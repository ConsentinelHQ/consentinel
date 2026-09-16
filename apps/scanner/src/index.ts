import {
  assessCredibility,
  detectBlock,
  vendorLabel,
  type BlockEvidence,
  type ScanResult,
} from "@consentinel/shared";
import { scanUrl, type ScanOptions } from "./scanner.js";
import { analyze } from "./analyze.js";

export { scanUrl } from "./scanner.js";
export { analyze, ENGINE_VERSION } from "./analyze.js";
export type { RawScan, ScanOptions } from "./scanner.js";

export { loadConfig, type ScannerConfig } from "./config.js";
export { startWorker, type RunningWorker } from "./worker.js";

/**
 * Thrown when a page loaded but produced too little activity to grade.
 * Distinct from a network error: the navigation succeeded, the content did not.
 */
export class UncredibleScanError extends Error {
  readonly requestCount: number;
  constructor(message: string, requestCount: number) {
    super(message);
    this.name = "UncredibleScanError";
    this.requestCount = requestCount;
  }
}

/**
 * The site's bot protection refused us. Distinct from an uncredible scan: here we
 * know who blocked us and can tell the customer exactly what to allowlist.
 */
export class ScanBlockedError extends Error {
  readonly evidence: BlockEvidence;

  constructor(evidence: BlockEvidence) {
    super(
      `${vendorLabel(evidence.vendor)} blocked the scan (${evidence.signal}). ` +
        `Allowlist Consentinel and run it again.`,
    );
    this.name = "ScanBlockedError";
    this.evidence = evidence;
  }
}

/** Scan a URL end to end and return the structured, severity-ranked result. */
export async function scan(url: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const raw = await scanUrl(url, opts);

  // Explicit block detection runs first: it names the vendor, where the
  // request-count heuristic below can only guess that something went wrong.
  for (const pass of [raw.deniedPass, raw.grantedPass]) {
    const main = pass.mainResponse;
    if (!main) continue;
    const evidence = detectBlock({
      status: main.status,
      headers: main.headers,
      cookieNames: pass.cookies.map((c) => c.name),
      title: main.title,
    });
    if (evidence) throw new ScanBlockedError(evidence);
  }

  // Refuse to grade a page that never really loaded. A false all-clear is the
  // most damaging output this engine can produce.
  const credibility = assessCredibility(
    raw.deniedPass.requests.length,
    raw.grantedPass.requests.length,
    opts.minRequests,
  );
  if (!credibility.credible) {
    throw new UncredibleScanError(
      `${credibility.reason ?? "Page did not load."} This usually means bot protection blocked the scan.`,
      credibility.requestCount,
    );
  }

  return analyze(raw);
}
