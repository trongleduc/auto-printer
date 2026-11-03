import "server-only";
import { asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, STATION_COOKIE, verifyToken } from "./auth";
import { db, schema } from "./db";
import type { AdminSessionDTO } from "./types";

const { adminSessions, stations } = schema;

/** last_seen_at is written at most this often, not on every request. */
const TOUCH_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who is using the app. `sid` identifies the session that owns an order. */
export type Viewer = { role: "user"; sid: string } | { role: "admin"; sid: string; name: string };
export type StationAuth = { stationId: string; name: string };

export async function viewerFromRequest(req: NextRequest): Promise<Viewer | null> {
  const t = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!t) return null;
  if (t.role === "user") return { role: "user", sid: t.id };
  if (t.role !== "admin" || !UUID.test(t.id)) return null;

  const [row] = await db().select().from(adminSessions).where(eq(adminSessions.id, t.id));
  if (!row) return null; // revoked from another device
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_MS) {
    await db().update(adminSessions).set({ lastSeenAt: new Date() }).where(eq(adminSessions.id, row.id));
  }
  return { role: "admin", sid: row.id, name: row.name };
}

/** The station id stored in this browser's cookie, whether or not it still exists. */
export async function stationIdFromCookie(req: NextRequest): Promise<string | null> {
  const t = await verifyToken(req.cookies.get(STATION_COOKIE)?.value);
  return t?.role === "station" && UUID.test(t.id) ? t.id : null;
}

export async function stationFromRequest(req: NextRequest): Promise<StationAuth | null> {
  const id = await stationIdFromCookie(req);
  if (!id) return null;
  const [row] = await db().select({ id: stations.id, name: stations.name }).from(stations).where(eq(stations.id, id));
  return row ? { stationId: row.id, name: row.name } : null;
}

// ─── admin sessions ────────────────────────────────────────────────────────

export async function createAdminSession(name: string, userAgent: string): Promise<string> {
  const [row] = await db()
    .insert(adminSessions)
    .values({ name, userAgent: userAgent.slice(0, 300) })
    .returning({ id: adminSessions.id });
  return row.id;
}

export async function listAdminSessions(currentId: string): Promise<AdminSessionDTO[]> {
  const rows = await db().select().from(adminSessions).orderBy(asc(adminSessions.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    current: r.id === currentId,
  }));
}

export async function renameAdminSession(id: string, name: string) {
  await db().update(adminSessions).set({ name }).where(eq(adminSessions.id, id));
}

/** Logs that device out of admin: its cookie stops working on the next request. */
export async function deleteAdminSession(id: string) {
  if (!UUID.test(id)) return;
  await db().delete(adminSessions).where(eq(adminSessions.id, id));
}
