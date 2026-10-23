import assert from "node:assert/strict";
import { matchAcknowledgment } from "../src/scanner";

const yes = [
  "Opt-Out Request Honored",
  "Your opt-out preference signal has been honored.",
  "Global Privacy Control signal detected",
  "We detected your Global Privacy Control signal and opted you out.",
  "GPC honored",
  "Your privacy choice has been applied",
];
const no = [
  "Do Not Sell or Share My Personal Information",
  "Opt out of targeted advertising",
  "Learn about Global Privacy Control",
  "",
];

for (const t of yes) assert.equal(matchAcknowledgment(t).shown, true, t);
for (const t of no) assert.equal(matchAcknowledgment(t).shown, false, t);
assert.equal(
  matchAcknowledgment("x\n  Opt-Out   Request Honored  y").text,
  "Opt-Out Request Honored",
);

console.log("gpc: all assertions passed");
