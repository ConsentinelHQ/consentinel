import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addSite,
  countMonitoredSites,
  getSiteForOrg,
  isEntitled,
  setSiteSchedule,
  setSitesClient,
  siteLimit,
} from "@consentinel/db";
import { assertScannableUrl } from "@consentinel/queue";
import { cleanText, gateFeature, mapLimit, parseDomainList } from "@/lib/agency";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PER_IMPORT = 200;

const body = z.object({
  /** Pasted list or raw CSV text. Parsed server-side so both entry points agree. */
  text: z.string().max(200_000),
  client: z.string().max(120).optional(),
  schedule: z.enum(["off", "daily", "weekly"]).default("off"),
});

interface Failure {
  domain: string;
  reason: string;
}

/**
 * Bulk import for agencies. Re-importing a domain that already exists retags it
 * with the client rather than erroring, so importing a client's list twice is safe.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const gate = await gateFeature(session.orgId, "workspaces");
  if (!gate.ok) return gate.response;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Send a list of domains." }, { status: 400 });
  }

  const domains = parseDomainList(parsed.data.text, MAX_PER_IMPORT);
  if (domains.length === 0) {
    return NextResponse.json({ error: "No domains found in that list." }, { status: 400 });
  }

  const database = db();
  const failed: Failure[] = [];
  const added = (
    await mapLimit(domains, 8, async (domain) => {
      const check = await assertScannableUrl(`https://${domain}`);
      if (!check.ok) {
        failed.push({ domain, reason: check.reason });
        return null;
      }
      try {
        return await addSite(database, session.orgId, check.url);
      } catch {
        failed.push({ domain, reason: "Couldn’t save this one." });
        return null;
      }
    })
  ).filter((id): id is string => id !== null);

  const client = cleanText(parsed.data.client, 120);
  if (client !== null) await setSitesClient(database, session.orgId, added, client);

  // Monitoring fills free slots in import order and reports the rest, rather than
  // failing the whole import because the plan covers 25 and the list had 30.
  let scheduled = 0;
  let overLimit = 0;
  if (parsed.data.schedule !== "off" && isEntitled(gate.billing)) {
    let free = siteLimit(gate.billing) - (await countMonitoredSites(database, session.orgId));
    for (const id of added) {
      const site = await getSiteForOrg(database, id, session.orgId);
      if (!site || site.schedule !== "off") continue;
      if (free <= 0) {
        overLimit++;
        continue;
      }
      await setSiteSchedule(database, id, session.orgId, parsed.data.schedule);
      scheduled++;
      free--;
    }
  }

  return NextResponse.json({
    added: added.length,
    scheduled,
    overLimit,
    failed,
    truncated: domains.length >= MAX_PER_IMPORT,
  });
}
