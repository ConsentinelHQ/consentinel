import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SEED, detectPiiLeaks } from "../src/pii.js";

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const target = "drinkolipop.com";
const kinds = (h: ReturnType<typeof detectPiiLeaks>) => h.map((x) => x.kind).sort();

// Meta-style hashed email in the query string
let hits = detectPiiLeaks(
  [{ url: `https://www.facebook.com/tr?id=1&ud[em]=${sha(SEED.email)}`, method: "GET" }],
  target,
);
assert.deepEqual(kinds(hits), ["email-sha256", "identifier-param"]);
assert.equal(hits[0]?.field, "ud[em]");

// Plain email in a JSON POST body
hits = detectPiiLeaks(
  [
    {
      url: "https://a.klaviyo.com/client/events",
      method: "POST",
      postData: JSON.stringify({ email: SEED.email }),
    },
  ],
  target,
);
assert.deepEqual(kinds(hits), ["email"]);
assert.equal(hits[0]?.location, "body");

// First party is never a leak
hits = detectPiiLeaks(
  [{ url: `https://drinkolipop.com/x?email=${SEED.email}`, method: "GET" }],
  target,
);
assert.equal(hits.length, 0);

// Phone hashed with country code, as Meta does
hits = detectPiiLeaks(
  [{ url: `https://analytics.tiktok.com/e?ph=${sha("12015550123")}`, method: "GET" }],
  target,
);
assert.ok(kinds(hits).includes("phone-sha256"));

// Empty identity params are not leaks
hits = detectPiiLeaks(
  [{ url: "https://www.facebook.com/tr?id=1&ud[em]=&ud[ph]=", method: "GET" }],
  target,
);
assert.equal(hits.length, 0);

// Someone else's hash under an identity key still counts
hits = detectPiiLeaks(
  [{ url: `https://ads.example.com/p?sha256_email_address=${sha("x@y.com")}`, method: "GET" }],
  target,
);
assert.deepEqual(kinds(hits), ["identifier-param"]);

// One hit per vendor per kind, however many requests repeat it
hits = detectPiiLeaks(
  Array.from({ length: 5 }, () => ({
    url: `https://www.facebook.com/tr?ud[em]=${sha(SEED.email)}`,
    method: "GET",
  })),
  target,
);
assert.equal(hits.filter((h) => h.kind === "email-sha256").length, 1);

console.log("pii: 7 cases passed");
