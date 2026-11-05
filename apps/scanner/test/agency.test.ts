import assert from "node:assert/strict";
import {
  agencyEmail,
  agencyFollowUpEmail,
  checkAgency,
  leakingVendors,
  pickAgencyContact,
} from "../src/outreach/agency.js";
import type { Contact } from "../src/outreach/contacts.js";
import type { Evidence } from "../src/outreach/evidence.js";
import { render } from "../src/outreach/template.js";

// checkAgency: domains normalized, own domain dropped, minimum clients, https source.
const input = {
  domain: "https://www.Agency.com/",
  name: "Agency Co",
  clients: ["a.com", "www.b.com", "https://c.com/", "agency.com", "a.com"],
  source: "https://agency.com/work",
};
const reason = (x: unknown): string => (typeof x === "string" ? x : "accepted");
const ok = checkAgency(input, new Set());
assert.ok(typeof ok !== "string");
assert.equal(ok.domain, "agency.com");
assert.deepEqual(ok.clients, ["a.com", "b.com", "c.com"]);
assert.equal(ok.status, "pending");
assert.match(
  reason(checkAgency({ ...input, clients: ["a.com", "b.com"] }, new Set())),
  /at least 3/,
);
assert.match(reason(checkAgency({ ...input, source: "http://x" }, new Set())), /--source/);
assert.match(reason(checkAgency(input, new Set(["agency.com"]))), /already/);
assert.match(reason(checkAgency({ ...input, name: " " }, new Set())), /--name/);

// leakingVendors: the bigger list wins, under MIN_VENDORS is clean.
const ev = (firing: string[], gpcIgnored?: string[]): Evidence => ({
  mode: gpcIgnored ? "rejected" : "gpc",
  critical: 5,
  gated: 0,
  firing,
  ...(gpcIgnored ? { gpcIgnored } : {}),
});
assert.deepEqual(leakingVendors(ev(["Meta", "TikTok"])), ["Meta", "TikTok"]);
assert.deepEqual(leakingVendors(ev(["Meta"])), []);
assert.deepEqual(leakingVendors(ev(["Meta"], ["Meta", "Google Ads", "TikTok"])), [
  "Meta",
  "Google Ads",
  "TikTok",
]);

// pickAgencyContact: founder beats developer beats anyone.
const c = (title: string): Contact => ({
  firstName: title,
  fullName: title,
  email: `${title.replace(/\W/g, "").toLowerCase()}@agency.com`,
  title,
  verified: "valid",
  source: "anymail",
});
assert.equal(pickAgencyContact([c("Developer"), c("Co-Founder")])?.title, "Co-Founder");
assert.equal(
  pickAgencyContact([c("Designer"), c("Head of Development")])?.title,
  "Head of Development",
);
assert.equal(pickAgencyContact([c("Designer")])?.title, "Designer");
assert.equal(pickAgencyContact([]), null);

// Agency email: names leaking clients, leads with the worst one, no threats.
const results = [
  { domain: "a.com", leaking: ["TikTok", "Meta", "Google Ads", "Pinterest"] },
  { domain: "b.com", leaking: ["Meta", "Snap"] },
  { domain: "c.com", leaking: [] },
  { domain: "d.com", leaking: [], error: "timeout" },
];
const mail = agencyEmail({ firstName: "Sam", results });
assert.match(mail.text, /^Hi Sam,/);
assert.match(mail.text, /on 3 stores from your work page\. On 2 of them \(a\.com and b\.com\)/i);
assert.match(mail.text, /4 vendors on a\.com, including Meta, Google Ads and TikTok/);
assert.match(mail.text, /white-label reports/);
assert.doesNotMatch(mail.text + mail.html, /CIPA|lawsuit|suit|fine|legal|liab/i);
assert.match(mail.html, /<a href="https:\/\/www\.getconsentinel\.com\/">Consentinel<\/a>/);
assert.throws(() => agencyEmail({ firstName: "Sam", results: [results[2]!] }));
const fu = agencyFollowUpEmail({ firstName: "Sam", results });
assert.equal(fu.subject, `Re: ${mail.subject}`);
assert.match(fu.text, /a\.com and b\.com/);

// Brand cold email: no legal threats either way.
for (const e of [ev(["Meta", "TikTok", "Google Ads"]), ev(["Meta", "TikTok"], [])]) {
  const m = render({ domain: "brand.com", firstName: "Ann", ev: e, postalAddress: "" });
  assert.doesNotMatch(m.text + m.html, /CIPA|lawsuit|suits|fines|legal/i);
}

console.log("agency tests passed");

// Shopify stores get the App Store line, linked in HTML; others don't.
{
  const e = ev(["Meta", "TikTok", "Google Ads"]);
  const shop = render({
    domain: "brand.com",
    firstName: "Ann",
    ev: e,
    postalAddress: "",
    shopify: true,
  });
  assert.match(
    shop.text,
    /Shopify App Store \(https:\/\/apps\.shopify\.com\/consentinel-1\)/,
  );
  assert.match(
    shop.html,
    /<a href="https:\/\/apps\.shopify\.com\/consentinel-1">Shopify App Store<\/a>/,
  );
  const plain = render({ domain: "brand.com", firstName: "Ann", ev: e, postalAddress: "" });
  assert.doesNotMatch(plain.text + plain.html, /App Store/);
  console.log("app store line passed");
}
