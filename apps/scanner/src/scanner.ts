import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  detectCmp,
  detectConsentMode,
  type CmpDetection,
  type ConsentModeDetection,
} from "./cmp/detect.js";
import { acceptConsent, rejectConsent } from "./cmp/driver.js";

const GOTO_TIMEOUT = 20_000;
const NETWORK_IDLE_TIMEOUT = 8_000;
/**
 * Tags do not fire on `load`. GTM injects, GTM's tags then inject, and the actual
 * measurement hit (the thing that proves data left the browser) lands seconds later.
 * A short settle sees the library load and misses the transmission - which is the
 * strongest evidence we have. Wait for network idle, provoke lazy tags, settle again.
 */
/** Requests must stop for this long before we consider the page settled. */
const QUIET_PERIOD_MS = 2_500;
const QUIET_POLL_MS = 250;
/** Hard ceiling. Some pages never go quiet; we cannot wait forever. */
const MAX_SETTLE_MS = 15_000;

export interface ScanOptions {
  /**
   * Record third-party requests but never send them. Used by fixture tests so a
   * suite run never touches a real tracker. Real scans must be false: tags load
   * tags, and blocking the cascade would hide downstream violations.
   */
  blockThirdParty?: boolean;
  /**
   * Minimum requests before a scan is considered credible. Fixtures are tiny by
   * design and set this low; real scans use the shared default.
   */
  minRequests?: number;
  /**
   * Announce ourselves in the user agent. Off by default because some CMPs serve
   * a reduced banner to identified bots, which corrupts the consent measurement.
   * Turn on only for sites whose owners have allowlisted us.
   */
  identify?: boolean;
  /**
   * Send Global Privacy Control on the denied pass: a `Sec-GPC: 1` header on
   * every request and navigator.globalPrivacyControl = true. Off by default
   * until measured, because a CMP that honours GPC may suppress its banner and
   * change what a reject-click scan observes.
   */
  gpc?: boolean;
}

export interface CapturedRequest {
  url: string;
  method: string;
  resourceType: string;
  tMs: number;
}

export interface CapturedCookie {
  name: string;
  domain: string;
  expires: number;
}

export type ConsentInteraction =
  | { kind: "none"; reason: string }
  | {
      kind: "reject" | "accept";
      performed: boolean;
      selector?: string;
      bannerPresent?: boolean;
      /** Banner shown with no decline control at all. Their configuration, not our miss. */
      noRejectOffered?: boolean;
    };

export interface MainResponse {
  status: number;
  headers: Record<string, string>;
  title: string;
}

export interface PassResult {
  requests: CapturedRequest[];
  cookies: CapturedCookie[];
  interaction: ConsentInteraction;
  /** The main document response. Absent if navigation produced none. */
  mainResponse?: MainResponse;
  /** Whether this pass sent Global Privacy Control. */
  gpc?: boolean;
}

export interface RawScan {
  url: string;
  cmp: CmpDetection;
  consentMode: ConsentModeDetection;
  /** Page in its consent-REJECTED (or default-denied) state - the scrutiny pass. */
  deniedPass: PassResult;
  /** Page in its consent-GRANTED state - tells us what is legitimately gated. */
  grantedPass: PassResult;
}

interface CapturedContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  requests: CapturedRequest[];
}

function registrableHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Identified UA, for customers who have allowlisted us.
 *
 * NOT the default. Tested against athleticbrewing.com: with this UA, Ketch serves
 * a different banner, the reject control is absent, and the scan silently falls
 * back to measuring the default state. 33 criticals became 5 and `observedUnder`
 * went from "rejected" to "default" - a plausible-looking report of the wrong thing,
 * which is worse than being blocked outright.
 *
 * Only send this when the site owner has asked to be scanned and allowlisted us.
 */
export const IDENTIFIED_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/141.0.0.0 Safari/537.36 Consentinel/1.0 (+https://www.consentinelhq.com/bot)";

async function newCapturedContext(
  targetUrl: string,
  opts: ScanOptions,
  signalGpc = false,
): Promise<CapturedContext> {
  const browser = await chromium.launch();
  // Clean profile per pass - no shared state.
  const context = await browser.newContext({
    ...(opts.identify ? { userAgent: IDENTIFIED_USER_AGENT } : {}),
    // GPC travels to every host, first and third party, exactly as a browser sends it.
    ...(signalGpc ? { extraHTTPHeaders: { "Sec-GPC": "1" } } : {}),
  });
  if (signalGpc) {
    // Before any page script runs, so a CMP reading the flag on load sees it.
    await context.addInitScript(
      'Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true, configurable: true });',
    );
  }
  const page = await context.newPage();
  const requests: CapturedRequest[] = [];
  const startedAt = Date.now();

  const targetHost = registrableHost(targetUrl);

  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    requests.push({
      url,
      method: req.method(),
      resourceType: req.resourceType(),
      tMs: Date.now() - startedAt,
    });

    if (!opts.blockThirdParty) {
      await route.continue();
      return;
    }

    // Hermetic mode: first-party still loads, third-party is recorded but never sent.
    const host = registrableHost(url);
    const firstParty =
      host !== null &&
      targetHost !== null &&
      (host === targetHost || host.endsWith("." + targetHost));
    if (firstParty) {
      await route.continue();
      return;
    }
    await route.abort();
  });

  return { browser, context, page, requests };
}

/**
 * Real sites defer tags behind scroll, interaction, or an idle callback. Without
 * this, a scan systematically under-reports the sites most worth reporting on.
 */
async function provokeLateTags(page: Page, requests: CapturedRequest[]): Promise<void> {
  try {
    await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT });
  } catch {
    // A page with long-polling or video never goes idle. Carry on.
  }
  try {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
      window.dispatchEvent(new Event("scroll"));
    });
    await page.mouse.move(200, 200);

    /**
     * A fixed settle makes the finding set depend on network speed: a tag that
     * fires at 3s is captured on a slow run and missed on a fast one. The same
     * site returned 71 findings, then 36, then 71 across three consecutive runs.
     *
     * Non-reproducible findings are fatal to diffing - scan-to-scan comparison
     * would report tags as "fixed" that were never touched. So instead of
     * waiting a fixed time, wait until requests actually stop arriving.
     */
    const deadline = Date.now() + MAX_SETTLE_MS;
    let lastCount = requests.length;
    let quietSince = Date.now();

    while (Date.now() < deadline) {
      await page.waitForTimeout(QUIET_POLL_MS);
      if (requests.length !== lastCount) {
        lastCount = requests.length;
        quietSince = Date.now();
        continue;
      }
      if (Date.now() - quietSince >= QUIET_PERIOD_MS) break;
    }

    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
  } catch {
    // Page closed or navigated; whatever we captured still stands.
  }
}

async function snapshotCookies(context: BrowserContext): Promise<CapturedCookie[]> {
  const cookies = await context.cookies();
  return cookies.map((c) => ({ name: c.name, domain: c.domain, expires: c.expires }));
}

/**
 * Navigate and keep what the server said, not just what loaded.
 *
 * `goto` returns null on same-document navigation, which a challenge redirect can
 * produce. Callers treat an absent response as "no evidence", never as "not blocked".
 */
async function gotoCapturing(page: Page, url: string): Promise<MainResponse | undefined> {
  const response = await page.goto(url, { waitUntil: "load", timeout: GOTO_TIMEOUT });
  if (!response) return undefined;
  const title = await page.title().catch(() => "");
  return { status: response.status(), headers: response.headers(), title };
}

export async function scanUrl(url: string, opts: ScanOptions = {}): Promise<RawScan> {
  // --- Pass 0: detection ---
  const probe = await newCapturedContext(url, opts);
  await probe.page.goto(url, { waitUntil: "load", timeout: GOTO_TIMEOUT });
  await probe.page.waitForTimeout(600);
  const cmp = await detectCmp(probe.page, probe.requests);
  const consentMode = await detectConsentMode(probe.page);
  await probe.browser.close();

  const cmpId = cmp.detected?.id ?? null;

  // --- Pass A: consent REJECTED (or default-denied if no CMP) ---
  const a = await newCapturedContext(url, opts, opts.gpc === true);
  const deniedResponse = await gotoCapturing(a.page, url);
  let deniedInteraction: ConsentInteraction;
  if (cmpId) {
    const r = await rejectConsent(a.page, cmpId);
    deniedInteraction = r.ok
      ? { kind: "reject", performed: true, selector: r.selector }
      : // bannerPresent separates "we could not click it" from "it never appeared",
        // which is a real finding rather than a limitation of ours.
        {
          kind: "reject",
          performed: false,
          bannerPresent: r.bannerPresent ?? false,
          noRejectOffered: r.noRejectOffered ?? false,
        };
  } else {
    deniedInteraction = {
      kind: "none",
      reason: "no CMP detected - default state is the denied state",
    };
  }
  await provokeLateTags(a.page, a.requests);
  const deniedPass: PassResult = {
    requests: a.requests,
    cookies: await snapshotCookies(a.context),
    interaction: deniedInteraction,
    ...(deniedResponse ? { mainResponse: deniedResponse } : {}),
    gpc: opts.gpc === true,
  };
  await a.browser.close();

  // --- Pass B: consent GRANTED ---
  const b = await newCapturedContext(url, opts);
  const grantedResponse = await gotoCapturing(b.page, url);
  let grantedInteraction: ConsentInteraction;
  if (cmpId) {
    const r = await acceptConsent(b.page, cmpId);
    grantedInteraction = r.ok
      ? { kind: "accept", performed: true, selector: r.selector }
      : { kind: "accept", performed: false };
  } else {
    grantedInteraction = {
      kind: "none",
      reason: "no CMP to accept - granted state equals default",
    };
  }
  await provokeLateTags(b.page, b.requests);
  const grantedPass: PassResult = {
    requests: b.requests,
    cookies: await snapshotCookies(b.context),
    interaction: grantedInteraction,
    ...(grantedResponse ? { mainResponse: grantedResponse } : {}),
  };
  await b.browser.close();

  return { url, cmp, consentMode, deniedPass, grantedPass };
}
