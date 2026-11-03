/**
 * Removes rows left by tests that ran against a real database.
 * Dry run by default; pass --apply to delete.
 *
 *   pnpm --filter @consentinel/db db:cleanup-test-data            # dry run
 *   pnpm --filter @consentinel/db db:cleanup-test-data -- --apply
 */
import { createDbWithConnection } from "./client.js";

const apply = process.argv.includes("--apply");
const { sql } = createDbWithConnection();

async function main(): Promise<void> {
  const host = new URL(process.env["DATABASE_URL"] ?? "").hostname;
  console.log(`${apply ? "APPLY" : "DRY RUN"} against ${host}\n`);

  const users = await sql<{ id: string; email: string }[]>`
    select id, email from users
    where email ilike '%@example.com' or email ilike '%.local'`;

  // Orgs the tests create: fixed names/key prefixes, and no real member.
  const orgs = await sql<{ id: string; name: string; clerk_org_id: string; sites: number }[]>`
    select o.id, o.name, o.clerk_org_id,
      (select count(*)::int from sites s where s.org_id = o.id) as sites
    from orgs o
    where (
      o.name = 'Test org'
      or o.clerk_org_id like 'worker-test-%'
      or o.clerk_org_id like 'disclosure-test-%'
      or o.clerk_org_id like 'jira-test-%'
    )
    and not exists (
      select 1 from org_members m join users u on u.id = m.user_id
      where m.org_id = o.id
        and not (u.email ilike '%@example.com' or u.email ilike '%.local')
    )`;

  console.log(`Users (${String(users.length)}):`);
  for (const u of users) console.log(`  ${u.email}  ${u.id}`);
  console.log(`\nOrgs (${String(orgs.length)}), sites/scans cascade:`);
  for (const o of orgs) console.log(`  ${o.name}  ${o.clerk_org_id}  sites=${String(o.sites)}`);

  if (!apply) {
    console.log("\nNothing deleted. Re-run with --apply.");
    return;
  }

  await sql.begin(async (tx) => {
    if (orgs.length) await tx`delete from orgs where id in ${tx(orgs.map((o) => o.id))}`;
    if (users.length) await tx`delete from users where id in ${tx(users.map((u) => u.id))}`;
  });
  console.log("\nDeleted.");
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
