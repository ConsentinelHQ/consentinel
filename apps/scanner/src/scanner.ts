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
const SETTLE_MS = 2_500;

export interface ScanOptions {
  /**
   * Record third-party requests but never send them. Used by fixture tests so a
   * suite run never touches a real tracker. Real scans must be false: tags load
   * tags, and blocking the cascade would hide downstream violations.
   */
  blockThirdParty?: boolean;
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
  | { kind: "reject" | "accept"; performed: boolean; selector?: string };

export interface PassResult {
  requests: CapturedRequest[];
  cookies: CapturedCookie[];
  interaction: ConsentInteraction;
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

async function newCapturedContext(targetUrl: string, opts: ScanOptions): Promise<CapturedContext> {
  const browser = await chromium.launch();
  const context = await browser.newContext(); // clean profile per pass - no shared state
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
async function provokeLateTags(page: Page): Promise<void> {
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
    await page.waitForTimeout(SETTLE_MS);
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
  const a = await newCapturedContext(url, opts);
  await a.page.goto(url, { waitUntil: "load", timeout: GOTO_TIMEOUT });
  let deniedInteraction: ConsentInteraction;
  if (cmpId) {
    const r = await rejectConsent(a.page, cmpId);
    deniedInteraction = r.ok
      ? { kind: "reject", performed: true, selector: r.selector }
      : { kind: "reject", performed: false };
  } else {
    deniedInteraction = {
      kind: "none",
      reason: "no CMP detected - default state is the denied state",
    };
  }
  await provokeLateTags(a.page);
  const deniedPass: PassResult = {
    requests: a.requests,
    cookies: await snapshotCookies(a.context),
    interaction: deniedInteraction,
  };
  await a.browser.close();

  // --- Pass B: consent GRANTED ---
  const b = await newCapturedContext(url, opts);
  await b.page.goto(url, { waitUntil: "load", timeout: GOTO_TIMEOUT });
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
  await provokeLateTags(b.page);
  const grantedPass: PassResult = {
    requests: b.requests,
    cookies: await snapshotCookies(b.context),
    interaction: grantedInteraction,
  };
  await b.browser.close();

  return { url, cmp, consentMode, deniedPass, grantedPass };
}
