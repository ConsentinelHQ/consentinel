import "server-only";
import { NextResponse } from "next/server";
import { can, getBillingState, type BillingState, type Feature } from "@consentinel/db";
import { db } from "@/lib/server";

/** Returns the billing state when the feature is on, or a 402 to send back. */
export async function gateFeature(
  orgId: string,
  feature: Feature,
): Promise<{ ok: true; billing: BillingState } | { ok: false; response: NextResponse }> {
  const billing = await getBillingState(db(), orgId);
  if (billing && can(billing, feature)) return { ok: true, billing };
  return {
    ok: false,
    response: NextResponse.json(
      { error: "This is part of the Agency plan.", upgrade: "/app/billing" },
      { status: 402 },
    ),
  };
}

const DOMAIN =
  /(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})(?:[/:?#]\S*)?/i;

/**
 * Pulls one domain per line out of pasted text or a CSV export. Takes the first
 * thing on each line that looks like a domain, so a "Client,Domain" spreadsheet
 * and a bare list both work. Emails are skipped: "jane@brand.com" isn't a site.
 */
export function parseDomainList(text: string, max = 200): string[] {
  const out = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    for (const cell of line.split(/[,;\t]/)) {
      const value = cell.trim().replace(/^"|"$/g, "");
      if (value === "" || value.includes("@")) continue;
      const m = DOMAIN.exec(value);
      if (m?.[1]) {
        out.add(m[1].toLowerCase().replace(/^www\./, ""));
        break;
      }
    }
    if (out.size >= max) break;
  }
  return [...out];
}

/** Runs async work with a fixed number in flight. DNS checks per domain add up. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      if (item !== undefined) results[i] = await fn(item);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Trims and caps free-text input; empty becomes null so "clear" works. */
export function cleanText(value: string | undefined | null, max: number): string | null {
  const v = (value ?? "").trim().slice(0, max);
  return v === "" ? null : v;
}
