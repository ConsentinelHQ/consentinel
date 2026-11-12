import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminAppUrl,
  frameAncestors,
  isShopDomain,
  reviewMoment,
  shopifyPlanForName,
  SHOPIFY_PLANS,
  toPlanStatusFromShopify,
  verifySessionToken,
  verifyWebhookHmac,
} from "./shopify";

const config = { apiKey: "key123", apiSecret: "secret456", appHandle: "consentinel" };
const NOW = 1_800_000_000_000;

function sign(payload: Record<string, unknown>, secret = config.apiSecret, alg = "HS256"): string {
  const h = Buffer.from(JSON.stringify({ alg, typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const s = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}

const good = {
  iss: "https://acme.myshopify.com/admin",
  dest: "https://acme.myshopify.com",
  aud: "key123",
  sub: "42",
  exp: NOW / 1000 + 60,
  nbf: NOW / 1000 - 5,
};

void test("accepts a valid session token", () => {
  const s = verifySessionToken(sign(good), config, NOW);
  assert.equal(s?.shop, "acme.myshopify.com");
});

void test("rejects wrong secret, audience, expiry, alg and mismatched store", () => {
  assert.equal(verifySessionToken(sign(good, "nope"), config, NOW), null);
  assert.equal(verifySessionToken(sign({ ...good, aud: "other" }), config, NOW), null);
  assert.equal(verifySessionToken(sign({ ...good, exp: NOW / 1000 - 60 }), config, NOW), null);
  assert.equal(verifySessionToken(sign({ ...good, nbf: NOW / 1000 + 60 }), config, NOW), null);
  assert.equal(verifySessionToken(sign(good, config.apiSecret, "none"), config, NOW), null);
  assert.equal(
    verifySessionToken(sign({ ...good, iss: "https://evil.myshopify.com/admin" }), config, NOW),
    null,
  );
  assert.equal(
    verifySessionToken(
      sign({ ...good, dest: "https://evil.com", iss: "https://evil.com" }),
      config,
      NOW,
    ),
    null,
  );
  assert.equal(verifySessionToken("not.a.jwt", config, NOW), null);
});

void test("webhook hmac", () => {
  const body = '{"id":1}';
  const mac = createHmac("sha256", config.apiSecret).update(body).digest("base64");
  assert.equal(verifyWebhookHmac(body, mac, config.apiSecret), true);
  assert.equal(verifyWebhookHmac(body + " ", mac, config.apiSecret), false);
  assert.equal(verifyWebhookHmac(body, null, config.apiSecret), false);
});

void test("helpers", () => {
  assert.equal(isShopDomain("acme.myshopify.com"), true);
  assert.equal(isShopDomain("acme.myshopify.com.evil.com"), false);
  assert.equal(
    adminAppUrl("acme.myshopify.com", "consentinel"),
    "https://admin.shopify.com/store/acme/apps/consentinel",
  );
  assert.equal(
    frameAncestors("acme.myshopify.com"),
    "frame-ancestors https://admin.shopify.com https://acme.myshopify.com;",
  );
  assert.equal(frameAncestors("evil.com"), "frame-ancestors https://admin.shopify.com;");
  assert.equal(toPlanStatusFromShopify("ACTIVE"), "active");
  assert.equal(toPlanStatusFromShopify("CANCELLED"), "canceled");
  assert.equal(toPlanStatusFromShopify("PENDING"), null);
});

void test("charge names map back to plans and never collide", () => {
  assert.equal(shopifyPlanForName("Consentinel Starter"), "starter");
  assert.equal(shopifyPlanForName("Consentinel Monitor"), "monitoring");
  assert.equal(shopifyPlanForName("Something else"), null);
  assert.equal(shopifyPlanForName(undefined), null);
  assert.equal(SHOPIFY_PLANS.starter.price, 19);
  assert.equal(SHOPIFY_PLANS.monitoring.price, 99);
});

void test("review ask waits for a real win", () => {
  const installedAt = new Date("2026-11-01T00:00:00Z");
  const base = { installedAt, paid: false, completeScans: 2, firstCritical: 4, latestCritical: 4 };
  // One scan: never.
  assert.equal(
    reviewMoment({ ...base, now: new Date("2026-11-20T00:00:00Z"), completeScans: 1 }),
    false,
  );
  // Fewer critical findings than the first scan: yes.
  assert.equal(reviewMoment({ ...base, now: installedAt, latestCritical: 1 }), true);
  // No change, free store: no.
  assert.equal(reviewMoment({ ...base, now: new Date("2026-11-20T00:00:00Z") }), false);
  // Paid for a week: yes. Paid for 3 days: no.
  assert.equal(reviewMoment({ ...base, paid: true, now: new Date("2026-11-08T00:00:00Z") }), true);
  assert.equal(reviewMoment({ ...base, paid: true, now: new Date("2026-11-04T00:00:00Z") }), false);
});
