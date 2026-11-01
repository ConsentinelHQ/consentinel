import "server-only";
import { redis } from "./server";

/**
 * Daily counters for the free-scan funnel. Redis, not Postgres: no migration,
 * and a lost count costs nothing. Kept 45 days.
 */
export const FUNNEL_EVENTS = [
  "report_view",
  "cta_click",
  "notify_email",
  "checkout_start",
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

const TTL = 45 * 86_400;

function key(event: FunnelEvent, day: string): string {
  return `funnel:${event}:${day}`;
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Never throws: tracking must not break the page or the checkout. */
export async function recordFunnel(event: FunnelEvent, now = new Date()): Promise<void> {
  try {
    const k = key(event, day(now));
    const client = redis();
    const n = await client.incr(k);
    if (n === 1) await client.expire(k, TTL);
  } catch (error) {
    console.error("funnel count failed", { event, error });
  }
}

/** Totals per event over the last N days, today included. */
export async function readFunnel(
  days: number,
  now = new Date(),
): Promise<Record<FunnelEvent, number>> {
  const dates = Array.from({ length: days }, (_, i) =>
    day(new Date(now.getTime() - i * 86_400_000)),
  );
  const out = {} as Record<FunnelEvent, number>;
  const client = redis();
  for (const event of FUNNEL_EVENTS) {
    const values = await Promise.all(dates.map((d) => client.get(key(event, d))));
    out[event] = values.reduce<number>((sum, v) => sum + (Number(v) || 0), 0);
  }
  return out;
}
