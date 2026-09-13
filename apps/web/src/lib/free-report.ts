import type { ScanResult, Severity } from "@consentinel/shared";

/**
 * The free tier shows enough to be credible and concerning, and withholds the part
 * that is actually worth money: the evidence and the remediation. Redaction happens
 * on the server - shipping the full result to the browser and hiding it with CSS
 * would mean the gate is a formality anyone can bypass in devtools.
 */
export interface FreeFinding {
  id: string;
  type: string;
  severity: Severity;
  vendor: string;
  title: string;
  locked: boolean;
}

export interface FreeReport {
  scanId: string;
  url: string;
  scannedAt: string;
  headline: string;
  counts: Record<Severity, number>;
  cmpName: string | null;
  consentModePresent: boolean;
  findings: FreeFinding[];
  correctlyGated: string[];
  lockedCount: number;
}

const PREVIEW_LIMIT = 3;

export function toFreeReport(result: ScanResult): FreeReport {
  /**
   * Show one finding per vendor before showing a second from any vendor. A site with
   * six YouTube cookies would otherwise fill the whole preview with YouTube and hide
   * the fact that Meta is also firing - which is the part that makes them act.
   */
  const seenVendors = new Set<string>();
  const previewIds = new Set<string>();
  for (const f of result.findings) {
    if (previewIds.size >= PREVIEW_LIMIT) break;
    if (seenVendors.has(f.vendor)) continue;
    seenVendors.add(f.vendor);
    previewIds.add(f.id);
  }
  for (const f of result.findings) {
    if (previewIds.size >= PREVIEW_LIMIT) break;
    previewIds.add(f.id);
  }

  const findings = result.findings.map((f) => ({
    id: f.id,
    type: f.type,
    severity: f.severity,
    vendor: f.vendor,
    title: f.title,
    locked: !previewIds.has(f.id),
  }));

  return {
    scanId: result.scanId,
    url: result.url,
    scannedAt: result.scannedAt,
    headline: result.headline,
    counts: result.counts,
    cmpName: result.cmp.detected?.name ?? null,
    consentModePresent: result.cmp.consentMode.present,
    findings,
    correctlyGated: result.correctlyGated.map((g) => g.vendor),
    lockedCount: findings.filter((f) => f.locked).length,
  };
}
