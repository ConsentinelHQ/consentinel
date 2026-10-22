import assert from "node:assert/strict";
import { backlog, sheetContact } from "../src/outreach/backlog.js";
import { NOT_A_SITE, cleanError, tier, type Evidence } from "../src/outreach/evidence.js";
import { mime, normDomain, type SheetRow } from "../src/outreach/google.js";
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
const noAddr = render({ domain: "x.com", firstName: "A", ev: rejected, postalAddress: "" });
assert.match(noAddr.text, /I won't email again\.$/);
assert.doesNotMatch(noAddr.text + noAddr.html, /POSTAL ADDRESS/);
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

// Bad domains stay out of the sheet; notes are one clean line.
const dns =
  'page.goto: net::ERR_NAME_NOT_RESOLVED at https://x.com/\nCall log:\n\u001b[2m  - navigating to "https://x.com/"\u001b[22m\n';
assert.equal(NOT_A_SITE.test(dns), true);
assert.equal(NOT_A_SITE.test("The page made only 1 requests"), false);
assert.equal(
  cleanError(`scan failed: ${dns}`),
  "scan failed: page.goto: net::ERR_NAME_NOT_RESOLVED at https://x.com/",
);

// Backlog: only untouched Tier 1/2 "Scanned - ready" rows, Tier 1 first, hand-flagged rows skipped.
const r = (n: number, v: Record<string, string>): SheetRow => ({ rowNumber: n, values: v });
const picked = backlog([
  r(2, { Domain: "a.com", Status: "Scanned - ready", Tier: "2", Critical: "20" }),
  r(3, { Domain: "b.com", Status: "Scanned - ready", Tier: "1", Critical: "5" }),
  r(4, { Domain: "c.com", Status: "Scanned - ready", Tier: "1", Critical: "9" }),
  r(5, { Domain: "d.com", Status: "Emailed", Tier: "1" }),
  r(6, { Domain: "e.com", Status: "Scanned - ready", Tier: "3" }),
  r(7, { Domain: "f.com", Status: "Scanned - ready", Tier: "1", Notes: "Hold: rescan first" }),
  r(8, { Domain: "g.com", Status: "Scanned - ready", Tier: "1", "First email": "2026-10-01" }),
  r(9, { Domain: "h.com", Status: "Scanned - ready", Tier: "" }),
]);
assert.deepEqual(
  picked.map((p) => p.values["Domain"]),
  ["c.com", "b.com", "a.com"],
);
assert.equal(sheetContact({ Email: "x@y.com", "Email check": "accept_all" }), null);
assert.equal(
  sheetContact({ Email: "x@y.com", "Email check": "valid (95%)", Contact: "Elizabeth Bell" })
    ?.firstName,
  "Elizabeth",
);

console.log("outreach: all assertions passed");
