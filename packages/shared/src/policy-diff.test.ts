import { diffPolicy, isMeaningfulChange } from "./policy-diff.js";

describe("diffPolicy", () => {
  const before =
    "Privacy Policy\nLast updated: May 1, 2026\nWe use Google Analytics.\n\nWe share data with Facebook.";
  it("lists added and removed paragraphs, ignoring reflowed whitespace", () => {
    const after =
      "Privacy Policy\nLast updated: October 1, 2026\nWe use   Google Analytics.\nWe share data with Facebook and TikTok.";
    expect(diffPolicy(before, after)).toEqual({
      added: ["Last updated: October 1, 2026", "We share data with Facebook and TikTok."],
      removed: ["Last updated: May 1, 2026", "We share data with Facebook."],
    });
  });

  it("calls a date bump alone not meaningful", () => {
    const after = before.replace("May 1, 2026", "October 1, 2026");
    expect(isMeaningfulChange(diffPolicy(before, after))).toBe(false);
    expect(
      isMeaningfulChange(
        diffPolicy(before, `${before}\nWe now use TikTok for advertising on our store.`),
      ),
    ).toBe(true);
  });

  it("finds nothing between identical texts", () => {
    expect(diffPolicy(before, before)).toEqual({ added: [], removed: [] });
  });
});
