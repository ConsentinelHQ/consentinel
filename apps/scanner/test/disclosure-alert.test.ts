import assert from "node:assert/strict";
import {
  createDbWithConnection,
  createScan,
  eq,
  getScan,
  orgs,
  scans,
  sites,
} from "@consentinel/db";
import { runMigrations } from "@consentinel/db/migrate";
import { disclosureSubject } from "@consentinel/notify";
import type { DisclosureCheck, ScanResult } from "@consentinel/shared";
import { disclosureSlackText, newDisclosureGaps } from "../src/alerting";
import { loadConfig } from "../src/config";

/** Disclosure alerts against real Postgres: what counts as a new gap. */
process.env.INTEGRATION_KEY ??= Buffer.alloc(32, 9).toString("base64");
const config = loadConfig(process.env);
const { db, sql } = createDbWithConnection(config.DATABASE_URL);
await runMigrations(db);

const [org] = await db
  .insert(orgs)
  .values({
    clerkOrgId: `disclosure-test-${String(Date.now())}`,
    name: "Acme",
    plan: "growth",
    planStatus: "active",
  })
  .returning();
assert.ok(org);
const [site] = await db
  .insert(sites)
  .values({ orgId: org.id, url: "https://www.shop.com/" })
  .returning();
assert.ok(site);

const check = (named: string[], notNamed: string[]): DisclosureCheck => ({
  status: "checked",
  policies: [
    {
      kind: "privacy",
      url: "https://www.shop.com/policies/privacy-policy",
      chars: 9000,
      sha256: "x",
    },
  ],
  named,
  notNamed,
});
let t = Date.now() - 10 * 3600_000;
async function scanWith(disclosure: DisclosureCheck | undefined): Promise<string> {
  assert.ok(site);
  const s = await createScan(db, { url: site.url, siteId: site.id, trigger: "scheduled" });
  t += 3600_000;
  await db
    .update(scans)
    .set({
      status: "complete",
      startedAt: new Date(t),
      finishedAt: new Date(t),
      result: { findings: [], ...(disclosure ? { disclosure } : {}) } as unknown as ScanResult,
    })
    .where(eq(scans.id, s.id));
  return s.id;
}
const gaps = async (id: string) => newDisclosureGaps(db, (await getScan(db, id))!);

// First checked scan is the baseline.
const first = await scanWith(check(["Meta", "Google Ads"], ["Hotjar"]));
assert.equal(await gaps(first), null);

// TikTok starts running unmentioned; the policy drops Meta.
const second = await scanWith(check(["Google Ads"], ["Hotjar", "Meta", "TikTok"]));
assert.deepEqual(await gaps(second), [
  { vendor: "Meta", why: "dropped" },
  { vendor: "TikTok", why: "started" },
]);

// Same state next time: already reported, nothing new.
const third = await scanWith(check(["Google Ads"], ["Hotjar", "Meta", "TikTok"]));
assert.deepEqual(await gaps(third), []);

// A scan whose policy couldn't be read never alerts.
const unread = await scanWith({ status: "unreadable", policies: [], named: [], notNamed: [] });
assert.equal(await gaps(unread), null);

assert.equal(
  disclosureSubject("https://www.shop.com/", [{ vendor: "TikTok", why: "started" }]),
  "TikTok is running on shop.com and your privacy policy doesn’t mention it",
);
assert.equal(
  disclosureSubject("https://www.shop.com/", [
    { vendor: "TikTok", why: "started" },
    { vendor: "Meta", why: "dropped" },
  ]),
  "2 vendors running on shop.com aren’t in your privacy policy",
);
assert.equal(
  disclosureSlackText(
    "https://www.shop.com/",
    [{ vendor: "TikTok", why: "started" }],
    "https://x/r",
  ),
  "TikTok is running on shop.com and the privacy policy doesn't mention it. <https://x/r|See the report>",
);

await sql.end();
console.log("disclosure alerts: all assertions passed");
