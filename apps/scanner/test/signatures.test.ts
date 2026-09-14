import { assessCredibility } from "@consentinel/shared";
import { classify, SIGNATURES } from "../src/signatures";

// Routing tests, not coverage. classify() returns the FIRST match, so order is
// load-bearing: google.com serves reCAPTCHA AND ads, gtm.com serves three things.
const cases: Array<[string, string | null]> = [
  ["https://www.google-analytics.com/g/collect?v=2", "ga4"],
  ["https://www.googletagmanager.com/gtm.js?id=GTM-ABC", "gtm"],
  ["https://www.googletagmanager.com/gtag/js?id=G-X", "gtag-js"],
  ["https://www.google.com/recaptcha/api.js", "recaptcha"],
  ["https://www.gstatic.com/recaptcha/releases/x/recaptcha__en.js", "recaptcha"],
  ["https://www.google.com/pagead/1p-user-list/123", "google-ads"],
  ["https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1", "doubleclick"],
  ["https://stats.g.doubleclick.net/g/collect", "doubleclick"],
  ["https://connect.facebook.net/en_US/fbevents.js", "meta-pixel"],
  ["https://www.facebook.com/tr?id=1&ev=PageView", "meta-pixel"],
  ["https://static.klaviyo.com/onsite/js/klaviyo.js", "klaviyo"],
  ["https://cdn.attn.tv/loader.js", "attentive"],
  ["https://monorail-edge.shopifysvc.com/v1/produce", "shopify-monorail"],
  ["https://bat.bing.com/bat.js", "bing-uet"],
  ["https://ct.pinterest.com/v3/?tid=1", "pinterest"],
  ["https://static.ads-twitter.com/uwt.js", "twitter-x"],
  ["https://sc-static.net/scevent.min.js", "snapchat"],
  ["https://analytics.tiktok.com/i18n/pixel/events.js", "tiktok"],
  ["https://cdn.shopify.com/s/files/1/x.js", "shopify-cdn"],
  ["https://js.stripe.com/v3/", "stripe"],
  ["https://m.stripe.network/inner.html", "stripe"],
  ["https://www.youtube-nocookie.com/embed/abc", "youtube-nocookie"],
  ["https://www.youtube.com/embed/abc", "youtube"],
  // Must NOT match. A false positive is worse than a miss.
  ["https://cdn.jsdelivr.net/npm/lodash", null],
  ["https://example.com/main.js", null],
  ["https://fonts.googleapis.com/css2?family=Inter", null],
];

const c = (s: string, n: number): string => `\x1b[${n}m${s}\x1b[0m`;
const mark = (ok: boolean): string => (ok ? c("PASS", 32) : c("FAIL", 31));

const checks: Array<[string, boolean]> = [];

for (const [url, want] of cases) {
  const got = classify(url)?.id ?? null;
  checks.push([`${want ?? "(none)"} <- ${url}`, got === want]);
}

const ids = SIGNATURES.map((s) => s.id);
checks.push(["no duplicate signature ids", new Set(ids).size === ids.length]);
checks.push(["malformed url returns null", classify("not a url") === null]);

// A blocked page looks identical to a clean one. Refusing to grade it is the
// whole point - a false all-clear is unrecoverable with a buyer.
checks.push(["empty page is not credible", !assessCredibility(0, 0).credible]);
checks.push(["near-empty page is not credible", !assessCredibility(3, 2).credible]);
checks.push(["real page is credible", assessCredibility(40, 55).credible]);

// Allowlist entries are the anti-false-positive tool. Losing one is a regression.
checks.push([
  "payment and bot-defence vendors stay unflagged",
  ["stripe", "paypal", "recaptcha", "turnstile", "klarna"].every(
    (id) => SIGNATURES.find((s) => s.id === id)?.consentRequired === false,
  ),
]);

console.log(c("\nConsentinel signature library - routing proof\n", 1));
let pass = true;
for (const [name, ok] of checks) {
  pass = pass && ok;
  console.log(`   ${mark(ok)}  ${name}`);
}
console.log(
  pass
    ? c(`\n  GREEN - ${String(SIGNATURES.length)} signatures, routing order verified.\n`, 32)
    : c("\n  FAILED - signature order changed, see above.\n", 31),
);
process.exit(pass ? 0 : 1);
