import { createDbWithConnection } from "./client.js";
import { addSite, upsertUser } from "./repository.js";

// Local dev seed. Idempotent - safe to run repeatedly.
async function main(): Promise<void> {
  const { db, sql } = createDbWithConnection();
  const userId = await upsertUser(db, "clerk_dev_user", "dev@consentinel.local");
  await addSite(db, userId, "https://example.com", "Example");
  await sql.end();
  console.log("seeded dev user and site");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
