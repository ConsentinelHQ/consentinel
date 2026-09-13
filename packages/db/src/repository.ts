import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { ScanResult } from "@consentinel/shared";
import type { Database } from "./client";
import { findings, scans, sites, users, type ScanRow, type ScanTrigger } from "./schema";
import { fingerprintFinding } from "./fingerprint";

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
  userId: string,
  url: string,
  label?: string,
): Promise<string> {
  const [row] = await db
    .insert(sites)
    .values({ userId, url, ...(label !== undefined ? { label } : {}) })
    .onConflictDoNothing({ target: [sites.userId, sites.url] })
    .returning({ id: sites.id });
  if (row) return row.id;
  const [existing] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.userId, userId), eq(sites.url, url)))
    .limit(1);
  if (!existing) throw new Error("failed to add site");
  return existing.id;
}
