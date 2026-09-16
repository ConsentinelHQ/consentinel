import { describe, expect, it } from "vitest";
import { detectBlock } from "./blocking.js";

describe("detectBlock", () => {
  it("names Cloudflare from cf-mitigated", () => {
    expect(
      detectBlock({ status: 403, headers: { "cf-mitigated": "challenge" }, cookieNames: [] }),
    ).toMatchObject({ vendor: "cloudflare" });
  });

  it("names Akamai from a challenge status plus its cookie", () => {
    expect(detectBlock({ status: 403, headers: {}, cookieNames: ["_abck"] })).toMatchObject({
      vendor: "akamai",
    });
  });

  it("names DataDome from its header", () => {
    expect(
      detectBlock({ status: 403, headers: { "x-datadome": "protected" }, cookieNames: [] }),
    ).toMatchObject({ vendor: "datadome" });
  });

  it("catches a challenge page that returns 200", () => {
    expect(
      detectBlock({ status: 200, headers: {}, cookieNames: [], title: "Just a moment..." }),
    ).toMatchObject({ vendor: "cloudflare" });
  });

  it("reports an unnamed block rather than nothing", () => {
    expect(detectBlock({ status: 429, headers: {}, cookieNames: [] })).toMatchObject({
      vendor: "unknown",
    });
  });

  // The expensive failure is the other direction: calling a working page blocked
  // would break every scan. Akamai's cookies appear on normal traffic too.
  it("does not flag a healthy page", () => {
    expect(
      detectBlock({ status: 200, headers: {}, cookieNames: ["_ga"], title: "Shop" }),
    ).toBeNull();
  });

  it("does not flag Akamai cookies on a 200", () => {
    expect(detectBlock({ status: 200, headers: {}, cookieNames: ["_abck", "bm_sz"] })).toBeNull();
  });
});
