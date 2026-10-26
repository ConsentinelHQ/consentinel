import type { Page } from "playwright";

/**
 * Finds and reads the site's privacy and cookie policies, for Disclosure Check.
 * Link choice is a pure function so it's testable without a browser.
 */

export interface PolicyText {
  kind: "privacy" | "cookie";
  url: string;
  text: string;
}

export interface PolicyLink {
  href: string;
  text: string;
}

/** Opt-out and request pages are linked as "privacy" but aren't the policy. */
const NOT_A_POLICY = /choices|do-?not-?sell|opt-?out|request|preferences|settings|manage/i;
const PRIVACY_TEXT = /\bprivacy\b/i;
const PRIVACY_HREF = /privacy/i;
const COOKIE_TEXT = /\bcookies?\b.*\b(policy|notice|statement|declaration)\b|^cookies?$/i;
const COOKIE_HREF = /cookie-?(policy|notice|statement|declaration)|\/cookies?\/?$/i;

/** Shopify serves its own privacy policy here on every store. */
export const SHOPIFY_POLICY_PATH = "/policies/privacy-policy";

/** At most one privacy and one cookie policy, first-matching link wins. */
export function pickPolicyLinks(
  links: readonly PolicyLink[],
  pageUrl: string,
): { kind: PolicyText["kind"]; url: string }[] {
  const out: { kind: PolicyText["kind"]; url: string }[] = [];
  const resolve = (href: string): string | null => {
    try {
      const u = new URL(href, pageUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      u.hash = "";
      return u.toString();
    } catch {
      return null;
    }
  };
  const find = (test: (l: PolicyLink) => boolean): string | null => {
    for (const l of links) {
      if (NOT_A_POLICY.test(l.text) || NOT_A_POLICY.test(l.href)) continue;
      if (!test(l)) continue;
      const url = resolve(l.href);
      if (url) return url;
    }
    return null;
  };
  const cookie = find((l) => COOKIE_TEXT.test(l.text.trim()) || COOKIE_HREF.test(l.href));
  const privacy = find(
    (l) => (PRIVACY_TEXT.test(l.text) || PRIVACY_HREF.test(l.href)) && !COOKIE_HREF.test(l.href),
  );
  if (privacy) out.push({ kind: "privacy", url: privacy });
  if (cookie && cookie !== privacy) out.push({ kind: "cookie", url: cookie });
  return out;
}

const READ_TIMEOUT = 20_000;
/** Every real policy talks about personal information or describes its cookies. A homepage rarely does. */
const LOOKS_LIKE_POLICY =
  /personal (information|data)|cookies? (policy|notice|statement|declaration)|types of cookies/i;
const MAX_CHARS = 400_000;

/** Text of a page and its frames; policy widgets often render in an iframe. */
async function readText(page: Page, url: string): Promise<{ text: string; finalUrl: string }> {
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: READ_TIMEOUT });
    if (res && res.status() >= 400) return { text: "", finalUrl: page.url() };
    await page.waitForTimeout(1500);
    const parts: string[] = [];
    for (const frame of page.frames()) {
      const t = await frame.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      if (t) parts.push(t);
    }
    return { text: parts.join("\n").slice(0, MAX_CHARS), finalUrl: page.url() };
  } catch {
    return { text: "", finalUrl: url };
  }
}

/**
 * Policy links from the loaded page, then each policy's text. Falls back to
 * Shopify's standard policy path when the page links none. Best effort: any
 * failure yields fewer texts, never a failed scan.
 */
export async function readPolicies(page: Page, pageUrl: string): Promise<PolicyText[]> {
  let links: PolicyLink[] = [];
  try {
    links = await page.$$eval("a[href]", (as) =>
      as.slice(0, 3000).map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
      })),
    );
  } catch {
    // Page gone; try the fallback below.
  }
  const picked = pickPolicyLinks(links, pageUrl);
  if (!picked.some((p) => p.kind === "privacy")) {
    try {
      picked.unshift({ kind: "privacy", url: new URL(SHOPIFY_POLICY_PATH, pageUrl).toString() });
    } catch {
      // Bad page URL; nothing to fall back to.
    }
  }
  const out: PolicyText[] = [];
  for (const p of picked) {
    const read = await readText(page, p.url);
    const fallback = p.url.endsWith(SHOPIFY_POLICY_PATH) && !links.some((l) => l.href === p.url);
    // The guessed path must not have redirected elsewhere (often home).
    const stayed = !fallback || new URL(read.finalUrl).pathname.startsWith("/policies/");
    // A page that doesn't read like a policy isn't one: a soft 404, a login wall.
    const text = stayed && LOOKS_LIKE_POLICY.test(read.text) ? read.text : "";
    if (!text && fallback) continue;
    out.push({ ...p, text });
  }
  return out;
}
