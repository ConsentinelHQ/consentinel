import {
  canonicalVendor,
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
  /** Flagged vendor that loaded this one, e.g. an ad network's cookie sync. */
  causedBy?: string;
  /** Vendors this one loads. Fixing it removes them too. */
  triggers?: string[];
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
  /** What proves the finding. Full report only; never set on a locked row. */
  evidence?: string[];
  /** What to change. Full report only. */
  remediation?: string;
}

export interface FreeReport {
  /** Free view only: size of the biggest tracker chain, without naming the tag. */
  hiddenChainSize?: number;
  /**
   * The denied pass sent Global Privacy Control instead of clicking reject.
   * Gated vendors then stopped because of the signal, not because they waited
   * for a consent choice, and the copy has to say so.
   */
  gpc?: boolean;
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

function toFreeReportBase(result: ScanResult): FreeReport {
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
    ...new Set(result.findings.filter(isUnattributed).map(cookieLabel)),
  ].sort();

  /**
   * Built from the same per-vendor rows as the full report, so a vendor appears
   * once - previewed or locked, never both - and the counts match the full report.
   */
  const grouped = [...groupByVendor(attributed)].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  const findings: FreeFinding[] = grouped.slice(0, PREVIEW_LIMIT).map((g) => ({
    id: g.id,
    type: g.type,
    severity: g.severity,
    vendor: g.vendor,
    title: g.title,
    ...(g.detail ? { detail: g.detail } : {}),
    locked: false,
    lockedCount: 0,
  }));
  const hidden = grouped.slice(PREVIEW_LIMIT);
  // A short list of what is withheld reads as a preview; a wall of it reads as a paywall.
  const LOCKED_ROW_LIMIT = 6;
  for (const g of hidden.slice(0, LOCKED_ROW_LIMIT)) {
    findings.push({
      id: g.id,
      type: "locked-group",
      severity: g.severity,
      vendor: g.vendor,
      title: `${g.vendor} - details locked`,
      locked: true,
      lockedCount: 1,
    });
  }
  const lockedTotal = hidden.length;
  const biggestChain = Math.max(0, ...grouped.map((g) => g.triggers?.length ?? 0));

  return {
    scanId: result.scanId,
    url: result.url,
    scannedAt: result.scannedAt,
    headline: result.headline,
    // Recounted: the header must match the list, or the numbers look made up.
    counts: countRows(grouped),
    cmpName: result.cmp.detected?.name ?? null,
    consentModePresent: result.cmp.consentMode.present,
    findings,
    correctlyGated: result.correctlyGated.map((g) => g.vendor),
    // Counts every hidden finding, including vendors not shown as rows.
    lockedCount: lockedTotal,
    ...(biggestChain >= 2 ? { hiddenChainSize: biggestChain + 1 } : {}),
    unattributedCookies,
  };
}

/**
 * The owner's view: every finding, nothing locked, no gate.
 *
 * Shares the FreeReport shape deliberately - one renderer, one set of styles,
 * and `locked` simply never true. A second component would drift.
 */
function toFullReportBase(result: ScanResult): FreeReport {
  const attributed = dedupe(result.findings.filter((f) => !isUnattributed(f)));
  const grouped = groupByVendor(attributed);
  const unattributedCookies = [
    ...new Set(result.findings.filter(isUnattributed).map(cookieLabel)),
  ].sort();

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
    evidence: string[];
    remediation: string[];
    causedBy: string | null;
    /** Any finding with no traced parent. Then the vendor is not a child: claiming it is would overpromise the fix. */
    untraced: boolean;
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
        evidence: [],
        remediation: [],
        causedBy: null,
        untraced: false,
      };
      groups.set(vendor, g);
    }

    // Worst severity wins, so the gutter never understates the group.
    if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[g.severity]) g.severity = f.severity;
    if (f.causedBy) g.causedBy = g.causedBy ?? canonicalVendor(f.causedBy);
    else g.untraced = true;

    const line = evidenceLine(f);
    if (line && !g.evidence.includes(line)) g.evidence.push(line);
    if (f.remediation && !g.remediation.includes(f.remediation)) g.remediation.push(f.remediation);

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

  // Only fully traced vendors join a chain.
  for (const g of groups.values()) if (g.untraced) g.causedBy = null;

  // Follow chains to the root: Amazon -> BidSwitch -> Neustar all roll up to Amazon.
  const rootOf = (vendor: string): string => {
    const seen = new Set<string>();
    let cur = vendor;
    for (;;) {
      const parent = groups.get(cur)?.causedBy;
      if (!parent || parent === cur || seen.has(parent) || !groups.has(parent)) return cur;
      seen.add(cur);
      cur = parent;
    }
  };
  const roots = new Map([...groups.keys()].map((v) => [v, rootOf(v)]));
  for (const g of groups.values()) {
    const root = roots.get(g.vendor);
    g.causedBy = root && root !== g.vendor ? root : null;
  }

  // Parent -> children, only where the parent is itself a finding on this page.
  const triggersOf = new Map<string, string[]>();
  for (const g of groups.values()) {
    if (g.causedBy && g.causedBy !== g.vendor && groups.has(g.causedBy)) {
      triggersOf.set(g.causedBy, [...(triggersOf.get(g.causedBy) ?? []), g.vendor]);
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
      evidence: g.evidence,
      // One vendor's findings usually share a fix. Keep them distinct if not.
      remediation: remediationWithChain(g.vendor, g.remediation.join(" "), g.causedBy, triggersOf),
      ...(g.causedBy && groups.has(g.causedBy) ? { causedBy: g.causedBy } : {}),
      ...(triggersOf.has(g.vendor) ? { triggers: triggersOf.get(g.vendor) ?? [] } : {}),
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

/** One readable line of proof per finding, from the evidence union. */
function evidenceLine(f: Finding): string | null {
  const e = f.evidence;
  switch (e.kind) {
    case "request":
      return `${e.method} ${e.url}`;
    case "cookie":
      return `Cookie "${e.name}" on ${e.domain} (${e.firstParty ? "first" : "third"} party)`;
    case "script":
      return `Script ${e.src}`;
    case "credential":
      return `Credential exposed in ${e.location}`;
    case "cmp":
      return `${e.platform}: ${e.detail}`;
    default:
      return null;
  }
}

function observedUnderGpc(result: ScanResult): boolean {
  return result.findings.some((f) => f.observedUnder === "gpc");
}

export function toFreeReport(result: ScanResult): FreeReport {
  return withRowCount({ ...toFreeReportBase(result), gpc: observedUnderGpc(result) });
}

export function toFullReport(result: ScanResult): FreeReport {
  return withRowCount({ ...toFullReportBase(result), gpc: observedUnderGpc(result) });
}

/** Children point at the parent; parents list what fixing them also clears. */
function remediationWithChain(
  vendor: string,
  own: string,
  causedBy: string | null,
  triggersOf: Map<string, string[]>,
): string {
  if (causedBy && triggersOf.get(causedBy)?.includes(vendor)) {
    return (
      `${vendor} was loaded by ${causedBy}, not by your site directly. ` +
      `Gate ${causedBy} behind consent and this stops with it.`
    );
  }
  const kids = triggersOf.get(vendor);
  if (kids && kids.length > 0) return `${own} Fixing it also stops ${joinList(kids)}.`;
  return own;
}

export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

/** "dpm" on ".demdex.net" -> "demdex.net · dpm", so cookies cluster by domain. */
function cookieLabel(f: Finding): string {
  return f.evidence.kind === "cookie"
    ? `${f.evidence.domain.replace(/^\./, "")} · ${f.vendor}`
    : f.vendor;
}

/**
 * The scanner's headline counts trackers that fired; the report also lists cookie-only
 * rows (Shopify, for example). Restate the number from the rows shown, so the headline
 * and the list below it never disagree.
 */
function withRowCount(report: FreeReport): FreeReport {
  const n = report.counts.critical + report.counts.warning + report.counts.info;
  return {
    ...report,
    headline: report.headline.replace(
      /^\d+ trackers?\b/,
      `${String(n)} tracker${n === 1 ? "" : "s"}`,
    ),
  };
}
