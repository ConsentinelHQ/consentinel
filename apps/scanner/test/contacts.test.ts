import assert from "node:assert/strict";
import {
  findContact,
  findContacts,
  findPerson,
  resetLookupState,
} from "../src/outreach/contacts.js";

// Fake provider APIs. Each test sets what each host returns.
type Reply = { status: number; body: unknown };
let routes: Record<string, (url: URL, body: unknown) => Reply> = {};
const calls: string[] = [];

globalThis.fetch = ((input: string | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const key = `${url.host}${url.pathname}`;
  calls.push(key);
  const handler = routes[key];
  const reply = handler
    ? handler(url, typeof init?.body === "string" ? JSON.parse(init.body) : undefined)
    : { status: 500, body: {} };
  return Promise.resolve(new Response(JSON.stringify(reply.body), { status: reply.status }));
}) as typeof fetch;

const ENV = {
  ANYMAIL_API_KEY: "a",
  PROSPEO_API_KEY: "p",
  TOMBA_API_KEY: "t",
  TOMBA_API_SECRET: "ts",
  HUNTER_API_KEY: "h",
};

function setup(env: Record<string, string>): void {
  for (const k of [...Object.keys(ENV), "GETPROSPECT_API_KEY"]) delete process.env[k];
  Object.assign(process.env, env);
  resetLookupState();
  routes = {};
  calls.length = 0;
}

const ANY = "api.anymailfinder.com/v5.1/find-email/decision-maker";
const PSEARCH = "api.prospeo.io/search-person";
const PENRICH = "api.prospeo.io/enrich-person";
const TSEARCH = "api.tomba.io/v1/domain-search";
const TVERIFY = "api.tomba.io/v1/email-verifier";
const HSEARCH = "api.hunter.io/v2/domain-search";

const outOfCredits = (): Reply => ({ status: 402, body: {} });
const prospeoPeople = (): Reply => ({
  status: 200,
  body: {
    error: false,
    results: [
      {
        person: {
          person_id: "p1",
          first_name: "Ana",
          full_name: "Ana Diaz",
          current_job_title: "VP Marketing",
        },
      },
      {
        person: {
          person_id: "p2",
          first_name: "Ben",
          full_name: "Ben Ito",
          current_job_title: "Head of Ecommerce",
        },
      },
    ],
  },
});
const reveal = (url: URL, body: unknown): Reply => {
  const id = (body as { data: { person_id?: string } }).data.person_id;
  return {
    status: 200,
    body: {
      error: false,
      person: { email: { status: "VERIFIED", revealed: true, email: `${String(id)}@shop.com` } },
    },
  };
};

// 1. Anymail out of credits falls through to Prospeo, which ranks the ecommerce lead first.
setup(ENV);
routes[ANY] = outOfCredits;
routes[PSEARCH] = prospeoPeople;
routes[PENRICH] = reveal;
{
  const hit = await findContact("shop.com");
  assert.ok(typeof hit !== "string");
  assert.equal(hit.source, "prospeo");
  assert.equal(hit.email, "p2@shop.com");
  assert.equal(hit.title, "Head of Ecommerce");
}

// 2. A spent provider isn't called again in the same run.
calls.length = 0;
await findContact("shop.com");
assert.ok(!calls.includes(ANY), "anymail skipped once spent");
assert.ok(!calls.includes(PSEARCH), "prospeo search cached per domain");

// 3. Prospeo "no results" is a real answer; Tomba fills in and verifies.
setup(ENV);
routes[ANY] = outOfCredits;
routes[PSEARCH] = () => ({ status: 400, body: { error: true, error_code: "NO_RESULTS" } });
routes[TSEARCH] = () => ({
  status: 200,
  body: {
    data: {
      emails: [
        {
          email: "Cara@shop.com",
          first_name: "Cara",
          position: "Director of Digital Product",
          score: 90,
        },
      ],
    },
  },
});
routes[TVERIFY] = () => ({
  status: 200,
  body: { data: { email: { status: "valid", result: "deliverable", accept_all: false } } },
});
{
  const hit = await findContact("shop.com");
  assert.ok(typeof hit !== "string");
  assert.equal(hit.source, "tomba");
  assert.equal(hit.email, "cara@shop.com");
  assert.equal(hit.verified, "valid");
}

// 4. Accept-all from Tomba is flagged, never passed off as valid.
setup({ TOMBA_API_KEY: "t", TOMBA_API_SECRET: "ts" });
routes[TSEARCH] = () => ({
  status: 200,
  body: { data: { emails: [{ email: "d@shop.com", position: "CTO" }] } },
});
routes[TVERIFY] = () => ({
  status: 200,
  body: { data: { email: { status: "accept_all", result: "risky", accept_all: true } } },
});
{
  const hit = await findContact("shop.com");
  assert.ok(typeof hit !== "string");
  assert.equal(hit.verified, "accept_all");
}

// 5. Every provider errored: throws, so the domain retries on a later run.
setup(ENV);
routes[ANY] = outOfCredits;
routes[PSEARCH] = () => ({
  status: 400,
  body: { error: true, error_code: "INSUFFICIENT_CREDITS" },
});
routes[TSEARCH] = () => ({ status: 429, body: {} });
routes[HSEARCH] = () => ({ status: 429, body: { errors: [{ details: "usage limit" }] } });
await assert.rejects(findContact("shop.com"), /INSUFFICIENT_CREDITS/);

// 6. Some answered "nobody", one errored: a reason string, not a throw.
setup({ PROSPEO_API_KEY: "p", HUNTER_API_KEY: "h" });
routes[PSEARCH] = () => ({ status: 400, body: { error: true, error_code: "NO_RESULTS" } });
routes[HSEARCH] = () => ({ status: 429, body: { errors: [{ details: "usage limit" }] } });
{
  const hit = await findContact("shop.com");
  assert.ok(typeof hit === "string");
  assert.match(hit, /prospeo: no wanted title/);
  assert.match(hit, /hunter: usage limit/);
}

// 7. No keys at all is a config error.
setup({});
await assert.rejects(findContact("shop.com"), /set at least one of/);

// 8. Roles: Prospeo fills owner and budget from one search, bounced address excluded.
setup({ PROSPEO_API_KEY: "p" });
routes[PSEARCH] = prospeoPeople;
routes[PENRICH] = reveal;
{
  const found = await findContacts("shop.com", ["p1@shop.com"]);
  assert.ok(typeof found !== "string");
  assert.deepEqual(
    found.map((f) => [f.role, f.email]),
    [["owner", "p2@shop.com"]],
  );
}

// 9. Roles with hunter false and only Hunter configured: no lookup, no throw.
setup({ HUNTER_API_KEY: "h" });
assert.equal(
  await findContacts("shop.com", [], { hunter: false }),
  "no contact found for any role",
);
assert.equal(calls.length, 0);

// 10. Research names: Prospeo reveal by name and site.
setup({ ANYMAIL_API_KEY: "a", PROSPEO_API_KEY: "p" });
routes["api.anymailfinder.com/v5.1/find-email/person"] = outOfCredits;
routes[PENRICH] = (_u, body) => {
  const d = (body as { data: { full_name?: string; company_website?: string } }).data;
  assert.equal(d.full_name, "Jane Roe");
  assert.equal(d.company_website, "shop.com");
  return {
    status: 200,
    body: { person: { email: { status: "VERIFIED", email: "JANE@shop.com" } } },
  };
};
{
  const hit = await findPerson("shop.com", "Jane Roe");
  assert.deepEqual(hit, { email: "jane@shop.com", source: "prospeo" });
}

// 11. GetProspect: free search ranks the owner title, reveal charges only on valid.
setup({ GETPROSPECT_API_KEY: "g", HUNTER_API_KEY: "h" });
routes["api.getprospect.com/v2/people/search"] = (_u, body) => {
  const b = body as {
    enrich_email: boolean;
    filters: { company: { domain: { include: string[] } } };
  };
  assert.equal(b.enrich_email, false);
  assert.deepEqual(b.filters.company.domain.include, ["shop.com"]);
  return {
    status: 200,
    body: {
      success: true,
      data: [
        {
          id: "1",
          full_name: "Ann Lee",
          first_name: "Ann",
          primary_position: { job_title: "CMO" },
        },
        {
          id: "2",
          full_name: "Raj Pal",
          first_name: "Raj",
          primary_position: { job_title: "VP Engineering" },
        },
      ],
    },
  };
};
routes["api.getprospect.com/v2/email/find"] = (_u, body) => {
  const name = (body as { data: { full_name: string } }).data.full_name;
  return name === "Raj Pal"
    ? { status: 200, body: { success: true, data: { email: "Raj@shop.com", status: "valid" } } }
    : { status: 200, body: { success: false, errors: [{ name: "NOT_FOUND" }] } };
};
{
  const hit = await findContact("shop.com");
  assert.ok(typeof hit !== "string");
  assert.equal(hit.source, "getprospect");
  assert.equal(hit.email, "raj@shop.com");
  assert.ok(!calls.includes(HSEARCH), "hunter not touched after a hit");
}

// 12. GetProspect out of credits (402) falls through to Hunter.
setup({ GETPROSPECT_API_KEY: "g", HUNTER_API_KEY: "h" });
routes["api.getprospect.com/v2/people/search"] = () => ({
  status: 402,
  body: { success: false, errors: [{ name: "PAYMENT_REQUIRED" }] },
});
routes[HSEARCH] = () => ({
  status: 200,
  body: {
    data: {
      emails: [
        {
          value: "e@shop.com",
          first_name: "Eve",
          last_name: null,
          position: "Head of Ecommerce",
          confidence: 90,
          verification: { status: "valid" },
        },
      ],
    },
  },
});
{
  const hit = await findContact("shop.com");
  assert.ok(typeof hit !== "string");
  assert.equal(hit.source, "hunter");
}

console.log("contacts: all checks passed");
