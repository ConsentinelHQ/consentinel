import * as Sentry from "@sentry/nextjs";

/**
 * Server runtime only. The client and edge configs are deliberately absent:
 * browser errors are noise at this stage, and nothing runs on the edge.
 *
 * No DSN means no reporting. Local dev stays quiet unless you opt in.
 */
const dsn = process.env["SENTRY_DSN"];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env["VERCEL_ENV"] ?? process.env["NODE_ENV"] ?? "development",
    // Errors only. No tracing budget to spend and no performance question yet.
    tracesSampleRate: 0,
  });
}
