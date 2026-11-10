import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import {
  countByImpact,
  scoreAccessibility,
  sortIssues,
  type A11yImpact,
  type AccessibilityAudit,
  type AccessibilityIssue,
  type AccessibilityPage,
} from "@consentinel/shared";
import { IDENTIFIED_USER_AGENT } from "./scanner.js";

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");
const AXE_VERSION = (require("axe-core/package.json") as { version: string }).version;
let axeSource: string | undefined;

const PAGE_TIMEOUT = 25_000;
const SETTLE_MS = 1_500;
const MAX_EXAMPLES = 3;
const HTML_CAP = 240;

/** WCAG 2.0, 2.1 and 2.2 at A and AA. Best-practice rules are left out: not what demand letters cite. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export interface AccessibilityOptions {
  /** Pages to audit, homepage included. From the plan: Monitor 1, Growth and Agency 10. */
  maxPages: number;
  scanToken?: string;
  identify?: boolean;
}

/** The pages shoppers use, in the order they matter. Matched against same-site links. */
const KEY_PAGES: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: "Product page", re: /\/products?\/[^/?#]+/i },
  { label: "Collection page", re: /\/(collections|category|categories|shop)\/[^/?#]+/i },
  { label: "Cart", re: /\/cart\/?$/i },
  { label: "Search", re: /\/search\/?$/i },
  { label: "Contact", re: /\/(pages\/)?contact(-us)?\/?$/i },
  { label: "Account sign-in", re: /\/account(\/login)?\/?$/i },
  { label: "About", re: /\/(pages\/)?about(-us)?\/?$/i },
  { label: "FAQ", re: /\/(pages\/)?(faq|faqs|help)\/?$/i },
];

const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|mp4|zip|xml|json|txt)$/i;

/**
 * Pick the pages to audit from the homepage's links: the homepage, then one of each
 * key page type, then other same-site links in page order. Pure, so it's testable.
 */
export function pickAuditPages(
  homeUrl: string,
  hrefs: readonly string[],
  maxPages: number,
): Array<{ url: string; label: string }> {
  const home = new URL(homeUrl);
  const host = home.hostname.replace(/^www\./, "");
  const out: Array<{ url: string; label: string }> = [{ url: home.toString(), label: "Homepage" }];
  const seen = new Set<string>([normalize(home)]);

  const candidates: URL[] = [];
  for (const href of hrefs) {
    let u: URL;
    try {
      u = new URL(href, home);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (u.hostname.replace(/^www\./, "") !== host) continue;
    if (SKIP_EXT.test(u.pathname)) continue;
    u.hash = "";
    u.search = "";
    if (seen.has(normalize(u))) continue;
    seen.add(normalize(u));
    candidates.push(u);
  }

  const used = new Set<URL>();
  for (const k of KEY_PAGES) {
    if (out.length >= maxPages) break;
    const hit = candidates.find((u) => !used.has(u) && k.re.test(u.pathname));
    if (!hit) continue;
    used.add(hit);
    out.push({ url: hit.toString(), label: k.label });
  }
  for (const u of candidates) {
    if (out.length >= maxPages) break;
    if (used.has(u)) continue;
    // Legal and policy pages are text walls; they add noise, not shopper paths.
    if (/\/(policies|legal|privacy|terms)/i.test(u.pathname)) continue;
    used.add(u);
    out.push({ url: u.toString(), label: "Page" });
  }
  return out.slice(0, Math.max(1, maxPages));
}

function normalize(u: URL): string {
  return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "") || "/"}`;
}

/** The axe-core result shape we read. */
export interface AxeRuleResult {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: Array<{ target: unknown[]; html: string }>;
}

/** Merge each page's axe violations into one issue per rule. Pure. */
export function mergeViolations(
  perPage: ReadonlyArray<{ path: string; violations: readonly AxeRuleResult[] }>,
): AccessibilityIssue[] {
  const byRule = new Map<string, AccessibilityIssue>();
  for (const { path, violations } of perPage) {
    for (const v of violations) {
      const impact = toImpact(v.impact);
      let issue = byRule.get(v.id);
      if (!issue) {
        issue = {
          rule: v.id,
          impact,
          title: FIXES[v.id]?.title ?? v.help,
          wcag: wcagCriteria(v.tags),
          level: v.tags.some((t) => /^wcag2\d?aa$/.test(t)) ? "AA" : "A",
          pages: [],
          instances: 0,
          examples: [],
          fix: FIXES[v.id]?.fix ?? `${v.help}. See the linked guidance for how to fix it.`,
          helpUrl: v.helpUrl.split("?")[0] ?? v.helpUrl,
        };
        byRule.set(v.id, issue);
      }
      if (!issue.pages.includes(path)) issue.pages.push(path);
      issue.instances += v.nodes.length;
      for (const n of v.nodes) {
        if (issue.examples.length >= MAX_EXAMPLES) break;
        issue.examples.push({
          page: path,
          selector: n.target.map(String).join(" "),
          html: n.html.length > HTML_CAP ? `${n.html.slice(0, HTML_CAP)}…` : n.html,
        });
      }
    }
  }
  return sortIssues([...byRule.values()]);
}

function toImpact(v: string | null | undefined): A11yImpact {
  return v === "critical" || v === "serious" || v === "moderate" || v === "minor" ? v : "moderate";
}

/** "wcag111" -> "1.1.1", "wcag1410" -> "1.4.10". */
function wcagCriteria(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const m = /^wcag(\d)(\d)(\d{1,2})$/.exec(t);
    if (m) out.push(`${m[1]}.${m[2]}.${m[3]}`);
  }
  return out;
}

/** Plain titles and fixes for the checks stores fail most. Unlisted rules fall back to axe's text. */
const FIXES: Record<string, { title: string; fix: string }> = {
  "image-alt": {
    title: "Images without alt text",
    fix: "Give every meaningful image alt text that says what it shows. In Shopify, set it per image in Products > Media or in the theme editor. Decorative images get an empty alt.",
  },
  "color-contrast": {
    title: "Text that's hard to read against its background",
    fix: "Raise contrast to at least 4.5:1 for body text and 3:1 for large text. Usually one theme color setting fixes every instance.",
  },
  "link-name": {
    title: "Links with no readable name",
    fix: "Icon-only links (social icons, cart, logo) need text a screen reader can say. Add visually hidden text or an aria-label.",
  },
  "button-name": {
    title: "Buttons with no readable name",
    fix: "Icon buttons (close, menu, quantity, carousel arrows) need an aria-label that says what they do.",
  },
  label: {
    title: "Form fields without labels",
    fix: "Every input needs a label. Placeholder text doesn't count. Check newsletter, search and quantity fields first.",
  },
  "select-name": {
    title: "Dropdowns without labels",
    fix: "Give variant and sort dropdowns a visible or aria label.",
  },
  "html-has-lang": {
    title: "Page language not set",
    fix: 'Add lang="en" (or the right language) to the <html> tag in the theme layout.',
  },
  "html-lang-valid": {
    title: "Page language is invalid",
    fix: "Set the <html> lang attribute to a valid language code.",
  },
  "document-title": {
    title: "Page has no title",
    fix: "Give every page a <title> that says what it is.",
  },
  "frame-title": {
    title: "Embedded frames without titles",
    fix: "Give iframes (videos, reviews, chat widgets) a title attribute.",
  },
  "aria-hidden-focus": {
    title: "Hidden content that can still be focused",
    fix: 'Elements inside aria-hidden can\'t be keyboard-focusable. Common in closed menus and carousels: add tabindex="-1" or the inert attribute when hidden.',
  },
  "nested-interactive": {
    title: "Interactive controls nested inside each other",
    fix: "Don't put buttons or links inside other buttons or links. Screen readers announce only one.",
  },
  list: {
    title: "Lists built incorrectly",
    fix: "<ul> and <ol> may contain only <li> elements directly.",
  },
  listitem: {
    title: "List items outside a list",
    fix: "Wrap <li> elements in a <ul> or <ol>.",
  },
  "duplicate-id-aria": {
    title: "Duplicate IDs used by labels",
    fix: "IDs referenced by labels or ARIA must be unique on the page.",
  },
  "aria-allowed-attr": {
    title: "Invalid ARIA attributes",
    fix: "Remove ARIA attributes the element's role doesn't support.",
  },
  "aria-required-attr": {
    title: "ARIA roles missing required attributes",
    fix: "Add the attributes the role requires, e.g. aria-checked on a checkbox role.",
  },
  "aria-valid-attr-value": {
    title: "ARIA attributes with invalid values",
    fix: "Fix ARIA values, often an aria-controls or aria-labelledby pointing at an ID that doesn't exist.",
  },
  "aria-prohibited-attr": {
    title: "ARIA labels on elements that can't have them",
    fix: "Move the aria-label to an element that supports it, or use visible text instead.",
  },
  "link-in-text-block": {
    title: "Links that only stand out by color",
    fix: "Underline links inside paragraphs, or give them 3:1 contrast with surrounding text plus a non-color cue.",
  },
  "meta-viewport": {
    title: "Zoom is disabled",
    fix: "Remove maximum-scale=1 and user-scalable=no from the viewport meta tag so people can zoom.",
  },
  "input-image-alt": {
    title: "Image buttons without alt text",
    fix: 'Add alt text to <input type="image"> buttons.',
  },
  "svg-img-alt": {
    title: "SVG images without a name",
    fix: 'SVGs with role="img" need a <title> or aria-label.',
  },
  "role-img-alt": {
    title: "Image roles without a name",
    fix: 'Elements with role="img" need an aria-label.',
  },
  "scrollable-region-focusable": {
    title: "Scroll areas keyboard users can't reach",
    fix: 'Make scrollable regions focusable with tabindex="0" or make sure they contain a focusable element.',
  },
  "target-size": {
    title: "Tap targets too small",
    fix: "Make buttons and links at least 24 by 24 pixels, or space them apart.",
  },
  "autocomplete-valid": {
    title: "Invalid autocomplete values",
    fix: "Use standard autocomplete values (email, given-name, postal-code) on address and contact fields.",
  },
  "empty-heading": {
    title: "Empty headings",
    fix: "Remove heading tags with no text, or give them text.",
  },
  "empty-table-header": {
    title: "Empty table headers",
    fix: "Give table header cells text.",
  },
  "definition-list": {
    title: "Definition lists built incorrectly",
    fix: "<dl> may contain only <dt>, <dd> and <div> groups.",
  },
  "video-caption": {
    title: "Videos without captions",
    fix: "Add a captions track to videos with speech.",
  },
};

/** Audit the homepage and the plan's share of key pages. Never throws for one bad page. */
export async function auditAccessibility(
  homeUrl: string,
  opts: AccessibilityOptions,
): Promise<AccessibilityAudit> {
  axeSource ??= readFileSync(AXE_PATH, "utf8");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      // Inline injection would trip a strict CSP; this only affects our own script.
      bypassCSP: true,
      viewport: { width: 1280, height: 900 },
      ...(opts.identify ? { userAgent: IDENTIFIED_USER_AGENT } : {}),
    });
    const host = new URL(homeUrl).hostname.replace(/^www\./, "");
    if (opts.scanToken) {
      const token = opts.scanToken;
      await context.route("**/*", async (route) => {
        const req = route.request();
        let firstParty = false;
        try {
          const h = new URL(req.url()).hostname.replace(/^www\./, "");
          firstParty = h === host || h.endsWith(`.${host}`);
        } catch {
          // Unparseable URL: send as is.
        }
        await route.continue(
          firstParty ? { headers: { ...req.headers(), "x-consentinel-token": token } } : undefined,
        );
      });
    }
    const page = await context.newPage();

    const home = await auditPage(page, homeUrl);
    const targets = pickAuditPages(homeUrl, home.hrefs, opts.maxPages);
    const pages: AccessibilityPage[] = [];
    const perPage: Array<{ path: string; violations: AxeRuleResult[] }> = [];
    let needsReview = new Set<string>();

    const record = (t: { url: string; label: string }, r: PageAudit): void => {
      if (r.error) {
        pages.push({ url: t.url, label: t.label, status: "failed", issues: 0, error: r.error });
        return;
      }
      pages.push({ url: t.url, label: t.label, status: "ok", issues: r.violations.length });
      perPage.push({ path: pathOf(t.url), violations: r.violations });
      needsReview = new Set([...needsReview, ...r.incomplete]);
    };

    const [first, ...rest] = targets;
    if (first) record(first, home);
    // A homepage we couldn't audit means the rest won't go better.
    if (!home.error) {
      for (const t of rest) record(t, await auditPage(page, t.url));
    }

    const issues = mergeViolations(perPage);
    return {
      engine: `axe-core ${AXE_VERSION}`,
      standard: "WCAG 2.2 AA",
      pageLimit: opts.maxPages,
      pages,
      score: scoreAccessibility(issues),
      counts: countByImpact(issues),
      issues,
      needsReview: needsReview.size,
    };
  } finally {
    await browser.close();
  }
}

interface PageAudit {
  violations: AxeRuleResult[];
  incomplete: string[];
  hrefs: string[];
  error?: string;
}

async function auditPage(page: Page, url: string): Promise<PageAudit> {
  try {
    let response;
    try {
      response = await page.goto(url, { waitUntil: "load", timeout: PAGE_TIMEOUT });
    } catch (err) {
      if (!(err instanceof Error) || err.name !== "TimeoutError") throw err;
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT });
    }
    const status = response?.status() ?? 0;
    if (status >= 400)
      return { violations: [], incomplete: [], hrefs: [], error: `HTTP ${status}` };
    try {
      await page.waitForLoadState("networkidle", { timeout: 6_000 });
    } catch {
      // Pages with polling never go idle.
    }
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate(axeSource ?? "");
    const result = await page.evaluate(async (tags) => {
      const axe = (
        window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<unknown> } }
      ).axe;
      return (await axe.run(document, {
        runOnly: { type: "tag", values: tags },
        resultTypes: ["violations", "incomplete"],
        iframes: false,
      })) as { violations: unknown; incomplete: Array<{ id: string }> };
    }, WCAG_TAGS);
    const hrefs = await page.$$eval("a[href]", (as) =>
      as.map((a) => (a as HTMLAnchorElement).href).slice(0, 2000),
    );
    return {
      violations: result.violations as AxeRuleResult[],
      incomplete: result.incomplete.map((i) => i.id),
      hrefs,
    };
  } catch (err) {
    return {
      violations: [],
      incomplete: [],
      hrefs: [],
      error: err instanceof Error ? (err.message.split("\n")[0] ?? "failed") : "failed",
    };
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}
