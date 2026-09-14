import type { ScanResult } from "@consentinel/shared";
import { scanUrl, type ScanOptions } from "./scanner.js";
import { analyze } from "./analyze.js";

export { scanUrl } from "./scanner.js";
export { analyze, ENGINE_VERSION } from "./analyze.js";
export type { RawScan, ScanOptions } from "./scanner.js";

export { loadConfig, type ScannerConfig } from "./config.js";
export { startWorker, type RunningWorker } from "./worker.js";

/** Scan a URL end to end and return the structured, severity-ranked result. */
export async function scan(url: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const raw = await scanUrl(url, opts);
  return analyze(raw);
}
