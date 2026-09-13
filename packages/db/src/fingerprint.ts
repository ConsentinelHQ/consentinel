import { createHash } from "node:crypto";
import type { Finding } from "@consentinel/shared";

/**
 * Stable identity for a finding across scans.
 *
 * Deliberately excludes anything that changes run to run - timestamps, the engine's
 * sequential id, query-string cache-busters. A tracker firing pre-consent on Tuesday
 * and again on Thursday must produce the SAME fingerprint, or every scheduled scan
 * would alert as a brand-new critical finding and the product would cry wolf.
 */
export function fingerprintFinding(finding: Finding): string {
  const parts: string[] = [finding.type, finding.vendor, finding.observedUnder];

  switch (finding.evidence.kind) {
    case "request": {
      // Host + path only. Query strings carry session and cache-busting noise.
      parts.push(stableRequestKey(finding.evidence.url));
      break;
    }
    case "cookie":
      parts.push(finding.evidence.name, finding.evidence.domain);
      break;
    case "script":
      parts.push(stableRequestKey(finding.evidence.src));
      break;
    case "credential":
      parts.push(finding.evidence.location);
      break;
  }

  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

function stableRequestKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname}`;
  } catch {
    return url;
  }
}
