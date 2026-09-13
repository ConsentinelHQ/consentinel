import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDbWithConnection } from "./client";

// Migrations only. Never hand-edit schema in an environment.
async function main(): Promise<void> {
  const { db, sql } = createDbWithConnection();
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  await sql.end();
  console.log("migrations applied");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
