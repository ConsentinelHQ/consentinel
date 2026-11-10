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

const PAGE_TIMEOUT = 20_000;
const SETTLE_MS = 1_000;
const MAX_EXAMPLES = 3;
const HTML_CAP = 240;

/** WCAG 2.0, 2.1 and 2.2 at A and AA. Best-practice rules are left out: not what demand letters cite. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export interface AccessibilityOptions {
  /** Pages to audit, homepage included. From the plan: Monitor 1, Growth and Agency 10. */
  maxPages: number;
  scanToken?: string;
  identify?: boolean;
  /**
   * Stop starting new pages after this long and return what finished. Keeps a slow
   * store's 7 audited pages instead of losing all 10 to an outer timeout.
   */
  budgetMs?: number;
  /**
   * Screenshot the first failing element of the worst issues. Paid plans only:
   * images are stored in the scan result, so free scans stay small.
   */
  screenshots?: boolean;
}

/** Screenshots per scan. Each is a small JPEG crop, roughly 10-25KB. */
const MAX_SHOTS = 10;

/** Most pages finish in 10-20s; one that hangs (polling, a wedged script) is cut off here. */
const PAGE_HARD_LIMIT_MS = 45_000;
/** Pages audited at once. Each is a tab in one browser, so memory stays flat. */
const PAGE_CONCURRENCY = 2;

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
  nodes: AxeNode[];
}

interface AxeNode {
  target: unknown[];
  html: string;
  failureSummary?: string;
  any?: Array<{ id: string; data?: unknown }>;
  /** Added by us: JPEG data URL of the element, outlined, in context. */
  shot?: string;
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
        const contrast = contrastOf(n);
        const summary = summaryOf(n.failureSummary);
        issue.examples.push({
          page: path,
          selector: n.target.map(String).join(" "),
          html: compactHtml(n.html),
          ...(summary ? { summary } : {}),
          ...(contrast ? { contrast } : {}),
          ...(n.shot ? { shot: n.shot } : {}),
        });
      }
    }
  }
  return sortIssues([...byRule.values()]);
}

/** Short elements in full; long ones (a whole <html> or section) as their opening tag. */
function compactHtml(html: string): string {
  if (html.length <= 160) return html;
  const open = /^<[^>]{0,400}>/.exec(html)?.[0];
  if (open) return open.length > HTML_CAP ? `${open.slice(0, HTML_CAP)}…>` : `${open}…`;
  return `${html.slice(0, HTML_CAP)}…`;
}

/** axe's "Fix any of the following: ..." without the boilerplate first line. */
function summaryOf(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^Fix (any|all) of the following:?$/i.test(l));
  // axe lists every sub-check that failed; the first one is the one that matters.
  const out = lines[0] ?? "";
  return out.length > 240 ? `${out.slice(0, 240)}…` : out || undefined;
}

/** The measured contrast for a color-contrast failure. */
function contrastOf(
  n: AxeNode,
): { fg: string; bg: string; ratio: number; required: number } | undefined {
  const d = n.any?.find((c) => c.id === "color-contrast")?.data as
    | { fgColor?: string; bgColor?: string; contrastRatio?: number; expectedContrastRatio?: string }
    | undefined;
  if (!d?.fgColor || !d.bgColor || typeof d.contrastRatio !== "number") return undefined;
  const required = Number.parseFloat(d.expectedContrastRatio ?? "4.5");
  return {
    fg: d.fgColor,
    bg: d.bgColor,
    ratio: Math.round(d.contrastRatio * 100) / 100,
    required: Number.isFinite(required) ? required : 4.5,
  };
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
  "label-content-name-mismatch": {
    title: "Link or button text doesn't match its accessible name",
    fix: "A control's aria-label must include its visible text, so voice users can say what they see. Remove the aria-label, or start it with the visible words.",
  },
  "aria-command-name": {
    title: "Custom buttons with no readable name",
    fix: 'Elements with role="button", "link" or "menuitem" need text or an aria-label.',
  },
  "aria-input-field-name": {
    title: "Custom inputs with no readable name",
    fix: "Comboboxes, sliders and search boxes built from divs need an aria-label or aria-labelledby.",
  },
  "aria-toggle-field-name": {
    title: "Toggles with no readable name",
    fix: "Custom checkboxes, switches and radios need an aria-label.",
  },
  "form-field-multiple-labels": {
    title: "Fields with more than one label",
    fix: "Give each field exactly one label element.",
  },
  "valid-lang": {
    title: "Invalid language on part of the page",
    fix: "Fix lang attributes inside the page to valid language codes.",
  },
  "object-alt": {
    title: "Embedded objects without a text alternative",
    fix: "Give <object> elements a text alternative.",
  },
  "td-headers-attr": {
    title: "Table cells pointing at missing headers",
    fix: "headers attributes on table cells must reference header cells in the same table.",
  },
  "th-has-data-cells": {
    title: "Table headers with no data",
    fix: "Every table header must describe at least one data cell. Size charts are the usual culprit.",
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
    const started = Date.now();
    const budget = opts.budgetMs ?? Number.POSITIVE_INFINITY;
    // A fresh tab per page: one that hangs can't poison the next.
    const shots = { remaining: opts.screenshots ? MAX_SHOTS : 0, taken: new Set<string>() };
    const auditInTab = async (url: string): Promise<PageAudit> => {
      const page = await context.newPage();
      try {
        return await withLimit(auditPage(page, url, shots), PAGE_HARD_LIMIT_MS);
      } finally {
        await page.close().catch(() => undefined);
      }
    };

    const home = await auditInTab(homeUrl);
    const targets = pickAuditPages(homeUrl, home.hrefs, opts.maxPages);
    const results = new Map<string, PageAudit>();
    const [first, ...rest] = targets;
    if (first) results.set(first.url, home);

    // A homepage we couldn't audit means the rest won't go better.
    if (!home.error) {
      let next = 0;
      const lane = async (): Promise<void> => {
        while (next < rest.length) {
          const t = rest[next++];
          if (!t) break;
          // Leave room for the slowest page to finish inside the budget.
          if (Date.now() - started > budget - PAGE_HARD_LIMIT_MS) {
            results.set(t.url, { violations: [], incomplete: [], hrefs: [], error: "time limit" });
            continue;
          }
          results.set(t.url, await auditInTab(t.url));
        }
      };
      await Promise.all(Array.from({ length: PAGE_CONCURRENCY }, lane));
    }

    // Report pages in pick order, not finish order.
    const pages: AccessibilityPage[] = [];
    const perPage: Array<{ path: string; violations: AxeRuleResult[] }> = [];
    const needsReview = new Set<string>();
    for (const t of targets) {
      const r = results.get(t.url);
      if (!r) continue;
      if (r.error) {
        pages.push({ url: t.url, label: t.label, status: "failed", issues: 0, error: r.error });
        continue;
      }
      pages.push({ url: t.url, label: t.label, status: "ok", issues: r.violations.length });
      perPage.push({ path: pathOf(t.url), violations: r.violations });
      for (const id of r.incomplete) needsReview.add(id);
    }
    console.log(
      `[a11y] ${homeUrl}: ${String(perPage.length)}/${String(targets.length)} pages in ${String(Date.now() - started)}ms`,
    );

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

async function auditPage(
  page: Page,
  url: string,
  shots: { remaining: number; taken: Set<string> },
): Promise<PageAudit> {
  try {
    // DOM ready is enough to audit markup. Waiting for "load" on a heavy store
    // (every ad pixel, every image) was what pushed product pages past the limit.
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT });
    const status = response?.status() ?? 0;
    if (status >= 400)
      return { violations: [], incomplete: [], hrefs: [], error: `HTTP ${status}` };
    await page.waitForLoadState("load", { timeout: 8_000 }).catch(() => undefined);
    // Pages with polling never go idle; take what rendered.
    await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
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
    const violations = result.violations as AxeRuleResult[];
    // Worst issues first, one shot per rule across the whole scan.
    for (const v of [...violations].sort((a, b) => rank(a.impact) - rank(b.impact))) {
      if (shots.remaining <= 0) break;
      if (shots.taken.has(v.id)) continue;
      const node = v.nodes[0];
      if (!node) continue;
      const shot = await shoot(page, node.target);
      if (!shot) continue;
      node.shot = shot;
      shots.taken.add(v.id);
      shots.remaining -= 1;
    }
    return {
      violations,
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

function rank(impact: string | null | undefined): number {
  return impact === "critical" ? 0 : impact === "serious" ? 1 : impact === "moderate" ? 2 : 3;
}

/**
 * The failing element in context: outlined in red, with a little of the page
 * around it, as a small JPEG. Skips elements inside frames or shadow roots,
 * hidden ones, and anything that errors.
 */
async function shoot(page: Page, target: readonly unknown[]): Promise<string | undefined> {
  const selector = target[0];
  if (target.length !== 1 || typeof selector !== "string") return undefined;
  // A screenshot of the whole page says nothing about a missing lang attribute.
  if (/^(html|body|head)\b/i.test(selector)) return undefined;
  const el = page.locator(selector).first();
  let marked = false;
  try {
    await el.scrollIntoViewIfNeeded({ timeout: 2_000 });
    const box = await el.boundingBox({ timeout: 2_000 });
    if (!box || box.width < 2 || box.height < 2) return undefined;
    await el.evaluate((n) => {
      const h = n as HTMLElement;
      h.dataset["cnslOutline"] = h.style.outline;
      h.style.outline = "3px solid #d70015";
      h.style.outlineOffset = "2px";
    });
    marked = true;
    const vp = page.viewportSize() ?? { width: 1280, height: 900 };
    const pad = 28;
    const x = Math.max(0, Math.floor(box.x - pad));
    const y = Math.max(0, Math.floor(box.y - pad));
    const width = Math.min(vp.width - x, Math.ceil(box.width + pad * 2), 760);
    const height = Math.min(vp.height - y, Math.ceil(box.height + pad * 2), 340);
    if (width < 8 || height < 8) return undefined;
    const buf = await page.screenshot({
      clip: { x, y, width, height },
      type: "jpeg",
      quality: 55,
      timeout: 4_000,
      animations: "disabled",
    });
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  } finally {
    if (marked) {
      await el
        .evaluate((n) => {
          const h = n as HTMLElement;
          h.style.outline = h.dataset["cnslOutline"] ?? "";
          h.style.outlineOffset = "";
        })
        .catch(() => undefined);
    }
  }
}

async function withLimit(p: Promise<PageAudit>, ms: number): Promise<PageAudit> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<PageAudit>((resolve) => {
        timer = setTimeout(
          () => resolve({ violations: [], incomplete: [], hrefs: [], error: "page timed out" }),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}
