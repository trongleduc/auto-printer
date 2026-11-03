import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const slotStatus = pgEnum("slot_status", ["queued", "assigned", "cancelled"]);
export const sheetStatus = pgEnum("sheet_status", ["ready", "printing", "printed"]);
export const sheetTrigger = pgEnum("sheet_trigger", ["auto", "manual", "reprint"]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  label: text("label").notNull().default(""),
  /** Session that created the order; regular users may only cancel their own. */
  ownerSid: text("owner_sid"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const photos = pgTable("photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  r2Key: text("r2_key").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A PC next to a printer that keeps /station open. Only the active one claims sheets. */
export const stations = pgTable("stations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

/** One row per device logged in as admin. Deleting the row logs that device out. */
export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sheets = pgTable("sheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: serial("number").notNull().unique(),
  status: sheetStatus("status").notNull().default("ready"),
  trigger: sheetTrigger("trigger").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  printedAt: timestamp("printed_at", { withTimezone: true }),
  /** Station that claimed the sheet. */
  stationId: uuid("station_id").references(() => stations.id, { onDelete: "set null" }),
});

/** One row per printed copy. A photo with quantity 3 produces 3 slots. */
export const slots = pgTable(
  "slots",
  {
    id: serial("id").primaryKey(),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    sheetId: uuid("sheet_id").references(() => sheets.id, { onDelete: "set null" }),
    position: smallint("position"),
    status: slotStatus("status").notNull().default("queued"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("slots_status_idx").on(t.status, t.createdAt), index("slots_sheet_idx").on(t.sheetId)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
