import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { joinNames } from "./evidence.js";
import { normDomain, type Sheet } from "./google.js";
import { nyDate, parseDay, repoRoot, type Entry, type Paused } from "./state.js";

/**
 * The morning brief: one Slack message with everything Charlie needs before
 * the day starts. Built entirely from data; Claw posts it word for word.
 */

export interface Metrics {
  hours: number;
  users: { total: number; new: number };
  revenue: { estMrr: number; paying: number; pastDue: number; byPlan: Record<string, number> };
  monitoredSites: number;
  scans: Record<string, { total: number; failed: number }>;
  failedCustomerScans: { url: string; trigger: string; reason: string }[];
  leads: { total: number; consented: number };
  inquiries: number;
}

export async function fetchMetrics(base: string, key: string, hours: number): Promise<Metrics> {
  const res = await fetch(
    `${base.replace(/\/$/, "")}/api/internal/metrics?hours=${String(hours)}`,
    {
      headers: { Authorization: `Bearer ${key}` },
    },
  );
  const body = (await res.json().catch(() => ({}))) as Metrics & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `metrics API returned ${String(res.status)}`);
  return body;
}

/** Monday covers the weekend. */
export function windowHours(now: Date): number {
  const day = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
  return day === 1 ? 72 : 24;
}

const CLOSED = new Set(["Dead", "Customer"]);

export interface BriefInput {
  now: Date;
  hours: number;
  metrics: Metrics | string;
  drafts: number | string;
  sheet: Sheet;
  ledger: Entry[];
  queuePending: number;
  paused: Paused | null;
  /** When the 2am job last wrote its log, if ever. */
  lastCronAt: Date | null;
}

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${String(n)} ${n === 1 ? one : many}`;

export function renderBrief(b: BriefInput): string {
  const lines: string[] = [];
  const today = nyDate(b.now);
  const dayName = b.now.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const span = b.hours === 24 ? "24h" : `${String(b.hours)}h`;
  lines.push(`*Consentinel - ${dayName}*`);

  // Business
  if (typeof b.metrics === "string") {
    lines.push(`Business numbers unavailable: ${b.metrics}`);
  } else {
    const m = b.metrics;
    const plans = Object.entries(m.revenue.byPlan)
      .map(([name, n]) => `${String(n)} ${name}`)
      .join(", ");
    lines.push(
      `*Revenue:* $${m.revenue.estMrr.toLocaleString("en-US")} est. MRR, ${plural(m.revenue.paying, "paying customer")}${plans ? ` (${plans})` : ""}${m.revenue.pastDue ? `, *${String(m.revenue.pastDue)} past due*` : ""}`,
    );
    const free = m.scans["public"]?.total ?? 0;
    const sched = m.scans["scheduled"]?.total ?? 0;
    lines.push(
      `*Product (${span}):* ${plural(m.users.new, "signup")} (${String(m.users.total)} total), ${plural(free, "free scan")}, ${plural(sched, "scheduled scan")} across ${plural(m.monitoredSites, "monitored site")}`,
    );
    lines.push(
      `*Inbound (${span}):* ${plural(m.leads.total, "lead")} (${String(m.leads.consented)} consented), ${plural(m.inquiries, "inquiry", "inquiries")}`,
    );
  }

  // Outreach activity in the window
  const since = b.now.getTime() - b.hours * 3_600_000;
  const recent = b.ledger.filter((e) => Date.parse(e.at) >= since);
  const drafted = recent.filter((e) => e.action === "drafted");
  const firsts = drafted.filter((e) => !e.reason || !/follow-up|inbound/.test(e.reason)).length;
  const followUps = drafted.filter((e) => /^follow-up/.test(e.reason ?? "")).length;
  const leadNotes = drafted.filter((e) => e.reason === "inbound lead").length;
  const sent = recent.filter((e) => e.action === "sent").length;
  lines.push(
    `*Outreach:* ${typeof b.drafts === "number" ? `${plural(b.drafts, "draft")} waiting in Gmail` : `drafts unavailable (${b.drafts})`}. Last ${span}: ${plural(firsts, "first email")}, ${plural(followUps, "follow-up")}, ${plural(leadNotes, "lead note")} drafted${sent ? `, ${String(sent)} auto-sent` : ""}`,
  );

  // Pipeline from the sheet
  const status = (s: string): number => b.sheet.rows.filter((r) => r.values["Status"] === s).length;
  const ready = b.sheet.rows.filter((r) => {
    const t = Number(r.values["Tier"]);
    return (
      r.values["Status"] === "Scanned - ready" && !r.values["First email"] && (t === 1 || t === 2)
    );
  }).length;
  lines.push(
    `*Pipeline:* ${String(status("Emailed"))} emailed, ${String(status("Followed up"))} followed up, ${String(status("Replied"))} replied, ${String(status("Meeting"))} meeting, ${String(status("Customer"))} customer. Backlog ${String(ready)}, discovery queue ${String(b.queuePending)}`,
  );

  // Needs Charlie
  const overdue = b.sheet.rows
    .filter((r) => {
      const day = parseDay(r.values["Next action date"]);
      const action = (r.values["Next action"] ?? "").trim();
      return day !== null && day <= today && action && !CLOSED.has(r.values["Status"] ?? "");
    })
    .filter(
      // Routine work the 2am job handles on its own.
      (r) =>
        !/review .*draft|follow up|close if no reply|mark dead/i.test(
          r.values["Next action"] ?? "",
        ),
    )
    .slice(0, 6)
    .map((r) => `${normDomain(r.values["Domain"] ?? "")} (${r.values["Next action"] ?? ""})`);
  if (overdue.length) lines.push(`*Needs you:* ${overdue.join(", ")}`);

  // Problems
  const warnings: string[] = [];
  if (typeof b.metrics !== "string" && b.metrics.failedCustomerScans.length) {
    // One entry per site and reason, with a count, so a repeat failure reads once.
    const grouped = new Map<string, number>();
    for (const x of b.metrics.failedCustomerScans) {
      const k = `${normDomain(x.url)} (${x.reason})`;
      grouped.set(k, (grouped.get(k) ?? 0) + 1);
    }
    const f = [...grouped.entries()]
      .slice(0, 3)
      .map(([k, n]) => (n > 1 ? `${k} x${String(n)}` : k));
    warnings.push(
      `${plural(b.metrics.failedCustomerScans.length, "customer scan")} failed: ${joinNames(f)}`,
    );
  }
  if (b.paused) warnings.push(`outreach sending is paused: ${b.paused.reason}`);
  // The job runs at 2am New York time, so a log written today means it ran.
  const weekday = !["Sat", "Sun"].includes(dayName.slice(0, 3));
  if (weekday && (!b.lastCronAt || nyDate(b.lastCronAt) !== today)) {
    warnings.push("the 2am outreach job didn't run (check the M2 is awake)");
  }
  if (warnings.length) lines.push(`*Problems:* ${warnings.join("; ")}`);

  return lines.join("\n");
}

export function lastCronAt(): Date | null {
  const log = resolve(repoRoot(), ".outreach", "cron.log");
  return existsSync(log) ? statSync(log).mtime : null;
}
