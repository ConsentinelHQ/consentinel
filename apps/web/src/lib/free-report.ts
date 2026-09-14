import {
  countBySeverity,
  isUnattributed,
  type ScanResult,
  type Severity,
} from "@consentinel/shared";

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
  /** Cookies seen pre-consent that we could not attribute. Evidence, not findings. */
  unattributedCookies: string[];
}

const PREVIEW_LIMIT = 3;

export function toFreeReport(result: ScanResult): FreeReport {
  /**
   * Show one finding per vendor before showing a second from any vendor. A site with
   * six YouTube cookies would otherwise fill the whole preview with YouTube and hide
   * the fact that Meta is also firing - which is the part that makes them act.
   */
  // Unattributed cookies are pulled out first. Left in, each one counts as its own
  // "vendor" and a site with thirty of them fills the preview with noise.
  const attributed = result.findings.filter((f) => !isUnattributed(f));
  const unattributedCookies = result.findings.filter(isUnattributed).map((f) => f.vendor);

  const seenVendors = new Set<string>();
  const previewIds = new Set<string>();
  for (const f of attributed) {
    if (previewIds.size >= PREVIEW_LIMIT) break;
    if (seenVendors.has(f.vendor)) continue;
    seenVendors.add(f.vendor);
    previewIds.add(f.id);
  }
  for (const f of attributed) {
    if (previewIds.size >= PREVIEW_LIMIT) break;
    previewIds.add(f.id);
  }

  const findings = attributed.map((f) => ({
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
    // Recounted: the header must match the list, or the numbers look made up.
    counts: countBySeverity(attributed),
    cmpName: result.cmp.detected?.name ?? null,
    consentModePresent: result.cmp.consentMode.present,
    findings,
    correctlyGated: result.correctlyGated.map((g) => g.vendor),
    lockedCount: findings.filter((f) => f.locked).length,
    unattributedCookies,
  };
}
