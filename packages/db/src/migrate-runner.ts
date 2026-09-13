import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./client";

export const MIGRATIONS_FOLDER = new URL("../migrations", import.meta.url).pathname;

/** Apply pending migrations. The only supported way to change schema. */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
