import { createHash } from "node:crypto";
import type { ScanResult } from "@consentinel/shared";

/**
 * Tamper evidence for scan history. Each completed scan stores a SHA-256 of its
 * full result, its URL and finish time, and the previous scan's hash for the
 * same site. Editing or deleting any scan breaks every hash after it, so a
 * history can be shown not to have changed since it was recorded.
 */

/** Bump only if the hashed fields change; old scans keep verifying under their version. */
export const EVIDENCE_HASH_VERSION = 1;

/** JSON with object keys sorted at every level, so jsonb's key reordering can't change the hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v ?? null)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export interface HashInput {
  scanId: string;
  url: string;
  finishedAt: Date;
  result: ScanResult;
  prevHash: string | null;
}

export function evidenceHash(input: HashInput): string {
  const body = canonicalJson({
    v: EVIDENCE_HASH_VERSION,
    scanId: input.scanId,
    url: input.url,
    finishedAt: input.finishedAt.toISOString(),
    prevHash: input.prevHash,
    result: input.result,
  });
  return createHash("sha256").update(body).digest("hex");
}

export interface SealedScan {
  id: string;
  url: string;
  finishedAt: Date | null;
  result: ScanResult | null;
  evidenceHash: string | null;
  prevEvidenceHash: string | null;
}

export type Seal =
  | { state: "verified"; hash: string }
  | { state: "mismatch"; hash: string }
  /** Recorded before sealing shipped, or never completed. */
  | { state: "unsealed" };

/** Recompute a stored scan's hash and compare. */
export function verifySeal(scan: SealedScan): Seal {
  if (!scan.evidenceHash || !scan.result || !scan.finishedAt) return { state: "unsealed" };
  const hash = evidenceHash({
    scanId: scan.id,
    url: scan.url,
    finishedAt: scan.finishedAt,
    result: scan.result,
    prevHash: scan.prevEvidenceHash,
  });
  return { state: hash === scan.evidenceHash ? "verified" : "mismatch", hash: scan.evidenceHash };
}
