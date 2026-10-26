/**
 * Contact lookup. Anymail Finder goes first because it only charges when it
 * returns a valid address; Hunter charges per search, so it's the fallback.
 * Returns a Contact, or a string explaining why there's none.
 */

export interface Contact {
  firstName: string;
  fullName: string;
  email: string;
  title: string;
  /** "valid" is proven. "accept_all" means the server takes anything: never auto-send. */
  verified: "valid" | "accept_all";
  source: "anymail" | "hunter" | "sheet";
}

/**
 * Earlier tiers win; within a tier, higher Hunter confidence wins. People who
 * own the site as a product come first: the broken opt-out is their bug.
 */
export const TITLE_TIERS = [
  /e-?commerce|digital product|product|engineering|technology|\bcto\b|web/i,
  /privacy|legal|counsel|compliance/i,
  /digital|growth/i,
  /founder|\bceo\b|president|owner/i,
  /marketing|\bcmo\b/i,
];

/** Anymail decision-maker categories, tried in order. Same priority as above. */
const ANYMAIL_ROLES = ["engineering", "it", "ceo", "marketing"];

const ANYMAIL = "https://api.anymailfinder.com/v5.1/find-email/decision-maker";
const ANYMAIL_PERSON = "https://api.anymailfinder.com/v5.1/find-email/person";
const HUNTER = "https://api.hunter.io/v2";

interface AnymailResponse {
  email_status?: string;
  valid_email?: string | null;
  person_full_name?: string | null;
  person_first_name?: string | null;
  person_job_title?: string | null;
}

async function anymail(domain: string, key: string, exclude: string[]): Promise<Contact | string> {
  const res = await fetch(ANYMAIL, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify({ domain, decision_maker_category: ANYMAIL_ROLES }),
  });
  if (!res.ok) throw new Error(`Anymail returned ${String(res.status)}`);
  const body = (await res.json()) as AnymailResponse;
  if (body.email_status !== "valid" || !body.valid_email) {
    return `anymail: ${body.email_status ?? "no result"}`;
  }
  if (exclude.includes(body.valid_email.toLowerCase())) {
    return "anymail: only found an address that already bounced";
  }
  const fullName = body.person_full_name ?? "";
  return {
    firstName: body.person_first_name ?? fullName.split(" ")[0] ?? "",
    fullName,
    email: body.valid_email,
    title: body.person_job_title ?? "",
    verified: "valid",
    source: "anymail",
  };
}

interface HunterEmail {
  value: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  confidence: number;
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

export async function hunter(
  domain: string,
  key: string,
  exclude: string[] = [],
): Promise<Contact | string> {
  const { emails = [] } = await hunterGet<{ emails?: HunterEmail[] }>(
    "domain-search",
    { domain, limit: "10", type: "personal" },
    key,
  );
  const ranked = emails
    .filter((e) => !exclude.includes(e.value.toLowerCase()))
    .map((e) => ({ e, tier: TITLE_TIERS.findIndex((re) => re.test(e.position ?? "")) }))
    .filter((x) => x.tier >= 0)
    .sort((a, b) => a.tier - b.tier || b.e.confidence - a.e.confidence);
  const pick = ranked[0]?.e;
  if (!pick) return `hunter: no marketing or ecommerce contact in ${String(emails.length)} results`;

  const { status = "unknown" } = await hunterGet<{ status?: string }>(
    "email-verifier",
    { email: pick.value },
    key,
  );
  if (status !== "valid" && status !== "accept_all") {
    return `hunter: ${pick.value} failed verification (${status})`;
  }
  const firstName = pick.first_name ?? "";
  return {
    firstName,
    fullName: [firstName, pick.last_name ?? ""].join(" ").trim(),
    email: pick.value,
    title: pick.position ?? "",
    verified: status,
    source: "hunter",
  };
}

/**
 * Throws only on outages or quota errors, so the caller can retry the domain
 * on a later run instead of marking it done.
 */
/** `exclude`: addresses that already bounced, never returned again. */
export async function findContact(
  domain: string,
  exclude: string[] = [],
): Promise<Contact | string> {
  const reasons: string[] = [];
  const anymailKey = process.env["ANYMAIL_API_KEY"];
  if (anymailKey) {
    const hit = await anymail(domain, anymailKey, exclude);
    if (typeof hit !== "string") return hit;
    reasons.push(hit);
  }
  const hunterKey = process.env["HUNTER_API_KEY"];
  if (hunterKey) {
    const hit = await hunter(domain, hunterKey, exclude);
    if (typeof hit !== "string") return hit;
    reasons.push(hit);
  }
  if (!anymailKey && !hunterKey) throw new Error("set ANYMAIL_API_KEY or HUNTER_API_KEY");
  return reasons.join("; ");
}

/** True when a job title is one we'd email. Same tiers as the automatic lookup. */
export function wantedTitle(title: string): boolean {
  return TITLE_TIERS.some((re) => re.test(title));
}

/**
 * A named person's address at a domain, for names found by research. Only a
 * proven-valid address counts: a guess from a pattern never reaches the sheet.
 */
export async function findPerson(
  domain: string,
  fullName: string,
  exclude: string[] = [],
): Promise<{ email: string; source: "anymail" | "hunter" } | string> {
  const reasons: string[] = [];
  const anymailKey = process.env["ANYMAIL_API_KEY"];
  if (anymailKey) {
    const res = await fetch(ANYMAIL_PERSON, {
      method: "POST",
      headers: { Authorization: anymailKey, "Content-Type": "application/json" },
      body: JSON.stringify({ domain, full_name: fullName }),
    });
    if (!res.ok) throw new Error(`Anymail returned ${String(res.status)}`);
    const body = (await res.json()) as AnymailResponse & { email?: string | null };
    const email = (body.valid_email ?? (body.email_status === "valid" ? body.email : null))
      ?.trim()
      .toLowerCase();
    if (body.email_status === "valid" && email && !exclude.includes(email)) {
      return { email, source: "anymail" };
    }
    reasons.push(`anymail: ${body.email_status ?? "no result"}`);
  }
  const hunterKey = process.env["HUNTER_API_KEY"];
  if (hunterKey) {
    const [first = "", ...rest] = fullName.trim().split(/\s+/);
    const found = await hunterGet<{ email?: string | null }>(
      "email-finder",
      { domain, first_name: first, last_name: rest.join(" ") },
      hunterKey,
    );
    const email = found.email?.trim().toLowerCase();
    if (email && !exclude.includes(email)) {
      const { status = "unknown" } = await hunterGet<{ status?: string }>(
        "email-verifier",
        { email },
        hunterKey,
      );
      if (status === "valid") return { email, source: "hunter" };
      reasons.push(`hunter: ${email} ${status}`);
    } else {
      reasons.push("hunter: no address");
    }
  }
  if (!anymailKey && !hunterKey) throw new Error("set ANYMAIL_API_KEY or HUNTER_API_KEY");
  return reasons.join("; ");
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

/** Anymail decision-maker categories per role, best first. */
const ANYMAIL_ROLE: Readonly<Record<Role, string[]>> = {
  owner: ["engineering", "it"],
  risk: ["ceo"],
  budget: ["marketing"],
};

async function anymailRole(
  domain: string,
  key: string,
  role: Role,
  exclude: string[],
): Promise<RoleContact | null> {
  const res = await fetch(ANYMAIL, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify({ domain, decision_maker_category: ANYMAIL_ROLE[role] }),
  });
  if (!res.ok) throw new Error(`Anymail returned ${String(res.status)}`);
  const body = (await res.json()) as AnymailResponse;
  const email = body.valid_email?.toLowerCase();
  if (body.email_status !== "valid" || !email || exclude.includes(email)) return null;
  const fullName = body.person_full_name ?? "";
  return {
    role,
    firstName: body.person_first_name ?? fullName.split(" ")[0] ?? "",
    fullName,
    email,
    title: body.person_job_title ?? "",
    verified: "valid",
    source: "anymail",
  };
}

interface HunterEmailV extends HunterEmail {
  verification?: { status?: string | null } | null;
}

/** One Hunter search fills whichever roles Anymail missed. */
async function hunterRoles(
  domain: string,
  key: string,
  missing: Role[],
  exclude: string[],
): Promise<RoleContact[]> {
  const { emails = [] } = await hunterGet<{ emails?: HunterEmailV[] }>(
    "domain-search",
    { domain, limit: "10", type: "personal" },
    key,
  );
  const out: RoleContact[] = [];
  for (const role of missing) {
    const pick = emails
      .filter((e) => !exclude.includes(e.value.toLowerCase()))
      .filter((e) => !out.some((o) => o.email === e.value.toLowerCase()))
      .filter((e) => roleFor(e.position ?? "") === role)
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (!pick) continue;
    // Hunter's own recent check saves a verification credit when it says valid.
    let status = pick.verification?.status ?? "unknown";
    if (status !== "valid") {
      status =
        (await hunterGet<{ status?: string }>("email-verifier", { email: pick.value }, key))
          .status ?? "unknown";
    }
    if (status !== "valid" && status !== "accept_all") continue;
    const firstName = pick.first_name ?? "";
    out.push({
      role,
      firstName,
      fullName: [firstName, pick.last_name ?? ""].join(" ").trim(),
      email: pick.value.toLowerCase(),
      title: pick.position ?? "",
      verified: status,
      source: "hunter",
    });
  }
  return out;
}

/**
 * Up to three people at a company, at most one per role, owner first. Anymail
 * charges only on a hit, so it goes first per role; one Hunter search fills
 * the gaps. Throws on outages or quota errors so the domain retries later.
 */
export async function findContacts(
  domain: string,
  exclude: string[] = [],
  /** skip: roles already covered. hunter false keeps the 25 monthly Hunter searches for contact 1. */
  opts: { skip?: Role[]; hunter?: boolean } = {},
): Promise<RoleContact[] | string> {
  const roles = (["owner", "risk", "budget"] as const).filter((r) => !opts.skip?.includes(r));
  const found: RoleContact[] = [];
  const taken = (): string[] => [...exclude, ...found.map((f) => f.email)];
  const anymailKey = process.env["ANYMAIL_API_KEY"];
  const hunterKey = opts.hunter === false ? undefined : process.env["HUNTER_API_KEY"];
  if (!anymailKey && !hunterKey) throw new Error("set ANYMAIL_API_KEY or HUNTER_API_KEY");
  if (anymailKey) {
    for (const role of roles) {
      const hit = await anymailRole(domain, anymailKey, role, taken());
      if (hit) found.push(hit);
    }
  }
  const missing = roles.filter((r) => !found.some((f) => f.role === r));
  if (hunterKey && missing.length > 0) {
    try {
      found.push(...(await hunterRoles(domain, hunterKey, missing, taken())));
    } catch (error) {
      // Out of Hunter credits mid-month: keep who Anymail found rather than lose the company.
      if (found.length === 0) throw error;
    }
  }
  if (found.length === 0) return "no contact found for any role";
  const order: Record<Role, number> = { owner: 0, risk: 1, budget: 2 };
  return found.sort((a, b) => order[a.role] - order[b.role]);
}
