import { createDbWithConnection, getScan } from "@consentinel/db";
import { runMigrations } from "@consentinel/db/migrate";
import { startFixtureServer } from "../fixtures/known-bad-shop";
import { loadConfig } from "../src/config";
import { createScanQueue, enqueueScan, redisConnection } from "@consentinel/queue";
import { startWorker } from "../src/worker";

const checks: Array<[string, boolean]> = [];
const check = (name: string, ok: boolean): void => {
  checks.push([name, ok]);
};

async function waitForStatus(
  db: ReturnType<typeof createDbWithConnection>["db"],
  scanId: string,
  target: string,
  timeoutMs = 60_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const row = await getScan(db, scanId);
    last = row?.status ?? "";
    if (last === target || last === "failed") return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}

async function main(): Promise<void> {
  const config = loadConfig({
    ...process.env,
    ALLOW_PRIVATE_SCAN_TARGETS: "true", // the fixture is on loopback
    SCAN_CONCURRENCY: "1",
    SCAN_MIN_REQUESTS: "1", // fixture page is minimal by design
  });

  const { db, sql } = createDbWithConnection(config.DATABASE_URL);
  await runMigrations(db);

  const connection = redisConnection(config.REDIS_URL);
  const queue = createScanQueue(connection);
  await queue.drain();

  const { shutdown } = startWorker(config);
  const fixture = await startFixtureServer();

  // --- a refused URL never reaches the browser ---
  const refused = await enqueueScan(db, queue, "http://169.254.169.254/latest/meta-data/", {
    allowPrivate: false,
  });
  check("enqueue refuses SSRF target before creating work", refused.status === "refused");

  // --- the happy path, end to end through the queue ---
  const queued = await enqueueScan(db, queue, fixture.url, {
    allowPrivate: true,
    trigger: "public",
  });
  check("enqueue returns queued", queued.status === "queued");
  if (queued.status !== "queued") throw new Error("enqueue failed");

  const status = await waitForStatus(db, queued.scan.id, "complete");
  check("worker drove the scan to complete", status === "complete");

  const stored = await getScan(db, queued.scan.id);
  check("findings persisted by the worker", (stored?.criticalCount ?? 0) >= 3);
  check("headline persisted", (stored?.headline ?? "").includes("before consent"));
  check("CMP recorded", stored?.cmpName === "OneTrust");
  check("timestamps recorded", !!stored?.startedAt && !!stored?.finishedAt);
  check("result blob stored by the worker", (stored?.result?.findings.length ?? 0) > 0);

  // --- cache short-circuits a repeat request instead of burning a worker slot ---
  const second = await enqueueScan(db, queue, fixture.url, {
    allowPrivate: true,
    cacheMaxAgeMs: 60 * 60 * 1000,
  });
  check("repeat scan served from cache", second.status === "cached");

  fixture.server.close();
  await shutdown();
  await queue.close();
  await sql.end();

  let pass = true;
  console.log("\nConsentinel worker - queue integration proof\n");
  for (const [name, ok] of checks) {
    pass = pass && ok;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  }
  console.log(
    pass
      ? "\n  Epic 1.1 GREEN - queue, worker, SSRF guard, and persistence verified.\n"
      : "\n  FAILED\n",
  );
  process.exit(pass ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
