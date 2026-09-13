import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

export const SCAN_QUEUE = "scan";

export interface ScanJobData {
  /** Row id in `scans` - the worker updates this record as it progresses. */
  scanId: string;
  url: string;
}

export function redisConnection(url: string): ConnectionOptions {
  // BullMQ requires maxRetriesPerRequest: null. With retries enabled, a blocked
  // command can throw mid-job and the worker loses the job instead of retrying it.
  return new IORedis(url, { maxRetriesPerRequest: null, connectTimeout: 5_000 });
}

/**
 * Fail fast on a dead Redis.
 *
 * ioredis retries a lost connection forever and stays silent while doing it, so a
 * worker pointed at the wrong URL looks healthy, logs nothing, and processes no jobs.
 * Call this at boot so the process dies loudly instead.
 */
export async function assertRedisReachable(url: string, timeoutMs = 5_000): Promise<void> {
  const client = new IORedis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: timeoutMs,
    retryStrategy: () => null,
    lazyConnect: true,
  });
  // ioredis emits an unhandled 'error' event on a refused connection, which prints a
  // stack trace over our own message. We are about to throw a better one.
  client.on("error", () => {});
  try {
    await client.connect();
    await client.ping();
  } catch (cause) {
    throw new Error(`cannot reach Redis at ${redact(url)}. Start it, or fix REDIS_URL.`, { cause });
  } finally {
    client.disconnect();
  }
}

/** Never put a password in a log line. */
function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "the configured URL";
  }
}

export function scanJobOptions(maxAttempts: number): JobsOptions {
  return {
    attempts: maxAttempts,
    backoff: { type: "exponential", delay: 5_000 },
    // Keep a short tail for debugging; the durable record lives in Postgres.
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  };
}

/** Named so consumers never need to depend on bullmq types directly. */
export type ScanQueue = Queue<ScanJobData>;

export function createScanQueue(connection: ConnectionOptions): ScanQueue {
  return new Queue<ScanJobData>(SCAN_QUEUE, { connection });
}
