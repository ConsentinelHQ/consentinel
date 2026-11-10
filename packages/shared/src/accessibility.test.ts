import {
  newSeriousIssues,
  scoreAccessibility,
  toAccessibilitySummary,
  type AccessibilityAudit,
  type AccessibilityIssue,
} from "./accessibility.js";

const issue = (
  rule: string,
  impact: AccessibilityIssue["impact"],
  pages = 1,
): AccessibilityIssue => ({
  rule,
  impact,
  title: rule,
  wcag: ["1.1.1"],
  level: "A",
  pages: Array.from({ length: pages }, (_, i) => `/p${i}`),
  instances: pages * 2,
  examples: [{ page: "/", selector: "img", html: "<img>" }],
  fix: "Add alt text.",
  helpUrl: "https://example.com",
});

const audit = (issues: AccessibilityIssue[]): AccessibilityAudit => ({
  engine: "axe-core test",
  standard: "WCAG 2.2 AA",
  pageLimit: 1,
  pages: [{ url: "https://shop.com/", label: "Homepage", status: "ok", issues: issues.length }],
  score: scoreAccessibility(issues),
  counts: { critical: 0, serious: 0, moderate: 0, minor: 0 },
  issues,
  needsReview: 0,
});

describe("scoreAccessibility", () => {
  it("scores a clean page 100 and floors at 0", () => {
    expect(scoreAccessibility([])).toBe(100);
    expect(scoreAccessibility([issue("a", "critical"), issue("b", "serious")])).toBe(77);
    expect(
      scoreAccessibility(Array.from({ length: 9 }, (_, i) => issue(`r${i}`, "critical"))),
    ).toBe(0);
  });
});

describe("toAccessibilitySummary", () => {
  const a = audit([
    issue("minor-one", "minor"),
    issue("image-alt", "critical", 3),
    issue("color-contrast", "serious"),
    issue("label", "critical", 1),
    issue("region", "moderate"),
  ]);

  it("free view shows the worst three without fixes or examples", () => {
    const s = toAccessibilitySummary(a, false);
    expect(s.issues.map((i) => i.rule)).toEqual(["image-alt", "label", "color-contrast"]);
    expect(s.issues[0]?.fix).toBeUndefined();
    expect(s.issues[0]?.examples).toBeUndefined();
    expect(s.lockedCount).toBe(2);
  });

  it("full view shows everything", () => {
    const s = toAccessibilitySummary(a, true);
    expect(s.issues).toHaveLength(5);
    expect(s.issues[0]?.fix).toBe("Add alt text.");
    expect(s.lockedCount).toBe(0);
  });
});

describe("newSeriousIssues", () => {
  it("flags only new critical and serious checks", () => {
    const before = audit([issue("image-alt", "critical")]);
    const after = audit([
      issue("image-alt", "critical"),
      issue("label", "serious"),
      issue("region", "moderate"),
    ]);
    expect(newSeriousIssues(before, after).map((i) => i.rule)).toEqual(["label"]);
    expect(newSeriousIssues(undefined, after)).toEqual([]);
  });
});
