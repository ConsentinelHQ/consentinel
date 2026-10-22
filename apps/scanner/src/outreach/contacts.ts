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
const TITLE_TIERS = [
  /e-?commerce|digital product|product|engineering|technology|\bcto\b|web/i,
  /privacy|legal|counsel|compliance/i,
  /digital|growth/i,
  /founder|\bceo\b|president|owner/i,
  /marketing|\bcmo\b/i,
];

/** Anymail decision-maker categories, tried in order. Same priority as above. */
const ANYMAIL_ROLES = ["engineering", "it", "ceo", "marketing"];

const ANYMAIL = "https://api.anymailfinder.com/v5.1/find-email/decision-maker";
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
