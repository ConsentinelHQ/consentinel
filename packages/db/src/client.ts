import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

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

/**
 * Tests write junk rows. Refuse anything but a local database unless
 * ALLOW_REMOTE_TEST_DB=1 is set on purpose.
 */
export function requireTestDatabaseUrl(url: string = requireDatabaseUrl()): string {
  const host = new URL(url).hostname;
  const local = ["localhost", "127.0.0.1", "::1", "[::1]", "postgres"].includes(host);
  if (!local && process.env["ALLOW_REMOTE_TEST_DB"] !== "1") {
    throw new Error(
      `Refusing to run tests against ${host}. Use a local Postgres, or set ALLOW_REMOTE_TEST_DB=1 for a throwaway branch.`,
    );
  }
  return url;
}

export { schema };
