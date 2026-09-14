import { FINDING_SCHEMA_VERSION, type Finding } from "./finding.js";
import { countBySeverity, severityFor, sortFindings } from "./severity.js";

const base = (over: Partial<Finding>): Finding => ({
  id: "f1",
  schemaVersion: FINDING_SCHEMA_VERSION,
  type: "dead-tag",
  severity: "warning",
  vendor: "Meta",
  category: "advertising",
  title: "t",
  detail: "d",
  observedUnder: "rejected",
  evidence: { kind: "request", url: "https://x", method: "GET", resourceType: "script" },
  compliance: [],
  remediation: "r",
  firstSeenAt: "2026-09-13T00:00:00Z",
  ...over,
});

describe("severity", () => {
  it("pre-consent firing is always critical", () => {
    expect(severityFor("tracker-fires-pre-consent")).toBe("critical");
    expect(severityFor("dead-tag")).toBe("warning");
  });

  it("sorts critical first, then deterministic by vendor/title", () => {
    const out = sortFindings([
      base({ id: "b", vendor: "Zed", title: "b" }),
      base({ id: "a", severity: "critical", vendor: "Zed", title: "a" }),
      base({ id: "c", vendor: "Alpha", title: "c" }),
    ]);
    expect(out.map((f) => f.id)).toEqual(["a", "c", "b"]);
  });

  it("counts every severity bucket even when empty", () => {
    expect(countBySeverity([base({})])).toEqual({ critical: 0, warning: 1, info: 0 });
  });
});
