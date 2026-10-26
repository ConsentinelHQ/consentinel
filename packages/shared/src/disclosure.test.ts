import { checkDisclosure, termsFor } from "./disclosure.js";

describe("checkDisclosure", () => {
  const policy = `
    We use cookies and similar technologies. Our advertising partners include Facebook
    and Google, and we use Klaviyo for email. Analytics are provided by Hotjar.
    We may share data with our service providers to improve the meta data of our site.
  `;

  it("names vendors by their own or their owner's name, deduped by canonical name", () => {
    expect(
      checkDisclosure(
        [
          "Meta Pixel",
          "Google Ads",
          "Google Analytics 4",
          "Google DoubleClick",
          "Klaviyo",
          "Hotjar",
          "TikTok Pixel",
          "Meta Pixel",
        ],
        [policy],
      ),
    ).toEqual({
      named: ["Google Ads", "Google Analytics", "Google DoubleClick", "Hotjar", "Klaviyo", "Meta"],
      notNamed: ["TikTok"],
    });
  });

  it("doesn't take common words as a vendor's name", () => {
    expect(
      checkDisclosure(
        ["Heap", "Segment", "Impact", "Drift"],
        ["a heap of data in each segment can impact results and drift"],
      ).notNamed,
    ).toEqual(["Drift", "Heap", "Impact", "Segment"]);
    expect(
      checkDisclosure(["Segment", "Impact"], ["We use Segment and impact.com."]).named,
    ).toEqual(["Impact", "Segment"]);
    // "meta data" is not Meta.
    expect(checkDisclosure(["Meta Pixel"], ["We review the meta data of pages."]).notNamed).toEqual(
      ["Meta"],
    );
  });

  it("falls back to the vendor name, and without a product suffix", () => {
    expect(termsFor("Criteo").some((r) => r.test("criteo s.a."))).toBe(true);
    expect(
      checkDisclosure(
        ["Reddit Pixel", "Lucky Orange"],
        ["We use Reddit ads and Lucky Orange heatmaps."],
      ).notNamed,
    ).toEqual([]);
    expect(checkDisclosure(["Pinterest Tag"], ["pinterest"]).named).toEqual(["Pinterest"]);
  });

  it("joins privacy and cookie policy text", () => {
    expect(
      checkDisclosure(["TikTok Pixel", "Meta Pixel"], ["We use Facebook.", "Cookie list: TikTok"])
        .notNamed,
    ).toEqual([]);
  });
});
