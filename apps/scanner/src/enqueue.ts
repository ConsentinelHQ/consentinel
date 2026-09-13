import type { Queue } from "bullmq";
import { createScan, findCachedScan, type Database, type ScanRow } from "@consentinel/db";
import { scanJobOptions, type ScanJobData } from "./queue";
import { assertScannableUrl } from "./safety";

export interface EnqueueOptions {
  siteId?: string;
  trigger?: "public" | "manual" | "scheduled";
  /** Serve a recent identical scan instead of burning a worker slot. 0 disables. */
  cacheMaxAgeMs?: number;
  allowPrivate?: boolean;
  maxAttempts?: number;
}

export type EnqueueResult =
  | { status: "queued"; scan: ScanRow }
  | { status: "cached"; scan: ScanRow }
  | { status: "refused"; reason: string };

/**
 * The single entry point for starting a scan. The web app calls this; it never
 * touches the queue directly. Safety check and cache lookup happen here so no
 * caller can skip them.
 */
export async function enqueueScan(
  db: Database,
  queue: Queue<ScanJobData>,
  url: string,
  opts: EnqueueOptions = {},
): Promise<EnqueueResult> {
  const check = await assertScannableUrl(url, { allowPrivate: opts.allowPrivate ?? false });
  if (!check.ok) return { status: "refused", reason: check.reason };

  const cacheMaxAgeMs = opts.cacheMaxAgeMs ?? 0;
  if (cacheMaxAgeMs > 0 && opts.siteId === undefined) {
    const cached = await findCachedScan(db, check.url, cacheMaxAgeMs);
    if (cached) return { status: "cached", scan: cached };
  }

  const row = await createScan(db, {
    url: check.url,
    ...(opts.siteId !== undefined ? { siteId: opts.siteId } : {}),
    ...(opts.trigger !== undefined ? { trigger: opts.trigger } : {}),
  });

  await queue.add(
    "scan",
    { scanId: row.id, url: check.url },
    { ...scanJobOptions(opts.maxAttempts ?? 3), jobId: row.id },
  );

  return { status: "queued", scan: row };
}
