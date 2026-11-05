import assert from "node:assert/strict";
import { orphans } from "../src/outreach/redraft.js";
import type { SheetRow } from "../src/outreach/google.js";
import type { Entry } from "../src/outreach/state.js";

const row = (n: number, v: Record<string, string>): SheetRow => ({
  rowNumber: n,
  values: {
    Domain: "a.com",
    Status: "Scanned - ready",
    "Next action": "Review Gmail draft and send",
    Email: "Ann@a.com",
    ...v,
  },
});
const ledger: Entry[] = [
  { at: "1", domain: "a.com", action: "drafted", email: "ann@a.com", messageId: "old" },
  { at: "2", domain: "a.com", action: "drafted", email: "ann@a.com", messageId: "new" },
  { at: "3", domain: "b.com", action: "sent", email: "bo@b.com", messageId: "s" },
];
const got = orphans([row(2, {})], ledger);
assert.equal(got.length, 1);
assert.equal(got[0]?.draftId, "new");
assert.equal(got[0]?.email, "ann@a.com");
// Sent, other statuses, other actions and no ledger draft are all left alone.
assert.equal(orphans([row(2, { "First email": "2026-11-03" })], ledger).length, 0);
assert.equal(orphans([row(2, { Status: "Emailed" })], ledger).length, 0);
assert.equal(orphans([row(2, { "Next action": "Find contact" })], ledger).length, 0);
assert.equal(orphans([row(2, { Domain: "b.com", Email: "bo@b.com" })], ledger).length, 0);
console.log("redraft tests passed");
