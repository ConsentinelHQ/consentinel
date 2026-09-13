import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { FINDING_SCHEMA_VERSION, type Finding, type ScanResult } from "@consentinel/shared";
import { createDbWithConnection } from "../src/client";
import {
  addSite,
  completeScan,
  countRecentScansForUrl,
  createScan,
  diffScans,
  findCachedScan,
  getScan,
  listScansForSite,
  markScanRunning,
  upsertUser,
} from "../src/repository";
import { fingerprintFinding } from "../src/fingerprint";

const checks: Array<[string, boolean]> = [];
const check = (name: string, ok: boolean): void => {
  checks.push([name, ok]);
};

function finding(over: Partial<Finding>): Finding {
  return {
    id: "preconsent-001",
    schemaVersion: FINDING_SCHEMA_VERSION,
    type: "tracker-fires-pre-consent",
    severity: "critical",
    vendor: "Meta Pixel",
    category: "advertising",
    title: "Meta Pixel fires under rejected consent",
    detail: "d",
    observedUnder: "rejected",
    evidence: {
      kind: "request",
      url: "https://www.facebook.com/tr?id=1&ev=PageView",
      method: "GET",
      resourceType: "image",
    },
    compliance: [],
    remediation: "r",
    firstSeenAt: new Date().toISOString(),
    ...over,
  };
}

function result(url: string, fs: Finding[]): ScanResult {
  return {
    scanId: randomUUID(),
    url,
    scannedAt: new Date().toISOString(),
    engineVersion: "0.1.0",
    signatureLibraryVersion: "0.1.0",
    cmpRegistryVersion: "0.1.0",
    cmp: {
      detected: { id: "onetrust", name: "OneTrust", confidence: "high" },
      consentMode: { present: true, defaultState: "denied" },
    },
    headline: `${fs.length} trackers firing before consent`,
    counts: {
      critical: fs.filter((f) => f.severity === "critical").length,
      warning: fs.filter((f) => f.severity === "warning").length,
      info: 0,
    },
    findings: fs,
    correctlyGated: [{ vendor: "TikTok Pixel", category: "advertising" }],
  };
}

async function main(): Promise<void> {
  const { db, sql } = createDbWithConnection();
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });

  const url = `https://shop-${randomUUID().slice(0, 8)}.example`;

  // --- free-tier anonymous scan, end to end ---
  const scan1 = await createScan(db, { url, trigger: "public" });
  check("scan starts queued", scan1.status === "queued");
  await markScanRunning(db, scan1.id);

  const metaF = finding({});
  const gaF = finding({
    id: "preconsent-002",
    vendor: "Google Analytics 4",
    type: "consent-signal-ignored",
    title: "Google Analytics 4 ignored a denied consent signal",
    evidence: {
      kind: "request",
      url: "https://www.google-analytics.com/g/collect?v=2&gcs=G100&_z=111",
      method: "GET",
      resourceType: "image",
    },
  });
  const cookieF = finding({
    id: "cookie-003",
    severity: "warning",
    type: "cookie-set-pre-consent",
    vendor: "_ga",
    title: 'Cookie "_ga" set under rejected consent',
    evidence: { kind: "cookie", name: "_ga", domain: "shop.example", firstParty: true },
  });
  await completeScan(db, scan1.id, result(url, [metaF, gaF, cookieF]));

  const stored = await getScan(db, scan1.id);
  check("scan marked complete", stored?.status === "complete");
  check("counts denormalized", stored?.criticalCount === 2 && stored?.warningCount === 1);
  check("CMP summary denormalized", stored?.cmpName === "OneTrust");
  check("immutable result blob kept", stored?.result?.findings.length === 3);
  check(
    "correctlyGated survives round trip",
    stored?.result?.correctlyGated[0]?.vendor === "TikTok Pixel",
  );

  // --- fingerprint stability: the thing alerting depends on ---
  const sameViolationLaterScan = fingerprintFinding(
    finding({
      id: "preconsent-099",
      firstSeenAt: new Date(Date.now() + 86_400_000).toISOString(),
      evidence: {
        kind: "request",
        url: "https://www.facebook.com/tr?id=1&ev=PageView&cb=9999999",
        method: "GET",
        resourceType: "image",
      },
    }),
  );
  check(
    "fingerprint ignores cache-busters and timestamps",
    sameViolationLaterScan === fingerprintFinding(metaF),
  );
  check(
    "different vendor gets different fingerprint",
    fingerprintFinding(gaF) !== fingerprintFinding(metaF),
  );

  // --- cache + rate limit reads ---
  const cached = await findCachedScan(db, url, 60 * 60 * 1000);
  check("recent scan is cache-hit", cached?.id === scan1.id);
  const stale = await findCachedScan(db, url, 1);
  check("stale scan is cache-miss", stale === undefined);
  check(
    "recent scan count for rate limiting",
    (await countRecentScansForUrl(db, url, 60_000)) === 1,
  );

  // --- account path + diffing ---
  const userId = await upsertUser(db, `clerk_${randomUUID()}`, "charlie@example.com");
  const siteId = await addSite(db, userId, url, "Test shop");
  check("addSite is idempotent", (await addSite(db, userId, url)) === siteId);

  const scan2 = await createScan(db, { url, siteId, trigger: "scheduled" });
  // Meta fixed, GA4 still there, a NEW critical appeared.
  const newCritical = finding({
    id: "preconsent-004",
    vendor: "TikTok Pixel",
    title: "TikTok Pixel fires under rejected consent",
    evidence: {
      kind: "request",
      url: "https://analytics.tiktok.com/i18n/pixel/events.js",
      method: "GET",
      resourceType: "script",
    },
  });
  await completeScan(db, scan2.id, result(url, [gaF, cookieF, newCritical]));

  const diff = await diffScans(db, scan1.id, scan2.id);
  check(
    "diff detects the new violation",
    diff.added.some((a) => a.title.includes("TikTok")),
  );
  check(
    "diff detects the fix",
    diff.fixed.some((f) => f.title.includes("Meta")),
  );
  check("diff counts unchanged", diff.unchanged === 2);
  check(
    "new finding is critical (alert trigger)",
    diff.added.every((a) => a.severity === "critical"),
  );

  const history = await listScansForSite(db, siteId);
  check("site history returns its scans", history.length === 1 && history[0]?.id === scan2.id);

  // --- cascade integrity ---
  const orphan = await findCachedScan(db, url, 60 * 60 * 1000);
  check("site-linked scans excluded from free-tier cache", orphan?.id === scan1.id);

  await sql.end();

  let pass = true;
  console.log("\nConsentinel data layer - integration proof\n");
  for (const [name, ok] of checks) {
    pass = pass && ok;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  }
  console.log(
    pass ? "\n  Epic 0.3 GREEN - data layer verified against real Postgres.\n" : "\n  FAILED\n",
  );
  process.exit(pass ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
