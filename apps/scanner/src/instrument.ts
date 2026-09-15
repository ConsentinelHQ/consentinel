import * as Sentry from "@sentry/node";

/**
 * Imported first in main.ts, before anything else. Sentry's Node SDK patches
 * globals at import time, so instrumentation loaded after the modules it
 * instruments sees nothing.
 *
 * No DSN means no reporting and no crash. Local runs stay quiet.
 */
const dsn = process.env["SENTRY_DSN"];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    // Errors only. Tracing a Playwright worker costs more than it tells us.
    tracesSampleRate: 0,
    dataCollection: {
      // Scan targets are customer URLs and findings carry cookie values.
      // Neither belongs in a third-party error tracker.
      httpBodies: [],
    },
  });
}

export { Sentry };
