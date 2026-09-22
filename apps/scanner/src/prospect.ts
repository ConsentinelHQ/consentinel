import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { canonicalVendor, type ScanResult } from "@consentinel/shared";
import { scan } from "./index.js";

/**
 * Prospecting pipeline. Scans each domain, keeps only findings we can defend,
 * finds and verifies a contact through Hunter, and writes a filled outreach
 * draft to CSV for review. It never sends anything.
 *
 * From the repo root:
 *   pnpm --filter @consentinel/scanner exec tsx src/prospect.ts domains.txt --scan-only
 *   pnpm --filter @consentinel/scanner exec tsx src/prospect.ts domains.txt
 *
 * --scan-only skips Hunter, so it costs no credits. Domains in prospects.done
 * are skipped, so a re-run never spends a credit twice.
 */

const HUNTER = "https://api.hunter.io/v2";
/** Fewer than this and the email is a shrug, not a finding. */
const MIN_VENDORS = 2;
/** Earlier tiers win; within a tier, higher Hunter confidence wins. */
const TITLE_TIERS = [
  /e-?commerce|digital/i,
  /growth/i,
  /marketing|\bcmo\b/i,
  /founder|\bceo\b|president|owner/i,
];

type Mode = "rejected" | "gpc";

interface Evidence {
  mode: Mode;
  critical: number;
  gated: number;
  /** Advertising vendors firing, most findings first. */
  firing: string[];
}

interface Contact {
  firstName: string;
  email: string;
  title: string;
  verified: string;
}

interface HunterEmail {
  value: string;
  first_name: string | null;
  position: string | null;
  confidence: number;
}

interface HunterResponse<T> {
  data?: T;
  errors?: { details: string }[];
}

/** Repo root: pnpm exec runs from the package folder, so walk up to the workspace file. */
function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
  return dir;
}
const base = repoRoot();
const outCsv = resolve(base, "prospects.csv");
const doneFile = resolve(base, "prospects.done");
const cacheFile = resolve(base, "prospects.contacts.json");
const cache: Record<string, Contact | string> = existsSync(cacheFile)
  ? (JSON.parse(readFileSync(cacheFile, "utf8")) as Record<string, Contact | string>)
  : {};
const COLUMNS = [
  "domain",
  "status",
  "mode",
  "critical",
  "gated",
  "contact",
  "email",
  "title",
  "verified",
  "subject",
  "body",
] as const;
type Column = (typeof COLUMNS)[number];

function cell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeRow(row: Partial<Record<Column, string | number>>): void {
  if (!existsSync(outCsv)) writeFileSync(outCsv, COLUMNS.join(",") + "\n");
  appendFileSync(outCsv, COLUMNS.map((c) => cell(row[c] ?? "")).join(",") + "\n");
}

interface Tally {
  critical: number;
  gated: Set<string>;
  firing: Map<string, number>;
}

function tally(result: ScanResult): Tally {
  const self = result.cmp.detected ? canonicalVendor(result.cmp.detected.name) : null;
  const gated = new Set(result.correctlyGated.map((g) => canonicalVendor(g.vendor)));
  const firing = new Map<string, number>();
  for (const f of result.findings) {
    if (f.severity !== "critical" || !/advert|marketing/i.test(f.category)) continue;
    const v = canonicalVendor(f.vendor);
    // The store's own platform is not a third party it chose to add.
    if (v === self || /^shopify\b/i.test(v)) continue;
    firing.set(v, (firing.get(v) ?? 0) + 1);
  }
  return { critical: result.counts.critical, gated, firing };
}

/**
 * Some tags fire on one page load and not the next. Untuckit's Google Ads was
 * gated in one run and firing in the next, so a single sample cannot support a
 * named claim. Name a vendor only if it fired in every run and was gated in
 * none; count a vendor as stopped only if it was gated in every run.
 */
function evaluate(mode: Mode, results: ScanResult[]): Evidence {
  const runs = results.map(tally);
  const first = runs[0];
  if (!first) return { mode, critical: 0, gated: 0, firing: [] };
  const everGated = new Set(runs.flatMap((r) => [...r.gated]));
  const firing = [...first.firing.keys()]
    .filter((v) => runs.every((r) => r.firing.has(v)) && !everGated.has(v))
    .map((v) => ({ v, n: runs.reduce((sum, r) => sum + (r.firing.get(v) ?? 0), 0) }))
    .sort((a, b) => b.n - a.n)
    .map(({ v }) => v);
  return {
    mode,
    critical: Math.min(...runs.map((r) => r.critical)),
    gated: [...first.gated].filter((v) => runs.every((r) => r.gated.has(v))).length,
    firing,
  };
}

/** A clicked reject is the stronger claim; GPC only when no reject was possible. */
async function gather(url: string): Promise<Evidence | string> {
  try {
    const normal = await scan(url);
    if (normal.consentAttempt?.performed) {
      return evaluate("rejected", [normal, await scan(url)]);
    }
    const a = await scan(url, { gpc: true });
    const b = await scan(url, { gpc: true });
    return evaluate("gpc", [a, b]);
  } catch (error) {
    return `scan failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function hunter<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env["HUNTER_API_KEY"];
  if (!key) throw new Error("HUNTER_API_KEY not set");
  const qs = new URLSearchParams({ ...params, api_key: key });
  const res = await fetch(`${HUNTER}/${path}?${qs.toString()}`);
  const body = (await res.json()) as HunterResponse<T>;
  if (!res.ok || !body.data) {
    throw new Error(body.errors?.[0]?.details ?? `Hunter returned ${String(res.status)}`);
  }
  return body.data;
}

async function findContact(domain: string): Promise<Contact | string> {
  const { emails = [] } = await hunter<{ emails?: HunterEmail[] }>("domain-search", {
    domain,
    limit: "10",
    type: "personal",
  });
  const ranked = emails
    .map((e) => ({ e, tier: TITLE_TIERS.findIndex((re) => re.test(e.position ?? "")) }))
    .filter((x) => x.tier >= 0)
    .sort((a, b) => a.tier - b.tier || b.e.confidence - a.e.confidence);
  const pick = ranked[0]?.e;
  if (!pick) return `no marketing or ecommerce contact in ${String(emails.length)} results`;

  const { status = "unknown" } = await hunter<{ status?: string }>("email-verifier", {
    email: pick.value,
  });
  // accept_all servers take mail for any address: likely delivered, not proven.
  if (status !== "valid" && status !== "accept_all") {
    return `${pick.value} failed verification (${status})`;
  }
  return {
    firstName: pick.first_name ?? "",
    email: pick.value,
    title: pick.position ?? "",
    verified: status,
  };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
}

function draft(domain: string, ev: Evidence, firstName: string): { subject: string; body: string } {
  const n = ev.firing.length;
  const named = joinNames(ev.firing.slice(0, 3));
  const vendors =
    n <= 3
      ? `${String(n)} ad vendors still fire: ${named}`
      : `${String(n)} ad vendors still fire, including ${named}`;
  const issues =
    ev.mode === "rejected"
      ? [
          `After declining cookies, ${vendors}`,
          ev.gated > 0
            ? `${String(ev.gated)} other vendors correctly wait for consent, so the banner is working - these just aren't connected to it`
            : "None of the tags we saw changed behavior after the reject click",
        ]
      : [
          `With Global Privacy Control turned on, ${vendors}`,
          ev.gated > 0
            ? `${String(ev.gated)} other vendors correctly stop, so the signal is being read - these just aren't connected to it`
            : "None of them stopped when the signal was on",
          "California treats GPC as an opt-out of sale and sharing, and it's what Sephora was fined $1.2M for in 2022",
        ];
  const body = [
    `Hi ${firstName || "there"},`,
    "",
    "My name is Charlie Buckley - I'm the founder of Consentinel, a tool that checks whether websites actually respect their visitors' privacy choices.",
    "",
    `I wanted to reach out as I did a manual scan on ${domain} and noticed ${n > 3 ? "several" : "a few"} issues I wanted to make you aware of:`,
    "",
    ...issues.map((i) => `- ${i}`),
    "",
    "I'd love to share the full report with you if you're interested. We also offer ongoing monitoring that rescans your site daily and alerts you if something new starts firing.",
    "",
    "Happy to connect if interested - just wanted to make you aware of these gaps.",
    "",
    "Thank you,",
    "",
    "Charlie Buckley",
    "Founder, Consentinel",
    "consentinelhq.com",
    "",
    "If you'd rather not hear from me, just reply and I won't email again.",
    process.env["PROSPECT_POSTAL_ADDRESS"] ?? "[POSTAL ADDRESS]",
  ].join("\n");
  return { subject: `Privacy issues on ${domain}`, body };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("--"));
  const scanOnly = args.includes("--scan-only");
  if (!input) {
    console.error("usage: prospect.ts domains.txt [--scan-only]");
    process.exit(1);
  }

  const done = new Set(
    existsSync(doneFile)
      ? readFileSync(doneFile, "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
      : [],
  );
  const hosts = readFileSync(resolve(base, input), "utf8")
    .split("\n")
    .map((l) =>
      l
        .trim()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, ""),
    )
    .filter(Boolean);

  for (const host of hosts) {
    const domain = host.replace(/^www\./, "");
    if (done.has(domain)) {
      console.log(`skip   ${domain} (already done)`);
      continue;
    }
    const markDone = (): void => {
      if (scanOnly) return;
      appendFileSync(doneFile, domain + "\n");
      done.add(domain);
    };

    console.log(`scan   ${domain}`);
    const ev = await gather(`https://${host}`);
    if (typeof ev === "string") {
      // Not marked done: a crashed browser is transient and worth retrying.
      writeRow({ domain, status: ev });
      console.log(`       ${ev}`);
      continue;
    }

    const summary = { domain, mode: ev.mode, critical: ev.critical, gated: ev.gated };
    if (ev.firing.length < MIN_VENDORS) {
      writeRow({ ...summary, status: `weak: ${String(ev.firing.length)} nameable ad vendors` });
      markDone();
      console.log(`       weak evidence, skipped`);
      continue;
    }
    console.log(`       ${ev.mode}: ${ev.firing.join(", ")}`);
    if (scanOnly) {
      writeRow({ ...summary, status: "evidence ok", body: ev.firing.join(", ") });
      continue;
    }

    // Cached per domain: re-running to fix copy or evidence must not spend credits twice.
    let contact = cache[domain];
    if (contact === undefined) {
      try {
        contact = await findContact(domain);
      } catch (error) {
        // Not marked done: a Hunter outage or quota hit should retry next run.
        const reason = `hunter failed: ${error instanceof Error ? error.message : String(error)}`;
        writeRow({ ...summary, status: reason });
        console.log(`       ${reason}`);
        continue;
      }
      cache[domain] = contact;
      writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
    }
    if (typeof contact === "string") {
      writeRow({ ...summary, status: contact });
      markDone();
      console.log(`       ${contact}`);
      continue;
    }

    const { subject, body } = draft(domain, ev, contact.firstName);
    writeRow({
      ...summary,
      status: "draft",
      contact: contact.firstName,
      email: contact.email,
      title: contact.title,
      verified: contact.verified,
      subject,
      body,
    });
    markDone();
    console.log(`       draft for ${contact.email} (${contact.title})`);
  }
  process.exit(0);
}

void main();
