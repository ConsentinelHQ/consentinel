import assert from "node:assert/strict";
import { tier, type Evidence } from "../src/outreach/evidence.js";
import { mime, normDomain } from "../src/outreach/google.js";
import { addBusinessDays, sentToday, shouldPause, type Entry } from "../src/outreach/state.js";
import { bullets, render } from "../src/outreach/template.js";

const rejected: Evidence = {
  mode: "rejected",
  critical: 14,
  gated: 3,
  firing: ["Attentive", "Meta", "Xandr", "TikTok", "Amazon Advertising"],
};
const gpc: Evidence = { mode: "gpc", critical: 9, gated: 0, firing: ["Google Ads", "Criteo"] };

// Always exactly three bullets, prominent vendors named first.
const [b1, b2, b3] = bullets(rejected);
assert.equal(
  b1,
  "After declining cookies, 5 ad vendors still fire, including Meta, TikTok and Amazon Advertising",
);
assert.match(b2, /^3 other vendors correctly wait for consent/);
assert.match(b3, /twice .* 14 critical findings/);
assert.match(
  bullets(gpc)[0],
  /Global Privacy Control.*2 ad vendors still fire: Google Ads and Criteo$/,
);
assert.equal(bullets(gpc)[1], "None of them stopped when the signal was on");
assert.match(bullets({ ...rejected, gated: 1 })[1], /^1 other vendor correctly waits/);

// Template: his wording, no "manual scan", link, opt-out and postal address present.
const email = render({
  domain: "chomps.com",
  firstName: "",
  ev: rejected,
  postalAddress: "PO Box 1, Boonton NJ",
});
assert.equal(email.subject, "Privacy issues on chomps.com");
assert.match(email.text, /^Hi there,\n/);
assert.match(email.text, /Sorry to bother, my name is Charlie Buckley/);
assert.match(email.text, /I ran a scan on chomps\.com/);
assert.doesNotMatch(email.text, /manual scan/);
assert.match(email.text, /Sephora \$1\.2M and Healthline \$1\.55M/);
assert.match(email.text, /PO Box 1, Boonton NJ$/);
assert.match(email.html, /<a href="https:\/\/www\.getconsentinel\.com\/">Consentinel<\/a>/);
assert.equal((email.html.match(/<li>/g) ?? []).length, 3);
assert.doesNotMatch(email.text, /—/, "no em dashes");

// HTML escaping holds for hostile vendor names.
assert.doesNotMatch(
  render({
    domain: "x.com",
    firstName: "<b>",
    ev: { ...gpc, firing: ["<script>", "Meta"] },
    postalAddress: "",
  }).html,
  /<script>|<b>/,
);

// MIME round-trips and carries the unsubscribe header.
const raw = Buffer.from(
  mime("Charlie <c@getconsentinel.com>", "a@b.com", email),
  "base64url",
).toString();
assert.match(raw, /^From: Charlie <c@getconsentinel.com>\r\nTo: a@b.com\r\n/);
assert.match(raw, /List-Unsubscribe: <mailto:c@getconsentinel.com\?subject=unsubscribe>/);

assert.equal(normDomain("https://www.Chomps.com/products"), "chomps.com");

// Tiers follow the sheet: reject = 1, 8+ GPC vendors = 2, else 3.
assert.equal(tier(rejected, 8), 1);
assert.equal(tier(gpc, 8), 3);
assert.equal(tier({ ...gpc, firing: Array.from({ length: 8 }, (_, i) => `v${String(i)}`) }, 8), 2);

// Bounce kill switch.
assert.equal(shouldPause(0, 1), false);
assert.equal(shouldPause(20, 2), true);
assert.equal(shouldPause(100, 3), false);
assert.equal(shouldPause(100, 4), true);

// Daily cap counts sends on the New York calendar day only.
const now = new Date("2026-10-22T14:00:00Z");
const ledger: Entry[] = [
  { at: "2026-10-22T13:00:00Z", domain: "a.com", action: "sent" },
  { at: "2026-10-22T03:00:00Z", domain: "b.com", action: "sent" }, // Oct 21 in NY
  { at: "2026-10-22T13:30:00Z", domain: "c.com", action: "drafted" },
];
assert.equal(sentToday(ledger, now), 1);

// Friday + 5 business days = next Friday.
assert.equal(addBusinessDays(new Date("2026-10-23T12:00:00"), 5).getDate(), 30);

console.log("outreach: all assertions passed");
