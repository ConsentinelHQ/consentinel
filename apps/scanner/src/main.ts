import { assertRedisReachable } from "@consentinel/queue";
import { loadConfig } from "./config.js";
import { startWorker } from "./worker.js";

// Container entrypoint. Prove the dependencies are live before claiming to be up:
// a worker that silently processes nothing is worse than one that crashes.
async function main(): Promise<void> {
  const config = loadConfig();
  await assertRedisReachable(config.REDIS_URL);
  const { worker } = startWorker(config);
  console.log(`scanner worker listening on queue "${worker.name}"`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
