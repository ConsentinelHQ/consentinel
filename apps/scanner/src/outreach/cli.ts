import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findContact, type Contact } from "./contacts.js";
import {
  MIN_VENDORS,
  NOT_A_SITE,
  byProminence,
  cleanError,
  gather,
  joinNames,
  tier,
  type Evidence,
} from "./evidence.js";
import { RETRY_AFTER_DAYS, backlog, recentlyTried, sheetContact } from "./backlog.js";
import {
  appendRow,
  authorize,
  countBounces,
  createDraft,
  normDomain,
  readSheet,
  send,
  updateRow,
  type Row,
  type SheetRow,
} from "./google.js";
import {
  addBusinessDays,
  legacyDomains,
  nyDate,
  pause,
  paused,
  readLedger,
  record,
  repoRoot,
  resume,
  resumedAt,
  sentSince,
  sentToday,
  shouldPause,
} from "./state.js";
import { mark, sync, type Mark } from "./sync.js";
import { render } from "./template.js";

/**
 * Daily outreach: scan -> evidence -> contact -> email -> sheet.
 *
 *   pnpm --filter @consentinel/scanner outreach run --domains a.com,b.com
 *   pnpm --filter @consentinel/scanner outreach run --file domains.txt --send
 *   pnpm --filter @consentinel/scanner outreach run --from-sheet --limit 5
 *   pnpm --filter @consentinel/scanner outreach sync
 *   pnpm --filter @consentinel/scanner outreach mark --domain a.com --status Meeting --note "call Fri"
 *   pnpm --filter @consentinel/scanner outreach status
 *   pnpm --filter @consentinel/scanner outreach pause|resume|auth
 *
 * --from-sheet works the sheet's own "Scanned - ready" backlog (Tier 1 first),
 * rescanning each row and updating it in place instead of adding a new one.
 *
 * Without --send it only writes Gmail drafts. Logs go to stderr; the last
 * stdout line is a JSON summary for whatever is driving this (OpenClaw).
 */

const BOUNCE_WINDOW_DAYS = 14;

const log = (s: string): void => {
  process.stderr.write(s + "\n");
};

function cfg(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`${name} not set (see .env.outreach.example)`);
  return v;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function company(domain: string): string {
  const stem = domain.split(".")[0] ?? domain;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

function keyFinding(ev: Evidence): string {
  const named = joinNames(byProminence(ev.firing).slice(0, 3));
  return `${named} fire ${ev.mode === "rejected" ? "after reject" : "under GPC"} (${String(ev.firing.length)} ad vendors)`;
}

function bounceSince(now: Date): Date {
  const window = new Date(now.getTime() - BOUNCE_WINDOW_DAYS * 86_400_000);
  const resumed = resumedAt();
  return resumed && resumed > window ? resumed : window;
}

interface Summary {
  processed: number;
  sent: string[];
  drafted: string[];
  skipped: Record<string, string>;
  errors: Record<string, string>;
  paused: string | null;
  sentToday: number;
  cap: number;
}

async function run(args: string[]): Promise<Summary> {
  const sendMode = args.includes("--send");
  const limit = Number(flag(args, "--limit") ?? "10");
  const cap = Number(cfg("OUTREACH_DAILY_CAP", "5"));
  const minGpc = Number(cfg("OUTREACH_MIN_GPC_VENDORS", "8"));
  const from = cfg("OUTREACH_FROM");
  const sheetId = cfg("OUTREACH_SHEET_ID");
  const tab = cfg("OUTREACH_SHEET_TAB", "Prospects");
  const postal = process.env["OUTREACH_POSTAL_ADDRESS"] ?? "";

  const inline = flag(args, "--domains")?.split(",") ?? [];
  const file = flag(args, "--file");
  const fromFile = file ? readFileSync(resolve(repoRoot(), file), "utf8").split("\n") : [];
  const domains = [...new Set([...inline, ...fromFile].map(normDomain).filter(Boolean))];
  const fromSheet = args.includes("--from-sheet");
  if (fromSheet && domains.length)
    throw new Error("use --from-sheet or --domains/--file, not both");

  const now = new Date();
  const ledger = readLedger();
  const sheet = await readSheet(sheetId, tab);
  const handled = new Set(
    ledger.filter((e) => e.action === "sent" || e.action === "drafted").map((e) => e.domain),
  );
  const contacted = new Set([...sheet.domains, ...legacyDomains(), ...handled]);
  // A backlog row that came up empty (no contact, failed rescan) waits a month before another try.
  const tried = recentlyTried(ledger, now, RETRY_AFTER_DAYS);
  // New domains must not be anywhere yet; backlog rows are in the sheet by definition.
  const targets: { domain: string; row?: SheetRow }[] = fromSheet
    ? backlog(sheet.rows)
        .map((row) => ({ domain: normDomain(row.values["Domain"] ?? ""), row }))
        .filter((t) => !handled.has(t.domain) && !tried.has(t.domain))
    : domains.map((domain) => ({ domain }));

  // Bounce check before anything goes out. A paused run still drafts.
  if (sendMode && !paused()) {
    const since = bounceSince(now);
    const bounces = await countBounces(since);
    const sends = sentSince(ledger, since);
    if (shouldPause(sends, bounces)) {
      pause(`${String(bounces)} bounces on ${String(sends)} sends since ${since.toISOString()}`);
    }
  }
  const pausedState = paused();
  let sentCount = sentToday(ledger, now);

  const out: Summary = {
    processed: 0,
    sent: [],
    drafted: [],
    skipped: {},
    errors: {},
    paused: pausedState?.reason ?? null,
    sentToday: sentCount,
    cap,
  };
  const today = nyDate(now);
  const base = (domain: string, ev?: Evidence): Row => ({
    Company: company(domain),
    Domain: domain,
    "Scan mode": ev?.mode ?? "",
    Critical: ev?.critical ?? "",
    Stopped: ev?.gated ?? "",
    "Key finding": ev && ev.firing.length ? keyFinding(ev) : "",
    Tier: ev ? tier(ev, minGpc) : "",
  });
  const note = (s: string): string => `${today}: outreach bot - ${s}`;

  for (const { domain, row } of targets) {
    /** New domains append a row; backlog rows update theirs and keep the old notes. */
    const write = async (fields: Row): Promise<void> => {
      if (!row) return appendRow(sheetId, tab, sheet.headers, fields);
      // Company and Domain are already right on an existing row.
      const rest = Object.fromEntries(
        Object.entries(fields).filter(([k]) => k !== "Company" && k !== "Domain"),
      );
      const prior = row.values["Notes"] ?? "";
      const notes = String(fields["Notes"] ?? "");
      await updateRow(sheetId, tab, sheet.headers, row.rowNumber, {
        ...rest,
        ...(notes ? { Notes: prior ? `${prior} | ${notes}` : notes } : {}),
      });
    };
    if (out.processed >= limit) break;
    if (!row && contacted.has(domain)) {
      out.skipped[domain] = "already in sheet or ledger";
      continue;
    }
    // A capped send run stops before spending scan time or lookup credits.
    if (sendMode && !pausedState && sentCount >= cap) {
      out.skipped[domain] = "daily cap reached";
      continue;
    }
    out.processed++;
    contacted.add(domain);
    log(`scan   ${domain}`);

    const ev = await gather(`https://${domain}`);
    if (typeof ev === "string") {
      const reason = cleanError(ev);
      // A domain that doesn't resolve is a bad input, not a prospect: keep it out of the sheet.
      if (NOT_A_SITE.test(ev)) {
        contacted.delete(domain);
        record({ domain, action: "error", reason });
        out.errors[domain] = reason;
        continue;
      }
      await write({
        ...(row ? {} : base(domain)),
        ...(row ? {} : { Status: "Scan failed" }),
        Notes: note(row ? `rescan failed: ${reason}` : reason),
      });
      record({ domain, action: "skipped", reason });
      out.skipped[domain] = reason;
      continue;
    }
    const t = tier(ev, minGpc);
    if (ev.firing.length < MIN_VENDORS || t === 3) {
      const reason = `${row ? "rescan: " : ""}weak evidence: ${String(ev.firing.length)} nameable ad vendors (${ev.mode})`;
      await write({
        ...base(domain, ev),
        Status: "Dead",
        Notes: note(reason),
      });
      record({ domain, action: "skipped", reason });
      out.skipped[domain] = reason;
      continue;
    }

    let contact: Contact | string | null = row ? sheetContact(row.values) : null;
    try {
      contact ??= await findContact(domain);
    } catch (error) {
      // Quota or outage: leave it out of the sheet so a later run retries it.
      const reason = error instanceof Error ? error.message : String(error);
      contacted.delete(domain);
      record({ domain, action: "error", reason });
      out.errors[domain] = reason;
      continue;
    }
    if (typeof contact === "string") {
      await write({
        ...base(domain, ev),
        Status: "Scanned - ready",
        "Next action": "Find contact",
        Notes: note(contact),
      });
      record({ domain, action: "skipped", reason: contact });
      out.skipped[domain] = contact;
      continue;
    }

    const email = render({
      domain,
      firstName: contact.firstName,
      ev,
      postalAddress: postal,
    });
    const contactCols = {
      Contact: contact.fullName,
      Title: contact.title,
      Email: contact.email,
      "Email check": `${contact.verified} (${contact.source})`,
    };
    // Only proven addresses go out unattended; accept_all bounces burn a new domain.
    const canSend = sendMode && !pausedState && contact.verified === "valid" && sentCount < cap;

    try {
      if (canSend) {
        const id = await send(from, contact.email, email);
        sentCount++;
        record({ domain, action: "sent", email: contact.email, messageId: id });
        await write({
          ...base(domain, ev),
          ...contactCols,
          Status: "Emailed",
          "First email": today,
          "Next action": "Follow up",
          "Next action date": nyDate(addBusinessDays(now, 5)),
          Notes: note("sent"),
        });
        out.sent.push(domain);
        log(`       sent to ${contact.email}`);
      } else {
        const id = await createDraft(from, contact.email, email);
        const why = !sendMode
          ? "draft mode"
          : pausedState
            ? "paused"
            : contact.verified !== "valid"
              ? "accept_all address"
              : "daily cap";
        record({ domain, action: "drafted", email: contact.email, messageId: id, reason: why });
        await write({
          ...base(domain, ev),
          ...contactCols,
          Status: "Scanned - ready",
          "Next action": "Review Gmail draft and send",
          "Next action date": today,
          Notes: note(`drafted (${why})`),
        });
        out.drafted.push(domain);
        log(`       drafted for ${contact.email} (${why})`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      record({ domain, action: "error", email: contact.email, reason });
      out.errors[domain] = reason;
    }
  }
  out.sentToday = sentCount;
  return out;
}

async function status(): Promise<object> {
  const now = new Date();
  const ledger = readLedger();
  const since = bounceSince(now);
  return {
    paused: paused(),
    sentToday: sentToday(ledger, now),
    cap: Number(cfg("OUTREACH_DAILY_CAP", "5")),
    bounceWindow: {
      since: since.toISOString(),
      sends: sentSince(ledger, since),
      bounces: await countBounces(since),
    },
    totals: {
      sent: ledger.filter((e) => e.action === "sent").length,
      drafted: ledger.filter((e) => e.action === "drafted").length,
    },
    last: ledger.slice(-5),
  };
}

async function main(): Promise<void> {
  const [cmd = "", ...args] = process.argv.slice(2);
  switch (cmd) {
    case "run":
      console.log(JSON.stringify(await run(args)));
      break;
    case "sync": {
      const sheetId = cfg("OUTREACH_SHEET_ID");
      const tab = cfg("OUTREACH_SHEET_TAB", "Prospects");
      console.log(JSON.stringify(await sync(sheetId, tab, await readSheet(sheetId, tab)), null, 2));
      break;
    }
    case "mark": {
      const sheetId = cfg("OUTREACH_SHEET_ID");
      const tab = cfg("OUTREACH_SHEET_TAB", "Prospects");
      const domain = flag(args, "--domain");
      if (!domain) throw new Error("mark needs --domain");
      const m: Mark = {};
      for (const key of ["status", "next", "date", "note"] as const) {
        const v = flag(args, `--${key}`);
        if (v !== undefined) m[key] = v;
      }
      await mark(sheetId, tab, await readSheet(sheetId, tab), domain, m);
      console.log(`marked ${domain}`);
      break;
    }
    case "status":
      console.log(JSON.stringify(await status(), null, 2));
      break;
    case "pause":
      pause(args.join(" ") || "paused by hand");
      console.log("paused");
      break;
    case "resume":
      resume();
      console.log("resumed; bounces before now are ignored");
      break;
    case "auth":
      await authorize();
      break;
    default:
      console.error(
        "usage: outreach run [--domains a,b | --file f | --from-sheet] [--send] [--limit n] | sync | mark --domain d [--status s] [--next t] [--date d] [--note n] | status | pause | resume | auth",
      );
      process.exit(2);
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
