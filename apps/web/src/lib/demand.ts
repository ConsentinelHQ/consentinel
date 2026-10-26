/** Claimed-date windows for the demand-letter pack, in Eastern time. */

const DAY = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Offset of America/New_York from UTC at an instant, in minutes (e.g. -240). */
function etOffset(at: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!m) return -300;
  const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -mins : mins;
}

/** Midnight Eastern at the start of a YYYY-MM-DD day. */
export function etStart(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  return new Date(guess.getTime() - etOffset(new Date(guess.getTime() + 12 * 3_600_000)) * 60_000);
}

/** The last millisecond of a YYYY-MM-DD day, Eastern. */
export function etEnd(day: string): Date {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return new Date(etStart(next.toISOString().slice(0, 10)).getTime() - 1);
}

export function etDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(at);
}

export interface Range {
  fromDay: string;
  toDay: string;
  from: Date;
  to: Date;
  /** The start was moved forward to the plan's history limit. */
  clamped: boolean;
  earliestDay: string;
}

/**
 * From the query string, defaulting to the last 30 days. Swapped if reversed,
 * clamped to the plan's history, never in the future.
 */
export function parseRange(
  params: { from?: string | string[] | undefined; to?: string | string[] | undefined },
  historyDays: number,
  now = new Date(),
): Range {
  const pick = (v: string | string[] | undefined): string | null => {
    const s = Array.isArray(v) ? v[0] : v;
    return s && ISO_DAY.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
  };
  const today = etDay(now);
  const earliestDay = etDay(new Date(now.getTime() - historyDays * DAY));
  let toDay = pick(params.to) ?? today;
  let fromDay = pick(params.from) ?? etDay(new Date(etStart(toDay).getTime() - 30 * DAY));
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];
  if (toDay > today) toDay = today;
  let clamped = false;
  if (fromDay < earliestDay) {
    fromDay = earliestDay;
    clamped = true;
  }
  if (fromDay > toDay) fromDay = toDay;
  return { fromDay, toDay, from: etStart(fromDay), to: etEnd(toDay), clamped, earliestDay };
}

/** "October 5, 2026" */
export function longDay(at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(at);
}
