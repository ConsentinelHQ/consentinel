import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { leads, scans, type ScanRow } from "./schema.js";

/** Fallback when there's no recent history to measure. */
const DEFAULT_SCAN_SECONDS = 70;

let durationCache: { at: number; seconds: number } | null = null;

/** Median wall time of recent completed scans. Cached 60s per process. */
export async function typicalScanSeconds(db: Database, now = Date.now()): Promise<number> {
  if (durationCache && now - durationCache.at < 60_000) return durationCache.seconds;
  const rows = await db
    .select({
      secs: sql<number>`extract(epoch from (${scans.finishedAt} - ${scans.startedAt}))`,
    })
    .from(scans)
    .where(
      and(eq(scans.status, "complete"), isNotNull(scans.startedAt), isNotNull(scans.finishedAt)),
    )
    .orderBy(desc(scans.finishedAt))
    .limit(50);
  const secs = rows
    .map((r) => Number(r.secs))
    .filter((s) => Number.isFinite(s) && s > 0)
    .sort((a, b) => a - b);
  const median =
    secs.length > 0
      ? (secs[Math.floor(secs.length / 2)] ?? DEFAULT_SCAN_SECONDS)
      : DEFAULT_SCAN_SECONDS;
  durationCache = { at: now, seconds: Math.round(median) };
  return durationCache.seconds;
}

/** Scans still waiting that were queued before this one. */
export async function scansAhead(db: Database, queuedAt: Date): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scans)
    .where(and(eq(scans.status, "queued"), lt(scans.queuedAt, queuedAt)));
  return Number(rows[0]?.n ?? 0);
}

/**
 * Seconds until a scan finishes. Pure so it can be tested.
 * ahead: scans in front of it; slots: worker concurrency; per: one scan's time.
 */
export function estimateWaitSeconds(
  status: "queued" | "running",
  ahead: number,
  slots: number,
  per: number,
): number {
  if (status === "running") return per;
  // Busy slots free up in half a scan on average, then each full round of
  // scans in front of us costs one scan, then our own.
  return Math.round((Math.floor(ahead / Math.max(1, slots)) + 1.5) * per);
}

/**
 * Emails waiting on this scan: leads created before it finished. The report
 * route only accepts complete scans, so anything earlier came from "email me".
 */
export async function leadsWaitingOnScan(
  db: Database,
  scanId: string,
  finishedAt: Date,
): Promise<{ id: string; email: string }[]> {
  return db
    .select({ id: leads.id, email: leads.email })
    .from(leads)
    .where(and(eq(leads.scanId, scanId), lt(leads.createdAt, finishedAt)))
    .limit(5);
}

/** True when this lead asked for this scan. The lead id works as an unlock token. */
export async function leadMatchesScan(
  db: Database,
  leadId: string,
  scanId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.scanId, scanId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * A public scan of the same URL already waiting or running. Joining it means a
 * spike of visitors on one domain costs one browser, not one each.
 */
export async function findInFlightPublicScan(
  db: Database,
  url: string,
  maxAgeMs = 10 * 60 * 1000,
): Promise<ScanRow | undefined> {
  const [row] = await db
    .select()
    .from(scans)
    .where(
      and(
        eq(scans.url, url),
        inArray(scans.status, ["queued", "running"]),
        isNull(scans.siteId),
        gte(scans.queuedAt, new Date(Date.now() - maxAgeMs)),
      ),
    )
    .orderBy(desc(scans.queuedAt))
    .limit(1);
  return row;
}
