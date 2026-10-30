import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shopify embedded app plumbing. Pure functions and fetch only, no "server-only",
 * so the verification logic runs under node --test.
 *
 * Auth model: managed install plus token exchange. The admin hands the page a
 * session token (an HS256 JWT signed with our API secret); every API call sends
 * it as a Bearer token. When we need the Admin API we trade that token for an
 * access token on the spot. Nothing long-lived is stored, so there's no token
 * table to leak and no OAuth redirect dance to break inside the iframe.
 */

export const SHOPIFY_API_VERSION = process.env["SHOPIFY_API_VERSION"] ?? "2026-07";

/** The one plan we sell in Shopify. Same price and limits as Monitor on the web. */
export const SHOPIFY_PLAN_NAME = "Consentinel Monitor";
export const SHOPIFY_PLAN_PRICE = 99;

export interface ShopifyConfig {
  apiKey: string;
  apiSecret: string;
  /** Handle from the app's admin URL, used to send merchants back after billing. */
  appHandle: string;
}

/** Null when the app isn't configured. Every Shopify route answers 404 then. */
export function shopifyConfig(env: NodeJS.ProcessEnv = process.env): ShopifyConfig | null {
  const apiKey = env["SHOPIFY_API_KEY"];
  const apiSecret = env["SHOPIFY_API_SECRET"];
  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    apiSecret,
    appHandle: env["SHOPIFY_APP_HANDLE"] ?? "consentinel-opt-out-checker",
  };
}

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function isShopDomain(value: string | null | undefined): value is string {
  return typeof value === "string" && SHOP_RE.test(value);
}

/** Stable key for the org that mirrors a store. */
export function shopOrgKey(shop: string): string {
  return `shopify:${shop}`;
}

function b64urlDecode(part: string): Buffer {
  return Buffer.from(part, "base64url");
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface SessionToken {
  shop: string;
  /** Admin user id. Absent for some token types; we don't rely on it. */
  sub?: string;
  raw: string;
}

/**
 * Verifies a session token. Checks signature, audience, time window, and that
 * iss and dest name the same store. Returns null on anything off.
 */
export function verifySessionToken(
  token: string,
  config: ShopifyConfig,
  now: number = Date.now(),
): SessionToken | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];

  let header: { alg?: string };
  let payload: {
    iss?: string;
    dest?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    nbf?: number;
  };
  try {
    header = JSON.parse(b64urlDecode(h).toString("utf8")) as typeof header;
    payload = JSON.parse(b64urlDecode(p).toString("utf8")) as typeof payload;
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;

  const expected = createHmac("sha256", config.apiSecret).update(`${h}.${p}`).digest();
  if (!safeEqual(expected, b64urlDecode(s))) return null;

  if (payload.aud !== config.apiKey) return null;
  const nowSec = Math.floor(now / 1000);
  // Small skew allowance: the admin and our servers don't share a clock.
  const skew = 10;
  if (typeof payload.exp !== "number" || payload.exp + skew < nowSec) return null;
  if (typeof payload.nbf === "number" && payload.nbf - skew > nowSec) return null;

  let destHost: string;
  let issHost: string;
  try {
    destHost = new URL(payload.dest ?? "").hostname;
    issHost = new URL(payload.iss ?? "").hostname;
  } catch {
    return null;
  }
  if (!isShopDomain(destHost) || destHost !== issHost) return null;

  return {
    shop: destHost,
    ...(payload.sub !== undefined ? { sub: payload.sub } : {}),
    raw: token,
  };
}

/** Webhook HMAC: base64 HMAC-SHA256 of the raw body. */
export function verifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
  secret: string,
): boolean {
  if (!hmacHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  return safeEqual(expected, Buffer.from(hmacHeader, "base64"));
}

export function bearer(request: Request): string | null {
  const value = request.headers.get("authorization");
  const match = value ? /^Bearer\s+(.+)$/i.exec(value) : null;
  return match?.[1] ?? null;
}

/** Trades a session token for a short-lived (expiring) offline Admin API token. */
export async function exchangeToken(session: SessionToken, config: ShopifyConfig): Promise<string> {
  const response = await fetch(`https://${session.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: config.apiKey,
      client_secret: config.apiSecret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: session.raw,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
      // Public apps must use expiring offline tokens. We exchange per request and
      // never store the token, so the refresh token is simply dropped.
      expiring: "1",
    }),
  });
  if (!response.ok) {
    const text = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`token exchange failed: ${response.status} ${text}`);
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("token exchange returned no token");
  return data.access_token;
}

export async function adminGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": accessToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    const text = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`admin api ${response.status} ${text}`);
  }
  const body = (await response.json()) as { data?: T; errors?: unknown };
  if (body.errors || !body.data) throw new Error(`admin api error: ${JSON.stringify(body.errors)}`);
  return body.data;
}

export interface ShopInfo {
  name: string;
  email: string;
  primaryUrl: string;
  devStore: boolean;
}

export async function fetchShopInfo(shop: string, accessToken: string): Promise<ShopInfo> {
  const data = await adminGraphql<{
    shop: {
      name: string;
      email: string;
      primaryDomain: { url: string };
      plan: { partnerDevelopment: boolean };
    };
  }>(
    shop,
    accessToken,
    `{ shop { name email primaryDomain { url } plan { partnerDevelopment } } }`,
  );
  return {
    name: data.shop.name,
    email: data.shop.email,
    primaryUrl: data.shop.primaryDomain.url,
    devStore: data.shop.plan.partnerDevelopment,
  };
}

export interface ShopifySubscription {
  id: string;
  name: string;
  status: string;
  currentPeriodEnd: string | null;
}

export async function fetchActiveSubscription(
  shop: string,
  accessToken: string,
): Promise<ShopifySubscription | null> {
  const data = await adminGraphql<{
    currentAppInstallation: { activeSubscriptions: ShopifySubscription[] };
  }>(
    shop,
    accessToken,
    `{ currentAppInstallation { activeSubscriptions { id name status currentPeriodEnd } } }`,
  );
  return (
    data.currentAppInstallation.activeSubscriptions.find((s) => s.name === SHOPIFY_PLAN_NAME) ??
    null
  );
}

export async function createSubscription(
  shop: string,
  accessToken: string,
  opts: { returnUrl: string; test: boolean; trialDays: number },
): Promise<string> {
  const data = await adminGraphql<{
    appSubscriptionCreate: {
      confirmationUrl: string | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    shop,
    accessToken,
    `mutation Subscribe($name: String!, $returnUrl: URL!, $test: Boolean, $trialDays: Int, $lineItems: [AppSubscriptionLineItemInput!]!) {
      appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, trialDays: $trialDays, lineItems: $lineItems) {
        confirmationUrl
        userErrors { field message }
      }
    }`,
    {
      name: SHOPIFY_PLAN_NAME,
      returnUrl: opts.returnUrl,
      test: opts.test,
      trialDays: opts.trialDays,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: SHOPIFY_PLAN_PRICE, currencyCode: "USD" },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
    },
  );
  const result = data.appSubscriptionCreate;
  if (result.userErrors.length > 0 || !result.confirmationUrl) {
    throw new Error(`subscription refused: ${result.userErrors.map((e) => e.message).join("; ")}`);
  }
  return result.confirmationUrl;
}

/** Shopify subscription status to our PlanStatus. PENDING returns null: no change. */
export function toPlanStatusFromShopify(status: string): "active" | "canceled" | "past_due" | null {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return "active";
    case "FROZEN":
      return "past_due";
    case "CANCELLED":
    case "DECLINED":
    case "EXPIRED":
      return "canceled";
    default:
      return null;
  }
}

/** Where Shopify sends the merchant after approving a charge: back into our app. */
export function adminAppUrl(shop: string, appHandle: string): string {
  const store = shop.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${store}/apps/${appHandle}`;
}

/** Short, safe reason for the merchant's toast and for Sentry. Never includes secrets. */
export function errorDetail(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

/** frame-ancestors for the embedded page. Shopify requires the shop and the admin. */
export function frameAncestors(shop: string | null): string {
  const shopSrc = isShopDomain(shop) ? ` https://${shop}` : "";
  return `frame-ancestors https://admin.shopify.com${shopSrc};`;
}
