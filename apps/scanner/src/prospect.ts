import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { findContact, type Contact } from "./outreach/contacts.js";
import { MIN_VENDORS, gather, type Evidence } from "./outreach/evidence.js";
import { render } from "./outreach/template.js";

/**
 * Prospecting pipeline. Scans each domain, keeps only findings we can defend,
 * finds and verifies a contact (Anymail, then Hunter), and writes a filled outreach
 * draft to CSV for review. It never sends anything.
 *
 * From the repo root:
 *   pnpm --filter @consentinel/scanner exec tsx src/prospect.ts domains.txt --scan-only
 *   pnpm --filter @consentinel/scanner exec tsx src/prospect.ts domains.txt
 *
 * Superseded by outreach/cli.ts for the daily flow; kept for CSV batch runs.
 * --scan-only skips contact lookups, so it costs no credits. Domains in prospects.done
 * are skipped, so a re-run never spends a credit twice.
 */

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
/** A scan-only pass is the expensive part; the real run reuses it within this window. */
const EVIDENCE_TTL_MS = 48 * 60 * 60 * 1000;
const evidenceFile = resolve(base, "prospects.evidence.json");
const evidence: Record<string, { at: number; ev: Evidence }> = existsSync(evidenceFile)
  ? (JSON.parse(readFileSync(evidenceFile, "utf8")) as Record<string, { at: number; ev: Evidence }>)
  : {};
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

function draft(domain: string, ev: Evidence, firstName: string): { subject: string; body: string } {
  const { subject, text } = render({
    domain,
    firstName,
    ev,
    postalAddress: process.env["PROSPECT_POSTAL_ADDRESS"] ?? "[POSTAL ADDRESS]",
  });
  return { subject, body: text };
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
    const cached = evidence[domain];
    let ev: Evidence | string;
    if (cached && Date.now() - cached.at < EVIDENCE_TTL_MS) {
      ev = cached.ev;
      console.log(`       reusing scan from ${new Date(cached.at).toLocaleString()}`);
    } else {
      ev = await gather(`https://${host}`);
      if (typeof ev !== "string") {
        evidence[domain] = { at: Date.now(), ev };
        writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));
      }
    }
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
        // Not marked done: a lookup outage or quota hit should retry next run.
        const reason = `lookup failed: ${error instanceof Error ? error.message : String(error)}`;
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
