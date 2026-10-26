import type { ScanResult } from "./finding.js";

/**
 * Demand-letter timeline: across a site's sealed scans, which vendors were seen
 * firing after a visitor opted out, and when that started and stopped. Facts
 * only, built from critical findings observed under reject or Global Privacy
 * Control. No inference about visits the scanner didn't make.
 */

export interface TimelineScan {
  id: string;
  finishedAt: Date;
  result: ScanResult;
}

export interface VendorLine {
  vendor: string;
  /** Scans in the claimed window where it fired after reject. */
  afterReject: number;
  /** Scans in the claimed window where it fired with GPC on. */
  withGpc: number;
  /** Across every scan in the pack, window or not. */
  firstSeen: Date;
  lastSeen: Date;
  /** First scan after lastSeen, if any: the earliest date it's shown stopped. */
  stoppedBy: Date | null;
  /** Firing on the newest scan in the pack. */
  current: boolean;
}

export interface Coverage {
  /** Scans finished inside the claimed window. */
  inWindow: number;
  firstInWindow: Date | null;
  lastInWindow: Date | null;
  /** Longest stretch with no scan, counting the window edges, in whole days. */
  longestGapDays: number;
  /** Nearest scans outside the window, for the state going in and coming out. */
  before: Date | null;
  after: Date | null;
}

export interface Timeline {
  coverage: Coverage;
  /** Vendors seen in the window, most scans first. */
  vendors: VendorLine[];
  /** Vendors seen only outside the window, for context. */
  outside: VendorLine[];
  /** Per scan: vendors firing after opt-out, both states combined. */
  byScan: Map<string, string[]>;
}

/** Opt-out vendors in one scan, split by state. Critical findings only. */
export function optOutVendors(result: ScanResult): { reject: string[]; gpc: string[] } {
  const reject = new Set<string>();
  const gpc = new Set<string>();
  for (const f of result.findings) {
    if (f.severity !== "critical") continue;
    if (f.observedUnder === "rejected") reject.add(f.vendor);
    else if (f.observedUnder === "gpc") gpc.add(f.vendor);
  }
  for (const v of result.gpcCheck?.ignoredBy ?? []) gpc.add(v);
  return { reject: [...reject].sort(), gpc: [...gpc].sort() };
}

const DAY = 86_400_000;

export function buildTimeline(scans: TimelineScan[], from: Date, to: Date): Timeline {
  const sorted = [...scans].sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime());
  const inside = (s: TimelineScan): boolean =>
    s.finishedAt.getTime() >= from.getTime() && s.finishedAt.getTime() <= to.getTime();
  const window = sorted.filter(inside);

  const stops = [from.getTime(), ...window.map((s) => s.finishedAt.getTime()), to.getTime()];
  let gap = 0;
  for (let i = 1; i < stops.length; i++) gap = Math.max(gap, stops[i]! - stops[i - 1]!);

  const before = [...sorted].reverse().find((s) => s.finishedAt.getTime() < from.getTime());
  const after = sorted.find((s) => s.finishedAt.getTime() > to.getTime());

  const lines = new Map<string, VendorLine & { inWindow: boolean }>();
  const byScan = new Map<string, string[]>();
  for (const s of sorted) {
    const { reject, gpc } = optOutVendors(s.result);
    const all = [...new Set([...reject, ...gpc])].sort();
    byScan.set(s.id, all);
    for (const vendor of all) {
      const line = lines.get(vendor) ?? {
        vendor,
        afterReject: 0,
        withGpc: 0,
        firstSeen: s.finishedAt,
        lastSeen: s.finishedAt,
        stoppedBy: null,
        current: false,
        inWindow: false,
      };
      line.lastSeen = s.finishedAt;
      if (inside(s)) {
        line.inWindow = true;
        if (reject.includes(vendor)) line.afterReject++;
        if (gpc.includes(vendor)) line.withGpc++;
      }
      lines.set(vendor, line);
    }
  }
  const newest = sorted[sorted.length - 1];
  const newestVendors = new Set(newest ? (byScan.get(newest.id) ?? []) : []);
  const done: (VendorLine & { inWindow: boolean })[] = [...lines.values()].map((l) => ({
    ...l,
    current: newestVendors.has(l.vendor),
    stoppedBy:
      sorted.find((s) => s.finishedAt.getTime() > l.lastSeen.getTime())?.finishedAt ?? null,
  }));
  const strip = ({ inWindow: _, ...l }: VendorLine & { inWindow: boolean }): VendorLine => l;
  const rank = (a: VendorLine, b: VendorLine): number =>
    b.afterReject + b.withGpc - (a.afterReject + a.withGpc) || a.vendor.localeCompare(b.vendor);

  return {
    coverage: {
      inWindow: window.length,
      firstInWindow: window[0]?.finishedAt ?? null,
      lastInWindow: window[window.length - 1]?.finishedAt ?? null,
      longestGapDays: Math.floor(gap / DAY),
      before: before?.finishedAt ?? null,
      after: after?.finishedAt ?? null,
    },
    vendors: done
      .filter((l) => l.inWindow)
      .map(strip)
      .sort(rank),
    outside: done
      .filter((l) => !l.inWindow)
      .map(strip)
      .sort((a, b) => a.vendor.localeCompare(b.vendor)),
    byScan,
  };
}
