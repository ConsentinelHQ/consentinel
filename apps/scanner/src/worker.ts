import { Worker, type Job } from "bullmq";
import {
  completeScan,
  createDbWithConnection,
  markScanFailed,
  markScanRunning,
  type Database,
} from "@consentinel/db";
import { loadConfig, type ScannerConfig } from "./config.js";
import {
  assertScannableUrl,
  redisConnection,
  SCAN_QUEUE,
  type ScanJobData,
} from "@consentinel/queue";
import { scan, UncredibleScanError } from "./index.js";
import { alertOnRegression } from "./alerting.js";
import { Sentry } from "./instrument.js";

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
      let result;
      try {
        result = await withTimeout(
          scan(check.url, { minRequests: config.SCAN_MIN_REQUESTS }),
          config.SCAN_TIMEOUT_MS,
        );
      } catch (error) {
        // Bot protection does not relent on attempt two. Fail once, clearly,
        // rather than burning three worker slots on the same wall.
        if (error instanceof UncredibleScanError) {
          await markScanFailed(db, scanId, error.message);
          throw new UnrecoverableScanError(error.message);
        }
        throw error;
      }
      await completeScan(db, scanId, result);

      // Alerting is the product's whole promise on a schedule: a scan nobody
      // reads is worth nothing. Failures here must never fail the scan.
      // The scan row, not the job payload, is the source of truth for which site
      // and trigger this was: completeScan just wrote it.
      try {
        await alertOnRegression(db, scanId, config);
      } catch (error) {
        console.error("alert failed", { scanId, error });
        // A customer paying for monitoring got no alert. Silent is not acceptable.
        Sentry.captureException(error, { tags: { area: "alerting" }, extra: { scanId } });
      }

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
    if (isLastAttempt) {
      // Refusals and bot-blocked pages are expected outcomes, not incidents.
      const expected = err instanceof UnrecoverableScanError || err instanceof UncredibleScanError;
      if (!expected) {
        Sentry.captureException(err, {
          tags: { area: "scan" },
          extra: { scanId, url: job?.data.url },
        });
      }
    }
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
