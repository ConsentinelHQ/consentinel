import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source, not built JS.
  transpilePackages: ["@consentinel/shared", "@consentinel/db", "@consentinel/queue"],
  // Old domain: pages move to getconsentinel.com, but /api stays put so Stripe,
  // Jira and customer deploy hooks pointed at consentinelhq.com keep working.
  // eslint-disable-next-line @typescript-eslint/require-await -- Next requires this hook to be async
  async redirects() {
    const has = [{ type: "host" as const, value: "(www\\.)?consentinelhq\\.com" }];
    return [
      { source: "/", has, destination: "https://www.getconsentinel.com/", permanent: true },
      {
        source: "/:path((?!api(?:/|$)).+)",
        has,
        destination: "https://www.getconsentinel.com/:path",
        permanent: true,
      },
    ];
  },
  // We of all products set a strict baseline on our own site.
  // eslint-disable-next-line @typescript-eslint/require-await -- Next requires this hook to be async
  async headers() {
    return [
      {
        // Everything except the Shopify app, which must load inside the admin
        // iframe and sets its own frame-ancestors CSP per store.
        source: "/:path((?!shopify(?:/|$)).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default config;
