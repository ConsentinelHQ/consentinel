/**
 * Contact lookup. Providers run as a waterfall: Anymail, GetProspect, Prospeo
 * and Tomba charge only on a hit, so they go first; Hunter charges per search, so it's
 * last. A provider that errors (out of credits, bad key, outage) is skipped for
 * the rest of the run. Lookups throw only when every provider errored, so the
 * caller retries the domain on a later run instead of marking it done.
 * Returns a Contact, or a string explaining why there's none.
 */

export type Source = "anymail" | "getprospect" | "prospeo" | "tomba" | "hunter";

export interface Contact {
  firstName: string;
  fullName: string;
  email: string;
  title: string;
  /** "valid" is proven. "accept_all" means the server takes anything: never auto-send. */
  verified: "valid" | "accept_all";
  source: Source | "sheet";
}

/**
 * Earlier tiers win; within a tier, higher confidence wins. People who own the
 * site as a product come first: the broken opt-out is their bug.
 */
export const TITLE_TIERS = [
  /e-?commerce|digital product|product|engineering|technology|\bcto\b|web/i,
  /privacy|legal|counsel|compliance/i,
  /digital|growth/i,
  /founder|\bceo\b|president|owner/i,
  /marketing|\bcmo\b/i,
];

/** Index into TITLE_TIERS, or -1 when we wouldn't email this title. */
function tierOf(title: string): number {
  return TITLE_TIERS.findIndex((re) => re.test(title));
}

/** True when a job title is one we'd email. Same tiers as the automatic lookup. */
export function wantedTitle(title: string): boolean {
  return tierOf(title) >= 0;
}

/**
 * Three people per company, one per role: who fixes it, who carries the legal
 * risk, and who owns the tags. A broken opt-out is a different problem to each.
 */
export type Role = "owner" | "risk" | "budget";

export const ROLE_TITLES: Readonly<Record<Role, RegExp>> = {
  owner:
    /e-?commerce|digital (product|experience)|product|engineering|technology|\bcto\b|\bweb\b|developer/i,
  risk: /privacy|legal|counsel|compliance|founder|\bceo\b|president|owner/i,
  budget: /marketing|\bcmo\b|growth|brand|performance|acquisition|retention|lifecycle/i,
};

/** First role a title fits, in priority order. Null when it fits none. */
export function roleFor(title: string): Role | null {
  for (const role of ["owner", "risk", "budget"] as const) {
    if (ROLE_TITLES[role].test(title)) return role;
  }
  return null;
}

export interface RoleContact extends Contact {
  role: Role;
}

/** A provider's answer for one lookup: hits, or why there are none. */
interface Provider {
  name: Source;
  /** Env vars this provider needs. All must be set for it to run. */
  env: readonly string[];
  find(domain: string, keys: string[], exclude: string[]): Promise<Contact | string>;
  person(
    domain: string,
    fullName: string,
    keys: string[],
    exclude: string[],
  ): Promise<{ email: string } | string>;
  roles(domain: string, keys: string[], roles: Role[], exclude: string[]): Promise<RoleContact[]>;
}

/** Throws for responses that mean "can't answer now", not "no one found". */
async function json<T>(name: string, res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${name} returned ${String(res.status)}`);
  return (await res.json()) as T;
}

const lower = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

// ---------- Anymail ----------

/** Anymail decision-maker categories, tried in order. Same priority as TITLE_TIERS. */
const ANYMAIL_ROLES = ["engineering", "it", "ceo", "marketing"];
/** Anymail decision-maker categories per role, best first. */
const ANYMAIL_ROLE: Readonly<Record<Role, string[]>> = {
  owner: ["engineering", "it"],
  risk: ["ceo"],
  budget: ["marketing"],
};
const ANYMAIL = "https://api.anymailfinder.com/v5.1/find-email/decision-maker";
const ANYMAIL_PERSON = "https://api.anymailfinder.com/v5.1/find-email/person";

interface AnymailResponse {
  email_status?: string;
  valid_email?: string | null;
  email?: string | null;
  person_full_name?: string | null;
  person_first_name?: string | null;
  person_job_title?: string | null;
}

async function anymailPost(key: string, url: string, body: object): Promise<AnymailResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return json<AnymailResponse>("Anymail", res);
}

function anymailContact(body: AnymailResponse, exclude: string[]): Contact | string {
  const email = lower(body.valid_email);
  if (body.email_status !== "valid" || !email)
    return `anymail: ${body.email_status ?? "no result"}`;
  if (exclude.includes(email)) return "anymail: only found an address that already bounced";
  const fullName = body.person_full_name ?? "";
  return {
    firstName: body.person_first_name ?? fullName.split(" ")[0] ?? "",
    fullName,
    email,
    title: body.person_job_title ?? "",
    verified: "valid",
    source: "anymail",
  };
}

const anymail: Provider = {
  name: "anymail",
  env: ["ANYMAIL_API_KEY"],
  async find(domain, [key = ""], exclude) {
    const body = await anymailPost(key, ANYMAIL, {
      domain,
      decision_maker_category: ANYMAIL_ROLES,
    });
    return anymailContact(body, exclude);
  },
  async person(domain, fullName, [key = ""], exclude) {
    const body = await anymailPost(key, ANYMAIL_PERSON, { domain, full_name: fullName });
    const email = lower(body.valid_email ?? (body.email_status === "valid" ? body.email : null));
    if (body.email_status === "valid" && email && !exclude.includes(email)) return { email };
    return `anymail: ${body.email_status ?? "no result"}`;
  },
  async roles(domain, [key = ""], roles, exclude) {
    const out: RoleContact[] = [];
    for (const role of roles) {
      const body = await anymailPost(key, ANYMAIL, {
        domain,
        decision_maker_category: ANYMAIL_ROLE[role],
      });
      const hit = anymailContact(body, [...exclude, ...out.map((o) => o.email)]);
      if (typeof hit !== "string") out.push({ ...hit, role });
    }
    return out;
  },
};

// ---------- Prospeo ----------

const PROSPEO = "https://api.prospeo.io";
/** Title keywords for the people search. Ranking happens locally with TITLE_TIERS. */
const PROSPEO_TITLES = [
  "ecommerce",
  "e-commerce",
  "digital",
  "product",
  "engineering",
  "technology",
  "CTO",
  "web",
  "privacy",
  "legal",
  "counsel",
  "compliance",
  "growth",
  "founder",
  "CEO",
  "president",
  "owner",
  "marketing",
  "CMO",
  "brand",
];
/** Error codes that mean "nobody", not "can't answer". */
const PROSPEO_EMPTY = new Set(["NO_RESULTS", "NO_MATCH"]);

interface ProspeoPerson {
  person_id?: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  current_job_title?: string | null;
  email?: { status?: string; revealed?: boolean; email?: string | null } | null;
}

interface ProspeoResponse {
  error?: boolean;
  error_code?: string;
  person?: ProspeoPerson;
  results?: { person?: ProspeoPerson }[];
}

async function prospeoPost(
  key: string,
  path: string,
  body: object,
): Promise<ProspeoResponse | null> {
  const res = await fetch(`${PROSPEO}${path}`, {
    method: "POST",
    headers: { "X-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Prospeo sends "no match" as a 400 with an error code, so read the body first.
  const parsed = (await res.json().catch(() => ({}))) as ProspeoResponse;
  if (parsed.error_code && PROSPEO_EMPTY.has(parsed.error_code)) return null;
  if (!res.ok || parsed.error) {
    throw new Error(`Prospeo returned ${parsed.error_code ?? String(res.status)}`);
  }
  return parsed;
}

/** One search per domain per run: it costs a credit, and lookups hit the same domain twice. */
const prospeoSearches = new Map<string, ProspeoPerson[]>();

async function prospeoPeople(domain: string, key: string): Promise<ProspeoPerson[]> {
  const cached = prospeoSearches.get(domain);
  if (cached) return cached;
  const body = await prospeoPost(key, "/search-person", {
    page: 1,
    filters: {
      company: { websites: { include: [domain] } },
      person_job_title: { include: PROSPEO_TITLES, match_mode: "CONTAINS" },
    },
  });
  const people = (body?.results ?? [])
    .map((r) => r.person)
    .filter((p): p is ProspeoPerson => Boolean(p?.person_id));
  prospeoSearches.set(domain, people);
  return people;
}

/** Reveals a verified address. Null when Prospeo has none. */
async function prospeoReveal(key: string, data: object): Promise<string | null> {
  const body = await prospeoPost(key, "/enrich-person", { data, only_verified_email: true });
  const e = body?.person?.email;
  const email = lower(e?.email);
  return e?.status === "VERIFIED" && email ? email : null;
}

function prospeoContact(p: ProspeoPerson, email: string): Contact {
  const firstName = p.first_name ?? p.full_name?.split(" ")[0] ?? "";
  return {
    firstName,
    fullName: p.full_name ?? [firstName, p.last_name ?? ""].join(" ").trim(),
    email,
    title: p.current_job_title ?? "",
    verified: "valid",
    source: "prospeo",
  };
}

/** Reveals tried per lookup, so one domain can't drain the month. */
const PROSPEO_TRIES = 3;

const prospeo: Provider = {
  name: "prospeo",
  env: ["PROSPEO_API_KEY"],
  async find(domain, [key = ""], exclude) {
    const people = await prospeoPeople(domain, key);
    const ranked = people
      .map((p) => ({ p, tier: tierOf(p.current_job_title ?? "") }))
      .filter((x) => x.tier >= 0)
      .sort((a, b) => a.tier - b.tier)
      .slice(0, PROSPEO_TRIES);
    if (ranked.length === 0) {
      return `prospeo: no wanted title in ${String(people.length)} results`;
    }
    for (const { p } of ranked) {
      const email = await prospeoReveal(key, { person_id: p.person_id });
      if (email && !exclude.includes(email)) return prospeoContact(p, email);
    }
    return `prospeo: no verified address for ${String(ranked.length)} candidates`;
  },
  async person(domain, fullName, [key = ""], exclude) {
    const email = await prospeoReveal(key, { full_name: fullName, company_website: domain });
    if (email && !exclude.includes(email)) return { email };
    return "prospeo: no verified address";
  },
  async roles(domain, [key = ""], roles, exclude) {
    const people = await prospeoPeople(domain, key);
    const out: RoleContact[] = [];
    let tries = 0;
    for (const role of roles) {
      for (const p of people.filter((x) => roleFor(x.current_job_title ?? "") === role)) {
        if (tries >= PROSPEO_TRIES) return out;
        tries += 1;
        const email = await prospeoReveal(key, { person_id: p.person_id });
        if (!email || exclude.includes(email) || out.some((o) => o.email === email)) continue;
        out.push({ ...prospeoContact(p, email), role });
        break;
      }
    }
    return out;
  },
};

// ---------- GetProspect ----------

const GETPROSPECT = "https://api.getprospect.com/v2";

interface GpPerson {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  primary_position?: { job_title?: string | null } | null;
}

interface GpResponse<T> {
  success?: boolean;
  data?: T;
  errors?: { name?: string }[];
}

/** Null on NOT_FOUND (a real "nobody"). Throws on credits, auth, timeouts, outages. */
async function gpPost<T>(key: string, path: string, body: object): Promise<T | null> {
  const res = await fetch(`${GETPROSPECT}${path}`, {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => ({}))) as GpResponse<T>;
  if (parsed.errors?.[0]?.name === "NOT_FOUND") return null;
  if (!res.ok || parsed.success === false || parsed.data === undefined) {
    throw new Error(`GetProspect returned ${parsed.errors?.[0]?.name ?? String(res.status)}`);
  }
  return parsed.data;
}

const gpTitle = (p: GpPerson): string => p.primary_position?.job_title ?? "";

/** Searching is free. Only people with a valid email on file come back. Cached per run. */
const gpSearches = new Map<string, GpPerson[]>();

async function gpPeople(domain: string, key: string): Promise<GpPerson[]> {
  const cached = gpSearches.get(domain);
  if (cached) return cached;
  const people =
    (await gpPost<GpPerson[]>(key, "/people/search", {
      filters: {
        company: { domain: { include: [domain] } },
        person_job_title: { include: PROSPEO_TITLES, match_mode: "CONTAINS" },
        contact_details: { email: { status: ["valid"] } },
      },
      page: 1,
      per_page: 25,
      enrich_email: false,
    })) ?? [];
  gpSearches.set(domain, people);
  return people;
}

/** One credit, only when the mailbox is confirmed. Accept-all comes back as not found. */
async function gpReveal(key: string, domain: string, fullName: string): Promise<string | null> {
  const data = await gpPost<{ email?: string | null; status?: string }>(key, "/email/find", {
    data: { full_name: fullName, domain },
  });
  const email = lower(data?.email);
  return data?.status === "valid" && email ? email : null;
}

function gpName(p: GpPerson): string {
  return (p.full_name ?? [p.first_name ?? "", p.last_name ?? ""].join(" ")).trim();
}

function gpContact(p: GpPerson, email: string): Contact {
  const fullName = gpName(p);
  return {
    firstName: p.first_name ?? fullName.split(" ")[0] ?? "",
    fullName,
    email,
    title: gpTitle(p),
    verified: "valid",
    source: "getprospect",
  };
}

const GP_TRIES = 3;

const getprospect: Provider = {
  name: "getprospect",
  env: ["GETPROSPECT_API_KEY"],
  async find(domain, [key = ""], exclude) {
    const people = await gpPeople(domain, key);
    const ranked = people
      .filter((p) => gpName(p))
      .map((p) => ({ p, tier: tierOf(gpTitle(p)) }))
      .filter((x) => x.tier >= 0)
      .sort((a, b) => a.tier - b.tier)
      .slice(0, GP_TRIES);
    if (ranked.length === 0) {
      return `getprospect: no wanted title in ${String(people.length)} results`;
    }
    for (const { p } of ranked) {
      const email = await gpReveal(key, domain, gpName(p));
      if (email && !exclude.includes(email)) return gpContact(p, email);
    }
    return `getprospect: no valid address for ${String(ranked.length)} candidates`;
  },
  async person(domain, fullName, [key = ""], exclude) {
    const email = await gpReveal(key, domain, fullName);
    if (email && !exclude.includes(email)) return { email };
    return "getprospect: no valid address";
  },
  async roles(domain, [key = ""], roles, exclude) {
    const people = await gpPeople(domain, key);
    const out: RoleContact[] = [];
    let tries = 0;
    for (const role of roles) {
      for (const p of people.filter((x) => gpName(x) && roleFor(gpTitle(x)) === role)) {
        if (tries >= GP_TRIES) return out;
        tries += 1;
        const email = await gpReveal(key, domain, gpName(p));
        if (!email || exclude.includes(email) || out.some((o) => o.email === email)) continue;
        out.push({ ...gpContact(p, email), role });
        break;
      }
    }
    return out;
  },
};

// ---------- Tomba ----------

const TOMBA = "https://api.tomba.io/v1";

interface TombaEmail {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  position?: string | null;
  score?: number | null;
  accept_all?: boolean | null;
  verification?: { status?: string | null } | null;
}

async function tombaGet<T>(
  path: string,
  params: Record<string, string>,
  keys: string[],
): Promise<T> {
  const [key = "", secret = ""] = keys;
  const res = await fetch(`${TOMBA}${path}?${new URLSearchParams(params).toString()}`, {
    headers: { "X-Tomba-Key": key, "X-Tomba-Secret": secret },
  });
  return (await json<{ data: T }>("Tomba", res)).data;
}

/** One search per domain per run; the free plan gets 25 a month. */
const tombaSearches = new Map<string, TombaEmail[]>();

async function tombaPeople(domain: string, keys: string[]): Promise<TombaEmail[]> {
  const cached = tombaSearches.get(domain);
  if (cached) return cached;
  const data = await tombaGet<{ emails?: TombaEmail[] }>(
    "/domain-search",
    { domain, limit: "10" },
    keys,
  );
  const emails = (data.emails ?? []).filter((e) => Boolean(e.email));
  tombaSearches.set(domain, emails);
  return emails;
}

/** Tomba's own check, skipped when the search already says valid. Null means don't use it. */
async function tombaVerify(e: TombaEmail, keys: string[]): Promise<Contact["verified"] | null> {
  if (e.verification?.status === "valid" && !e.accept_all) return "valid";
  const { email: v } = await tombaGet<{
    email?: { status?: string; result?: string; accept_all?: boolean };
  }>("/email-verifier", { email: e.email }, keys);
  if (v?.accept_all) return "accept_all";
  return v?.result === "deliverable" || v?.status === "valid" ? "valid" : null;
}

function tombaContact(e: TombaEmail, verified: Contact["verified"]): Contact {
  const firstName = e.first_name ?? "";
  return {
    firstName,
    fullName: e.full_name ?? [firstName, e.last_name ?? ""].join(" ").trim(),
    email: lower(e.email),
    title: e.position ?? "",
    verified,
    source: "tomba",
  };
}

const tomba: Provider = {
  name: "tomba",
  env: ["TOMBA_API_KEY", "TOMBA_API_SECRET"],
  async find(domain, keys, exclude) {
    const emails = await tombaPeople(domain, keys);
    const pick = emails
      .filter((e) => !exclude.includes(lower(e.email)))
      .map((e) => ({ e, tier: tierOf(e.position ?? "") }))
      .filter((x) => x.tier >= 0)
      .sort((a, b) => a.tier - b.tier || (b.e.score ?? 0) - (a.e.score ?? 0))[0]?.e;
    if (!pick) return `tomba: no wanted title in ${String(emails.length)} results`;
    const verified = await tombaVerify(pick, keys);
    if (!verified) return `tomba: ${pick.email} failed verification`;
    return tombaContact(pick, verified);
  },
  async person(domain, fullName, keys, exclude) {
    const [first = "", ...rest] = fullName.trim().split(/\s+/);
    const found = await tombaGet<TombaEmail | null>(
      "/email-finder",
      { domain, first_name: first, last_name: rest.join(" ") },
      keys,
    );
    const email = lower(found?.email);
    if (!found || !email || exclude.includes(email)) return "tomba: no address";
    // Research names only count when proven: accept_all isn't enough here.
    return (await tombaVerify(found, keys)) === "valid" ? { email } : `tomba: ${email} not proven`;
  },
  async roles(domain, keys, roles, exclude) {
    const emails = await tombaPeople(domain, keys);
    const out: RoleContact[] = [];
    for (const role of roles) {
      const pick = emails
        .filter((e) => !exclude.includes(lower(e.email)))
        .filter((e) => !out.some((o) => o.email === lower(e.email)))
        .filter((e) => roleFor(e.position ?? "") === role)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      if (!pick) continue;
      const verified = await tombaVerify(pick, keys);
      if (verified) out.push({ ...tombaContact(pick, verified), role });
    }
    return out;
  },
};

// ---------- Hunter ----------

const HUNTER = "https://api.hunter.io/v2";

interface HunterEmail {
  value: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  confidence: number;
  verification?: { status?: string | null } | null;
}

interface HunterResponse<T> {
  data?: T;
  errors?: { details: string }[];
}

async function hunterGet<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  const qs = new URLSearchParams({ ...params, api_key: key });
  const res = await fetch(`${HUNTER}/${path}?${qs.toString()}`);
  const body = (await res.json()) as HunterResponse<T>;
  if (!res.ok || !body.data) {
    throw new Error(body.errors?.[0]?.details ?? `Hunter returned ${String(res.status)}`);
  }
  return body.data;
}

async function hunterSearch(domain: string, key: string): Promise<HunterEmail[]> {
  const { emails = [] } = await hunterGet<{ emails?: HunterEmail[] }>(
    "domain-search",
    { domain, limit: "10", type: "personal" },
    key,
  );
  return emails;
}

/** Hunter's own recent check saves a verification credit when it says valid. */
async function hunterVerify(e: HunterEmail, key: string): Promise<string> {
  const known = e.verification?.status;
  if (known === "valid") return known;
  return (
    (await hunterGet<{ status?: string }>("email-verifier", { email: e.value }, key)).status ??
    "unknown"
  );
}

function hunterContact(e: HunterEmail, verified: Contact["verified"]): Contact {
  const firstName = e.first_name ?? "";
  return {
    firstName,
    fullName: [firstName, e.last_name ?? ""].join(" ").trim(),
    email: e.value.toLowerCase(),
    title: e.position ?? "",
    verified,
    source: "hunter",
  };
}

const hunterProvider: Provider = {
  name: "hunter",
  env: ["HUNTER_API_KEY"],
  async find(domain, [key = ""], exclude) {
    const emails = await hunterSearch(domain, key);
    const pick = emails
      .filter((e) => !exclude.includes(e.value.toLowerCase()))
      .map((e) => ({ e, tier: tierOf(e.position ?? "") }))
      .filter((x) => x.tier >= 0)
      .sort((a, b) => a.tier - b.tier || b.e.confidence - a.e.confidence)[0]?.e;
    if (!pick)
      return `hunter: no marketing or ecommerce contact in ${String(emails.length)} results`;
    const status = await hunterVerify(pick, key);
    if (status !== "valid" && status !== "accept_all") {
      return `hunter: ${pick.value} failed verification (${status})`;
    }
    return hunterContact(pick, status);
  },
  async person(domain, fullName, [key = ""], exclude) {
    const [first = "", ...rest] = fullName.trim().split(/\s+/);
    const found = await hunterGet<{ email?: string | null }>(
      "email-finder",
      { domain, first_name: first, last_name: rest.join(" ") },
      key,
    );
    const email = lower(found.email);
    if (!email || exclude.includes(email)) return "hunter: no address";
    const { status = "unknown" } = await hunterGet<{ status?: string }>(
      "email-verifier",
      { email },
      key,
    );
    return status === "valid" ? { email } : `hunter: ${email} ${status}`;
  },
  async roles(domain, [key = ""], roles, exclude) {
    const emails = await hunterSearch(domain, key);
    const out: RoleContact[] = [];
    for (const role of roles) {
      const pick = emails
        .filter((e) => !exclude.includes(e.value.toLowerCase()))
        .filter((e) => !out.some((o) => o.email === e.value.toLowerCase()))
        .filter((e) => roleFor(e.position ?? "") === role)
        .sort((a, b) => b.confidence - a.confidence)[0];
      if (!pick) continue;
      const status = await hunterVerify(pick, key);
      if (status !== "valid" && status !== "accept_all") continue;
      out.push({ ...hunterContact(pick, status), role });
    }
    return out;
  },
};

/** Kept for callers that want Hunter alone. */
export async function hunter(
  domain: string,
  key: string,
  exclude: string[] = [],
): Promise<Contact | string> {
  return hunterProvider.find(domain, [key], exclude);
}

// ---------- Waterfall ----------

/** Charge-on-hit providers first, per-search Hunter last. */
const PROVIDERS: readonly Provider[] = [anymail, getprospect, prospeo, tomba, hunterProvider];

/** Providers that errored this run (no credits, bad key, outage). Not retried until the next run. */
const spent = new Map<Source, string>();

/** Clears per-run state. Tests only. */
export function resetLookupState(): void {
  spent.clear();
  prospeoSearches.clear();
  tombaSearches.clear();
  gpSearches.clear();
}

function configured(skip: Source[] = []): { p: Provider; keys: string[] }[] {
  const all = PROVIDERS.map((p) => ({ p, keys: p.env.map((v) => process.env[v] ?? "") })).filter(
    ({ keys }) => keys.every(Boolean),
  );
  if (all.length === 0) {
    throw new Error(`set at least one of ${PROVIDERS.map((p) => p.env.join("+")).join(", ")}`);
  }
  return all.filter(({ p }) => !skip.includes(p.name));
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Runs `call` down the providers until one returns a hit. Throws only when no
 * provider gave a real answer, so the domain retries on a later run.
 */
async function waterfall<T>(
  call: (p: Provider, keys: string[]) => Promise<T | string>,
): Promise<T | string> {
  const reasons: string[] = [];
  const errors: string[] = [];
  for (const { p, keys } of configured()) {
    const already = spent.get(p.name);
    if (already) {
      errors.push(`${p.name}: ${already}`);
      continue;
    }
    try {
      const hit = await call(p, keys);
      if (typeof hit !== "string") return hit;
      reasons.push(hit);
    } catch (error) {
      spent.set(p.name, message(error));
      errors.push(`${p.name}: ${message(error)}`);
    }
  }
  if (reasons.length === 0) throw new Error(errors.join("; "));
  return [...reasons, ...errors].join("; ");
}

/** `exclude`: addresses that already bounced, never returned again. */
export async function findContact(
  domain: string,
  exclude: string[] = [],
): Promise<Contact | string> {
  return waterfall((p, keys) => p.find(domain, keys, exclude));
}

/**
 * A named person's address at a domain, for names found by research. Only a
 * proven-valid address counts: a guess from a pattern never reaches the sheet.
 */
export async function findPerson(
  domain: string,
  fullName: string,
  exclude: string[] = [],
): Promise<{ email: string; source: Source } | string> {
  return waterfall(async (p, keys) => {
    const hit = await p.person(domain, fullName, keys, exclude);
    return typeof hit === "string" ? hit : { email: hit.email, source: p.name };
  });
}

/**
 * Up to three people at a company, at most one per role, owner first. Each
 * provider fills only the roles the ones before it missed. Throws only when
 * every provider errored, so the domain retries later.
 */
export async function findContacts(
  domain: string,
  exclude: string[] = [],
  /** skip: roles already covered. hunter false keeps Hunter's monthly searches for contact 1. */
  opts: { skip?: Role[]; hunter?: boolean } = {},
): Promise<RoleContact[] | string> {
  const roles = (["owner", "risk", "budget"] as const).filter((r) => !opts.skip?.includes(r));
  const found: RoleContact[] = [];
  const errors: string[] = [];
  let answered = false;
  const providers = configured(opts.hunter === false ? ["hunter"] : []);
  for (const { p, keys } of providers) {
    const missing = roles.filter((r) => !found.some((f) => f.role === r));
    if (missing.length === 0) break;
    const already = spent.get(p.name);
    if (already) {
      errors.push(`${p.name}: ${already}`);
      continue;
    }
    try {
      const taken = [...exclude, ...found.map((f) => f.email)];
      found.push(...(await p.roles(domain, keys, missing, taken)));
      answered = true;
    } catch (error) {
      spent.set(p.name, message(error));
      errors.push(`${p.name}: ${message(error)}`);
    }
  }
  if (found.length === 0) {
    if (!answered && providers.length > 0) throw new Error(errors.join("; "));
    return "no contact found for any role";
  }
  const order: Record<Role, number> = { owner: 0, risk: 1, budget: 2 };
  return found.sort((a, b) => order[a.role] - order[b.role]);
}
