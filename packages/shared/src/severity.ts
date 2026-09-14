import type { Finding, FindingType, Severity } from "./finding.js";

// Single source of truth for severity. Scanner emits, report renders, both agree.
export const SEVERITY_BY_TYPE: Record<FindingType, Severity> = {
  "tracker-fires-pre-consent": "critical",
  "consent-signal-ignored": "critical",
  "pii-leak-to-tracker": "critical",
  "cookie-set-pre-consent": "critical",
  "exposed-credential": "critical",
  "uninventoried-script": "critical",
  "payment-page-tamper": "critical",
  "dead-tag": "warning",
  "duplicate-tag": "warning",
  // A consent platform that never shows a banner is not a lesser problem than a
  // tag firing early - it is the reason the tags fire early.
  "consent-banner-absent": "critical",
};

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function severityFor(type: FindingType): Severity {
  return SEVERITY_BY_TYPE[type];
}

/** Critical first, then stable by vendor and title so diffs between scans are deterministic. */
/**
 * Findings that explain the others sort above them. "No consent banner was shown"
 * is the reason every tracker below it fired; buried at position 30 it reads as
 * one more line item instead of the root cause.
 */
const ROOT_CAUSE_TYPES: ReadonlySet<string> = new Set(["consent-banner-absent"]);

export function sortFindings(findings: readonly Finding[]): Finding[] {
  const rootCauseRank = (f: Finding): number => (ROOT_CAUSE_TYPES.has(f.type) ? 0 : 1);
  return [...findings].sort(
    (a, b) =>
      rootCauseRank(a) - rootCauseRank(b) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.vendor.localeCompare(b.vendor) ||
      a.title.localeCompare(b.title),
  );
}

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/**
 * An unattributed cookie: observed before consent, but we could not tie it to a
 * vendor. It is evidence, not a finding - we cannot prove it is non-essential, and
 * listing it beside "Meta Pixel fires before consent" makes the report unreadable.
 */
export function isUnattributed(f: Finding): boolean {
  return f.type === "cookie-set-pre-consent" && f.category === "unknown";
}

/**
 * A page that loads almost nothing did not load. Bot management serving an empty
 * shell, a JS-gated SPA that never hydrated, and a silent navigation failure all
 * look identical to a clean site otherwise - zero trackers, zero cookies.
 *
 * Reporting that as "no trackers fired before consent" is the worst output this
 * product can produce: it is a false all-clear, and it is unrecoverable with a
 * buyer who later finds out. Below this threshold we refuse to grade the scan.
 */
export const MIN_CREDIBLE_REQUESTS = 12;

export interface ScanCredibility {
  credible: boolean;
  requestCount: number;
  reason?: string;
}

export function assessCredibility(
  deniedRequestCount: number,
  grantedRequestCount: number,
  // Overridable so local fixtures, which are deliberately tiny, can opt out.
  minRequests: number = MIN_CREDIBLE_REQUESTS,
): ScanCredibility {
  const requestCount = Math.max(deniedRequestCount, grantedRequestCount);
  if (requestCount >= minRequests) return { credible: true, requestCount };
  return {
    credible: false,
    requestCount,
    reason:
      requestCount === 0
        ? "The page returned no network activity at all."
        : `The page made only ${String(requestCount)} requests, far below a working page.`,
  };
}

/**
 * The cookie and signature libraries grew separately and use different strings
 * for the same company: "Meta" and "Meta Pixel", "Microsoft Advertising" and
 * "Microsoft Advertising UET", "TikTok" and "TikTok Pixel".
 *
 * A report listing the same vendor three ways reads as careless, and grouping by
 * vendor splits into fragments. Normalising here rather than editing 200 library
 * rows keeps the libraries free to be as specific as detection needs.
 */
const VENDOR_ALIASES: Record<string, string> = {
  "Meta Pixel": "Meta",
  "TikTok Pixel": "TikTok",
  "Snap Pixel": "Snap",
  "Pinterest Tag": "Pinterest",
  "Reddit Pixel": "Reddit",
  "LinkedIn Insight": "LinkedIn",
  "Microsoft Advertising UET": "Microsoft Advertising",
  Microsoft: "Microsoft Advertising",
  "Google Ads (gtag destination)": "Google Ads",
  "Google Analytics 4": "Google Analytics",
  "X (Twitter) Pixel": "X (Twitter)",
  "YouTube (no-cookie)": "YouTube",
  "Shopify CDN": "Shopify",
};

/** Canonical display name for a vendor. Detection keeps its specific label. */
export function canonicalVendor(vendor: string): string {
  return VENDOR_ALIASES[vendor] ?? vendor;
}
