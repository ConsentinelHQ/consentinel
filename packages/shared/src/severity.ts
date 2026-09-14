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
};

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function severityFor(type: FindingType): Severity {
  return SEVERITY_BY_TYPE[type];
}

/** Critical first, then stable by vendor and title so diffs between scans are deterministic. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
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
