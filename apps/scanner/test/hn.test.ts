import assert from "node:assert/strict";
import { angleFor, pickThreads, renderHn, type HnStory } from "../src/outreach/hn.js";

const now = new Date("2026-11-02T12:00:00Z");
const t = now.getTime() / 1000;
const s = (id: string, title: string, comments: number, ageH = 2, points = 10): HnStory => ({
  objectID: id,
  title,
  points,
  num_comments: comments,
  created_at_i: t - ageH * 3600,
});

assert.match(angleFor("Firefox now sends Global Privacy Control by default") ?? "", /GPC/);
assert.match(angleFor("Why every site has a cookie banner") ?? "", /OneTrust/);
assert.match(angleFor("Meta pixel leaked tax data") ?? "", /GTM/);
assert.equal(angleFor("Rust 2.0 released"), null);

const picks = pickThreads(
  [
    s("1", "Cookie consent banners are theater", 40),
    s("1", "Cookie consent banners are theater", 40), // duplicate from a second query
    s("2", "Shopify launches new checkout", 3), // too quiet
    s("3", "Playwright 2.0", 12, 50), // too old
    s("4", "Rust 2.0 released", 300), // off-topic
    s("5", "Shopify app store changes", 20),
  ],
  now,
);
assert.deepEqual(
  picks.map((p) => p.story.objectID),
  ["1", "5"],
);

const out = renderHn(picks);
assert.match(out, /no Consentinel/);
assert.match(out, /news\.ycombinator\.com\/item\?id=1/);
assert.doesNotMatch(out, /—/);
assert.match(renderHn([]), /Nothing on-topic/);

console.log("hn ok");
