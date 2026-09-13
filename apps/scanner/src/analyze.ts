import {
  FINDING_SCHEMA_VERSION,
  countBySeverity,
  sortFindings,
  type Finding,
  type ScanResult,
  type ConsentState,
  type Evidence,
  type ConsentSignal,
  type CmpSummary,
} from "@consentinel/shared";
import { randomUUID } from "node:crypto";
import {
  classify,
  extractConsentSignal,
  SIGNATURE_LIBRARY_VERSION,
  type Signature,
} from "./signatures";
import { CMP_REGISTRY_VERSION } from "./cmp/registry";
import type { RawScan, CapturedRequest } from "./scanner";

export const ENGINE_VERSION = "0.1.0";

const EMAIL_RE = /[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

interface ClassifiedHit {
  sig: Signature;
  consentSignal: ConsentSignal | null;
  request: CapturedRequest;
}

function classifyPass(requests: CapturedRequest[]): ClassifiedHit[] {
  const out: ClassifiedHit[] = [];
  const seen = new Set<string>();
  for (const r of requests) {
    const sig = classify(r.url);
    if (!sig || seen.has(sig.id)) continue;
    seen.add(sig.id);
    out.push({ sig, consentSignal: extractConsentSignal(r.url), request: r });
  }
  return out;
}

export function analyze(raw: RawScan): ScanResult {
  const scanId = randomUUID();
  const now = new Date().toISOString();

  const deniedHits = classifyPass(raw.deniedPass.requests);
  const grantedHits = classifyPass(raw.grantedPass.requests);
  const deniedIds = new Set(deniedHits.map((h) => h.sig.id));

  // Were we able to actually click "reject"? Determines how findings are framed.
  const observedUnder: ConsentState =
    raw.deniedPass.interaction.kind === "reject" && raw.deniedPass.interaction.performed
      ? "rejected"
      : "default";

  const findings: Finding[] = [];
  let seq = 0;
  const nextId = (t: string): string => `${t}-${String(++seq).padStart(3, "0")}`;

  // 1) Trackers firing under denied/rejected consent - the core violation.
  for (const h of deniedHits) {
    if (!h.sig.consentRequired) continue;
    const ignoredDenied = h.consentSignal?.state === "denied";
    const evidence: Evidence = {
      kind: "request",
      url: h.request.url,
      method: h.request.method,
      resourceType: h.request.resourceType,
    };
    const base: Finding = {
      id: nextId("preconsent"),
      schemaVersion: FINDING_SCHEMA_VERSION,
      type: ignoredDenied ? "consent-signal-ignored" : "tracker-fires-pre-consent",
      severity: "critical",
      vendor: h.sig.vendor,
      category: h.sig.category,
      title: ignoredDenied
        ? `${h.sig.vendor} ignored a denied consent signal`
        : `${h.sig.vendor} fires under ${observedUnder} consent`,
      detail: ignoredDenied
        ? `${h.sig.vendor} sent data carrying gcs=${h.consentSignal?.gcs} (denied) and fired anyway.`
        : `${h.sig.vendor} (${h.sig.category}) loaded and sent data while consent was ${observedUnder}.`,
      observedUnder,
      evidence,
      compliance: [],
      remediation: `Gate ${h.sig.vendor} behind consent (Consent Mode default-denied or CMP blocking) so it does not fire until the visitor opts in.`,
      firstSeenAt: now,
    };
    findings.push(h.consentSignal ? { ...base, consentSignal: h.consentSignal } : base);
  }

  // 2) PII leakage to trackers (scan the denied pass).
  const piiSeen = new Set<string>();
  for (const r of raw.deniedPass.requests) {
    const sig = classify(r.url);
    if (!sig) continue;
    const decoded = decodeURIComponent(r.url);
    const m = EMAIL_RE.exec(decoded);
    if (m && !piiSeen.has(sig.id)) {
      piiSeen.add(sig.id);
      const evidence: Evidence = {
        kind: "request",
        url: r.url,
        method: r.method,
        resourceType: r.resourceType,
        matched: m[0],
      };
      findings.push({
        id: nextId("pii"),
        schemaVersion: FINDING_SCHEMA_VERSION,
        type: "pii-leak-to-tracker",
        severity: "critical",
        vendor: sig.vendor,
        category: "unknown",
        title: `Email address leaked to ${sig.vendor}`,
        detail: `A request to ${sig.vendor} contained an email address in plaintext.`,
        observedUnder,
        evidence,
        compliance: [],
        remediation: `Strip PII from URLs and dataLayer pushes before they reach trackers; never pass raw email or phone in query strings.`,
        firstSeenAt: now,
      });
    }
  }

  // 3) Cookies set under denied/rejected consent.
  const pageHost = safeHost(raw.url);
  for (const c of raw.deniedPass.cookies) {
    if (/^(__cf|csrf|session)/i.test(c.name)) continue;
    const firstParty = pageHost !== null && c.domain.replace(/^\./, "") === pageHost;
    const evidence: Evidence = {
      kind: "cookie",
      name: c.name,
      domain: c.domain,
      firstParty,
      expires: c.expires,
    };
    findings.push({
      id: nextId("cookie"),
      schemaVersion: FINDING_SCHEMA_VERSION,
      type: "cookie-set-pre-consent",
      severity: "warning",
      vendor: c.name,
      category: "unknown",
      title: `Cookie "${c.name}" set under ${observedUnder} consent`,
      detail: `Cookie "${c.name}" (domain ${c.domain}) was written before consent was granted.`,
      observedUnder,
      evidence,
      compliance: [],
      remediation: `Do not set non-essential cookies until consent is granted.`,
      firstSeenAt: now,
    });
  }

  // 4) Diff: tags that appeared ONLY after consent - the legitimate, well-behaved set.
  const correctlyGated = grantedHits
    .filter((h) => !deniedIds.has(h.sig.id) && h.sig.consentRequired)
    .map((h) => ({ vendor: h.sig.vendor, category: h.sig.category }));

  const sorted = sortFindings(findings);
  const counts = countBySeverity(sorted);

  const headlineCount = sorted.filter(
    (f) => f.type === "tracker-fires-pre-consent" || f.type === "consent-signal-ignored",
  ).length;

  const cmp: CmpSummary = {
    detected: raw.cmp.detected
      ? {
          id: raw.cmp.detected.id,
          name: raw.cmp.detected.name,
          confidence: raw.cmp.detected.confidence,
        }
      : null,
    consentMode: { present: raw.consentMode.present, defaultState: raw.consentMode.defaultState },
  };

  return {
    scanId,
    url: raw.url,
    scannedAt: now,
    engineVersion: ENGINE_VERSION,
    signatureLibraryVersion: SIGNATURE_LIBRARY_VERSION,
    cmpRegistryVersion: CMP_REGISTRY_VERSION,
    cmp,
    headline: `${headlineCount} tracker${headlineCount === 1 ? "" : "s"} firing before consent`,
    counts,
    findings: sorted,
    correctlyGated,
  };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
