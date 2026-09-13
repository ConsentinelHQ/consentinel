import { Worker, type Job } from "bullmq";
import {
  completeScan,
  createDbWithConnection,
  markScanFailed,
  markScanRunning,
  type Database,
} from "@consentinel/db";
import { loadConfig, type ScannerConfig } from "./config";
import {
  assertScannableUrl,
  redisConnection,
  SCAN_QUEUE,
  type ScanJobData,
} from "@consentinel/queue";
import { scan } from "./index";

/**
 * The scanner worker. A long-running container, never a serverless function -
 * headless Chromium is too heavy and slow-starting to live in a Lambda.
 *
 * Job lifecycle is persisted to Postgres (queued -> running -> complete | failed)
 * so the frontend can poll a scan that this process knows nothing about.
 */
export interface RunningWorker {
  worker: Worker<ScanJobData>;
  db: Database;
  shutdown: () => Promise<void>;
}

export function startWorker(config: ScannerConfig = loadConfig()): RunningWorker {
  const { db, sql } = createDbWithConnection(config.DATABASE_URL);
  const connection = redisConnection(config.REDIS_URL);

  const worker = new Worker<ScanJobData>(
    SCAN_QUEUE,
    async (job: Job<ScanJobData>) => {
      const { scanId, url } = job.data;

      // Re-check at execution time, not just at enqueue: DNS can be re-pointed
      // between the two, and the browser is what actually makes the request.
      const check = await assertScannableUrl(url, {
        allowPrivate: config.ALLOW_PRIVATE_SCAN_TARGETS,
      });
      if (!check.ok) {
        await markScanFailed(db, scanId, `refused: ${check.reason}`);
        // Do not retry a refusal - the URL will not become safe on attempt two.
        throw new UnrecoverableScanError(check.reason);
      }

      await markScanRunning(db, scanId);
      const result = await withTimeout(scan(check.url), config.SCAN_TIMEOUT_MS);
      await completeScan(db, scanId, result);
      return { scanId, critical: result.counts.critical };
    },
    {
      connection,
      concurrency: config.SCAN_CONCURRENCY,
      // A wedged page must not hold a slot forever.
      lockDuration: config.SCAN_TIMEOUT_MS + 30_000,
    },
  );

  worker.on("failed", (job, err) => {
    const scanId = job?.data.scanId;
    const isLastAttempt = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
    if (scanId && isLastAttempt) {
      // Best effort: the DB record must not stay "running" forever.
      void markScanFailed(db, scanId, err.message);
    }
  });

  const shutdown = async (): Promise<void> => {
    // close(false) lets in-flight scans finish rather than orphaning them mid-browser.
    await worker.close();
    await sql.end();
  };

  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());

  return { worker, db, shutdown };
}

export class UnrecoverableScanError extends Error {
  override readonly name = "UnrecoverableScanError";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`scan timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
