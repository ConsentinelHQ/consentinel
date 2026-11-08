import { describe, expect, it } from "vitest";
import {
  FINDING_SCHEMA_VERSION,
  type Finding,
  type GtmTagRef,
  type ScanResult,
} from "./finding.js";
import { fixList, toFreeReport, toFullReport } from "./report.js";

const ref = (tagId: number): GtmTagRef => ({
  containerId: "GTM-AB12",
  tagId,
  kind: "Custom HTML",
  consent: "not-set",
  builtInConsent: false,
  firesOn: ["All Pages"],
  consentTrigger: false,
  fix: `The Custom HTML tag that loads Meta (tag ID ${String(tagId)} in GTM-AB12) has no consent check.`,
});

const f = (over: Partial<Finding>): Finding => ({
  id: over.id ?? "f",
  schemaVersion: FINDING_SCHEMA_VERSION,
  type: "tracker-fires-pre-consent",
  severity: "critical",
  vendor: "Meta",
  category: "advertising",
  title: "Meta fires before consent",
  detail: "d",
  observedUnder: "rejected",
  evidence: {
    kind: "request",
    url: "https://www.facebook.com/tr",
    method: "GET",
    resourceType: "image",
  },
  compliance: [],
  remediation: "Gate Meta.",
  firstSeenAt: "2026-11-08T00:00:00Z",
  ...over,
});

const result: ScanResult = {
  scanId: "s",
  url: "https://example.com/",
  scannedAt: "2026-11-08T00:00:00Z",
  engineVersion: "0.3.0",
  signatureLibraryVersion: "x",
  cmpRegistryVersion: "x",
  cmp: { detected: null, consentMode: { present: false, defaultState: null } },
  headline: "x",
  counts: { critical: 2, warning: 0, info: 0 },
  // Two findings for one vendor sharing a tag: the fix shows once.
  findings: [
    f({ id: "a", gtm: [ref(11)] }),
    f({
      id: "b",
      type: "gpc-signal-ignored",
      title: "Meta ignores Global Privacy Control",
      gtm: [ref(11)],
    }),
  ],
  correctlyGated: [],
  gtm: {
    containers: [
      {
        id: "GTM-AB12",
        version: "9",
        tags: 20,
        unguarded: [{ tagId: 11, kind: "Custom HTML", vendors: ["Meta"] }],
      },
    ],
  },
};

describe("GTM in reports", () => {
  it("puts tag fixes on the full report, once per tag", () => {
    const row = toFullReport(result).findings[0];
    expect(row?.gtmFixes).toEqual([ref(11).fix]);
  });

  it("keeps tag fixes off the free report but shows the summary", () => {
    const free = toFreeReport(result);
    expect(free.findings.every((r) => r.gtmFixes === undefined)).toBe(true);
    expect(free.gtm).toEqual({ containers: [{ id: "GTM-AB12", tags: 20, unguarded: 1 }] });
  });

  it("adds the tag fix to the fix list", () => {
    expect(fixList(result, "https://r")).toContain(
      "In Google Tag Manager: The Custom HTML tag that loads Meta (tag ID 11",
    );
  });
});
