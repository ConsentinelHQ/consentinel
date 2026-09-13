import type { ScanResult } from "@consentinel/shared";
import { scanUrl, type ScanOptions } from "./scanner";
import { analyze } from "./analyze";

export { scanUrl } from "./scanner";
export { analyze, ENGINE_VERSION } from "./analyze";
export type { RawScan, ScanOptions } from "./scanner";

export { loadConfig, type ScannerConfig } from "./config";
export { startWorker, type RunningWorker } from "./worker";

/** Scan a URL end to end and return the structured, severity-ranked result. */
export async function scan(url: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const raw = await scanUrl(url, opts);
  return analyze(raw);
}
