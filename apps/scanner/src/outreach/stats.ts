import type { SheetRow } from "./google.js";

/**
 * Numbers for content, from the outreach sheet's scan history.
 *
 * The sheet only records sites where we found violations, so it can't say what
 * share of all sites leak. Every figure here is about that population and
 * carries its sample size: "of N brands where trackers fired after an opt-out,
 * Meta was involved in X%". `population` spells that out for whoever writes.
 */

/** Vendor names as they appear in Key finding / Notes, mapped to one label. */
const VENDORS: [string, RegExp][] = [
  ["Meta", /\b(meta|facebook)\b/i],
  ["Google Ads", /\b(google ads|doubleclick)\b/i],
  ["TikTok", /\btiktok\b/i],
  ["Amazon Advertising", /\bamazon advertising\b/i],
  ["Pinterest", /\bpinterest\b/i],
  ["Snap", /\bsnap(chat)?\b/i],
  ["Reddit", /\breddit\b/i],
  ["Microsoft Ads", /\b(microsoft (uet|ads)|bing)\b/i],
  ["LinkedIn", /\blinkedin\b/i],
  ["Criteo", /\bcriteo\b/i],
  ["The Trade Desk", /\btrade desk\b/i],
  ["LiveRamp", /\bliveramp\b/i],
  ["Xandr", /\bxandr\b/i],
  ["Klaviyo", /\bklaviyo\b/i],
  ["Attentive", /\battentive\b/i],
  ["Postscript", /\bpostscript\b/i],
];

export interface Stats {
  population: string;
  /** Leaking sites: a nameable vendor kept firing after an opt-out. The base for every share. */
  sites: number;
  /** Every successful scan in the sheet, leaking or not. */
  scanned: number;
  /** Scans the nightly pipeline logged, clean ones included: the only sample with a fair pass rate. */
  pipeline: { scanned: number; leaking: number; share: number };
  afterReject: number;
  underGpc: number;
  medianCritical: number | null;
  vendors: { vendor: string; sites: number; share: number }[];
  bySegment: { segment: string; sites: number }[];
}

const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((n / d) * 100));

export function computeStats(rows: SheetRow[]): Stats {
  const scanned = rows.filter(({ values: v }) => {
    const mode = (v["Scan mode"] ?? "").trim().toLowerCase();
    return (mode === "gpc" || mode === "rejected") && v["Status"] !== "Scan failed";
  });
  // A scan with no named vendor is a clean (or unprovable) site, not a leak.
  const leaks = (r: SheetRow): boolean => (r.values["Key finding"] ?? "").trim() !== "";
  const sites = scanned.filter(leaks);
  // Rows the nightly run wrote carry its note; imported rows were leak-only, so they'd skew a pass rate.
  const piped = scanned.filter((r) => (r.values["Notes"] ?? "").includes("outreach bot"));
  const mode = (r: SheetRow): string => (r.values["Scan mode"] ?? "").trim().toLowerCase();

  const criticals = sites
    .map((r) => Number(r.values["Critical"] ?? ""))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const mid = Math.floor(criticals.length / 2);
  const median =
    criticals.length === 0
      ? null
      : criticals.length % 2
        ? (criticals[mid] ?? null)
        : Math.round(((criticals[mid - 1] ?? 0) + (criticals[mid] ?? 0)) / 2);

  const vendorCounts = new Map<string, number>();
  for (const r of sites) {
    const text = `${r.values["Key finding"] ?? ""} ${r.values["Notes"] ?? ""}`;
    for (const [name, re] of VENDORS) {
      if (re.test(text)) vendorCounts.set(name, (vendorCounts.get(name) ?? 0) + 1);
    }
  }

  const segments = new Map<string, number>();
  for (const r of sites) {
    const seg = (r.values["Segment"] ?? "").trim();
    if (seg && seg !== "Inbound") segments.set(seg, (segments.get(seg) ?? 0) + 1);
  }

  return {
    population: `US e-commerce brands where Consentinel found trackers still firing after a visitor opted out (clicked reject, or sent Global Privacy Control). Every share is over leaking sites only. For how common leaks are, use pipeline.share (nightly scans, clean ones included) and say it's from that sample, never all sites.`,
    sites: sites.length,
    scanned: scanned.length,
    pipeline: {
      scanned: piped.length,
      leaking: piped.filter(leaks).length,
      share: pct(piped.filter(leaks).length, piped.length),
    },
    afterReject: sites.filter((r) => mode(r) === "rejected").length,
    underGpc: sites.filter((r) => mode(r) === "gpc").length,
    medianCritical: median,
    vendors: [...vendorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([vendor, n]) => ({ vendor, sites: n, share: pct(n, sites.length) })),
    bySegment: [...segments.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([segment, n]) => ({ segment, sites: n })),
  };
}
