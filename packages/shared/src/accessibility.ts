/**
 * Accessibility Monitor. Automated WCAG 2.2 A/AA checks (axe-core), run on the
 * homepage and the pages shoppers actually use. Deterministic, like the rest of
 * the engine: the same page gives the same issues.
 *
 * Automated checks catch a share of WCAG failures, not all of them. Copy never
 * says "ADA compliant" or "WCAG compliant" - only what was found.
 */

export type A11yImpact = "critical" | "serious" | "moderate" | "minor";

export const A11Y_IMPACTS: readonly A11yImpact[] = ["critical", "serious", "moderate", "minor"];

/** One failing check, merged across every page it appeared on. */
export interface AccessibilityIssue {
  /** axe rule id, e.g. "image-alt". Stable across scans, used for diffing. */
  rule: string;
  impact: A11yImpact;
  /** Short plain-English title. */
  title: string;
  /** WCAG success criteria, e.g. ["1.1.1"]. */
  wcag: string[];
  level: "A" | "AA";
  /** Paths the issue appeared on, e.g. ["/", "/products/x"]. */
  pages: string[];
  /** Elements failing, summed over pages. */
  instances: number;
  /** A few failing elements, capped. Full report only. */
  examples: Array<{
    page: string;
    selector: string;
    html: string;
    /** axe's exact reason, e.g. "Element has insufficient color contrast of 2.85 ...". */
    summary?: string;
    /** Measured colors and ratio for contrast failures. */
    contrast?: { fg: string; bg: string; ratio: number; required: number };
    /** JPEG data URL of the element outlined in context. Paid scans only. */
    shot?: string;
  }>;
  /** What to change. Full report only. */
  fix: string;
  helpUrl: string;
}

export interface AccessibilityPage {
  url: string;
  /** "Homepage", "Product page", "Cart"... */
  label: string;
  status: "ok" | "failed";
  /** Failing checks on this page. */
  issues: number;
  error?: string;
}

export interface AccessibilityAudit {
  /** e.g. "axe-core 4.14.0". */
  engine: string;
  standard: "WCAG 2.2 AA";
  /** Pages the plan allowed. Monitor 1, Growth and Agency 10. */
  pageLimit: number;
  pages: AccessibilityPage[];
  /** 0-100. See scoreAccessibility. */
  score: number;
  /** Failing checks by impact. Not element counts. */
  counts: Record<A11yImpact, number>;
  issues: AccessibilityIssue[];
  /** Checks that need a human eye (axe "incomplete"). Counted, not scored. */
  needsReview: number;
}

/** Per failing check, not per element: fixing one template clears every instance. */
const PENALTY: Record<A11yImpact, number> = { critical: 15, serious: 8, moderate: 3, minor: 1 };

/**
 * 100 minus a fixed penalty per failing check. Per check rather than per element so
 * the score doesn't swing because a collection page had 48 products today and 12
 * yesterday. A site with no automated failures scores 100.
 */
export function scoreAccessibility(issues: readonly Pick<AccessibilityIssue, "impact">[]): number {
  const penalty = issues.reduce((sum, i) => sum + PENALTY[i.impact], 0);
  return Math.max(0, 100 - penalty);
}

export function countByImpact(
  issues: readonly Pick<AccessibilityIssue, "impact">[],
): Record<A11yImpact, number> {
  const out: Record<A11yImpact, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const i of issues) out[i.impact] += 1;
  return out;
}

const IMPACT_RANK: Record<A11yImpact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

/** Worst first, then most widespread. */
export function sortIssues<T extends Pick<AccessibilityIssue, "impact" | "pages" | "instances">>(
  issues: readonly T[],
): T[] {
  return [...issues].sort(
    (a, b) =>
      IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] ||
      b.pages.length - a.pages.length ||
      b.instances - a.instances,
  );
}

export function scoreBand(score: number): "good" | "fair" | "poor" {
  if (score >= 90) return "good";
  if (score >= 60) return "fair";
  return "poor";
}

/** Critical and serious checks that fail now and didn't on the previous scan. */
export function newSeriousIssues(
  previous: AccessibilityAudit | undefined,
  current: AccessibilityAudit | undefined,
): AccessibilityIssue[] {
  if (!previous || !current) return [];
  const before = new Set(previous.issues.map((i) => i.rule));
  return current.issues.filter(
    (i) => (i.impact === "critical" || i.impact === "serious") && !before.has(i.rule),
  );
}

/** What the report shows. The free view keeps the score and the top issues, nothing to act on. */
export interface AccessibilitySummary {
  standard: "WCAG 2.2 AA";
  score: number;
  counts: Record<A11yImpact, number>;
  pages: AccessibilityPage[];
  pageLimit: number;
  needsReview: number;
  issues: Array<
    Omit<AccessibilityIssue, "examples" | "fix" | "helpUrl"> &
      Partial<Pick<AccessibilityIssue, "examples" | "fix" | "helpUrl">>
  >;
  /** Free view only: issues withheld. */
  lockedCount: number;
}

const FREE_PREVIEW = 3;

export function toAccessibilitySummary(
  audit: AccessibilityAudit,
  full: boolean,
): AccessibilitySummary {
  const sorted = sortIssues(audit.issues);
  const shown = full
    ? sorted
    : sorted.slice(0, FREE_PREVIEW).map(({ examples: _e, fix: _f, helpUrl: _h, ...rest }) => rest);
  return {
    standard: audit.standard,
    score: audit.score,
    counts: audit.counts,
    pages: audit.pages,
    pageLimit: audit.pageLimit,
    needsReview: audit.needsReview,
    issues: shown,
    lockedCount: full ? 0 : Math.max(0, sorted.length - FREE_PREVIEW),
  };
}
