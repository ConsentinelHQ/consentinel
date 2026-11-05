import assert from "node:assert/strict";
import { OLD_WORDING, orphans } from "../src/outreach/redraft.js";
import type { SheetRow } from "../src/outreach/google.js";
import type { Entry } from "../src/outreach/state.js";

const now = new Date("2026-11-05T15:00:00Z");
const row = (v: Record<string, string> = {}): SheetRow => ({
  rowNumber: 2,
  values: {
    Domain: "a.com",
    Status: "Emailed",
    Contact: "Ann Lee",
    Email: "Ann@a.com",
    "Email check": "valid (anymail)",
    "Contact 2": "Bo Kim",
    "Email 2": "bo@a.com",
    "Email check 2": "valid (researched)",
    ...v,
  },
});
const d = (email: string, id: string, reason: string, at = "2026-11-04T08:00:00Z"): Entry => ({
  at,
  domain: "a.com",
  action: "drafted",
  email,
  messageId: id,
  reason,
});
const ledger: Entry[] = [
  d("ann@a.com", "old", "draft mode"),
  d("ann@a.com", "new", "draft mode"),
  d("bo@a.com", "bo1", "draft mode, contact 2 (researched)"),
  d("bo@a.com", "fu", "follow-up, contact 2"),
];
const got = orphans([row()], ledger, now);
assert.deepEqual(
  got.map((o) => [o.m.email, o.draftId, o.m.slot]),
  [
    ["ann@a.com", "new", 1],
    ["bo@a.com", "bo1", 2],
  ],
);
// Sent, dead rows, bounced people, old drafts and follow-ups are left alone.
const sent: Entry = {
  at: "2026-11-04T09:00:00Z",
  domain: "a.com",
  action: "sent",
  email: "bo@a.com",
};
assert.deepEqual(
  orphans([row()], [...ledger, sent], now).map((o) => o.m.email),
  ["ann@a.com"],
);
assert.equal(orphans([row({ Status: "Dead" })], ledger, now).length, 0);
assert.deepEqual(
  orphans([row({ "Email check 2": "bounced" })], ledger, now).map((o) => o.m.email),
  ["ann@a.com"],
);
assert.equal(
  orphans([row()], [d("ann@a.com", "x", "draft mode", "2026-10-01T00:00:00Z")], now).length,
  0,
);
assert.equal(orphans([row()], [d("ann@a.com", "x", "follow-up")], now).length, 0);
console.log("redraft tests passed");

// Old wording is caught; the new template isn't.
assert.match("the pattern behind the current wave of CIPA suits.", OLD_WORDING);
assert.doesNotMatch(
  "Starting January 1, every browser has to offer that setting, so a lot more of your shoppers will be sending it.",
  OLD_WORDING,
);
console.log("old wording check passed");
