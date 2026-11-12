import { canonicalVendor, type AccessibilityAudit, type ScanResult } from "@consentinel/shared";
import { auditAccessibility } from "../accessibility.js";
import { scan } from "../index.js";

/** Fewer than this and the email is a shrug, not a finding. */
export const MIN_VENDORS = 2;

export type Mode = "rejected" | "gpc";

export interface Evidence {
  mode: Mode;
  critical: number;
  gated: number;
  /** Advertising vendors firing, most findings first. */
  firing: string[];
  /**
   * Reject-mode scans only: ad vendors that ignored Global Privacy Control in
   * every run. Empty when GPC wasn't tested or everything stopped.
   */
  gpcIgnored?: string[];
  /**
   * Vendors running that the site's privacy policy didn't mention, in every run
   * whose policy was read. Absent unless every run read the policy.
   */
  notMentioned?: string[];
  /** The last scan behind this evidence, uploaded as the prospect's report. */
  latest?: ScanResult;
  /** Homepage accessibility audit. Absent when it failed or wasn't run. */
  a11y?: A11yEvidence;
}

/** What the email can say about accessibility. Automated WCAG 2.2 A/AA checks only. */
export interface A11yEvidence {
  score: number;
  /** Critical plus serious issues: the ones worth leading with. */
  severe: number;
  /** Worst first, capped at 3. */
  top: { title: string; instances: number }[];
}

export function toA11yEvidence(audit: AccessibilityAudit): A11yEvidence | undefined {
  if (audit.pages.every((p) => p.status === "failed")) return undefined;
  const rank = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;
  const top = [...audit.issues]
    .sort((a, b) => rank[a.impact] - rank[b.impact] || b.instances - a.instances)
    .slice(0, 3)
    .map((i) => ({ title: i.title, instances: i.instances }));
  return { score: audit.score, severe: audit.counts.critical + audit.counts.serious, top };
}

/** Worth an email on accessibility alone: at least one serious issue and a score under 90. */
export function a11yStrong(a: A11yEvidence | undefined): a is A11yEvidence {
  return !!a && a.severe >= 1 && a.score < 90 && a.top.length > 0;
}

/**
 * Which finding leads. Consent leads only when it's strong and accessibility is
 * fair or better; the same rule the Shopify app uses to order its sections.
 */
export function leadWith(ev: Evidence, consentStrong: boolean): "consent" | "a11y" | null {
  const a = a11yStrong(ev.a11y) ? ev.a11y : undefined;
  if (consentStrong && (!a || a.score >= 70)) return "consent";
  if (a) return "a11y";
  return consentStrong ? "consent" : null;
}

/** Consent strength by the old bar, plus what leads. Null lead: nothing worth sending. */
export function qualify(
  ev: Evidence,
  minGpcVendors: number,
): { consentStrong: boolean; lead: "consent" | "a11y" | null } {
  const consentStrong = ev.firing.length >= MIN_VENDORS && tier(ev, minGpcVendors) !== 3;
  return { consentStrong, lead: leadWith(ev, consentStrong) };
}

/** Homepage only, no screenshots, a minute at most. Never throws. */
async function homepageA11y(url: string): Promise<A11yEvidence | undefined> {
  try {
    const audit = await Promise.race([
      auditAccessibility(url, { maxPages: 1, budgetMs: 60_000, screenshots: false }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 90_000)),
    ]);
    return toA11yEvidence(audit);
  } catch {
    return undefined;
  }
}

interface Tally {
  critical: number;
  gated: Set<string>;
  firing: Map<string, number>;
}

function tally(result: ScanResult): Tally {
  const self = result.cmp.detected ? canonicalVendor(result.cmp.detected.name) : null;
  const gated = new Set(result.correctlyGated.map((g) => canonicalVendor(g.vendor)));
  const firing = new Map<string, number>();
  for (const f of result.findings) {
    if (f.severity !== "critical" || !/advert|marketing/i.test(f.category)) continue;
    // Separate-pass GPC findings aren't evidence for the mode this email claims.
    if (f.type === "gpc-signal-ignored" || f.type === "gpc-not-acknowledged") continue;
    const v = canonicalVendor(f.vendor);
    // The store's own platform is not a third party it chose to add.
    if (v === self || /^shopify\b/i.test(v)) continue;
    firing.set(v, (firing.get(v) ?? 0) + 1);
  }
  return { critical: result.counts.critical, gated, firing };
}

/**
 * Some tags fire on one page load and not the next. Untuckit's Google Ads was
 * gated in one run and firing in the next, so a single sample cannot support a
 * named claim. Name a vendor only if it fired in every run and was gated in
 * none; count a vendor as stopped only if it was gated in every run.
 */
export function evaluate(mode: Mode, results: ScanResult[]): Evidence {
  const runs = results.map(tally);
  const first = runs[0];
  if (!first) return { mode, critical: 0, gated: 0, firing: [] };
  const everGated = new Set(runs.flatMap((r) => [...r.gated]));
  const firing = [...first.firing.keys()]
    .filter((v) => runs.every((r) => r.firing.has(v)) && !everGated.has(v))
    .map((v) => ({ v, n: runs.reduce((sum, r) => sum + (r.firing.get(v) ?? 0), 0) }))
    .sort((a, b) => b.n - a.n)
    .map(({ v }) => v);
  return {
    mode,
    critical: Math.min(...runs.map((r) => r.critical)),
    gated: [...first.gated].filter((v) => runs.every((r) => r.gated.has(v))).length,
    firing,
  };
}

/**
 * Vendors that ignored GPC in every run, same bar as `evaluate`. The store's
 * own platform and the CMP are left out, as they are for firing vendors.
 */
export function gpcIgnoredInAll(results: ScanResult[]): string[] {
  const sets = results.map((r) => {
    const self = r.cmp.detected ? canonicalVendor(r.cmp.detected.name) : null;
    return new Set(
      (r.gpcCheck?.mode === "separate-pass" ? r.gpcCheck.ignoredBy : [])
        .map(canonicalVendor)
        .filter((v) => v !== self && !/^shopify\b/i.test(v)),
    );
  });
  const [first, ...rest] = sets;
  if (!first) return [];
  return [...first].filter((v) => rest.every((s) => s.has(v)));
}

/**
 * Not mentioned in every run, same two-scan bar as the rest of the email. Any
 * run that couldn't read the policy voids the claim. Platform and CMP left out.
 */
export function notMentionedInAll(results: ScanResult[]): string[] {
  if (results.length === 0) return [];
  if (!results.every((r) => r.disclosure?.status === "checked")) return [];
  const sets = results.map((r) => {
    const self = r.cmp.detected ? canonicalVendor(r.cmp.detected.name) : null;
    return new Set(
      (r.disclosure?.notNamed ?? []).filter((v) => v !== self && !/^shopify\b/i.test(v)),
    );
  });
  const [first, ...rest] = sets;
  return byProminence([...(first ?? [])].filter((v) => rest.every((s) => s.has(v))));
}

const withPolicy = (ev: Evidence, runs: ScanResult[]): Evidence => {
  const notMentioned = notMentionedInAll(runs);
  return notMentioned.length > 0 ? { ...ev, notMentioned } : ev;
};

/** A clicked reject is the stronger claim; GPC only when no reject was possible. */
export async function gather(url: string): Promise<Evidence | string> {
  const ev = await gatherConsent(url);
  if (typeof ev === "string") return ev;
  const a11y = await homepageA11y(url);
  return a11y ? { ...ev, a11y } : ev;
}

async function gatherConsent(url: string): Promise<Evidence | string> {
  try {
    const normal = await scan(url);
    if (normal.consentAttempt?.performed) {
      const runs = [normal, await scan(url)];
      const ev = evaluate("rejected", runs);
      const gpcIgnored = gpcIgnoredInAll(runs);
      return {
        ...withPolicy(gpcIgnored.length > 0 ? { ...ev, gpcIgnored } : ev, runs),
        latest: runs[1] ?? normal,
      };
    }
    const a = await scan(url, { gpc: true });
    const b = await scan(url, { gpc: true });
    return { ...withPolicy(evaluate("gpc", [a, b]), [a, b]), latest: b };
  } catch (error) {
    return `scan failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Tier rules from the outreach sheet: 1 = fired after a clicked reject,
 * 2 = enough vendors ignore GPC to be worth a lookup credit, 3 = too light.
 */
export function tier(ev: Evidence, minGpcVendors: number): 1 | 2 | 3 {
  if (ev.mode === "rejected") return 1;
  return ev.firing.length >= minGpcVendors ? 2 : 3;
}

/**
 * Names a marketing lead recognizes instantly go first. Finding count is a
 * poor proxy for alarm: 3 Attentive findings land softer than 1 Meta Pixel.
 */
const PROMINENT = [
  "Meta",
  "Google Ads",
  "TikTok",
  "Amazon Advertising",
  "Pinterest",
  "Snap",
  "Reddit",
];

export function byProminence(vendors: string[]): string[] {
  const rank = (v: string): number => {
    const i = PROMINENT.indexOf(v);
    return i === -1 ? PROMINENT.length : i;
  };
  // Stable sort keeps finding-count order among the rest.
  return [...vendors].sort((a, b) => rank(a) - rank(b));
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
}

/** DNS and connection failures: the domain is wrong or dead, not a site we couldn't grade. */
export const NOT_A_SITE =
  /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_ADDRESS_UNREACHABLE|ENOTFOUND/;

/** One line, no terminal colors or Playwright call logs. */
export function cleanError(e: string): string {
  return (
    e
      // eslint-disable-next-line no-control-regex -- stripping ANSI color codes
      .replace(/\u001b\[[0-9;]*m/g, "")
      .split("\n")[0]
      ?.trim()
      .slice(0, 200) ?? ""
  );
}
