import { scan } from "./index.js";

// Phase 1 harness: drive the engine headlessly before any UI exists.
// Usage: pnpm --filter @consentinel/scanner scan https://example.com
async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error("usage: scan <url>");
    process.exit(2);
  }
  const result = await scan(url);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
