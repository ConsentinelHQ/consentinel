import {
  canonicalVendor,
  type Finding,
  type GtmAudit,
  type GtmTagRef,
  type ScanResult,
  type VendorCategory,
} from "@consentinel/shared";
import { classify } from "./signatures.js";
import type { RawScan } from "./scanner.js";

/**
 * Google Tag Manager, read from the outside.
 *
 * Every GTM site serves its published container as public JavaScript
 * (gtm.js?id=GTM-XXXX). It holds each tag's template, code, Consent Settings and
 * triggers. Reading it lets the report name the exact tag behind a leak and the
 * setting to change, with no access to the customer's GTM account.
 */

const FETCH_TIMEOUT_MS = 8_000;
/** Big containers run 1-2 MB. Anything far past that isn't one. */
const MAX_BYTES = 6_000_000;
const MAX_CONTAINERS = 3;
const MAX_REFS_PER_FINDING = 3;

/** Parsed container: the pieces we use. */
export interface Container {
  id: string;
  version: string;
  tags: RawTag[];
  macros: Array<Record<string, unknown>>;
  predicates: Array<Record<string, unknown>>;
  rules: unknown[][];
  permissions: Record<string, Record<string, unknown>>;
}

type RawTag = Record<string, unknown> & { function?: string; tag_id?: number };

interface TemplateInfo {
  kind: string;
  /** A URL this template sends to, so classify() names the vendor. */
  url?: string;
  /** Google's own templates check Consent Mode by themselves. */
  google?: boolean;
}

const GA = "https://www.google-analytics.com/g/collect";
const ADS = "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1";
const FLOODLIGHT = "https://ad.doubleclick.net/activity";

/** Built-in templates. Custom templates (__cvt_*) are read from their permissions. */
export const TEMPLATES: Readonly<Record<string, TemplateInfo>> = {
  __html: { kind: "Custom HTML" },
  __img: { kind: "Custom Image" },
  __googtag: { kind: "Google Tag", url: GA, google: true },
  __gaawc: { kind: "GA4 Configuration", url: GA, google: true },
  __gaawe: { kind: "GA4 Event", url: GA, google: true },
  __ua: {
    kind: "Universal Analytics",
    url: "https://www.google-analytics.com/collect",
    google: true,
  },
  __awct: { kind: "Google Ads Conversion Tracking", url: ADS, google: true },
  __sp: { kind: "Google Ads Remarketing", url: ADS, google: true },
  __flc: { kind: "Floodlight Counter", url: FLOODLIGHT, google: true },
  __fls: { kind: "Floodlight Sales", url: FLOODLIGHT, google: true },
  __gclidw: { kind: "Conversion Linker", google: true },
  __baut: { kind: "Microsoft Advertising UET", url: "https://bat.bing.com/bat.js" },
  __bzi: {
    kind: "LinkedIn Insight",
    url: "https://snap.licdn.com/li.lms-analytics/insight.min.js",
  },
  __pntr: { kind: "Pinterest Tag", url: "https://s.pinimg.com/ct/core.js" },
  __hjtc: { kind: "Hotjar Tracking Code", url: "https://static.hotjar.com/c/hotjar-1.js" },
  __twitter_website_tag: { kind: "X Website Tag", url: "https://static.ads-twitter.com/uwt.js" },
};

/** Pixel globals in Custom HTML, for snippets that build their script URL in code. */
const GLOBALS: ReadonlyArray<[RegExp, string]> = [
  [/\bfbq\s*\(/, "https://connect.facebook.net/en_US/fbevents.js"],
  [/\bttq\.(?:load|page|track)\b/, "https://analytics.tiktok.com/i18n/pixel/events.js"],
  [/\bsnaptr\s*\(/, "https://sc-static.net/scevent.min.js"],
  [/\bpintrk\s*\(/, "https://s.pinimg.com/ct/core.js"],
  [/\btwq\s*\(/, "https://static.ads-twitter.com/uwt.js"],
  [/\brdt\s*\(/, "https://www.redditstatic.com/ads/pixel.js"],
  [/\buetq\b/, "https://bat.bing.com/bat.js"],
  [/_linkedin_partner_id/, "https://snap.licdn.com/li.lms-analytics/insight.min.js"],
  [/\bhj\s*\(|hotjar/i, "https://static.hotjar.com/c/hotjar-1.js"],
  [/clarity\.ms|\bclarity\s*\(/, "https://www.clarity.ms/tag/x"],
];

/** Triggers and listeners, not tags that load anything. */
const LISTENERS = new Set([
  "__cl",
  "__lcl",
  "__tl",
  "__fsl",
  "__sdl",
  "__evl",
  "__ytl",
  "__hl",
  "__jel",
  "__tg",
]);

const EVENT_LABELS: Readonly<Record<string, string>> = {
  "gtm.js": "All Pages",
  "gtm.init": "Initialization",
  "gtm.init_consent": "Consent Initialization",
  "gtm.dom": "DOM Ready",
  "gtm.load": "Window Loaded",
  "gtm.click": "Click",
  "gtm.linkClick": "Link Click",
  "gtm.formSubmit": "Form Submission",
  "gtm.historyChange": "History Change",
  "gtm.historyChange-v2": "History Change",
  "gtm.scrollDepth": "Scroll Depth",
  "gtm.timer": "Timer",
  "gtm.video": "YouTube Video",
  "gtm.elementVisibility": "Element Visibility",
};

/** Event names and variables that mean "wait for the consent choice". */
const CONSENT_RE =
  /consent|onetrust|optanon|cookiebot|cookieyes|osano|didomi|trustarc|truste|usercentrics|termly|iubenda|\bcmp\b|gdpr|ccpa|opt.?out|\bgpc\b/i;
/** OneTrust performance, functional and targeting groups. */
const ONETRUST_GROUP = /\bC000[2-5]\b/;

const MARKETING: ReadonlySet<VendorCategory> = new Set([
  "advertising",
  "analytics",
  "session-recording",
  "social",
]);

// ---------------------------------------------------------------------------
// Fetch and parse
// ---------------------------------------------------------------------------

/** gtm.js URLs the page actually loaded, one per container, as captured (keeps proxies and environments). */
export function containerUrls(raw: RawScan): string[] {
  const byId = new Map<string, string>();
  const passes = [raw.deniedPass, raw.grantedPass, raw.gpcPass].filter((p) => p !== undefined);
  for (const pass of passes) {
    for (const r of pass.requests) {
      if (!r.url.includes("gtm.js")) continue;
      const id = /[?&]id=(GTM-[A-Z0-9]+)/i.exec(r.url)?.[1]?.toUpperCase();
      if (id && !byId.has(id)) byId.set(id, r.url);
    }
  }
  return [...byId.values()].slice(0, MAX_CONTAINERS);
}

/** Never throws: a missing container means a report without GTM detail, not a failed scan. */
export async function fetchContainer(url: string): Promise<Container | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > MAX_BYTES) return null;
    const id = /[?&]id=(GTM-[A-Z0-9]+)/i.exec(url)?.[1]?.toUpperCase() ?? "GTM";
    return parseContainer(text, id);
  } catch {
    return null;
  }
}

/** Pull the `var data = {...}` object out of a container file. */
export function parseContainer(js: string, id: string): Container | null {
  const at = js.indexOf("var data = ");
  if (at < 0) return null;
  const start = js.indexOf("{", at);
  const end = matchBrace(js, start);
  if (start < 0 || end < 0) return null;
  let data: unknown;
  try {
    data = JSON.parse(js.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!isRecord(data) || !isRecord(data.resource)) return null;
  const r = data.resource;
  return {
    id,
    version: typeof r.version === "string" ? r.version : "",
    tags: arrayOf(r.tags).filter(isRecord),
    macros: arrayOf(r.macros).filter(isRecord),
    predicates: arrayOf(r.predicates).filter(isRecord),
    rules: arrayOf(r.rules).filter(Array.isArray) as unknown[][],
    permissions: isRecord(data.permissions)
      ? (data.permissions as Record<string, Record<string, unknown>>)
      : {},
  };
}

/** Index of the brace closing the one at `start`, skipping strings. */
function matchBrace(s: string, start: number): number {
  if (start < 0) return -1;
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Read the tags
// ---------------------------------------------------------------------------

export interface TagInfo {
  tagId: number;
  kind: string;
  /** Canonical vendor -> its category. */
  vendors: Map<string, VendorCategory>;
  consent: GtmTagRef["consent"];
  builtInConsent: boolean;
  firesOn: string[];
  consentTrigger: boolean;
}

export function readTags(c: Container): TagInfo[] {
  const triggers = triggersByTag(c);
  const out: TagInfo[] = [];
  c.tags.forEach((t, index) => {
    const fn = typeof t.function === "string" ? t.function : "";
    if (!fn || fn === "__paused" || LISTENERS.has(fn) || typeof t.tag_id !== "number") return;
    const template = TEMPLATES[fn];
    const vendors = new Map<string, VendorCategory>();
    for (const url of tagUrls(t, fn, template, c.permissions)) {
      const sig = classify(url);
      if (!sig?.consentRequired || !MARKETING.has(sig.category)) continue;
      vendors.set(canonicalVendor(sig.vendor), sig.category);
    }
    if (vendors.size === 0) return;
    const trig = triggers.get(index) ?? { firesOn: [], consentTrigger: false };
    out.push({
      tagId: t.tag_id,
      kind: template?.kind ?? (fn.startsWith("__cvt_") ? "Custom Template" : fn.replace(/^__/, "")),
      vendors,
      consent: consentSetting(t.consent),
      builtInConsent: template?.google === true,
      firesOn: trig.firesOn,
      consentTrigger: trig.consentTrigger,
    });
  });
  return out;
}

function tagUrls(
  t: RawTag,
  fn: string,
  template: TemplateInfo | undefined,
  permissions: Container["permissions"],
): string[] {
  const urls: string[] = [];
  if (template?.url) urls.push(template.url);
  // Templates declare the scripts they inject and pixels they send.
  const perm = permissions[fn];
  if (perm) {
    for (const key of ["inject_script", "send_pixel", "inject_hidden_iframe"]) {
      const p = perm[key];
      if (isRecord(p)) for (const u of arrayOf(p.urls)) if (typeof u === "string") urls.push(u);
    }
  }
  const html = typeof t.vtp_html === "string" ? t.vtp_html : "";
  const src = typeof t.vtp_url === "string" ? t.vtp_url : "";
  const code = `${html}\n${src}`;
  for (const m of code.matchAll(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>\\)]*/gi)) {
    urls.push(m[0].startsWith("//") ? `https:${m[0]}` : m[0]);
  }
  for (const [re, url] of GLOBALS) if (re.test(html)) urls.push(url);
  // Template permissions use wildcards: "https://*.tiktok.com/*".
  return urls.map((u) => u.replace(/\*\./g, "x.").replace(/\*/g, "x"));
}

/** ["list", "ad_storage"] requires ad_storage. ["list"] is "no additional consent". Absent is never set. */
function consentSetting(v: unknown): GtmTagRef["consent"] {
  if (!Array.isArray(v) || v[0] !== "list") return "not-set";
  const types = v.slice(1).filter((x): x is string => typeof x === "string");
  return types.length > 0 ? types : "none";
}

/** Which triggers fire each tag (by array index), and whether any wait on consent. */
function triggersByTag(c: Container): Map<number, { firesOn: string[]; consentTrigger: boolean }> {
  const out = new Map<number, { firesOn: string[]; consentTrigger: boolean }>();
  const get = (i: number) => {
    let e = out.get(i);
    if (!e) out.set(i, (e = { firesOn: [], consentTrigger: false }));
    return e;
  };
  for (const rule of c.rules) {
    const ifs: number[] = [];
    const unless: number[] = [];
    const adds: number[] = [];
    const blocks: number[] = [];
    for (const clause of rule) {
      if (!Array.isArray(clause)) continue;
      const [op, ...idx] = clause as [unknown, ...unknown[]];
      const nums = idx.filter((x): x is number => typeof x === "number");
      if (op === "if") ifs.push(...nums);
      else if (op === "unless") unless.push(...nums);
      else if (op === "add") adds.push(...nums);
      else if (op === "block") blocks.push(...nums);
    }
    const events: string[] = [];
    let consentish = false;
    for (const p of [...ifs, ...unless]) {
      const pred = c.predicates[p];
      if (!pred) continue;
      const macro = macroOf(c, pred.arg0);
      const value = typeof pred.arg1 === "string" ? pred.arg1 : "";
      if (ifs.includes(p) && macro?.function === "__e" && pred.function === "_eq") {
        events.push(EVENT_LABELS[value] ?? value);
      }
      const name = typeof macro?.vtp_name === "string" ? macro.vtp_name : "";
      if (CONSENT_RE.test(name) || CONSENT_RE.test(value) || ONETRUST_GROUP.test(value)) {
        consentish = true;
      }
    }
    for (const i of adds) {
      const e = get(i);
      for (const ev of events.length > 0 ? events : ["Custom trigger"]) {
        if (!e.firesOn.includes(ev)) e.firesOn.push(ev);
      }
      if (consentish) e.consentTrigger = true;
    }
    // A blocking trigger on the opt-out is a consent gate too.
    for (const i of blocks) if (consentish) get(i).consentTrigger = true;
  }
  return out;
}

function macroOf(c: Container, arg: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(arg) || arg[0] !== "macro" || typeof arg[1] !== "number") return undefined;
  return c.macros[arg[1]];
}

// ---------------------------------------------------------------------------
// Attach to the scan
// ---------------------------------------------------------------------------

/** Plain fix for one tag that loaded `vendor` when it shouldn't have. */
export function fixFor(containerId: string, tag: TagInfo, vendor: string): string {
  const category = tag.vendors.get(vendor) ?? "advertising";
  const type =
    category === "advertising" || category === "social" ? "ad_storage" : "analytics_storage";
  const name =
    tag.kind === "Custom HTML" || tag.kind === "Custom Image" || tag.kind === "Custom Template"
      ? `The ${tag.kind} tag that loads ${vendor} (tag ID ${String(tag.tagId)} in ${containerId})`
      : `The ${tag.kind} tag (tag ID ${String(tag.tagId)} in ${containerId})`;
  const optOut =
    "your consent banner updates Google Consent Mode when a visitor opts out, including through Global Privacy Control";
  if (tag.builtInConsent) {
    return `${name} uses Google's built-in consent checks, so it fired because ${type} wasn't denied. Set Consent Mode to default to denied and make sure ${optOut}.`;
  }
  if (Array.isArray(tag.consent)) {
    const types = tag.consent.join(" and ");
    return `${name} already requires ${types}, but it still fired, so ${types} was never set to denied for this visitor. Make sure ${optOut}.`;
  }
  if (tag.consentTrigger) {
    return `${name} waits on a consent trigger (${tag.firesOn.join(", ")}), but it still fired. Change that trigger so it only fires when ${type === "ad_storage" ? "advertising" : "analytics"} consent is granted, then publish the container.`;
  }
  return `${name} has no consent check. In GTM, open the tag, go to Advanced Settings > Consent Settings, choose "Require additional consent for tag to fire", add ${type}, and publish the container. This works once your consent banner updates Google Consent Mode.`;
}

/** Adds GTM tag references and the container summary. Returns a new result. */
export function attachGtm(result: ScanResult, containers: Container[]): ScanResult {
  if (containers.length === 0) return result;
  const read = containers.map((c) => ({ c, tags: readTags(c) }));

  const findings: Finding[] = result.findings.map((f) => {
    const vendor = canonicalVendor(f.vendor);
    if (f.causedBy || f.category === "tag-manager" || f.category === "essential") return f;
    const refs: GtmTagRef[] = [];
    for (const { c, tags } of read) {
      // Page-load tags first: those are the ones that fired on the scanned page.
      for (const t of [...tags].sort((a, b) => pageLoadRank(a) - pageLoadRank(b))) {
        if (!t.vendors.has(vendor) || refs.length >= MAX_REFS_PER_FINDING) continue;
        refs.push({
          containerId: c.id,
          tagId: t.tagId,
          kind: t.kind,
          consent: t.consent,
          builtInConsent: t.builtInConsent,
          firesOn: t.firesOn,
          consentTrigger: t.consentTrigger,
          fix: fixFor(c.id, t, vendor),
        });
      }
    }
    return refs.length > 0 ? { ...f, gtm: refs } : f;
  });

  const gtm: GtmAudit = {
    containers: read.map(({ c, tags }) => ({
      id: c.id,
      version: c.version,
      tags: c.tags.filter((t) => t.function !== "__paused" && !LISTENERS.has(String(t.function)))
        .length,
      unguarded: tags
        .filter((t) => !t.builtInConsent && !Array.isArray(t.consent) && !t.consentTrigger)
        .map((t) => ({ tagId: t.tagId, kind: t.kind, vendors: [...t.vendors.keys()].sort() })),
    })),
  };
  return { ...result, findings, gtm };
}

/** Fetch every container the page loaded and attach what they say. */
export async function withGtm(result: ScanResult, raw: RawScan): Promise<ScanResult> {
  const containers = await Promise.all(containerUrls(raw).map(fetchContainer));
  return attachGtm(
    result,
    containers.filter((c): c is Container => c !== null),
  );
}

const PAGE_LOAD = new Set([
  "All Pages",
  "Initialization",
  "Consent Initialization",
  "DOM Ready",
  "Window Loaded",
]);

function pageLoadRank(t: TagInfo): number {
  return t.firesOn.some((e) => PAGE_LOAD.has(e)) ? 0 : 1;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function arrayOf(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
