import { FINDING_SCHEMA_VERSION, type Finding, type ScanResult } from "./finding.js";
import { buildTimeline, optOutVendors, type TimelineScan } from "./demand.js";

const f = (
  vendor: string,
  observedUnder: Finding["observedUnder"],
  severity: Finding["severity"] = "critical",
): Finding => ({
  id: `${vendor}-${observedUnder}`,
  schemaVersion: FINDING_SCHEMA_VERSION,
  type: "tracker-fires-pre-consent",
  severity,
  vendor,
  category: "advertising",
  title: "t",
  detail: "d",
  observedUnder,
  evidence: { kind: "request", url: "https://x/", method: "GET", resourceType: "image" },
  compliance: [],
  remediation: "r",
  firstSeenAt: "2026-10-01T00:00:00Z",
});

const result = (findings: Finding[], ignoredBy: string[] = []): ScanResult => ({
  scanId: "s",
  url: "https://shop.com/",
  scannedAt: "2026-10-01T00:00:00Z",
  engineVersion: "0.3.0",
  signatureLibraryVersion: "x",
  cmpRegistryVersion: "x",
  cmp: { detected: null, consentMode: { present: false, defaultState: null } },
  headline: "x",
  counts: { critical: 0, warning: 0, info: 0 },
  findings,
  correctlyGated: [],
  ...(ignoredBy.length
    ? { gpcCheck: { mode: "separate-pass", ignoredBy, stoppedBy: [], acknowledged: false } }
    : {}),
});

const day = (d: string): Date => new Date(`${d}T15:00:00Z`);
const scan = (id: string, d: string, r: ScanResult): TimelineScan => ({
  id,
  finishedAt: day(d),
  result: r,
});

describe("optOutVendors", () => {
  it("takes critical reject and GPC findings, plus GPC ignoredBy", () => {
    const r = result(
      [
        f("Meta", "rejected"),
        f("TikTok", "gpc"),
        f("Klaviyo", "default"),
        f("Hotjar", "rejected", "warning"),
        f("Google Ads", "granted"),
      ],
      ["Criteo"],
    );
    expect(optOutVendors(r)).toEqual({ reject: ["Meta"], gpc: ["Criteo", "TikTok"] });
  });
});

describe("buildTimeline", () => {
  const scans = [
    scan("a", "2026-09-28", result([f("Meta", "rejected")])),
    scan("b", "2026-10-02", result([f("Meta", "rejected"), f("TikTok", "gpc")])),
    scan("c", "2026-10-05", result([f("Meta", "rejected")], ["Meta"])),
    scan("d", "2026-10-09", result([])),
    scan("e", "2026-10-15", result([f("Pinterest", "rejected")])),
  ];
  const t = buildTimeline(
    scans,
    new Date("2026-10-01T04:00:00Z"),
    new Date("2026-10-11T03:59:59Z"),
  );

  it("counts scans per state inside the window only", () => {
    expect(t.vendors.map((v) => [v.vendor, v.afterReject, v.withGpc])).toEqual([
      ["Meta", 2, 1],
      ["TikTok", 0, 1],
    ]);
  });

  it("dates first seen, last seen and the first clean scan after", () => {
    const meta = t.vendors[0]!;
    expect(meta.firstSeen).toEqual(day("2026-09-28"));
    expect(meta.lastSeen).toEqual(day("2026-10-05"));
    expect(meta.stoppedBy).toEqual(day("2026-10-09"));
    expect(meta.current).toBe(false);
  });

  it("keeps vendors seen only outside the window apart", () => {
    expect(t.outside.map((v) => [v.vendor, v.current, v.stoppedBy])).toEqual([
      ["Pinterest", true, null],
    ]);
  });

  it("reports coverage and the longest gap", () => {
    expect(t.coverage.inWindow).toBe(3);
    expect(t.coverage.before).toEqual(day("2026-09-28"));
    expect(t.coverage.after).toEqual(day("2026-10-15"));
    // Oct 5 15:00 to Oct 9 15:00.
    expect(t.coverage.longestGapDays).toBe(4);
    expect(t.byScan.get("b")).toEqual(["Meta", "TikTok"]);
  });

  it("handles a window with no scans", () => {
    const empty = buildTimeline(
      scans,
      new Date("2026-11-01T00:00:00Z"),
      new Date("2026-11-10T00:00:00Z"),
    );
    expect(empty.coverage.inWindow).toBe(0);
    expect(empty.coverage.longestGapDays).toBe(9);
    expect(empty.vendors).toEqual([]);
  });
});
