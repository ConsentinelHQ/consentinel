import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminAppUrl,
  frameAncestors,
  isShopDomain,
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
