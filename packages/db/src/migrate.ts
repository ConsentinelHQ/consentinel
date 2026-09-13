import { createDbWithConnection } from "./client";
import { runMigrations } from "./migrate-runner";

// Migrations only. Never hand-edit schema in an environment.
async function main(): Promise<void> {
  const { db, sql } = createDbWithConnection();
  await runMigrations(db);
  await sql.end();
  console.log("migrations applied");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
