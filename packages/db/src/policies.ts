import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { MIN_POLICY_CHARS, normalizePolicy } from "@consentinel/shared";
import type { Database } from "./client.js";
import { policyVersions, sites, type PolicyVersionRow } from "./schema.js";

/**
 * Policy archive. One row per distinct version of a site's privacy or cookie
 * policy. Same algorithm as the scanner's disclosure hash, so a stored version
 * can be matched to the sealed hash inside any scan that saw it.
 */

export function policyHash(text: string): string {
  return createHash("sha256").update(normalizePolicy(text)).digest("hex");
}

/** The stored text still hashes to what was recorded. */
export function verifyPolicyText(v: { text: string; sha256: string }): boolean {
  return policyHash(v.text) === v.sha256;
}

export interface PolicyInput {
  kind: "privacy" | "cookie";
  url: string;
  text: string;
}

export interface NewVersion {
  version: PolicyVersionRow;
  /** The version it replaced. Absent for the first version on record. */
  previous?: PolicyVersionRow;
}

/**
 * After a scan: extend the current version's run when the text is unchanged,
 * otherwise store a new version. Unreadable policies are skipped, as they are
 * by the disclosure check. Returns only the versions that are new.
 */
export async function recordPolicyVersions(
  db: Database,
  siteId: string,
  scanId: string,
  at: Date,
  policies: readonly PolicyInput[],
): Promise<NewVersion[]> {
  const out: NewVersion[] = [];
  for (const p of policies) {
    const normalized = normalizePolicy(p.text);
    if (normalized.length < MIN_POLICY_CHARS) continue;
    const sha256 = policyHash(p.text);
    const [latest] = await db
      .select()
      .from(policyVersions)
      .where(and(eq(policyVersions.siteId, siteId), eq(policyVersions.kind, p.kind)))
      .orderBy(desc(policyVersions.firstSeenAt))
      .limit(1);
    if (latest?.sha256 === sha256) {
      await db
        .update(policyVersions)
        .set({ lastSeenAt: at, lastScanId: scanId, url: p.url })
        .where(eq(policyVersions.id, latest.id));
      continue;
    }
    const [version] = await db
      .insert(policyVersions)
      .values({
        siteId,
        kind: p.kind,
        url: p.url,
        text: p.text.trim(),
        sha256,
        chars: normalized.length,
        firstSeenAt: at,
        lastSeenAt: at,
        firstScanId: scanId,
        lastScanId: scanId,
      })
      .returning();
    if (version) out.push({ version, ...(latest ? { previous: latest } : {}) });
  }
  return out;
}

/** Every version for a site the org owns, newest first. Null if not theirs. */
export async function listPolicyVersions(
  db: Database,
  siteId: string,
  orgId: string,
): Promise<PolicyVersionRow[] | null> {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId)))
    .limit(1);
  if (!site) return null;
  return db
    .select()
    .from(policyVersions)
    .where(eq(policyVersions.siteId, site.id))
    .orderBy(desc(policyVersions.firstSeenAt));
}

/**
 * Versions in effect at any point in [from, to], oldest first. A version is in
 * effect from the first scan that saw it until the next version of the same
 * kind appeared, so a gap between scans belongs to the last version seen.
 * Caller has checked ownership.
 */
export async function policyVersionsInWindow(
  db: Database,
  siteId: string,
  from: Date,
  to: Date,
): Promise<PolicyVersionRow[]> {
  const rows = await db
    .select()
    .from(policyVersions)
    .where(and(eq(policyVersions.siteId, siteId), lte(policyVersions.firstSeenAt, to)))
    .orderBy(asc(policyVersions.firstSeenAt));
  return rows.filter((v, i) => {
    const next = rows.slice(i + 1).find((n) => n.kind === v.kind);
    return !next || next.firstSeenAt.getTime() > from.getTime();
  });
}

/** Versions first seen since a time, for change-rate checks. */
export async function countPolicyVersionsSince(
  db: Database,
  siteId: string,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ id: policyVersions.id })
    .from(policyVersions)
    .where(and(eq(policyVersions.siteId, siteId), gte(policyVersions.firstSeenAt, since)));
  return rows.length;
}
