import { listDueSites, markSiteScheduled, type Database } from "@consentinel/db";
import { enqueueScan, type ScanQueue } from "@consentinel/queue";
import { Sentry } from "./instrument.js";

export interface RunningScheduler {
  stop: () => void;
}

/**
 * Enqueues scheduled scans.
 *
 * Lives in the worker rather than a serverless cron because the worker is already
 * a long-lived process with a database and queue connection, and because a missed
 * tick here is harmless: due-ness is computed from lastScheduledAt, so the next
 * tick simply catches up.
 *
 * Claims each site BEFORE enqueuing. If the enqueue then fails the site waits one
 * interval, which is a far better failure than two workers double-scanning and
 * billing the customer twice.
 */
export function startScheduler(
  db: Database,
  queue: ScanQueue,
  opts: { intervalMs?: number } = {},
): RunningScheduler {
  const intervalMs = opts.intervalMs ?? 5 * 60 * 1000;

  const tick = async (): Promise<void> => {
    try {
      const due = await listDueSites(db);
      for (const site of due) {
        await markSiteScheduled(db, site.id);
        const result = await enqueueScan(db, queue, site.url, {
          siteId: site.id,
          trigger: "scheduled",
        });
        if (result.status === "refused") {
          console.error(`scheduler: refused ${site.url}: ${result.reason}`);
        }
      }
      if (due.length > 0) console.log(`scheduler: enqueued ${String(due.length)} scheduled scans`);
    } catch (error) {
      // A failed tick must not kill the worker. The next one retries.
      console.error("scheduler tick failed:", error);
      // Silent ticks mean nobody is being scanned and nobody knows.
      Sentry.captureException(error, { tags: { area: "scheduler" } });
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
