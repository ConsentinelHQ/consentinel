import { and, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import type { ScanResult } from "@consentinel/shared";
import type { Database } from "./client.js";
import {
  findings,
  orgs,
  scans,
  sites,
  users,
  type ScanRow,
  type ScanSchedule,
  type ScanTrigger,
} from "./schema.js";
import { fingerprintFinding } from "./fingerprint.js";

export interface CreateScanInput {
  url: string;
  siteId?: string;
  trigger?: ScanTrigger;
}

/** Enqueue a scan. Returns the row the worker will pick up and the UI will poll. */
export async function createScan(db: Database, input: CreateScanInput): Promise<ScanRow> {
  const [row] = await db
    .insert(scans)
    .values({
      url: input.url,
      ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
      trigger: input.trigger ?? "public",
      status: "queued",
    })
    .returning();
  if (!row) throw new Error("failed to create scan");
  return row;
}

export async function markScanRunning(db: Database, scanId: string): Promise<void> {
  await db
    .update(scans)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(scans.id, scanId));
}

export async function markScanFailed(db: Database, scanId: string, error: string): Promise<void> {
  await db
    .update(scans)
    .set({ status: "failed", error, finishedAt: new Date() })
    .where(eq(scans.id, scanId));
}

/**
 * Persist a completed scan: denormalized summary, immutable result blob, and one
 * row per finding. Single transaction - a scan is either fully stored or not at
 * all. A half-written scan would corrupt every future diff against it.
 */
export async function completeScan(
  db: Database,
  scanId: string,
  result: ScanResult,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(scans)
      .set({
        status: "complete",
        finishedAt: new Date(),
        engineVersion: result.engineVersion,
        signatureLibraryVersion: result.signatureLibraryVersion,
        cmpRegistryVersion: result.cmpRegistryVersion,
        cmpId: result.cmp.detected?.id ?? null,
        cmpName: result.cmp.detected?.name ?? null,
        consentModePresent: result.cmp.consentMode.present,
        headline: result.headline,
        criticalCount: result.counts.critical,
        warningCount: result.counts.warning,
        infoCount: result.counts.info,
        result,
      })
      .where(eq(scans.id, scanId));

    if (result.findings.length === 0) return;

    await tx.insert(findings).values(
      result.findings.map((f) => ({
        scanId,
        localId: f.id,
        schemaVersion: f.schemaVersion,
        type: f.type,
        severity: f.severity,
        vendor: f.vendor,
        category: f.category,
        title: f.title,
        detail: f.detail,
        observedUnder: f.observedUnder,
        evidence: f.evidence,
        ...(f.consentSignal !== undefined ? { consentSignal: f.consentSignal } : {}),
        compliance: f.compliance,
        remediation: f.remediation,
        fingerprint: fingerprintFinding(f),
        firstSeenAt: new Date(f.firstSeenAt),
      })),
    );
  });
}

export async function getScan(db: Database, scanId: string): Promise<ScanRow | undefined> {
  const [row] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
  return row;
}

/** Scan history for a site, newest first. */
export async function listScansForSite(
  db: Database,
  siteId: string,
  limit = 50,
): Promise<ScanRow[]> {
  return db
    .select()
    .from(scans)
    .where(eq(scans.siteId, siteId))
    .orderBy(desc(scans.finishedAt))
    .limit(limit);
}

/**
 * Recent completed anonymous scan for a URL. Backs the free-tier cache so the
 * same domain is not re-scanned on every visit - scanning is the cost centre,
 * and protecting it is what lets the free tier stay free (Epic 2.4).
 */
export async function findCachedScan(
  db: Database,
  url: string,
  maxAgeMs: number,
): Promise<ScanRow | undefined> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const [row] = await db
    .select()
    .from(scans)
    .where(
      and(
        eq(scans.url, url),
        eq(scans.status, "complete"),
        isNull(scans.siteId),
        gte(scans.finishedAt, cutoff),
      ),
    )
    .orderBy(desc(scans.finishedAt))
    .limit(1);
  return row;
}

/** Scans started from one IP-equivalent key in a window. Backs rate limiting. */
export async function countRecentScansForUrl(
  db: Database,
  url: string,
  windowMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - windowMs);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scans)
    .where(and(eq(scans.url, url), gte(scans.queuedAt, cutoff)));
  return row?.n ?? 0;
}

export interface ScanDiff {
  added: Array<{ fingerprint: string; title: string; severity: string }>;
  fixed: Array<{ fingerprint: string; title: string; severity: string }>;
  unchanged: number;
}

/**
 * Diff two scans by fingerprint. This is the foundation for regression alerting:
 * "added" with a critical severity is exactly the publish-time alert (Epic 4.2).
 */
export async function diffScans(
  db: Database,
  baseScanId: string,
  headScanId: string,
): Promise<ScanDiff> {
  const rows = await db
    .select({
      scanId: findings.scanId,
      fingerprint: findings.fingerprint,
      title: findings.title,
      severity: findings.severity,
    })
    .from(findings)
    .where(sql`${findings.scanId} in (${baseScanId}::uuid, ${headScanId}::uuid)`);

  const base = new Map<string, (typeof rows)[number]>();
  const head = new Map<string, (typeof rows)[number]>();
  for (const r of rows) (r.scanId === baseScanId ? base : head).set(r.fingerprint, r);

  const added = [...head.values()]
    .filter((r) => !base.has(r.fingerprint))
    .map((r) => ({ fingerprint: r.fingerprint, title: r.title, severity: r.severity }));
  const fixed = [...base.values()]
    .filter((r) => !head.has(r.fingerprint))
    .map((r) => ({ fingerprint: r.fingerprint, title: r.title, severity: r.severity }));
  const unchanged = [...head.keys()].filter((f) => base.has(f)).length;

  return { added, fixed, unchanged };
}

export async function upsertUser(
  db: Database,
  clerkUserId: string,
  email: string,
): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ clerkUserId, email })
    .onConflictDoUpdate({ target: users.clerkUserId, set: { email } })
    .returning({ id: users.id });
  if (!row) throw new Error("failed to upsert user");
  return row.id;
}

export async function addSite(
  db: Database,
  orgId: string,
  url: string,
  label?: string,
): Promise<string> {
  const [row] = await db
    .insert(sites)
    .values({ orgId, url, ...(label !== undefined ? { label } : {}) })
    .onConflictDoNothing({ target: [sites.orgId, sites.url] })
    .returning({ id: sites.id });
  if (row) return row.id;
  const [existing] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.orgId, orgId), eq(sites.url, url)))
    .limit(1);
  if (!existing) throw new Error("failed to add site");
  return existing.id;
}

export interface SiteSummary {
  id: string;
  url: string;
  label: string | null;
  schedule: string;
  lastScanAt: Date | null;
  lastCritical: number | null;
  lastStatus: string | null;
}

/**
 * Sites for an org with their most recent scan rolled in. One query rather than
 * N+1: the dashboard lists every site and each needs its latest result.
 */
export async function listSitesForOrg(db: Database, orgId: string): Promise<SiteSummary[]> {
  const rows = await db
    .select({
      id: sites.id,
      url: sites.url,
      label: sites.label,
      schedule: sites.schedule,
      lastScanAt: scans.finishedAt,
      lastCritical: scans.criticalCount,
      lastStatus: scans.status,
    })
    .from(sites)
    .leftJoin(
      scans,
      and(
        eq(scans.siteId, sites.id),
        // Only the newest scan per site.
        sql`${scans.startedAt} = (select max(started_at) from scans s2 where s2.site_id = ${sites.id})`,
      ),
    )
    .where(eq(sites.orgId, orgId))
    .orderBy(desc(sites.createdAt));

  return rows.map((r) => ({
    ...r,
    schedule: r.schedule,
    lastScanAt: r.lastScanAt,
    lastCritical: r.lastCritical,
    lastStatus: r.lastStatus,
  }));
}

/**
 * Fetch a site only if it belongs to the given org. Scoping the read this way
 * means an authorisation bug cannot leak another org's data through a guessed
 * UUID - the query simply returns nothing.
 */
export async function getSiteForOrg(
  db: Database,
  siteId: string,
  orgId: string,
): Promise<typeof sites.$inferSelect | undefined> {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId)))
    .limit(1);
  return row;
}

export async function setSiteSchedule(
  db: Database,
  siteId: string,
  orgId: string,
  schedule: ScanSchedule,
): Promise<void> {
  await db
    .update(sites)
    .set({ schedule })
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId)));
}

const SCHEDULE_INTERVAL_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export interface DueSite {
  id: string;
  url: string;
  orgId: string;
  schedule: string;
}

/**
 * Sites whose next scheduled scan is due.
 *
 * Driven by lastScheduledAt rather than a cron expression per site: the tick can
 * run at any cadence, miss a beat, or be replayed, and each site still gets
 * scanned about once per interval. A fixed cron would silently skip a site if the
 * worker happened to be down at the wrong minute.
 *
 * Only orgs on a paid plan are returned - scheduling is what the subscription buys.
 */
export async function listDueSites(db: Database, now = new Date()): Promise<DueSite[]> {
  const rows = await db
    .select({
      id: sites.id,
      url: sites.url,
      orgId: sites.orgId,
      schedule: sites.schedule,
      lastScheduledAt: sites.lastScheduledAt,
    })
    .from(sites)
    .innerJoin(orgs, eq(orgs.id, sites.orgId))
    .where(and(ne(sites.schedule, "off"), eq(orgs.plan, "monitoring")));

  return rows
    .filter((r) => {
      const interval = SCHEDULE_INTERVAL_MS[r.schedule];
      if (interval === undefined) return false;
      if (!r.lastScheduledAt) return true; // never run, so it is due now
      return now.getTime() - r.lastScheduledAt.getTime() >= interval;
    })
    .map((r) => ({ id: r.id, url: r.url, orgId: r.orgId, schedule: r.schedule }));
}

/** Claim a site so a concurrent tick does not double-enqueue it. */
export async function markSiteScheduled(db: Database, siteId: string): Promise<void> {
  await db.update(sites).set({ lastScheduledAt: new Date() }).where(eq(sites.id, siteId));
}
