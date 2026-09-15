// Must be first: the SDK patches globals at import time.
import "./instrument.js";
import { assertRedisReachable, createScanQueue, redisConnection } from "@consentinel/queue";
import { loadConfig } from "./config.js";
import { startScheduler } from "./scheduler.js";
import { startWorker } from "./worker.js";

// Container entrypoint. Prove the dependencies are live before claiming to be up:
// a worker that silently processes nothing is worse than one that crashes.
async function main(): Promise<void> {
  const config = loadConfig();
  await assertRedisReachable(config.REDIS_URL);
  const { worker, db } = startWorker(config);
  console.log(`scanner worker listening on queue "${worker.name}"`);

  // The scheduler produces, the worker consumes. Same process, separate
  // connections - BullMQ does not allow one connection to do both.
  startScheduler(db, createScanQueue(redisConnection(config.REDIS_URL)));
  console.log("scheduler running");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
