import { FINDING_SCHEMA_VERSION, type Finding, type ScanResult } from "./finding.js";
import { toFreeReport, toFullReport } from "./report.js";

const f = (over: Partial<Finding>): Finding => ({
  id: over.id ?? "f",
  schemaVersion: FINDING_SCHEMA_VERSION,
  type: "tracker-fires-pre-consent",
  severity: "critical",
  vendor: "Meta Pixel",
  category: "advertising",
  title: "Meta Pixel fires under rejected consent",
  detail: "d",
  observedUnder: "rejected",
  evidence: {
    kind: "request",
    url: "https://www.facebook.com/tr",
    method: "GET",
    resourceType: "image",
  },
  compliance: [],
  remediation: "r",
  firstSeenAt: "2026-10-22T00:00:00Z",
  ...over,
});

const result = (findings: Finding[]): ScanResult => ({
  scanId: "s",
  url: "https://shop.example/",
  scannedAt: "2026-10-22T00:00:00Z",
  engineVersion: "0.3.0",
  signatureLibraryVersion: "x",
  cmpRegistryVersion: "x",
  cmp: { detected: null, consentMode: { present: false, defaultState: null } },
  headline: "1 tracker firing before consent",
  counts: { critical: 0, warning: 0, info: 0 },
  findings,
  correctlyGated: [{ vendor: "Pinterest Tag", category: "advertising" }],
  gpcCheck: {
    mode: "separate-pass",
    ignoredBy: ["Meta", "Pinterest"],
    stoppedBy: ["Criteo"],
    acknowledged: false,
  },
});

const gpcMeta = f({
  id: "g1",
  type: "gpc-signal-ignored",
  title: "Meta Pixel ignores Global Privacy Control",
  observedUnder: "gpc",
});
const gpcPinterest = f({
  id: "g2",
  type: "gpc-signal-ignored",
  vendor: "Pinterest Tag",
  title: "Pinterest Tag ignores Global Privacy Control",
  observedUnder: "gpc",
});
const ack = f({
  id: "a1",
  type: "gpc-not-acknowledged",
  severity: "info",
  vendor: "Opt-out confirmation",
  category: "unknown",
  title: "No opt-out confirmation shown for Global Privacy Control",
  observedUnder: "gpc",
});

describe("GPC pass in reports", () => {
  const full = toFullReport(result([f({ id: "p1" }), gpcMeta, gpcPinterest, ack]));

  it("doesn't turn a reject-test report into a GPC report", () => {
    expect(full.gpc).toBe(false);
  });

  it("folds GPC into an existing vendor row", () => {
    const meta = full.findings.find((r) => r.vendor === "Meta");
    expect(meta?.title).toBe("Meta fires before consent, and ignores Global Privacy Control");
  });

  it("gives a GPC-only vendor its own wording", () => {
    const pin = full.findings.find((r) => r.vendor === "Pinterest");
    expect(pin?.title).toBe("Pinterest ignores Global Privacy Control");
    expect(pin?.type).toBe("gpc-signal-ignored");
    expect(pin?.severity).toBe("critical");
  });

  it("shows a standalone finding under its own title", () => {
    const row = full.findings.find((r) => r.vendor === "Opt-out confirmation");
    expect(row?.title).toBe("No opt-out confirmation shown for Global Privacy Control");
    expect(row?.detail).toEqual([]);
  });

  it("carries the GPC summary to both views", () => {
    expect(full.gpcCheck?.ignoredBy).toEqual(["Meta", "Pinterest"]);
    expect(toFreeReport(result([gpcMeta])).gpcCheck?.stoppedBy).toEqual(["Criteo"]);
  });

  it("keeps the GPC framing for fallback scans", () => {
    const fallback = toFullReport(
      result([
        f({ observedUnder: "gpc", title: "Meta Pixel fires with Global Privacy Control on" }),
      ]),
    );
    expect(fallback.gpc).toBe(true);
  });
});
