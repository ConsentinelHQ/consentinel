import { adminGraphql } from "./shopify";

/**
 * Store-side checks the storefront scan can't see. Uses read_privacy_settings
 * (Shopify's own banner and opt-out page) and read_themes (where each ad tag is
 * hardcoded in the live theme). Read-only. Nothing is stored; it runs on demand.
 *
 * Pure parsing lives in findThemeTags so it runs under node --test.
 */

/** Vendor names match the scanner's signature library, so findings line up. */
export const THEME_TAG_PATTERNS: { vendor: string; patterns: RegExp[] }[] = [
  { vendor: "Meta Pixel", patterns: [/connect\.facebook\.net/i, /\bfbq\s*\(/] },
  { vendor: "TikTok Pixel", patterns: [/analytics\.tiktok\.com/i, /\bttq\.(load|page|track)\b/] },
  { vendor: "Google Ads", patterns: [/['"]AW-\d{6,}['"]/, /googleadservices\.com/i] },
  { vendor: "Google DoubleClick", patterns: [/doubleclick\.net/i] },
  {
    vendor: "Google Tag Manager",
    patterns: [/googletagmanager\.com\/gtm\.js/i, /['"]GTM-[A-Z0-9]{4,}['"]/],
  },
  { vendor: "Google gtag.js", patterns: [/googletagmanager\.com\/gtag\/js/i] },
  { vendor: "Pinterest Tag", patterns: [/s\.pinimg\.com\/ct/i, /\bpintrk\s*\(/] },
  { vendor: "Snap Pixel", patterns: [/sc-static\.net\/scevent/i, /\bsnaptr\s*\(/] },
  { vendor: "Amazon Advertising", patterns: [/amazon-adsystem\.com/i] },
  { vendor: "Microsoft Advertising UET", patterns: [/bat\.bing\.com/i, /\buetq\b/] },
  { vendor: "Criteo", patterns: [/static\.criteo\.net/i, /criteo_q/] },
  { vendor: "Reddit Pixel", patterns: [/redditstatic\.com\/ads/i, /\brdt\s*\(\s*['"]init/] },
  { vendor: "X (Twitter) Pixel", patterns: [/static\.ads-twitter\.com/i, /\btwq\s*\(/] },
  { vendor: "LinkedIn Insight", patterns: [/snap\.licdn\.com/i, /_linkedin_partner_id/] },
  { vendor: "Taboola", patterns: [/cdn\.taboola\.com/i] },
  { vendor: "Outbrain", patterns: [/amplify\.outbrain\.com/i] },
  { vendor: "AdRoll", patterns: [/s\.adroll\.com/i, /adroll_adv_id/] },
  { vendor: "The Trade Desk", patterns: [/js\.adsrvr\.org/i] },
  { vendor: "Klaviyo", patterns: [/static\.klaviyo\.com/i] },
  { vendor: "Attentive", patterns: [/cdn\.attn\.tv/i] },
  { vendor: "Hotjar", patterns: [/static\.hotjar\.com/i] },
  { vendor: "Microsoft Clarity", patterns: [/clarity\.ms\/tag/i] },
];

/** Signs the tag is wrapped in Shopify's consent API or a CMP check. */
const CONSENT_HINT =
  /customerPrivacy|analyticsProcessingAllowed|marketingAllowed|saleOfDataAllowed|visitorConsentCollected|OnetrustActiveGroups|Cookiebot\.consent|cookieyes|consent/i;

/** Lines above a hit that count as "the same block" for the consent check. */
const CONSENT_WINDOW = 15;

export interface ThemeTag {
  vendor: string;
  filename: string;
  line: number;
  /** A consent check sits near the tag. A hint, not proof. */
  consentAware: boolean;
}

/** Finds hardcoded vendor tags in one theme file. One hit per vendor per file. */
export function findThemeTags(filename: string, content: string): ThemeTag[] {
  const lines = content.split("\n");
  const hits: ThemeTag[] = [];
  for (const { vendor, patterns } of THEME_TAG_PATTERNS) {
    const index = lines.findIndex((l) => patterns.some((p) => p.test(l)));
    if (index === -1) continue;
    const window = lines.slice(Math.max(0, index - CONSENT_WINDOW), index + 1).join("\n");
    hits.push({ vendor, filename, line: index + 1, consentAware: CONSENT_HINT.test(window) });
  }
  return hits;
}

/** Only files that render into the page. Assets and JSON templates don't hold inline tags. */
const THEME_FILES = [
  "layout/*.liquid",
  "sections/*.liquid",
  "snippets/*.liquid",
  "blocks/*.liquid",
];
const MAX_PAGES = 6;

interface FilesPage {
  theme: {
    files: {
      nodes: {
        filename: string;
        body: { content?: string; url?: string } | null;
      }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    } | null;
  } | null;
}

export interface ThemeAudit {
  themeId: string;
  themeName: string;
  filesChecked: number;
  tags: ThemeTag[];
}

export async function auditTheme(shop: string, accessToken: string): Promise<ThemeAudit | null> {
  const main = await adminGraphql<{ themes: { nodes: { id: string; name: string }[] } }>(
    shop,
    accessToken,
    `{ themes(first: 1, roles: [MAIN]) { nodes { id name } } }`,
  );
  const theme = main.themes.nodes[0];
  if (!theme) return null;

  const tags: ThemeTag[] = [];
  let filesChecked = 0;
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: FilesPage = await adminGraphql<FilesPage>(
      shop,
      accessToken,
      `query Files($id: ID!, $after: String, $names: [String!]) {
        theme(id: $id) {
          files(first: 100, after: $after, filenames: $names) {
            nodes {
              filename
              body {
                ... on OnlineStoreThemeFileBodyText { content }
                ... on OnlineStoreThemeFileBodyUrl { url }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { id: theme.id, after, names: THEME_FILES },
    );
    const files = data.theme?.files;
    if (!files) break;
    for (const file of files.nodes) {
      const content = file.body?.content ?? (file.body?.url ? await fetchBody(file.body.url) : "");
      if (!content) continue;
      filesChecked++;
      tags.push(...findThemeTags(file.filename, content));
    }
    if (!files.pageInfo.hasNextPage || !files.pageInfo.endCursor) break;
    after = files.pageInfo.endCursor;
  }

  // layout/theme.liquid first: it loads on every page.
  tags.sort((a, b) => rank(a.filename) - rank(b.filename) || a.vendor.localeCompare(b.vendor));
  return { themeId: theme.id, themeName: theme.name, filesChecked, tags };
}

function rank(filename: string): number {
  return filename.startsWith("layout/") ? 0 : filename.startsWith("snippets/") ? 1 : 2;
}

/** Large files come back as a short-lived URL instead of inline text. */
async function fetchBody(url: string): Promise<string> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.ok ? await response.text() : "";
  } catch {
    return "";
  }
}

export interface PrivacySetup {
  bannerEnabled: boolean;
  bannerAutoManaged: boolean;
  optOutPageAutoManaged: boolean;
}

export async function fetchPrivacySetup(shop: string, accessToken: string): Promise<PrivacySetup> {
  const data = await adminGraphql<{
    privacySettings: {
      banner: { enabled: boolean; autoManaged: boolean } | null;
      dataSaleOptOutPage: { autoManaged: boolean } | null;
    };
  }>(
    shop,
    accessToken,
    `{ privacySettings { banner { enabled autoManaged } dataSaleOptOutPage { autoManaged } } }`,
  );
  return {
    bannerEnabled: data.privacySettings.banner?.enabled ?? false,
    bannerAutoManaged: data.privacySettings.banner?.autoManaged ?? false,
    optOutPageAutoManaged: data.privacySettings.dataSaleOptOutPage?.autoManaged ?? false,
  };
}

/** Theme code editor, opened on the file and line the tag lives in. */
export function themeEditorUrl(shop: string, themeGid: string, filename: string): string {
  const store = shop.replace(/\.myshopify\.com$/, "");
  const id = themeGid.split("/").pop() ?? "";
  return `https://admin.shopify.com/store/${store}/themes/${id}?key=${encodeURIComponent(filename)}`;
}

export function privacySettingsUrl(shop: string): string {
  const store = shop.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${store}/settings/customer_privacy`;
}
