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
  /** Cookie names and other specifics rolled into this vendor's row. */
  detail?: string[];
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
  const grouped = groupByVendor(attributed);
  const unattributedCookies = [
    ...new Set(result.findings.filter(isUnattributed).map((f) => f.vendor)),
  ];

  return {
    scanId: result.scanId,
    url: result.url,
    scannedAt: result.scannedAt,
    headline: result.headline,
    // Counted from the grouped rows, not raw findings: the header must describe
    // what the reader can actually see.
    counts: countRows(grouped),
    cmpName: result.cmp.detected?.name ?? null,
    consentModePresent: result.cmp.consentMode.present,
    findings: grouped,
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

/**
 * Collapse a vendor's findings into one row.
 *
 * Nine rows of "Attentive set an advertising cookie X" tells the reader one fact
 * nine times. What they need is "Attentive fires before consent and sets nine
 * cookies" - the vendor is the unit of action, because you fix a vendor, not a
 * cookie. The cookie names stay as detail underneath.
 */
function groupByVendor(findings: readonly Finding[]): FreeFinding[] {
  interface Group {
    id: string;
    vendor: string;
    severity: Severity;
    type: string;
    fires: boolean;
    cookies: string[];
    otherTitles: string[];
  }

  const groups = new Map<string, Group>();

  for (const f of findings) {
    const vendor = canonicalVendor(f.vendor);
    let g = groups.get(vendor);
    if (!g) {
      g = {
        id: f.id,
        vendor,
        severity: f.severity,
        type: f.type,
        fires: false,
        cookies: [],
        otherTitles: [],
      };
      groups.set(vendor, g);
    }

    // Worst severity wins, so the gutter never understates the group.
    if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[g.severity]) g.severity = f.severity;

    const cookie = /cookie "([^"]+)"/.exec(f.title)?.[1];
    if (cookie) {
      if (!g.cookies.includes(cookie)) g.cookies.push(cookie);
    } else if (f.type === "tracker-fires-pre-consent" || f.type === "consent-signal-ignored") {
      g.fires = true;
      // A tag that ignored an explicit denial is the strongest claim we have.
      if (f.type === "consent-signal-ignored") g.type = f.type;
    } else {
      g.otherTitles.push(f.title);
    }
  }

  return [...groups.values()].map((g) => {
    const parts: string[] = [];
    if (g.fires) parts.push("fires");
    if (g.cookies.length > 0) {
      parts.push(
        g.cookies.length === 1 ? `sets 1 cookie` : `sets ${String(g.cookies.length)} cookies`,
      );
    }
    const action = parts.length > 0 ? parts.join(" and ") : "was observed";

    return {
      id: g.id,
      type: g.type,
      severity: g.severity,
      vendor: g.vendor,
      title: `${g.vendor} ${action} before consent`,
      detail: [...g.cookies, ...g.otherTitles],
      locked: false,
      lockedCount: 0,
    };
  });
}

/** Severity counts over display rows rather than raw findings. */
function countRows(rows: readonly FreeFinding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  for (const r of rows) counts[r.severity] += 1;
  return counts;
}
