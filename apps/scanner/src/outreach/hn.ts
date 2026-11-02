/**
 * HN threads worth a comment from Charlie. Read-only, no LLM: pulls recent
 * stories from HN's public search API and matches them to topics he knows.
 * Charlie writes every comment himself. Nothing here posts anywhere.
 */

export interface HnStory {
  objectID: string;
  title: string;
  points: number | null;
  num_comments: number | null;
  created_at_i: number;
}

interface Topic {
  /** Search terms sent to the API. */
  queries: string[];
  /** Matched against the title, case-insensitive. */
  match: RegExp;
  angle: string;
}

/** Ordered: the first topic whose pattern matches a title supplies its angle. */
export const TOPICS: Topic[] = [
  {
    queries: ["Global Privacy Control", "do not track", "opt out", "CCPA"],
    match: /\b(gpc|global privacy control|do not track|opt[- ]?out|ccpa|cpra)\b/i,
    angle: "You've tested how hundreds of stores handle GPC and opt-outs.",
  },
  {
    queries: ["cookie banner", "consent", "GDPR cookies", "OneTrust"],
    match: /\b(cookie|consent|gdpr|onetrust|cookiebot)\b/i,
    angle: "You audited cookies across Metagenics' sites against OneTrust.",
  },
  {
    queries: ["tag manager", "Meta pixel", "tracking pixel", "ad tracking", "analytics"],
    match: /\b(tag manager|gtm|pixel|tracking|tracker|analytics|adtech|ad tech)\b/i,
    angle: "You ran GTM tracking and analytics at Metagenics.",
  },
  {
    queries: ["Shopify"],
    match: /\bshopify\b/i,
    angle: "You've built and shipped a Shopify app.",
  },
  {
    queries: ["Playwright", "headless browser", "bot detection", "Cloudflare bot"],
    match: /\b(playwright|puppeteer|headless|bot detection|scrap(e|ing)|cloudflare)\b/i,
    angle: "You run Playwright scans at scale and deal with bot protection.",
  },
  {
    queries: ["A/B testing"],
    match: /\b(a\/b test|ab test|split test)/i,
    angle: "You ran A/B testing at Metagenics.",
  },
];

/** Stories newer than this are still early enough for a comment to be read. */
export const MAX_AGE_HOURS = 36;
const MIN_COMMENTS = 5;

export function angleFor(title: string): string | null {
  return TOPICS.find((t) => t.match.test(title))?.angle ?? null;
}

/** Dedupe, keep on-topic, live discussions, rank by activity. */
export function pickThreads(stories: HnStory[], now: Date, limit = 4) {
  const cutoff = now.getTime() / 1000 - MAX_AGE_HOURS * 3600;
  const seen = new Set<string>();
  return stories
    .filter((s) => {
      if (seen.has(s.objectID)) return false;
      seen.add(s.objectID);
      return s.created_at_i >= cutoff && (s.num_comments ?? 0) >= MIN_COMMENTS;
    })
    .map((s) => ({ story: s, angle: angleFor(s.title) }))
    .filter((x): x is { story: HnStory; angle: string } => x.angle !== null)
    .sort(
      (a, b) =>
        (b.story.num_comments ?? 0) +
        (b.story.points ?? 0) -
        ((a.story.num_comments ?? 0) + (a.story.points ?? 0)),
    )
    .slice(0, limit);
}

export function renderHn(picks: ReturnType<typeof pickThreads>): string {
  const head = "*HN threads to comment on* (your own words, no Consentinel)";
  if (picks.length === 0) return `${head}\nNothing on-topic in the last ${String(MAX_AGE_HOURS)}h.`;
  return [
    head,
    ...picks.map(
      ({ story, angle }, i) =>
        `${String(i + 1)}. ${story.title} (${String(story.num_comments ?? 0)} comments) https://news.ycombinator.com/item?id=${story.objectID}\n   ${angle}`,
    ),
  ].join("\n");
}

export async function fetchHn(now: Date): Promise<HnStory[]> {
  const since = Math.floor(now.getTime() / 1000) - MAX_AGE_HOURS * 3600;
  const queries = TOPICS.flatMap((t) => t.queries);
  const results = await Promise.all(
    queries.map(async (q) => {
      const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=30&numericFilters=created_at_i>${String(since)}&query=${encodeURIComponent(q)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HN search ${String(res.status)}`);
      const body = (await res.json()) as { hits: HnStory[] };
      return body.hits;
    }),
  );
  return results.flat();
}

/** The brief section. Never throws: a failed lookup is one line, not a failed brief. */
export async function hnSection(now: Date): Promise<string> {
  try {
    return renderHn(pickThreads(await fetchHn(now), now));
  } catch (e) {
    return `*HN threads:* lookup failed (${e instanceof Error ? e.message : String(e)})`;
  }
}
