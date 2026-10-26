import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { normDomain, updateRow, type Sheet, type SheetRow } from "./google.js";
import { nyDate, repoRoot } from "./state.js";
import { SLOTS, col, type Slot } from "./team.js";

/**
 * Report opens: the one signal we get before a reply. A prospect's email links
 * to their own report; every signed-out open of that link is counted by the web
 * app. This matches opens back to sheet rows and says which are new.
 */

export interface View {
  scanId: string;
  views: number;
  firstViewedAt: string;
  lastViewedAt: string;
}

export interface Open {
  domain: string;
  views: number;
  /** True the first time this report is ever opened. */
  first: boolean;
  /** Who the link was sent to, when the row names them. */
  who?: string;
  lastViewedAt: string;
}

const UUID = /\/report\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function scanIdFromLink(link: string): string | null {
  return UUID.exec(link)?.[1]?.toLowerCase() ?? null;
}

const seenFile = (): string => resolve(repoRoot(), ".outreach", "report-views.json");

interface Seen {
  /** scanId -> views already reported. */
  views: Record<string, number>;
  checkedAt?: string;
}

export function loadSeen(): Seen {
  try {
    return existsSync(seenFile())
      ? (JSON.parse(readFileSync(seenFile(), "utf8")) as Seen)
      : { views: {} };
  } catch {
    return { views: {} };
  }
}

export function saveSeen(seen: Seen): void {
  mkdirSync(resolve(repoRoot(), ".outreach"), { recursive: true });
  writeFileSync(seenFile(), JSON.stringify(seen));
}

export async function fetchViews(base: string, key: string, since: Date): Promise<View[]> {
  const res = await fetch(
    `${base.replace(/\/$/, "")}/api/internal/report-views?since=${encodeURIComponent(since.toISOString())}`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  const body = (await res.json().catch(() => ({}))) as { views?: View[]; error?: string };
  if (!res.ok || !body.views)
    throw new Error(body.error ?? `views API returned ${String(res.status)}`);
  return body.views;
}

/** Pure: which rows have opens we haven't reported yet. */
export function newOpens(
  rows: SheetRow[],
  views: View[],
  seen: Record<string, number>,
): { row: SheetRow; open: Open; scanId: string }[] {
  // Each contact has their own report, so the link that was opened says who opened it.
  const byScan = new Map<string, { row: SheetRow; slot: Slot }>();
  for (const row of rows) {
    for (const slot of [1, ...SLOTS] as Slot[]) {
      const id = scanIdFromLink(row.values[col("Report link", slot)] ?? "");
      if (id) byScan.set(id, { row, slot });
    }
  }
  const out: { row: SheetRow; open: Open; scanId: string }[] = [];
  for (const v of views) {
    const id = v.scanId.toLowerCase();
    const hit = byScan.get(id);
    const before = seen[id] ?? 0;
    if (!hit || v.views <= before) continue;
    const { row, slot } = hit;
    const who = (row.values[col("Contact", slot)] ?? "").trim();
    out.push({
      row,
      scanId: id,
      open: {
        domain: normDomain(row.values["Domain"] ?? ""),
        views: v.views,
        first: before === 0,
        lastViewedAt: v.lastViewedAt,
        ...(who ? { who } : {}),
      },
    });
  }
  return out;
}

/** Statuses where an open should bring the row to the top of Charlie's day. */
const WAITING = new Set(["Emailed", "Followed up", "Dead"]);

export async function recordOpens(
  sheetId: string,
  tab: string,
  sheet: Sheet,
  base: string,
  key: string,
  now = new Date(),
): Promise<Open[]> {
  const seen = loadSeen();
  // Look back a little past the last check so nothing slips between runs.
  const since = seen.checkedAt
    ? new Date(new Date(seen.checkedAt).getTime() - 3_600_000)
    : new Date(now.getTime() - 30 * 86_400_000);
  const views = await fetchViews(base, key, since);
  const today = nyDate(now);
  const opens: Open[] = [];
  for (const { row, open, scanId } of newOpens(sheet.rows, views, seen.views)) {
    const prior = row.values["Notes"] ?? "";
    const n = `${today}: outreach bot - report opened${open.who ? ` by ${open.who}` : ""} (${String(open.views)} ${open.views === 1 ? "view" : "views"})`;
    const status = row.values["Status"] ?? "";
    // Someone who said no stays closed, however often they open the link.
    const closedByThem = /unsubscribe|not interested|not now/i.test(prior);
    await updateRow(sheetId, tab, sheet.headers, row.rowNumber, {
      ...(WAITING.has(status) && !closedByThem
        ? {
            ...(status === "Dead" ? { Status: "Followed up" } : {}),
            "Next action": "Follow up: opened report",
            "Next action date": today,
          }
        : {}),
      Notes: prior ? `${prior} | ${n}` : n,
    });
    seen.views[scanId] = open.views;
    opens.push(open);
  }
  seen.checkedAt = now.toISOString();
  saveSeen(seen);
  return opens;
}
