import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/** Validate at boot, fail fast. No silent fallback to a wrong database. */
export function requireDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function createDb(connectionString: string = requireDatabaseUrl()) {
  // max:1 for migrations/scripts is set by callers; the worker and web use the default pool.
  const sql = postgres(connectionString);
  return drizzle(sql, { schema });
}

/** Returns the db plus its underlying connection so scripts and tests can close cleanly. */
export function createDbWithConnection(connectionString: string = requireDatabaseUrl()) {
  const sql = postgres(connectionString);
  return { db: drizzle(sql, { schema }), sql };
}

export { schema };
