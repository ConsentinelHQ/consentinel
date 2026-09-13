import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source, not built JS.
  transpilePackages: ["@consentinel/shared", "@consentinel/db", "@consentinel/queue"],
  // We of all products set a strict baseline on our own site.
  // eslint-disable-next-line @typescript-eslint/require-await -- Next requires this hook to be async
  async headers() {
    return [
      {
        source: "/:path*",
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
