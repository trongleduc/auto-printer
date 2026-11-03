import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export type DB = NeonDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

let _db: DB | undefined;

/** Lazily created so `next build` does not need DATABASE_URL. */
export function db(): DB {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const pool = new Pool({ connectionString: url });
    // Idle WebSocket connections can be dropped by the platform; don't crash on it.
    pool.on("error", (err: Error) => console.error("pg pool error", err));
    _db = drizzle({ client: pool, schema });
  }
  return _db;
}

export { schema };
