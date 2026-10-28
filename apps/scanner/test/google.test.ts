import assert from "node:assert/strict";
import { backoff, isRateLimit, search } from "../src/outreach/google.js";

// Quota errors are recognized; real permission errors are not.
assert.equal(isRateLimit(429, ""), true);
assert.equal(isRateLimit(403, "Quota exceeded for quota metric 'Total Query Cost'"), true);
assert.equal(isRateLimit(403, '{"reason":"rateLimitExceeded"}'), true);
assert.equal(isRateLimit(403, "Insufficient Permission"), false);
assert.equal(isRateLimit(500, "Quota exceeded"), false);

Object.assign(process.env, {
  OUTREACH_GOOGLE_CLIENT_ID: "id",
  OUTREACH_GOOGLE_CLIENT_SECRET: "secret",
  OUTREACH_GOOGLE_REFRESH_TOKEN: "refresh",
});
const waits: number[] = [];
backoff.wait = (ms) => {
  waits.push(ms);
  return Promise.resolve();
};

let gmailCalls = 0;
let failures = 2;
globalThis.fetch = ((input: string | URL) => {
  const url = String(input);
  if (url.includes("oauth2.googleapis.com")) {
    return Promise.resolve(new Response(JSON.stringify({ access_token: "t", expires_in: 3600 })));
  }
  gmailCalls++;
  if (failures-- > 0) {
    return Promise.resolve(
      new Response("Quota exceeded for quota metric 'Total Query Cost'", { status: 403 }),
    );
  }
  return Promise.resolve(new Response(JSON.stringify({ messages: [{ id: "m1" }] })));
}) as typeof fetch;

// Two quota errors, then success: retried with doubling waits.
assert.deepEqual(await search("in:sent"), ["m1"]);
assert.equal(gmailCalls, 3);
assert.deepEqual(waits, [2000, 4000]);

// Permanent quota errors still surface after the retries run out.
failures = 100;
gmailCalls = 0;
await assert.rejects(search("in:sent"), /Google 403/);
assert.equal(gmailCalls, 7);

console.log("google: all checks passed");
