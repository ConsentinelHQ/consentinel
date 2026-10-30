# Shopify app

Embedded app inside Shopify admin. Installs in one click, scans the store's primary
domain right away, and sells daily monitoring at $99/month (7-day trial) through
Shopify billing.

## How it works

- `apps/web/src/app/shopify/route.ts`: the app page (plain HTML + App Bridge).
- `apps/web/src/app/api/shopify/*`: `session` (install + state), `scan` (rescan),
  `billing` (start charge), `webhooks` (uninstall, subscription updates, GDPR).
- Auth: Shopify session tokens, verified with the API secret. Admin API access by
  token exchange on demand. No access tokens are stored.
- Data: one org per store, keyed `shopify:<shop>.myshopify.com` in `orgs.clerk_org_id`.
  No migration. The store email is added as an alert recipient.
- Billing: an active Shopify charge sets the org to Monitor (1 site) and turns on
  daily scans. Cancel, decline or uninstall drops the plan. `shop/redact` deletes the org.
- Dev stores get test charges automatically.

## Setup (once)

1. Create a free Shopify Partner account at partners.shopify.com.
2. Dev Dashboard > Create app > name it Consentinel. Copy the Client ID and secret.
3. Vercel env (Production): `SHOPIFY_API_KEY` = Client ID, `SHOPIFY_API_SECRET` = secret.
   Optional: `SHOPIFY_APP_HANDLE` if the handle isn't `consentinel`. Redeploy.
4. Put the Client ID in `shopify/shopify.app.toml`, then from `shopify/` run
   `npx @shopify/cli@latest app deploy`. This sets the app URL, webhooks and
   GDPR endpoints.
5. Create a development store in the Partner dashboard and install the app on it to test.

Until step 3 is done every Shopify route answers 404, so this ships dark.

## App Store listing (draft)

- Name: Consentinel: Opt-out Checker
- Tagline: Prove your store stops tracking when shoppers opt out.
- Intro: Your consent app says it blocks trackers. We check. Consentinel loads your
  store three ways (Reject all, Accept all, Global Privacy Control on) and shows every
  ad vendor that keeps running after a shopper says no.
- Key benefits:
  - Free scan the moment you install. No setup, no code.
  - Works with any consent banner: Consentmo, Pandectes, OneTrust, Cookiebot and more.
  - Daily monitoring with email alerts and dated, sealed evidence of every scan.
- Pricing: Free scan. Monitor $99/month, 7-day free trial.
- Category: Store management > Privacy and security.
- Listing fee: one-time registration charged by Shopify. Confirm before paying.
