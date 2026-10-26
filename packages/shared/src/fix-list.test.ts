import { FINDING_SCHEMA_VERSION, type Finding, type ScanResult } from "./finding.js";
import { fixList } from "./report.js";

const f = (over: Partial<Finding>): Finding => ({
  id: over.id ?? "f",
  schemaVersion: FINDING_SCHEMA_VERSION,
  type: "tracker-fires-pre-consent",
  severity: "critical",
  vendor: "Amazon Advertising",
  category: "advertising",
  title: "Amazon Advertising fires with Global Privacy Control on",
  detail: "d",
  observedUnder: "gpc",
  evidence: {
    kind: "request",
    url: "https://s.amazon-adsystem.com/x",
    method: "GET",
    resourceType: "image",
  },
  compliance: [],
  remediation: "Block Amazon Advertising when a visitor opts out.",
  firstSeenAt: "2026-10-26T00:00:00Z",
  ...over,
});

const result: ScanResult = {
  scanId: "s",
  url: "https://drinkolipop.com/",
  scannedAt: "2026-10-26T15:06:02Z",
  engineVersion: "0.3.0",
  signatureLibraryVersion: "x",
  cmpRegistryVersion: "x",
  cmp: { detected: null, consentMode: { present: false, defaultState: null } },
  headline: "x",
  counts: { critical: 0, warning: 0, info: 0 },
  findings: [
    f({ id: "a" }),
    f({ id: "b", vendor: "BidSwitch", causedBy: "Amazon Advertising", remediation: "x" }),
    f({ id: "c", vendor: "Klaviyo", remediation: "Hold back Klaviyo for opted-out visitors." }),
    f({ id: "d", severity: "info", vendor: "Opt-out confirmation", type: "gpc-not-acknowledged" }),
  ],
  correctlyGated: [],
};

describe("fix list", () => {
  const text = fixList(result, "https://www.getconsentinel.com/report/s?t=1");

  it("lists root vendors once, children folded into their parent", () => {
    expect(text).toMatch(/^1\. Amazon Advertising \(critical\): .*Also clears: BidSwitch\.$/m);
    expect(text).not.toMatch(/^\d\. BidSwitch/m);
    expect(text).toMatch(/^2\. Klaviyo \(critical\)/m);
  });

  it("leaves out info rows and ends with the report link", () => {
    expect(text).not.toMatch(/Opt-out confirmation/);
    expect(text.trim().endsWith("https://www.getconsentinel.com/report/s?t=1")).toBe(true);
    expect(text).toMatch(/^Consent fixes for drinkolipop\.com \(scanned 2026-10-26\)/);
  });
});
