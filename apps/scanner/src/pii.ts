import { createHash } from "node:crypto";

/**
 * Personal data reaching third parties. Seed-based on purpose: the scanner types a
 * known test identity into the page, so a hit is proof the vendor received it, not
 * a pattern-match guess. Hashed forms count. A SHA-256 of an email is still
 * personal data under CCPA, and it is exactly how Meta and Google receive it.
 */

export type PiiKind =
  | "email"
  | "email-sha256"
  | "email-md5"
  | "email-sha1"
  | "phone"
  | "phone-sha256"
  | "identifier-param";

export interface PiiHit {
  url: string;
  method: string;
  host: string;
  kind: PiiKind;
  location: "url" | "body";
  /** Parameter that carried it, when the request is key/value shaped. */
  field: string | null;
}

export interface PiiRequest {
  url: string;
  method: string;
  postData?: string;
}

export interface Seed {
  email: string;
  /** National number, digits only. */
  phone?: string;
  /** Country calling code, digits only. Meta hashes phones with it. */
  countryCode?: string;
}

/** Fictional 555 number and our own domain, so a hit can never be a real person. */
export const SEED: Seed = {
  email: "gpc-probe@consentinelhq.com",
  phone: "2015550123",
  countryCode: "1",
};

const hex = (algo: string, s: string): string => createHash(algo).update(s).digest("hex");

/** Parameter names vendors use for identity, raw or hashed. */
const IDENTITY_KEY =
  /(^|[[_.-])(em|email|e_mail|hashed_email|sha256_email(_address)?|ph|phone|hashed_phone|sha256_phone(_number)?)(]|$|[_.-])/i;
const HASH_VALUE = /^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/i;

function decode(s: string): string {
  let out = s;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(out.replace(/\+/g, " "));
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

function pairs(raw: string): Array<[string, string]> {
  try {
    return [...new URLSearchParams(raw).entries()];
  } catch {
    return [];
  }
}

function needles(seed: Seed): Array<[PiiKind, string]> {
  const email = seed.email.trim().toLowerCase();
  const out: Array<[PiiKind, string]> = [
    ["email", email],
    ["email-sha256", hex("sha256", email)],
    ["email-md5", hex("md5", email)],
    ["email-sha1", hex("sha1", email)],
  ];
  if (seed.phone) {
    const full = `${seed.countryCode ?? ""}${seed.phone}`;
    out.push(["phone", seed.phone], ["phone-sha256", hex("sha256", full)]);
    if (full !== seed.phone) out.push(["phone-sha256", hex("sha256", seed.phone)]);
  }
  return out;
}

function isFirstParty(host: string, targetHost: string): boolean {
  return host === targetHost || host.endsWith("." + targetHost);
}

export function detectPiiLeaks(
  requests: readonly PiiRequest[],
  targetHost: string,
  seed: Seed = SEED,
): PiiHit[] {
  const wanted = needles(seed);
  const seen = new Set<string>();
  const hits: PiiHit[] = [];
  const add = (hit: PiiHit): void => {
    const key = `${hit.host}|${hit.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  };

  for (const req of requests) {
    let host: string;
    let query: string;
    try {
      const u = new URL(req.url);
      host = u.hostname;
      query = u.search.slice(1);
    } catch {
      continue;
    }
    if (isFirstParty(host, targetHost)) continue;

    const sources: Array<["url" | "body", string]> = [["url", query]];
    if (req.postData) sources.push(["body", req.postData]);

    for (const [location, raw] of sources) {
      const kv = pairs(raw);
      const text = decode(raw).toLowerCase();
      for (const [kind, needle] of wanted) {
        if (!text.includes(needle)) continue;
        const field = kv.find(([, v]) => decode(v).toLowerCase().includes(needle))?.[0] ?? null;
        add({ url: req.url, method: req.method, host, kind, location, field });
      }
      // Hashed identity under an identity key, even if it isn't our seed.
      for (const [k, v] of kv) {
        if (IDENTITY_KEY.test(k) && HASH_VALUE.test(v.trim())) {
          add({
            url: req.url,
            method: req.method,
            host,
            kind: "identifier-param",
            location,
            field: k,
          });
        }
      }
    }
  }
  return hits;
}
