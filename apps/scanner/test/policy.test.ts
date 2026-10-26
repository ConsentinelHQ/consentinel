import assert from "node:assert/strict";
import { pickPolicyLinks } from "../src/policy";

const page = "https://shop.com/products/x";
const pick = (links: { href: string; text: string }[]) => pickPolicyLinks(links, page);

// Privacy and cookie policies, resolved, hash dropped.
assert.deepEqual(
  pick([
    { href: "/pages/about", text: "About" },
    { href: "/policies/privacy-policy#top", text: "Privacy Policy" },
    { href: "https://shop.com/pages/cookie-policy", text: "Cookie Policy" },
  ]),
  [
    { kind: "privacy", url: "https://shop.com/policies/privacy-policy" },
    { kind: "cookie", url: "https://shop.com/pages/cookie-policy" },
  ],
);
// Opt-out and preference pages aren't the policy, even when they say privacy.
assert.deepEqual(
  pick([
    { href: "/pages/your-privacy-choices", text: "Your Privacy Choices" },
    { href: "/pages/do-not-sell", text: "Do Not Sell My Personal Information" },
    { href: "javascript:void(0)", text: "Cookie Settings" },
    { href: "mailto:privacy@shop.com", text: "privacy@shop.com" },
    { href: "/legal/privacy", text: "Privacy" },
  ]),
  [{ kind: "privacy", url: "https://shop.com/legal/privacy" }],
);
// A cookie policy link isn't also taken as the privacy policy.
assert.deepEqual(pick([{ href: "/privacy/cookie-policy", text: "Cookies" }]), [
  { kind: "cookie", url: "https://shop.com/privacy/cookie-policy" },
]);
assert.deepEqual(pick([]), []);

console.log("policy: all assertions passed");
