import {
  FINDING_SCHEMA_VERSION,
  countBySeverity,
  sortFindings,
  type Finding,
  type ScanResult,
  type Severity,
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
} from "./signatures.js";
import { classifyCookie } from "./cookies.js";
import { CMP_REGISTRY_VERSION } from "./cmp/registry.js";
import type { RawScan, CapturedRequest } from "./scanner.js";

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
    /**
     * Severity is risk and priority, not lawfulness - same rule the cookie path uses.
     * Advertising and session recording: critical. Data leaves for profiling and
     * resale, and this is what regulators actually fine.
     * Analytics, social embeds, tag managers: warning. Still unlawful pre-consent,
     * lower exposure, usually a one-line Consent Mode fix.
     *
     * A tag that saw gcs=denied and fired anyway stays critical whatever it is. That
     * is a broken consent implementation, not a misconfigured vendor.
     */
    const severity: Severity =
      ignoredDenied || h.sig.category === "advertising" || h.sig.category === "session-recording"
        ? "critical"
        : "warning";
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
      severity,
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

  // 3) Cookies set under denied/rejected consent, attributed to a vendor.
  //    A third-party advertising cookie dropped pre-consent is a violation in its own
  //    right, not a tidy-up item - it is the thing a regulator asks about first.
  const pageHost = safeHost(raw.url);
  for (const c of raw.deniedPass.cookies) {
    const sig = classifyCookie(c.name);
    // Strictly necessary cookies are lawful before consent. Flagging them is crying wolf.
    if (sig && !sig.consentRequired) continue;

    const firstParty = pageHost !== null && c.domain.replace(/^\./, "") === pageHost;
    const known = sig !== null;
    /**
     * Severity encodes RISK AND PRIORITY, not lawfulness. Every non-essential cookie
     * before consent is unlawful, but grading them all critical makes the report
     * useless for triage - if everything is critical, nothing is, and the privacy
     * officer reading it gets no help deciding what to fix first.
     *
     * Advertising and session recording: critical. Data leaves for profiling,
     * cross-site targeting, and resale. This is what regulators actually fine.
     * Analytics: warning. Still a violation, lower exposure, usually a one-line
     * Consent Mode fix.
     * Unattributed: warning. We cannot prove it is non-essential, and guessing
     * would mean crying wolf.
     */
    const severity: Severity =
      sig?.category === "advertising" || sig?.category === "session-recording"
        ? "critical"
        : "warning";

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
      severity,
      vendor: sig?.vendor ?? c.name,
      category: sig?.category ?? "unknown",
      title: known
        ? `${sig.vendor} set ${describe(sig.category)} cookie "${c.name}" under ${observedUnder} consent`
        : `Unrecognised cookie "${c.name}" set under ${observedUnder} consent`,
      detail: known
        ? `${sig.vendor} wrote "${c.name}" on ${c.domain} before consent was granted.`
        : `Cookie "${c.name}" (domain ${c.domain}) was written before consent was granted. We could not attribute it to a known vendor, so confirm whether it is strictly necessary.`,
      observedUnder,
      evidence,
      compliance: [],
      remediation: known
        ? `Block ${sig.vendor} until consent is granted. If it comes from an embed, use the privacy-enhanced or consent-gated variant.`
        : `Confirm what sets this cookie. If it is not strictly necessary, gate it behind consent.`,
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
    headline:
      headlineCount === 0
        ? "No trackers fired before consent"
        : `${headlineCount} tracker${headlineCount === 1 ? "" : "s"} firing before consent`,
    counts,
    findings: sorted,
    correctlyGated,
  };
}

function describe(category: string): string {
  return category === "advertising"
    ? "an advertising"
    : category === "analytics"
      ? "an analytics"
      : category === "session-recording"
        ? "a session-recording"
        : "a tracking";
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
