import "server-only";
import { and, asc, desc, eq, getTableColumns, inArray, notInArray, sql } from "drizzle-orm";
import { HttpError } from "./api";
import { db, schema, type Tx } from "./db";
import { STATION_ONLINE_MS } from "./poll";
import { deleteObjects, signGetMany } from "./r2";
import type { Viewer } from "./sessions";
import { SLOTS_PER_SHEET } from "./sheet-geometry";
import type {
  CellDTO,
  HistoryDTO,
  PendingOrderDTO,
  QueueDTO,
  SettingsDTO,
  SheetDTO,
  StationDTO,
  StationPollDTO,
} from "./types";

const { orders, photos, slots, sheets, settings, stations } = schema;

/** Serialises every operation that assigns slots to sheets. */
const ASSIGN_LOCK = 81_726_354;
/** A sheet in "printing" longer than this is shown as stuck. */
const STUCK_MS = 2 * 60_000;
/** Setting key: the station that claims sheets. Other stations stand by. */
const ACTIVE_STATION = "active_station_id";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

type Q = Tx | ReturnType<typeof db>;

// ─── settings ──────────────────────────────────────────────────────────────

async function getSetting(tx: Q, key: string): Promise<string | null> {
  const [row] = await tx.select().from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

async function setSetting(tx: Q, key: string, value: string) {
  await tx
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function getSettings(): Promise<SettingsDTO> {
  const v = await getSetting(db(), "auto_flush_minutes");
  return { autoFlushMinutes: v ? Number(v) : 0 };
}

export async function updateSettings(s: SettingsDTO) {
  await setSetting(db(), "auto_flush_minutes", String(s.autoFlushMinutes));
}

// ─── stations ──────────────────────────────────────────────────────────────

const isOnline = (lastSeen: Date | null) => !!lastSeen && Date.now() - lastSeen.getTime() < STATION_ONLINE_MS;

export async function listStations(thisDeviceStationId: string | null): Promise<StationDTO[]> {
  const d = db();
  const [rows, activeId] = await Promise.all([
    d.select().from(stations).orderBy(asc(stations.createdAt)),
    getSetting(d, ACTIVE_STATION),
  ]);
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
    online: isOnline(s.lastSeenAt),
    active: s.id === activeId,
    thisDevice: s.id === thisDeviceStationId,
  }));
}

/** Registers a station. The first one (or one added while none is active) becomes active. */
export async function createStation(name: string): Promise<string> {
  return db().transaction(async (tx) => {
    const [station] = await tx.insert(stations).values({ name }).returning({ id: stations.id });
    const activeId = await getSetting(tx, ACTIVE_STATION);
    const activeExists =
      !!activeId && (await tx.select({ id: stations.id }).from(stations).where(eq(stations.id, activeId))).length > 0;
    if (!activeExists) await setSetting(tx, ACTIVE_STATION, station.id);
    return station.id;
  });
}

export async function updateStation(id: string, patch: { name?: string; active?: true }) {
  const d = db();
  const [row] = await d.select({ id: stations.id }).from(stations).where(eq(stations.id, id));
  if (!row) throw new HttpError(404, "not_found");
  if (patch.name !== undefined) await d.update(stations).set({ name: patch.name }).where(eq(stations.id, id));
  if (patch.active) await setSetting(d, ACTIVE_STATION, id);
}

/**
 * Removes a station; its cookie stops working. A sheet it was printing stays in
 * "printing" (and shows as stuck), because it may already be on paper.
 */
export async function deleteStation(id: string) {
  await db().transaction(async (tx) => {
    await tx.delete(stations).where(eq(stations.id, id));
    if ((await getSetting(tx, ACTIVE_STATION)) === id) {
      await tx.delete(settings).where(eq(settings.key, ACTIVE_STATION));
    }
  });
}

// ─── sheet assembly ────────────────────────────────────────────────────────

/**
 * Groups queued slots (oldest first) into sheets of 9. A remainder becomes a
 * partial sheet only when `partial` is given (the "Print now" button or the
 * auto-flush timer).
 */
async function fillSheets(tx: Tx, partial: "manual" | "auto" | null): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(${ASSIGN_LOCK})`);
  const queued = await tx
    .select({ id: slots.id })
    .from(slots)
    .where(eq(slots.status, "queued"))
    .orderBy(asc(slots.createdAt), asc(slots.id));

  let created = 0;
  for (let i = 0; i < queued.length; i += SLOTS_PER_SHEET) {
    const chunk = queued.slice(i, i + SLOTS_PER_SHEET);
    const isFull = chunk.length === SLOTS_PER_SHEET;
    if (!isFull && !partial) break;

    const [sheet] = await tx
      .insert(sheets)
      .values({ trigger: isFull ? "auto" : partial! })
      .returning({ id: sheets.id });
    const ids = chunk.map((s) => s.id);
    const positionCase = sql.join(
      [sql`case ${slots.id}`, ...ids.map((id, pos) => sql`when ${id} then ${pos}`), sql`end`],
      sql` `,
    );
    await tx
      .update(slots)
      .set({ sheetId: sheet.id, status: "assigned", position: sql`(${positionCase})::smallint` })
      .where(inArray(slots.id, ids));
    created++;
  }
  return created;
}

export async function flushQueue(): Promise<number> {
  return db().transaction((tx) => fillSheets(tx, "manual"));
}

// ─── orders ────────────────────────────────────────────────────────────────

async function uniqueCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    let code = "";
    for (let i = 0; i < 3; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    // Only needs to be unique among recent orders, since the code identifies prints on the table.
    const [clash] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.code, code), sql`${orders.createdAt} > now() - interval '7 days'`))
      .limit(1);
    if (!clash) return code;
  }
  throw new Error("could not allocate order code");
}

export async function createOrder(input: {
  label: string;
  ownerSid: string;
  photos: { key: string; quantity: number }[];
}) {
  return db().transaction(async (tx) => {
    const code = await uniqueCode(tx);
    const [order] = await tx
      .insert(orders)
      .values({ code, label: input.label, ownerSid: input.ownerSid })
      .returning({ id: orders.id, code: orders.code });
    const inserted = await tx
      .insert(photos)
      .values(input.photos.map((p) => ({ orderId: order.id, r2Key: p.key, quantity: p.quantity })))
      .returning({ id: photos.id, quantity: photos.quantity });

    // One row per copy; createdAt is equal, so serial id keeps upload order.
    const slotRows = inserted.flatMap((p) =>
      Array.from({ length: p.quantity }, () => ({ photoId: p.id, orderId: order.id })),
    );
    await tx.insert(slots).values(slotRows);
    const sheetsCreated = await fillSheets(tx, null);
    return { id: order.id, code: order.code, sheetsCreated };
  });
}

type CancelTarget = { orderId: string } | { photoId: string };

/** Admins may cancel anything; regular users only orders created from their session. */
async function assertCanCancel(target: CancelTarget, viewer: Viewer) {
  if (viewer.role === "admin") return;
  const [row] =
    "orderId" in target
      ? await db().select({ owner: orders.ownerSid }).from(orders).where(eq(orders.id, target.orderId))
      : await db()
          .select({ owner: orders.ownerSid })
          .from(photos)
          .innerJoin(orders, eq(orders.id, photos.orderId))
          .where(eq(photos.id, target.photoId));
  if (!row) throw new HttpError(404, "not_found");
  if (row.owner !== viewer.sid) throw new HttpError(403, "forbidden");
}

/**
 * Cancels the still-queued copies of an order or a single photo. Photos left
 * with no printed/assigned copies are deleted together with their R2 objects.
 */
export async function cancelQueued(target: CancelTarget, viewer: Viewer) {
  await assertCanCancel(target, viewer);
  const keys = await db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ASSIGN_LOCK})`);
    const where =
      "orderId" in target
        ? and(eq(slots.orderId, target.orderId), eq(slots.status, "queued"))
        : and(eq(slots.photoId, target.photoId), eq(slots.status, "queued"));
    await tx.update(slots).set({ status: "cancelled" }).where(where);

    const scope = "orderId" in target ? eq(photos.orderId, target.orderId) : eq(photos.id, target.photoId);
    const stillUsed = tx
      .select({ id: slots.photoId })
      .from(slots)
      .where(inArray(slots.status, ["queued", "assigned"]));
    const dead = await tx
      .delete(photos)
      .where(and(scope, notInArray(photos.id, stillUsed)))
      .returning({ key: photos.r2Key, orderId: photos.orderId });

    const orderIds = [...new Set(dead.map((d) => d.orderId))];
    if (orderIds.length) {
      await tx.execute(
        sql`delete from ${orders} where ${inArray(orders.id, orderIds)}
            and not exists (select 1 from ${photos} where ${photos.orderId} = ${orders.id})`,
      );
    }
    return dead.map((d) => d.key);
  });
  await deleteObjects(keys).catch((err) => console.error("R2 delete failed", err));
}

// ─── sheets ────────────────────────────────────────────────────────────────

/** Sheet rows joined with the name of the station that claimed them. */
function selectSheets() {
  return db()
    .select({ ...getTableColumns(sheets), stationName: stations.name })
    .from(sheets)
    .leftJoin(stations, eq(stations.id, sheets.stationId));
}
type SheetRow = typeof sheets.$inferSelect & { stationName: string | null };

async function loadCells(sheetIds: string[]): Promise<Map<string, CellDTO[]>> {
  const out = new Map<string, CellDTO[]>(sheetIds.map((id) => [id, []]));
  if (!sheetIds.length) return out;
  const rows = await db()
    .select({
      sheetId: slots.sheetId,
      position: slots.position,
      key: photos.r2Key,
      code: orders.code,
    })
    .from(slots)
    .innerJoin(photos, eq(photos.id, slots.photoId))
    .innerJoin(orders, eq(orders.id, slots.orderId))
    .where(inArray(slots.sheetId, sheetIds))
    .orderBy(asc(slots.position));
  const urls = await signGetMany(rows.map((r) => r.key));
  for (const r of rows) {
    out.get(r.sheetId!)?.push({ position: r.position!, src: urls.get(r.key)!, code: r.code });
  }
  return out;
}

function toSheetDTO(s: SheetRow, cells: CellDTO[]): SheetDTO {
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    trigger: s.trigger,
    createdAt: s.createdAt.toISOString(),
    claimedAt: s.claimedAt?.toISOString() ?? null,
    printedAt: s.printedAt?.toISOString() ?? null,
    stationName: s.stationName,
    stuck: s.status === "printing" && !!s.claimedAt && Date.now() - s.claimedAt.getTime() > STUCK_MS,
    cells,
  };
}

async function withCells(rows: SheetRow[]): Promise<SheetDTO[]> {
  const cells = await loadCells(rows.map((r) => r.id));
  return rows.map((s) => toSheetDTO(s, cells.get(s.id)!));
}

/**
 * Called by every registered station every few seconds. Records the heartbeat.
 * Only the active station then runs the auto-flush timer and atomically claims
 * the oldest ready sheet; the others stand by.
 */
export async function claimNextSheet(stationId: string, opts: { claim: boolean }): Promise<StationPollDTO> {
  const result = await db().transaction(async (tx) => {
    const [me] = await tx
      .update(stations)
      .set({ lastSeenAt: new Date() })
      .where(eq(stations.id, stationId))
      .returning({ name: stations.name });
    const activeId = await getSetting(tx, ACTIVE_STATION);
    if (activeId !== stationId) {
      const [active] = activeId
        ? await tx.select({ name: stations.name }).from(stations).where(eq(stations.id, activeId))
        : [];
      return { name: me?.name ?? "", claimed: null, active: false, activeStationName: active?.name ?? null };
    }
    // Heartbeat only: the station is not ready to output (e.g. output folder not granted yet).
    if (!opts.claim) return { name: me?.name ?? "", claimed: null, active: true, activeStationName: me?.name ?? null };

    const minutes = Number((await getSetting(tx, "auto_flush_minutes")) ?? 0);
    if (minutes > 0) {
      const [oldest] = await tx
        .select({ createdAt: slots.createdAt })
        .from(slots)
        .where(eq(slots.status, "queued"))
        .orderBy(asc(slots.createdAt))
        .limit(1);
      if (oldest && Date.now() - oldest.createdAt.getTime() > minutes * 60_000) {
        await fillSheets(tx, "auto");
      }
    }

    // SKIP LOCKED: two open station tabs can never claim the same sheet.
    const res = await tx.execute<{ id: string }>(sql`
      update ${sheets} set status = 'printing', claimed_at = now(), station_id = ${stationId}
      where id = (
        select id from ${sheets} where status = 'ready'
        order by number limit 1 for update skip locked
      )
      returning id`);
    return { name: me?.name ?? "", claimed: res.rows[0]?.id ?? null, active: true, activeStationName: me?.name ?? null };
  });

  const { claimed, ...rest } = result;
  if (!claimed) return { ...rest, sheet: null };
  const [sheet] = await withCells(await selectSheets().where(eq(sheets.id, claimed)));
  return { ...rest, sheet };
}

/** Station ack. `stationId` limits it to the station that claimed the sheet; null is an admin override. */
export async function markPrinted(id: string, stationId: string | null) {
  await db()
    .update(sheets)
    .set({ status: "printed", printedAt: new Date() })
    .where(
      and(
        eq(sheets.id, id),
        eq(sheets.status, "printing"),
        stationId ? eq(sheets.stationId, stationId) : undefined,
      ),
    );
}

/** A station hands back a sheet it claimed but could not print (images failed to load). */
export async function releaseSheet(id: string, stationId: string) {
  await db()
    .update(sheets)
    .set({ status: "ready", claimedAt: null, stationId: null })
    .where(and(eq(sheets.id, id), eq(sheets.status, "printing"), eq(sheets.stationId, stationId)));
}

/**
 * Admin actions:
 * - "retry": a stuck sheet goes back to "ready" (no duplicate is created).
 * - "reprint": a printed sheet is copied into a new ready sheet.
 * - "mark_printed": staff confirm a stuck sheet did come out of the printer.
 */
export async function sheetAction(id: string, action: "retry" | "reprint" | "mark_printed") {
  if (action === "retry") {
    await db()
      .update(sheets)
      .set({ status: "ready", claimedAt: null, stationId: null })
      .where(and(eq(sheets.id, id), eq(sheets.status, "printing")));
    return;
  }
  if (action === "mark_printed") {
    await markPrinted(id, null);
    return;
  }
  await db().transaction(async (tx) => {
    const old = await tx
      .select({ photoId: slots.photoId, orderId: slots.orderId, position: slots.position })
      .from(slots)
      .where(eq(slots.sheetId, id));
    if (!old.length) return;
    const [sheet] = await tx.insert(sheets).values({ trigger: "reprint" }).returning({ id: sheets.id });
    await tx.insert(slots).values(old.map((s) => ({ ...s, sheetId: sheet.id, status: "assigned" as const })));
  });
}

// ─── read models ───────────────────────────────────────────────────────────

async function activeStationStatus(d: Q): Promise<QueueDTO["station"]> {
  const activeId = await getSetting(d, ACTIVE_STATION);
  if (!activeId) return null;
  const [s] = await d.select().from(stations).where(eq(stations.id, activeId));
  if (!s) return null;
  return { name: s.name, lastSeenAt: s.lastSeenAt?.toISOString() ?? null, online: isOnline(s.lastSeenAt) };
}

export async function getQueue(viewer: Viewer): Promise<QueueDTO> {
  const d = db();
  const [queuedRows, openSheets, station, flushMinutes] = await Promise.all([
    d
      .select({
        slotId: slots.id,
        createdAt: slots.createdAt,
        photoId: photos.id,
        key: photos.r2Key,
        orderId: orders.id,
        code: orders.code,
        label: orders.label,
        ownerSid: orders.ownerSid,
        orderCreatedAt: orders.createdAt,
      })
      .from(slots)
      .innerJoin(photos, eq(photos.id, slots.photoId))
      .innerJoin(orders, eq(orders.id, slots.orderId))
      .where(eq(slots.status, "queued"))
      .orderBy(asc(slots.createdAt), asc(slots.id)),
    selectSheets()
      .where(inArray(sheets.status, ["ready", "printing"]))
      .orderBy(asc(sheets.number)),
    activeStationStatus(d),
    getSetting(d, "auto_flush_minutes"),
  ]);

  const urls = await signGetMany(queuedRows.map((r) => r.key));

  const ordersMap = new Map<string, PendingOrderDTO>();
  for (const r of queuedRows) {
    let o = ordersMap.get(r.orderId);
    if (!o) {
      o = {
        id: r.orderId,
        code: r.code,
        label: r.label,
        createdAt: r.orderCreatedAt.toISOString(),
        mine: r.ownerSid === viewer.sid,
        photos: [],
      };
      ordersMap.set(r.orderId, o);
    }
    const p = o.photos.find((x) => x.id === r.photoId);
    if (p) p.queued++;
    else o.photos.push({ id: r.photoId, src: urls.get(r.key)!, queued: 1 });
  }

  const minutes = Number(flushMinutes ?? 0);
  const oldest = queuedRows[0]?.createdAt;

  return {
    viewer: { role: viewer.role },
    queuedCount: queuedRows.length,
    gathering: queuedRows.slice(0, SLOTS_PER_SHEET).map((r, i) => ({
      position: i,
      src: urls.get(r.key)!,
      code: r.code,
    })),
    pendingOrders: [...ordersMap.values()].reverse(),
    openSheets: await withCells(openSheets),
    station,
    autoFlushAt: minutes > 0 && oldest ? new Date(oldest.getTime() + minutes * 60_000).toISOString() : null,
  };
}

export async function getHistory(viewer: Viewer, limit = 50): Promise<HistoryDTO> {
  const rows = await selectSheets().where(eq(sheets.status, "printed")).orderBy(desc(sheets.printedAt)).limit(limit);
  return { viewer: { role: viewer.role }, sheets: await withCells(rows) };
}
