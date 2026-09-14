import {
  canonicalVendor,
  countBySeverity,
  type Finding,
  isUnattributed,
  SEVERITY_RANK,
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
  /** How many findings this row stands for. 0 for an unlocked, real finding. */
  lockedCount: number;
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
  const attributed = dedupe(result.findings.filter((f) => !isUnattributed(f)));
  // Deduped: the same cookie name can appear first- and third-party, and two
  // identical rows reads as a bug.
  const unattributedCookies = [
    ...new Set(result.findings.filter(isUnattributed).map((f) => f.vendor)),
  ];

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

  /**
   * Locked findings collapse to one row per vendor. Six YouTube cookies rendering as
   * six identical "YouTube - locked" rows reads as repetition, not as six problems,
   * and it tells the reader nothing about what the gate is withholding.
   */
  const findings: FreeFinding[] = [];
  const lockedByVendor = new Map<string, { severity: Severity; count: number; id: string }>();

  for (const f of attributed) {
    if (previewIds.has(f.id)) {
      findings.push({
        id: f.id,
        type: f.type,
        severity: f.severity,
        vendor: f.vendor,
        title: f.title,
        locked: false,
        lockedCount: 0,
      });
      continue;
    }
    const vendorKey = canonicalVendor(f.vendor);
    const existing = lockedByVendor.get(vendorKey);
    if (existing) {
      existing.count += 1;
      // Keep the worst severity so the gutter does not understate the group.
      if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[existing.severity]) {
        existing.severity = f.severity;
      }
    } else {
      lockedByVendor.set(vendorKey, { severity: f.severity, count: 1, id: f.id });
    }
  }

  /**
   * Show the worst handful of locked vendors, not all 35. A wall of "N findings
   * locked" is not a stronger gate than a short one - it just buries the three
   * real findings above it and reads as a paywall rather than a preview.
   */
  const LOCKED_ROW_LIMIT = 6;
  const ranked = [...lockedByVendor.entries()]
    .sort(
      (a, b) =>
        SEVERITY_RANK[a[1].severity] - SEVERITY_RANK[b[1].severity] || b[1].count - a[1].count,
    )
    .slice(0, LOCKED_ROW_LIMIT);

  for (const [vendor, group] of ranked) {
    findings.push({
      id: group.id,
      type: "locked-group",
      severity: group.severity,
      vendor,
      title:
        group.count === 1
          ? `${vendor} - 1 finding locked`
          : `${vendor} - ${String(group.count)} findings locked`,
      locked: true,
      lockedCount: group.count,
    });
  }

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
    // Counts every hidden finding, including vendors not shown as rows.
    lockedCount: [...lockedByVendor.values()].reduce((n, g) => n + g.count, 0),
    unattributedCookies,
  };
}

/**
 * The owner's view: every finding, nothing locked, no gate.
 *
 * Shares the FreeReport shape deliberately - one renderer, one set of styles,
 * and `locked` simply never true. A second component would drift.
 */
export function toFullReport(result: ScanResult): FreeReport {
  const attributed = dedupe(result.findings.filter((f) => !isUnattributed(f)));
  const unattributedCookies = [
    ...new Set(result.findings.filter(isUnattributed).map((f) => f.vendor)),
  ];

  return {
    scanId: result.scanId,
    url: result.url,
    scannedAt: result.scannedAt,
    headline: result.headline,
    counts: countBySeverity(attributed),
    cmpName: result.cmp.detected?.name ?? null,
    consentModePresent: result.cmp.consentMode.present,
    findings: attributed.map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      vendor: canonicalVendor(f.vendor),
      title: f.title,
      locked: false,
      lockedCount: 0,
    })),
    correctlyGated: result.correctlyGated.map((g) => canonicalVendor(g.vendor)),
    lockedCount: 0,
    unattributedCookies,
  };
}

/** Collapse findings that render identically. Two rows with the same words is a bug. */
function dedupe(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    const key = `${canonicalVendor(f.vendor)}|${f.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
