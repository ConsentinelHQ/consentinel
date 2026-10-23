import { detectPiiLeaks, leakDescription, leakDetail, leakRemediation } from "./pii.js";
import {
  FINDING_SCHEMA_VERSION,
  countBySeverity,
  severityFor,
  sortFindings,
  type CmpSummary,
  type ConsentSignal,
  type ConsentState,
  type Evidence,
  type Finding,
  type GpcCheck,
  type ScanResult,
  type Severity,
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
import type { RawScan, CapturedRequest, OptOutAcknowledgment } from "./scanner.js";
import { remediationFor } from "./remediation.js";
import { canonicalVendor } from "@consentinel/shared";

// 0.3.0: separate GPC pass. Alerting only diffs same-version scans, so the new
// findings don't email every customer as a regression.
export const ENGINE_VERSION = "0.3.0";

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
      : raw.deniedPass.gpc
        ? "gpc"
        : "default";
  // GPC is an opt-out signal, not a consent state, so it needs its own wording.
  const gpc = observedUnder === "gpc";
  const underPhrase = gpc ? "with Global Privacy Control on" : `under ${observedUnder} consent`;
  const firesPhrase = gpc ? "fires with Global Privacy Control on" : `fires ${underPhrase}`;
  const when = gpc ? "with Global Privacy Control on" : "before consent";
  const cookieWhen = gpc ? "while Global Privacy Control was on" : "before consent was granted";

  const findings: Finding[] = [];
  let seq = 0;
  const nextId = (t: string): string => `${t}-${String(++seq).padStart(3, "0")}`;

  /**
   * 0) A consent platform that is installed but never shows a banner.
   *
   * Observed on real sites: the CMP loads its SDK, geo-targeting decides a US
   * visitor needs no banner, and every tag fires immediately. Without this the
   * report says "we could not find the reject control", which reads as our
   * failure rather than theirs - and buries the reason everything else fired.
   */
  const denied = raw.deniedPass.interaction;
  if (
    raw.cmp.detected &&
    denied.kind === "reject" &&
    !denied.performed &&
    denied.bannerPresent === false
  ) {
    findings.push({
      id: nextId("nobanner"),
      schemaVersion: FINDING_SCHEMA_VERSION,
      type: "consent-banner-absent",
      severity: severityFor("consent-banner-absent"),
      vendor: raw.cmp.detected.name,
      category: "unknown",
      title: `${raw.cmp.detected.name} is installed but no consent banner was shown`,
      detail:
        `${raw.cmp.detected.name} loaded on this page but never presented a consent banner, ` +
        `so visitors in the scanned region are not asked before tracking begins. This is commonly a ` +
        `geo-targeting rule that exempts visitors in some regions. Every finding below ` +
        `was observed with no choice available.`,
      remediation:
        `Check your ${raw.cmp.detected.name} geolocation rules. If the banner is intentionally ` +
        `limited to certain regions, confirm that matches your legal obligations - several ` +
        `US states now require an opt-out mechanism regardless of EU rules.`,
      evidence: {
        kind: "cmp",
        platform: raw.cmp.detected.name,
        bannerShown: false,
        detail: `${raw.cmp.detected.name} SDK loaded; no banner element became visible`,
      },
      observedUnder: "default",
      firstSeenAt: now,
      compliance: [],
    });
  }

  /**
   * 0b) Personal data reaching third parties. Only when the scan seeded a test
   * identity, so every hit is provable. Always critical: contact details reaching
   * an ad platform after an opt-out is the exposure regulators and wiretap claims target.
   */
  if (raw.deniedPass.seeded) {
    const targetHost = new URL(raw.url).hostname.replace(/^www\./, "");
    for (const hit of detectPiiLeaks(raw.deniedPass.requests, targetHost)) {
      const req = raw.deniedPass.requests.find((r) => r.url === hit.url);
      const sig = req ? classifyPass([req])[0]?.sig : undefined;
      const vendor = sig?.vendor ?? hit.host;
      findings.push({
        id: nextId("pii"),
        schemaVersion: FINDING_SCHEMA_VERSION,
        type: "pii-leak-to-tracker",
        severity: "critical",
        vendor,
        category: sig?.category ?? "unknown",
        title: `${vendor} received ${leakDescription(hit)} ${when}`,
        detail: leakDetail(hit, vendor),
        remediation: leakRemediation(vendor),
        evidence: {
          kind: "request",
          url: hit.url,
          method: hit.method,
          resourceType: req?.resourceType ?? "other",
          ...(hit.field ? { matched: hit.field } : {}),
        },
        observedUnder,
        firstSeenAt: now,
        compliance: [],
      });
    }
  }

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
        : `${h.sig.vendor} ${firesPhrase}`,
      detail: ignoredDenied
        ? `${h.sig.vendor} sent data carrying gcs=${h.consentSignal?.gcs} (denied) and fired anyway.`
        : `${h.sig.vendor} (${h.sig.category}) loaded and sent data while consent was ${observedUnder}.`,
      observedUnder,
      evidence,
      compliance: [],
      remediation: remediationFor(h.sig.vendor),
      firstSeenAt: now,
    };
    // Chain attribution: a tracker loaded by another tracker gets traced to its parent.
    const parentSig = h.request.initiator ? classify(h.request.initiator) : null;
    const withParent: Finding =
      parentSig && parentSig.vendor !== h.sig.vendor
        ? { ...base, causedBy: parentSig.vendor }
        : base;
    findings.push(h.consentSignal ? { ...withParent, consentSignal: h.consentSignal } : withParent);
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
        severity: severityFor("pii-leak-to-tracker"),
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
    // Name first. An unfamiliar name on a known tracker's domain is still that
    // tracker's cookie: ad-id on amazon-adsystem.com is Amazon's.
    const byDomain = classify(`https://${c.domain.replace(/^\./, "")}/`);
    const sig =
      classifyCookie(c.name) ??
      (byDomain
        ? {
            vendor: byDomain.vendor,
            category: byDomain.category,
            consentRequired: byDomain.consentRequired,
          }
        : null);
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
        ? `${sig.vendor} set ${describe(sig.category)} cookie "${c.name}" ${underPhrase}`
        : `Unrecognized cookie "${c.name}" set ${underPhrase}`,
      detail: known
        ? `${sig.vendor} wrote "${c.name}" on ${c.domain} ${cookieWhen}.`
        : `Cookie "${c.name}" (domain ${c.domain}) was written ${cookieWhen}. We could not attribute it to a known vendor, so confirm whether it is strictly necessary.`,
      observedUnder,
      evidence,
      compliance: [],
      remediation: known
        ? remediationFor(sig.vendor)
        : `Confirm what sets this cookie. If it is not strictly necessary, gate it behind consent.`,
      ...(() => {
        const parent = c.setBy?.initiator ? classify(c.setBy.initiator) : null;
        return sig && parent && parent.vendor !== sig.vendor ? { causedBy: parent.vendor } : {};
      })(),
      firstSeenAt: now,
    });
  }

  // 3b) Global Privacy Control, tested on its own with no banner click.
  const gpcCheck = analyzeGpc(raw, grantedHits, gpc, findings, nextId, now);

  // 4) Diff: tags that appeared ONLY after consent - the legitimate, well-behaved set.
  // A vendor that set cookies under denial did not stop, whatever its requests did.
  // GPC findings don't disqualify a vendor that waited for a consent click.
  const flagged = new Set(
    findings.filter((f) => !GPC_TYPES.has(f.type)).map((f) => canonicalVendor(f.vendor)),
  );
  const correctlyGated = grantedHits
    .filter(
      (h) =>
        !deniedIds.has(h.sig.id) &&
        h.sig.consentRequired &&
        !flagged.has(canonicalVendor(h.sig.vendor)),
    )
    .map((h) => ({ vendor: h.sig.vendor, category: h.sig.category }));

  const sorted = sortFindings(findings);
  const counts = countBySeverity(sorted);

  // Headline counts the denied pass only, so it means what it always meant.
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
    headline: headlineFor(headlineCount, when, gpcCheck),
    counts,
    findings: sorted,
    correctlyGated,
    // Carried through so a "default" observation is explicable rather than opaque.
    consentAttempt: {
      performed:
        raw.deniedPass.interaction.kind !== "none" && raw.deniedPass.interaction.performed === true,
      ...("bannerPresent" in raw.deniedPass.interaction
        ? { bannerPresent: raw.deniedPass.interaction.bannerPresent }
        : {}),
      ...("noRejectOffered" in raw.deniedPass.interaction
        ? { noRejectOffered: raw.deniedPass.interaction.noRejectOffered }
        : {}),
      ...("reason" in raw.deniedPass.interaction
        ? { reason: raw.deniedPass.interaction.reason }
        : {}),
      ...("selector" in raw.deniedPass.interaction
        ? { selector: raw.deniedPass.interaction.selector }
        : {}),
    },
    ...(gpcCheck ? { gpcCheck } : {}),
  };
}

function headlineFor(count: number, when: string, check: GpcCheck | null): string {
  if (count > 0) return `${String(count)} tracker${count === 1 ? "" : "s"} firing ${when}`;
  // Clean on the reject test but not on GPC: lead with what's actually wrong.
  const n = check?.mode === "separate-pass" ? check.ignoredBy.length : 0;
  if (n > 0)
    return `${String(n)} ${n === 1 ? "ad vendor ignores" : "ad vendors ignore"} Global Privacy Control`;
  return `No trackers fired ${when}`;
}

const GPC_TYPES: ReadonlySet<string> = new Set(["gpc-signal-ignored", "gpc-not-acknowledged"]);

/**
 * Advertising only. Under the CCPA, GPC opts the visitor out of sale and
 * sharing - cross-context behavioral advertising. Analytics firing with the
 * signal on is not a sale on its own, and flagging it would cry wolf.
 */
function isSaleOrShare(category: string): boolean {
  return category === "advertising";
}

function analyzeGpc(
  raw: RawScan,
  grantedHits: ClassifiedHit[],
  deniedWasGpc: boolean,
  findings: Finding[],
  nextId: (t: string) => string,
  now: string,
): GpcCheck | null {
  const grantedAds = new Set(
    grantedHits
      .filter((h) => h.sig.consentRequired && isSaleOrShare(h.sig.category))
      .map((h) => canonicalVendor(h.sig.vendor)),
  );

  // Fallback scans already observed the denied pass under GPC. Summarize those
  // findings instead of re-emitting them.
  if (deniedWasGpc) {
    const ignoredBy = uniqueSorted(
      findings
        .filter((f) => f.observedUnder === "gpc" && isSaleOrShare(f.category))
        .map((f) => canonicalVendor(f.vendor)),
    );
    const ack = raw.deniedPass.acknowledgment ?? { shown: false };
    pushAckFinding(findings, ignoredBy, ack, nextId, now);
    return summary("denied-pass", ignoredBy, grantedAds, ack);
  }

  const pass = raw.gpcPass;
  if (!pass) return null;

  // One finding per vendor: a request is the stronger proof, a cookie the fallback.
  const byVendor = new Map<string, { vendor: string; evidence: Evidence; viaCookie: boolean }>();
  for (const h of classifyPass(pass.requests)) {
    if (!h.sig.consentRequired || !isSaleOrShare(h.sig.category)) continue;
    const v = canonicalVendor(h.sig.vendor);
    if (byVendor.has(v)) continue;
    byVendor.set(v, {
      vendor: h.sig.vendor,
      viaCookie: false,
      evidence: {
        kind: "request",
        url: h.request.url,
        method: h.request.method,
        resourceType: h.request.resourceType,
      },
    });
  }
  for (const c of pass.cookies) {
    const byDomain = classify(`https://${c.domain.replace(/^\./, "")}/`);
    const sig = classifyCookie(c.name) ?? byDomain;
    if (!sig?.consentRequired || !isSaleOrShare(sig.category)) continue;
    const v = canonicalVendor(sig.vendor);
    if (byVendor.has(v)) continue;
    const pageHost = safeHost(raw.url);
    byVendor.set(v, {
      vendor: sig.vendor,
      viaCookie: true,
      evidence: {
        kind: "cookie",
        name: c.name,
        domain: c.domain,
        firstParty: pageHost !== null && c.domain.replace(/^\./, "") === pageHost,
        expires: c.expires,
      },
    });
  }

  for (const { vendor, evidence, viaCookie } of byVendor.values()) {
    findings.push({
      id: nextId("gpc"),
      schemaVersion: FINDING_SCHEMA_VERSION,
      type: "gpc-signal-ignored",
      severity: severityFor("gpc-signal-ignored"),
      vendor,
      category: "advertising",
      title: `${vendor} ignores Global Privacy Control`,
      detail: viaCookie
        ? `With Global Privacy Control on and no banner click, ${vendor} set an advertising cookie. ` +
          `In California and other states, that signal is a valid opt-out of sale and sharing.`
        : `With Global Privacy Control on and no banner click, ${vendor} loaded and sent data. ` +
          `In California and other states, that signal is a valid opt-out of sale and sharing.`,
      remediation:
        `Turn on Global Privacy Control support in your consent platform so the signal opts the ` +
        `visitor out of advertising, then make sure ${canonicalVendor(vendor)} is blocked by it rather ` +
        `than loaded directly from your theme or tag manager.`,
      evidence,
      observedUnder: "gpc",
      firstSeenAt: now,
      compliance: [],
    });
  }

  const ignoredBy = uniqueSorted([...byVendor.keys()]);
  const ack = pass.acknowledgment ?? { shown: false };
  pushAckFinding(findings, ignoredBy, ack, nextId, now);
  return summary("separate-pass", ignoredBy, grantedAds, ack);
}

/**
 * California's regulations require showing whether the signal was processed.
 * Only raised when advertising is present: a site with no sale or share has
 * nothing to opt out of.
 */
function pushAckFinding(
  findings: Finding[],
  ignoredBy: string[],
  ack: OptOutAcknowledgment,
  nextId: (t: string) => string,
  now: string,
): void {
  if (ack.shown || ignoredBy.length === 0) return;
  findings.push({
    id: nextId("gpcack"),
    schemaVersion: FINDING_SCHEMA_VERSION,
    type: "gpc-not-acknowledged",
    severity: severityFor("gpc-not-acknowledged"),
    vendor: "Opt-out confirmation",
    category: "unknown",
    title: "No opt-out confirmation shown for Global Privacy Control",
    detail:
      "The browser sent Global Privacy Control, and the page didn't show that the opt-out was " +
      "processed. California's regulations require sites to display whether they honored the " +
      'signal, for example "Opt-Out Request Honored".',
    remediation:
      'Show a visible "Opt-Out Request Honored" message, or the equivalent toggle state, when ' +
      "your site receives Global Privacy Control. Most consent platforms have a setting for it.",
    evidence: {
      kind: "cmp",
      platform: "Global Privacy Control",
      bannerShown: false,
      detail: "Signal sent; no opt-out confirmation text found on the page",
    },
    observedUnder: "gpc",
    firstSeenAt: now,
    compliance: [],
  });
}

function summary(
  mode: GpcCheck["mode"],
  ignoredBy: string[],
  grantedAds: Set<string>,
  ack: OptOutAcknowledgment,
): GpcCheck {
  const ignored = new Set(ignoredBy);
  return {
    mode,
    ignoredBy,
    stoppedBy: uniqueSorted([...grantedAds].filter((v) => !ignored.has(v))),
    acknowledged: ack.shown,
    ...(ack.text ? { acknowledgment: ack.text } : {}),
  };
}

function uniqueSorted(items: string[]): string[] {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
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
