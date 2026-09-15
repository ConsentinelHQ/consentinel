/**
 * Next.js calls this once per runtime at startup. Server only, by design.
 */
export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] === "nodejs") {
    await import("./sentry.server.config.js");
  }
}
