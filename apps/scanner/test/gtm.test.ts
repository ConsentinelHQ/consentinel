import assert from "node:assert/strict";
import { FINDING_SCHEMA_VERSION, type Finding, type ScanResult } from "@consentinel/shared";
import { attachGtm, containerUrls, parseContainer, readTags, TEMPLATES } from "../src/gtm";
import { classify } from "../src/signatures";
import type { RawScan } from "../src/scanner";

// Synthetic container in the published gtm.js shape: same keys, made-up tags.
const data = {
  resource: {
    version: "42",
    macros: [{ function: "__e" }, { function: "__v", vtp_name: "OnetrustActiveGroups" }],
    tags: [
      // 0: Meta in Custom HTML, no consent settings, All Pages.
      {
        function: "__html",
        vtp_html:
          '<script>!function(f,b,e,v){f.fbq=1}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");fbq("init","1");</script>',
        tag_id: 11,
      },
      // 1: TikTok via a custom template, requires ad_storage.
      { function: "__cvt_1_2", consent: ["list", "ad_storage"], tag_id: 12 },
      // 2: Google Ads, built-in consent checks.
      { function: "__awct", vtp_conversionId: "1", tag_id: 13 },
      // 3: LinkedIn, fired by a OneTrust trigger.
      { function: "__bzi", consent: ["list"], tag_id: 14 },
      // 4: paused Pinterest, ignored.
      { function: "__paused", vtp_originalTagType: "pntr", tag_id: 15 },
      // 5: click listener, not a tag that loads anything.
      { function: "__cl", tag_id: 16 },
    ],
    predicates: [
      { function: "_eq", arg0: ["macro", 0], arg1: "gtm.js" },
      { function: "_eq", arg0: ["macro", 0], arg1: "OneTrustGroupsUpdated" },
      { function: "_cn", arg0: ["macro", 1], arg1: ",C0004," },
    ],
    rules: [
      [
        ["if", 0],
        ["add", 0, 1, 2],
      ],
      [
        ["if", 1, 2],
        ["add", 3],
      ],
    ],
  },
  permissions: {
    __cvt_1_2: { inject_script: { urls: ["https://analytics.tiktok.com/*"] } },
  },
};
const js = `(function(){\nvar data = ${JSON.stringify(data)};\nvar more = {"x":"}"};\n})();`;

// Every built-in template URL must name a vendor, or the mapping is dead weight.
for (const [fn, t] of Object.entries(TEMPLATES)) {
  if (t.url) assert.ok(classify(t.url), `${fn} url ${t.url} should classify`);
}

const c = parseContainer(js, "GTM-TEST1");
assert.ok(c, "container parses");
assert.equal(c.version, "42");
assert.equal(parseContainer("var x = 1;", "GTM-X"), null);
assert.equal(parseContainer("var data = {broken", "GTM-X"), null);

const tags = readTags(c);
const byId = new Map(tags.map((t) => [t.tagId, t]));
assert.equal(tags.length, 4, "paused tag and listener skipped");

const meta = byId.get(11);
assert.ok(meta);
assert.equal(meta.kind, "Custom HTML");
assert.ok(meta.vendors.has("Meta"), `meta vendors: ${[...meta.vendors.keys()].join()}`);
assert.equal(meta.consent, "not-set");
assert.deepEqual(meta.firesOn, ["All Pages"]);
assert.equal(meta.consentTrigger, false);

const tiktok = byId.get(12);
assert.ok(tiktok);
assert.equal(tiktok.kind, "Custom Template");
assert.ok([...tiktok.vendors.keys()].some((v) => /tiktok/i.test(v)));
assert.deepEqual(tiktok.consent, ["ad_storage"]);

const ads = byId.get(13);
assert.ok(ads?.builtInConsent);

const li = byId.get(14);
assert.ok(li);
assert.equal(li.consent, "none");
assert.equal(li.consentTrigger, true);
assert.deepEqual(li.firesOn, ["OneTrustGroupsUpdated"]);

// Enrichment
const finding = (vendor: string, extra: Partial<Finding> = {}): Finding => ({
  id: vendor,
  schemaVersion: FINDING_SCHEMA_VERSION,
  type: "gpc-signal-ignored",
  severity: "critical",
  vendor,
  category: "advertising",
  title: `${vendor} ignores Global Privacy Control`,
  detail: "",
  observedUnder: "gpc",
  evidence: { kind: "request", url: "https://x", method: "GET", resourceType: "script" },
  compliance: [],
  remediation: "base",
  firstSeenAt: "2026-11-08T00:00:00Z",
  ...extra,
});
const tiktokVendor = [...tiktok.vendors.keys()][0] ?? "";
const result = {
  findings: [
    finding("Meta"),
    finding(tiktokVendor),
    finding("Klaviyo"),
    finding("Meta", { id: "child", causedBy: "Amazon" }),
  ],
} as unknown as ScanResult;

const out = attachGtm(result, [c]);
const [fMeta, fTik, fKlav, fChild] = out.findings;
assert.equal(fMeta?.gtm?.[0]?.tagId, 11);
assert.match(
  fMeta?.gtm?.[0]?.fix ?? "",
  /Custom HTML tag that loads Meta \(tag ID 11 in GTM-TEST1\) has no consent check/,
);
assert.match(
  fMeta?.gtm?.[0]?.fix ?? "",
  /Require additional consent for tag to fire", add ad_storage/,
);
assert.match(fTik?.gtm?.[0]?.fix ?? "", /already requires ad_storage/);
assert.equal(fKlav?.gtm, undefined, "not in GTM, no ref");
assert.equal(fChild?.gtm, undefined, "children follow their parent's fix");
assert.equal(fMeta?.remediation, "base", "remediation untouched");
assert.equal(out.gtm?.containers[0]?.id, "GTM-TEST1");
assert.equal(out.gtm?.containers[0]?.tags, 4);
assert.deepEqual(
  out.gtm?.containers[0]?.unguarded.map((u) => u.tagId),
  [11],
  "only Meta has neither a consent check nor a consent trigger",
);
assert.equal(attachGtm(result, []), result, "no containers, untouched");

// Container URLs come from what the page loaded, one per ID.
const pass = (urls: string[]) => ({
  requests: urls.map((url) => ({ url, method: "GET", resourceType: "script", tMs: 0 })),
  cookies: [],
  interaction: { kind: "none" as const, reason: "" },
});
const raw = {
  deniedPass: pass([
    "https://www.googletagmanager.com/gtm.js?id=GTM-ABC1",
    "https://shop.example.com/metrics/gtm.js?id=GTM-ZZ9&l=dl",
  ]),
  grantedPass: pass(["https://www.googletagmanager.com/gtm.js?id=GTM-ABC1&gtm_auth=x"]),
} as unknown as RawScan;
assert.deepEqual(containerUrls(raw), [
  "https://www.googletagmanager.com/gtm.js?id=GTM-ABC1",
  "https://shop.example.com/metrics/gtm.js?id=GTM-ZZ9&l=dl",
]);

console.log("gtm: all checks passed");
