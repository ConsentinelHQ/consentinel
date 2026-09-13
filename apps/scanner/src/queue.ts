import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

export const SCAN_QUEUE = "scan";

export interface ScanJobData {
  /** Row id in `scans` - the worker updates this record as it progresses. */
  scanId: string;
  url: string;
}

export function redisConnection(url: string): ConnectionOptions {
  // BullMQ requires this to be null: with retries enabled, a blocked command can
  // throw mid-job and the worker loses the job instead of retrying it.
  return new IORedis(url, { maxRetriesPerRequest: null });
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

export function createScanQueue(connection: ConnectionOptions): Queue<ScanJobData> {
  return new Queue<ScanJobData>(SCAN_QUEUE, { connection });
}
