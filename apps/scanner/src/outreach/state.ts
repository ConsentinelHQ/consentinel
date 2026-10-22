import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Local run state: an append-only ledger of every action and a pause flag.
 * The ledger is the source of truth for the daily cap and never-email-twice.
 */

export type Action = "sent" | "drafted" | "skipped" | "error";

export interface Entry {
  at: string;
  domain: string;
  action: Action;
  email?: string;
  reason?: string;
  messageId?: string;
}

export interface Paused {
  at: string;
  reason: string;
}

/** Repo root: pnpm exec runs from the package folder, so walk up to the workspace file. */
export function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
  return dir;
}

const dir = resolve(repoRoot(), ".outreach");
const ledgerFile = resolve(dir, "ledger.jsonl");
const pausedFile = resolve(dir, "paused.json");
const resumedFile = resolve(dir, "resumed-at");
const legacyDone = resolve(repoRoot(), "prospects.done");

function ensureDir(): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readLedger(): Entry[] {
  if (!existsSync(ledgerFile)) return [];
  return readFileSync(ledgerFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Entry);
}

export function record(entry: Omit<Entry, "at">): void {
  ensureDir();
  appendFileSync(ledgerFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

/** Domains the old prospect.ts flow already handled. */
export function legacyDomains(): Set<string> {
  if (!existsSync(legacyDone)) return new Set();
  return new Set(
    readFileSync(legacyDone, "utf8")
      .split("\n")
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function paused(): Paused | null {
  return existsSync(pausedFile) ? (JSON.parse(readFileSync(pausedFile, "utf8")) as Paused) : null;
}

export function pause(reason: string): void {
  ensureDir();
  writeFileSync(pausedFile, JSON.stringify({ at: new Date().toISOString(), reason }, null, 2));
}

/** Bounces before a resume were already reviewed, so the bounce check ignores them. */
export function resume(): void {
  ensureDir();
  rmSync(pausedFile, { force: true });
  writeFileSync(resumedFile, new Date().toISOString());
}

export function resumedAt(): Date | null {
  return existsSync(resumedFile) ? new Date(readFileSync(resumedFile, "utf8").trim()) : null;
}

// ---------- Pure rules (unit tested) ----------

/** Calendar date in New York, so "today" matches Charlie's day, not the server's. */
export function nyDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * A sheet date as YYYY-MM-DD. Sheets shows dates however the cell is formatted
 * ("2026-10-22", "10/22/2026", "2026-10-22 0:00:00"), so read them all.
 */
export function parseDay(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(v);
  if (us) {
    const year = us[3]!.length === 2 ? `20${us[3]}` : us[3]!;
    return `${year}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : nyDate(d);
}

/** Noon on that day, so business-day math never trips over a timezone edge. */
export function dayToDate(day: string): Date {
  return new Date(`${day}T12:00:00`);
}

export function sentToday(ledger: Entry[], now: Date): number {
  const today = nyDate(now);
  return ledger.filter((e) => e.action === "sent" && nyDate(new Date(e.at)) === today).length;
}

export function sentSince(ledger: Entry[], since: Date): number {
  return ledger.filter((e) => e.action === "sent" && new Date(e.at) >= since).length;
}

/**
 * Pause at 2+ bounces once they pass 3% of sends. Inbox providers start
 * throttling around 2-5%, and a fresh domain has no reputation to spend.
 */
export function shouldPause(sends: number, bounces: number): boolean {
  return bounces >= 2 && bounces / Math.max(sends, 1) > 0.03;
}

/** Follow-up date: 5 business days out, per the sheet's rule. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}
