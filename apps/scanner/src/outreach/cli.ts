import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findContact, findContacts, roleFor, type Contact, type RoleContact } from "./contacts.js";
import { EXTRA_HEADERS, extraCols, pickExtras, type Slot } from "./team.js";
import { draftTeam } from "./team-draft.js";
import { repairTeam, setTeam, skipTeam, teamNeedList } from "./team-research.js";
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
import {
  RETRY_AFTER_DAYS,
  backlog,
  bouncedEmails,
  bouncedRows,
  recentlyTried,
  sheetContact,
} from "./backlog.js";
import {
  appendRow,
  authorize,
  countBounces,
  countDrafts,
  createDraft,
  ensureHeaders,
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
import { fetchMetrics, lastCronAt, renderBrief, windowHours } from "./brief.js";
import { followups } from "./followup.js";
import { retouch } from "./retouch.js";
import { RESEARCHED, needList, setContact, skipContact } from "./research.js";
import { recordOpens } from "./views.js";
import { computeStats } from "./stats.js";
import { addToQueue, readQueue } from "./queue.js";
import {
  draftLeads,
  fetchInbound,
  inboundSince,
  isOwn,
  pickLeads,
  saveInboundSince,
} from "./inbound.js";
import { prep, reportLink } from "./prep.js";
import { mark, sync, type Mark } from "./sync.js";
import { render } from "./template.js";

/**
 * Daily outreach: scan -> evidence -> contact -> email -> sheet.
 *
 *   pnpm --filter @consentinel/scanner outreach run --domains a.com,b.com
 *   pnpm --filter @consentinel/scanner outreach run --file domains.txt --send
 *   pnpm --filter @consentinel/scanner outreach run --from-sheet --limit 5
 *   pnpm --filter @consentinel/scanner outreach sync
 *   pnpm --filter @consentinel/scanner outreach followups [--limit 5]
 *   pnpm --filter @consentinel/scanner outreach retouch [--limit 5]
 *   pnpm --filter @consentinel/scanner outreach contacts need [--limit 10]
 *   pnpm --filter @consentinel/scanner outreach contacts set --domain d --name "First Last" --title t --source url
 *   pnpm --filter @consentinel/scanner outreach contacts skip --domain d --reason "why"
 *   pnpm --filter @consentinel/scanner outreach prep --domain a.com
 *   pnpm --filter @consentinel/scanner outreach leads [--limit 10]
 *   pnpm --filter @consentinel/scanner outreach queue add a.com,b.com | queue status | queue known
 *   pnpm --filter @consentinel/scanner outreach run --from-sheet --then-queue --limit 5
 *   pnpm --filter @consentinel/scanner outreach brief [--hours 24]
 *   pnpm --filter @consentinel/scanner outreach stats
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
  /** Colleagues Claw researched, drafted after contact 1. */
  colleagues?: string[];
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
  // Contact 2 and 3 columns, added once on the first run that needs them.
  if (fromSheet || domains.length) {
    const added = await ensureHeaders(sheetId, tab, sheet, EXTRA_HEADERS);
    if (added.length) log(`added sheet columns: ${added.join(", ")}`);
  }
  const handled = new Set(
    ledger.filter((e) => e.action === "sent" || e.action === "drafted").map((e) => e.domain),
  );
  const contacted = new Set([...sheet.domains, ...legacyDomains(), ...handled]);
  // A backlog row that came up empty (no contact, failed rescan) waits a month before another try.
  const tried = recentlyTried(ledger, now, RETRY_AFTER_DAYS);
  // New domains must not be anywhere yet; backlog rows are in the sheet by definition.
  // Bounced rows first: a known-good prospect whose contact just needs replacing.
  const recovering = fromSheet
    ? bouncedRows(sheet.rows)
        .map((row) => ({ domain: normDomain(row.values["Domain"] ?? ""), row, recover: true }))
        .filter((t) => !tried.has(t.domain))
    : [];
  const targets: { domain: string; row?: SheetRow; recover?: boolean }[] = fromSheet
    ? [
        ...recovering,
        ...backlog(sheet.rows)
          .map((row) => ({ domain: normDomain(row.values["Domain"] ?? ""), row }))
          // A contact found by research gets its draft on the next run, not in a month.
          .filter(
            (t) =>
              !handled.has(t.domain) &&
              (!tried.has(t.domain) || t.row.values["Email check"] === RESEARCHED),
          ),
      ]
    : domains.map((domain) => ({ domain }));
  // Discovery queue tops up whatever the backlog can't fill; dedupe happens in the loop.
  if (fromSheet && args.includes("--then-queue")) {
    for (const domain of readQueue()) if (!contacted.has(domain)) targets.push({ domain });
  }

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
  const apiKey = process.env["OUTREACH_API_KEY"];
  const reportApi = apiKey
    ? {
        base: (process.env["OUTREACH_APP_URL"] ?? "https://www.getconsentinel.com").replace(
          /\/$/,
          "",
        ),
        key: apiKey,
      }
    : null;

  for (const { domain, row, recover } of targets) {
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

    const exclude = row ? bouncedEmails(row.values) : [];
    let contact: Contact | string | null = row && !recover ? sheetContact(row.values) : null;
    try {
      contact ??= await findContact(domain, exclude);
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
        ...(recover ? {} : { Status: "Scanned - ready", "Next action": "Find contact" }),
        Notes: note(recover ? `no replacement contact: ${contact}` : contact),
      });
      record({ domain, action: "skipped", reason: contact });
      out.skipped[domain] = contact;
      continue;
    }

    // Colleagues in other roles, each in their own thread. A failed lookup never blocks contact 1.
    let extras: RoleContact[] = [];
    if (!recover) {
      try {
        const own = roleFor(contact.title);
        const found = await findContacts(domain, [...exclude, contact.email], {
          ...(own ? { skip: [own] } : {}),
          hunter: false,
        });
        if (typeof found !== "string") extras = pickExtras(contact, found);
      } catch (error) {
        log(`       no extra contacts: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const team: { slot: Slot; c: Contact; role?: RoleContact["role"] }[] = [
      { slot: 1, c: contact, ...(roleFor(contact.title) ? { role: roleFor(contact.title)! } : {}) },
      ...extras.map((c, i) => ({ slot: (i + 2) as Slot, c, role: c.role })),
    ];

    // A link to their own report is the email's call to action, and its opens are the signal.
    // One report per person so an open says who looked. No key, or the scan fails: the email offers to send it.
    const links = await Promise.all(
      team.map((): Promise<string | undefined> =>
        reportApi ? reportLink(reportApi, domain, ev.latest, log) : Promise.resolve(undefined),
      ),
    );
    const reportUrl = links[0];
    const contactCols = {
      ...(reportUrl ? { "Report link": reportUrl } : {}),
      Contact: contact.fullName,
      Title: contact.title,
      Email: contact.email,
      "Email check": `${contact.verified} (${contact.source})`,
      // A replacement contact starts a fresh thread: old send dates belong to the bounced address.
      ...(recover ? { "First email": "", "Follow-up": "" } : {}),
      ...Object.assign(
        {},
        ...team.slice(1).map((m, i) => extraCols(m.slot, extras[i]!, links[i + 1])),
      ),
    } as Row;

    const results: { email: string; sent: boolean; why: string }[] = [];
    for (const [i, m] of team.entries()) {
      const others = team.filter((o) => o !== m).map((o) => o.c.fullName);
      const email = render({
        domain,
        firstName: m.c.firstName,
        ev,
        postalAddress: postal,
        ...(links[i] ? { reportUrl: links[i] } : {}),
        ...(m.role ? { role: m.role } : {}),
        alsoSent: others,
      });
      // Only proven addresses go out unattended; accept_all bounces burn a new domain.
      const canSend = sendMode && !pausedState && m.c.verified === "valid" && sentCount < cap;
      const tag = m.slot === 1 ? "" : `, contact ${String(m.slot)}`;
      try {
        if (canSend) {
          const id = await send(from, m.c.email, email);
          sentCount++;
          record({ domain, action: "sent", email: m.c.email, messageId: id });
          results.push({ email: m.c.email, sent: true, why: "sent" });
          log(`       sent to ${m.c.email}`);
        } else {
          const id = await createDraft(from, m.c.email, email);
          const why = !sendMode
            ? "draft mode"
            : pausedState
              ? "paused"
              : m.c.verified !== "valid"
                ? "accept_all address"
                : "daily cap";
          record({ domain, action: "drafted", email: m.c.email, messageId: id, reason: why + tag });
          results.push({ email: m.c.email, sent: false, why });
          log(`       drafted for ${m.c.email} (${why})`);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        record({ domain, action: "error", email: m.c.email, reason });
        // Contact 1 failing is the row's error; a colleague failing just drops that colleague.
        if (m.slot === 1) out.errors[domain] = reason;
        else log(`       contact ${String(m.slot)} failed: ${reason}`);
      }
    }

    const first = results.find((r) => r.email === contact.email);
    if (!first) continue;
    const who = team.length > 1 ? ` for ${String(team.length)} contacts` : "";
    if (first.sent) {
      await write({
        ...base(domain, ev),
        ...contactCols,
        Status: "Emailed",
        "First email": today,
        "Next action": "Follow up",
        "Next action date": nyDate(addBusinessDays(now, 5)),
        Notes: note(`sent${who}`),
      });
      out.sent.push(domain);
    } else {
      await write({
        ...base(domain, ev),
        ...contactCols,
        Status: "Scanned - ready",
        "Next action":
          team.length > 1 ? "Review Gmail drafts and send" : "Review Gmail draft and send",
        "Next action date": today,
        Notes: note(
          `drafted${who} (${first.why})${recover ? `, replacing bounced ${exclude.join(", ")}` : ""}`,
        ),
      });
      out.drafted.push(domain);
    }
  }
  out.sentToday = sentCount;
  if (fromSheet) {
    try {
      const restored = await repairTeam(sheetId, tab, sheet, log);
      if (restored.length) log(`restored colleagues: ${restored.join(", ")}`);
      out.colleagues = await draftTeam(
        sheetId,
        tab,
        sheet,
        readLedger(),
        { from, postalAddress: postal, limit, reportApi },
        log,
      );
    } catch (error) {
      out.errors["colleagues"] = error instanceof Error ? error.message : String(error);
    }
  }
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
      const sheet = await readSheet(sheetId, tab);
      const summary = await sync(sheetId, tab, sheet);
      const key = process.env["OUTREACH_API_KEY"];
      // Report opens: never let a failure here hide the replies.
      let opens: { reportOpens?: unknown; reportOpensError?: string } = {};
      if (key) {
        try {
          opens = {
            reportOpens: await recordOpens(
              sheetId,
              tab,
              sheet,
              cfg("OUTREACH_APP_URL", "https://www.getconsentinel.com"),
              key,
            ),
          };
        } catch (error) {
          opens = { reportOpensError: error instanceof Error ? error.message : String(error) };
        }
      }
      let inbound = {};
      if (key) {
        // Inbound is a bonus: a failure here must not hide the replies above.
        try {
          const now = new Date();
          const got = await fetchInbound(
            cfg("OUTREACH_APP_URL", "https://www.getconsentinel.com"),
            key,
            inboundSince(),
          );
          const ignore = (process.env["OUTREACH_IGNORE_EMAILS"] ?? "").split(",");
          inbound = {
            inquiries: got.inquiries.filter((i) => !isOwn(i.email, ignore)),
            prospectScans: got.leads
              .filter((l) => l.url && sheet.domains.has(normDomain(l.url)))
              .map((l) => ({ domain: normDomain(l.url ?? ""), email: l.email, at: l.createdAt })),
          };
          saveInboundSince(now);
        } catch (error) {
          inbound = { inboundError: error instanceof Error ? error.message : String(error) };
        }
      }
      console.log(JSON.stringify({ ...summary, ...inbound, ...opens }, null, 2));
      break;
    }
    case "queue": {
      const sheetId = cfg("OUTREACH_SHEET_ID");
      const tab = cfg("OUTREACH_SHEET_TAB", "Prospects");
      const sheet = await readSheet(sheetId, tab);
      const done = new Set([...sheet.domains, ...readLedger().map((e) => e.domain)]);
      const [sub = "status", ...rest] = args;
      if (sub === "add") {
        const list = (flag(rest, "--domains") ?? rest.join(",")).split(/[\s,]+/);
        const checks = await addToQueue(list, done);
        console.log(
          JSON.stringify({
            accepted: checks.filter((c) => c.ok).map((c) => c.domain),
            rejected: checks
              .filter((c) => !c.ok)
              .map((c) => ({ domain: c.input, reason: c.reason })),
            pending: readQueue().filter((d) => !done.has(d)).length,
          }),
        );
      } else if (sub === "known") {
        // Everything already worked or queued, so research can skip it up front.
        console.log([...new Set([...done, ...readQueue()])].sort().join("\n"));
      } else {
        const queued = readQueue();
        console.log(
          JSON.stringify({
            queued: queued.length,
            pending: queued.filter((d) => !done.has(d)).length,
          }),
        );
      }
      break;
    }
    case "brief": {
      const sheetId = cfg("OUTREACH_SHEET_ID");
      const tab = cfg("OUTREACH_SHEET_TAB", "Prospects");
      const now = new Date();
      const hours = Number(flag(args, "--hours") ?? windowHours(now));
      const key = process.env["OUTREACH_API_KEY"];
      const [sheet, metrics, drafts] = await Promise.all([
        readSheet(sheetId, tab),
        key
          ? fetchMetrics(
              cfg("OUTREACH_APP_URL", "https://www.getconsentinel.com"),
              key,
              hours,
            ).catch((e: unknown) => (e instanceof Error ? e.message : String(e)))
          : Promise.resolve("OUTREACH_API_KEY not set"),
        countDrafts().catch((e: unknown) => (e instanceof Error ? e.message : String(e))),
      ]);
      const ledger = readLedger();
      const done = new Set([...sheet.domains, ...ledger.map((e) => e.domain)]);
      console.log(
        renderBrief({
          now,
          hours,
          metrics,
          drafts,
          sheet,
          ledger,
          queuePending: readQueue().filter((d) => !done.has(d)).length,
          paused: paused(),
          lastCronAt: lastCronAt(),
        }),
      );
      break;
    }
    case "stats": {
      const sheetId = cfg("OUTREACH_SHEET_ID");
      const tab = cfg("OUTREACH_SHEET_TAB", "Prospects");
      console.log(JSON.stringify(computeStats((await readSheet(sheetId, tab)).rows), null, 2));
      break;
    }
    case "leads": {
      const sheetId = cfg("OUTREACH_SHEET_ID");
      const tab = cfg("OUTREACH_SHEET_TAB", "Prospects");
      const sheet = await readSheet(sheetId, tab);
      const now = new Date();
      const got = await fetchInbound(
        cfg("OUTREACH_APP_URL", "https://www.getconsentinel.com"),
        cfg("OUTREACH_API_KEY"),
        new Date(now.getTime() - 14 * 86_400_000),
      );
      const picked = pickLeads(got.leads, {
        now,
        sheet,
        ledger: readLedger(),
        ignore: (process.env["OUTREACH_IGNORE_EMAILS"] ?? "").split(","),
      });
      const drafted = await draftLeads(sheetId, tab, sheet, picked, {
        from: cfg("OUTREACH_FROM"),
        postalAddress: process.env["OUTREACH_POSTAL_ADDRESS"] ?? "",
        limit: Number(flag(args, "--limit") ?? "10"),
      });
      console.log(
        JSON.stringify({
          drafted,
          consentedLeads: got.leads.length,
          withoutConsent: got.leadsWithoutConsent,
        }),
      );
      break;
    }
    case "followups": {
      const sheetId = cfg("OUTREACH_SHEET_ID");
      const tab = cfg("OUTREACH_SHEET_TAB", "Prospects");
      const summary = await followups(sheetId, tab, await readSheet(sheetId, tab), {
        from: cfg("OUTREACH_FROM"),
        postalAddress: process.env["OUTREACH_POSTAL_ADDRESS"] ?? "",
        limit: Number(flag(args, "--limit") ?? "5"),
      });
      console.log(JSON.stringify(summary));
      break;
    }
    case "contacts": {
      const sheetId = cfg("OUTREACH_SHEET_ID");
      const tab = cfg("OUTREACH_SHEET_TAB", "Prospects");
      const sheet = await readSheet(sheetId, tab);
      // --team: colleagues for rows whose contact 1 is already drafted or emailed.
      const team = args.includes("--team");
      if (args[0] === "need" && team) {
        const limit = Number(flag(args, "--limit") ?? "5");
        console.log(JSON.stringify(teamNeedList(sheet.rows, nyDate(new Date()), limit)));
        break;
      }
      if (args[0] === "set" && team) {
        const result = await setTeam(sheetId, tab, sheet, {
          domain: flag(args, "--domain") ?? "",
          name: flag(args, "--name") ?? "",
          title: flag(args, "--title") ?? "",
          source: flag(args, "--source") ?? "",
        });
        console.log(JSON.stringify(result));
        break;
      }
      if (args[0] === "skip" && team) {
        const result = await skipTeam(sheetId, tab, sheet, {
          domain: flag(args, "--domain") ?? "",
          reason: flag(args, "--reason") ?? "",
        });
        console.log(JSON.stringify(result));
        break;
      }
      if (args[0] === "need") {
        const limit = Number(flag(args, "--limit") ?? "10");
        console.log(JSON.stringify(needList(sheet.rows, nyDate(new Date()), limit)));
        break;
      }
      if (args[0] === "set") {
        const result = await setContact(sheetId, tab, sheet, {
          domain: flag(args, "--domain") ?? "",
          name: flag(args, "--name") ?? "",
          title: flag(args, "--title") ?? "",
          source: flag(args, "--source") ?? "",
        });
        console.log(JSON.stringify(result));
        break;
      }
      if (args[0] === "skip") {
        const result = await skipContact(sheetId, tab, sheet, {
          domain: flag(args, "--domain") ?? "",
          reason: flag(args, "--reason") ?? "",
        });
        console.log(JSON.stringify(result));
        break;
      }
      throw new Error(
        "usage: outreach contacts need [--team] [--limit n] | contacts set [--team] --domain d --name n --title t --source url | contacts skip [--team] --domain d --reason r",
      );
    }
    case "retouch": {
      const sheetId = cfg("OUTREACH_SHEET_ID");
      const tab = cfg("OUTREACH_SHEET_TAB", "Prospects");
      const summary = await retouch(sheetId, tab, await readSheet(sheetId, tab), {
        from: cfg("OUTREACH_FROM"),
        postalAddress: process.env["OUTREACH_POSTAL_ADDRESS"] ?? "",
        limit: Number(flag(args, "--limit") ?? "5"),
      });
      console.log(JSON.stringify(summary));
      break;
    }
    case "prep": {
      const sheetId = cfg("OUTREACH_SHEET_ID");
      const tab = cfg("OUTREACH_SHEET_TAB", "Prospects");
      const domain = flag(args, "--domain");
      if (!domain) throw new Error("prep needs --domain");
      const result = await prep(sheetId, tab, await readSheet(sheetId, tab), domain, {
        from: cfg("OUTREACH_FROM"),
        apiBase: cfg("OUTREACH_APP_URL", "https://www.getconsentinel.com"),
        apiKey: cfg("OUTREACH_API_KEY"),
      });
      console.log(JSON.stringify(result));
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
        "usage: outreach run [--domains a,b | --file f | --from-sheet] [--send] [--limit n] | sync | followups [--limit n] | retouch [--limit n] | contacts need [--limit n] | contacts set --domain d --name n --title t --source url | prep --domain d | leads [--limit n] | queue add a,b | queue status | queue known | brief [--hours n] | stats | mark --domain d [--status s] [--next t] [--date d] [--note n] | status | pause | resume | auth",
      );
      process.exit(2);
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
