import assert from "node:assert/strict";
import {
  createDbWithConnection,
  createScan,
  eq,
  findings,
  orgs,
  saveJiraConnection,
  scans,
  sites,
  type ScanTrigger,
} from "@consentinel/db";
import { runMigrations } from "@consentinel/db/migrate";
import { alertOnRegression } from "../src/alerting";
import { loadConfig } from "../src/config";
import { postJiraScanFailure, postJiraVerdict } from "../src/jira-sync";

/**
 * Jira sync against real Postgres with Jira's HTTP API stubbed: a regression opens
 * a ticket, a Done ticket gets a per-finding verdict, the plan gate holds.
 */
process.env.INTEGRATION_KEY = Buffer.alloc(32, 9).toString("base64");
const config = loadConfig(process.env);
const { db, sql } = createDbWithConnection(config.DATABASE_URL);
await runMigrations(db);

const calls: { url: string; body: string }[] = [];
globalThis.fetch = ((url: string, init: RequestInit) => {
  calls.push({ url, body: typeof init.body === "string" ? init.body : "" });
  const key = url.endsWith("/rest/api/3/issue") ? { key: "WEB-7" } : {};
  return Promise.resolve(new Response(JSON.stringify(key), { status: 201 }));
}) as typeof fetch;
const last = (): { url: string; body: string } => {
  const c = calls.at(-1);
  assert.ok(c, "expected a Jira call");
  return c;
};

const [org] = await db
  .insert(orgs)
  .values({
    clerkOrgId: `jira-test-${String(Date.now())}`,
    name: "Acme",
    plan: "growth",
    planStatus: "active",
    planQuantity: 1,
  })
  .returning();
assert.ok(org);
const [site] = await db
  .insert(sites)
  .values({ orgId: org.id, url: "https://www.shop.com/" })
  .returning();
assert.ok(site);
await saveJiraConnection(db, org.id, {
  baseUrl: "https://acme.atlassian.net",
  email: "a@b.co",
  apiToken: "tok",
  projectKey: "WEB",
  issueTypeId: "2",
  issueTypeName: "Bug",
  autoCreate: true,
});

let t = Date.now() - 10 * 3600_000;
async function scanWith(
  trigger: ScanTrigger,
  fps: string[],
  jiraIssueKey?: string,
): Promise<string> {
  assert.ok(site);
  const s = await createScan(db, {
    url: site.url,
    siteId: site.id,
    trigger,
    ...(jiraIssueKey ? { jiraIssueKey } : {}),
  });
  t += 3600_000;
  await db
    .update(scans)
    .set({
      status: "complete",
      engineVersion: "1",
      signatureLibraryVersion: "1",
      startedAt: new Date(t),
      finishedAt: new Date(t),
      criticalCount: fps.length,
    })
    .where(eq(scans.id, s.id));
  for (const [i, fp] of fps.entries()) {
    await db.insert(findings).values({
      scanId: s.id,
      localId: `f${String(i)}`,
      schemaVersion: "1",
      type: "tracker-fires-pre-consent",
      severity: "critical",
      vendor: `Vendor ${fp}`,
      category: "advertising",
      title: `${fp} fires after reject`,
      detail: "d",
      observedUnder: "rejected",
      evidence: {} as never,
      remediation: "Gate it",
      fingerprint: fp,
      firstSeenAt: new Date(t),
    });
  }
  return s.id;
}

// Regression opens a ticket with only the new criticals.
await scanWith("scheduled", ["a"]);
await alertOnRegression(db, await scanWith("scheduled", ["a", "meta", "tiktok"]), config);
const created = calls.find((c) => c.url.endsWith("/rest/api/3/issue"));
assert.ok(created, "issue created");
assert.match(created.body, /2 new critical privacy issues on shop\.com/);
assert.match(created.body, /"labels":\["consentinel","privacy"\]/);

// Ticket closed but one finding still fires.
await postJiraVerdict(db, await scanWith("jira", ["a", "meta"], "WEB-7"), config);
assert.ok(last().url.endsWith("/issue/WEB-7/comment"));
assert.match(last().body, /Not fixed/);
assert.match(last().body, /1 of 2 findings/);

// Fixed for real.
await postJiraVerdict(db, await scanWith("jira", ["a"], "WEB-7"), config);
assert.match(last().body, /Verified fixed/);

// An unrelated ticket that shipped a regression gets a comment, not a second ticket.
calls.length = 0;
const v3 = await scanWith("jira", ["a", "hotjar"], "SHOP-99");
await alertOnRegression(db, v3, config);
assert.ok(!calls.some((c) => c.url.endsWith("/rest/api/3/issue")), "no new ticket");
await postJiraVerdict(db, v3, config);
assert.ok(last().url.endsWith("/SHOP-99/comment"));
assert.match(last().body, /New regression/);

// Unrelated ticket, nothing new.
await postJiraVerdict(db, await scanWith("jira", ["a", "hotjar"], "SHOP-100"), config);
assert.match(last().body, /No new issues/);

// A scan that couldn't run still answers the ticket.
const failed = await createScan(db, {
  url: site.url,
  siteId: site.id,
  trigger: "jira",
  jiraIssueKey: "SHOP-101",
});
await postJiraScanFailure(db, failed.id, "timeout");
assert.match(last().body, /Couldn't verify/);

// Plan gate: Monitor doesn't include Jira, so nothing posts.
await db.update(orgs).set({ plan: "monitoring" }).where(eq(orgs.id, org.id));
calls.length = 0;
await postJiraVerdict(db, await scanWith("jira", ["a"], "SHOP-102"), config);
assert.equal(calls.length, 0);

console.log("jira sync: all checks passed");
await sql.end();
