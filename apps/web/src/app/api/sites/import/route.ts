import { NextResponse } from "next/server";
import { z } from "zod";
import { addSite, can, getBillingState, listOrgSiteRefs, setSitesClient } from "@consentinel/db";
import { assertScannableUrl } from "@consentinel/queue";
import { mapLimit } from "@/lib/agency";
import { requireSession } from "@/lib/auth";
import { displayHost } from "@/lib/format";
import { MAX_IMPORT_ROWS, parseImport, toDomain } from "@/lib/import-parse";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/server";
import { describePlan, fillSchedules, friendlyReason } from "@/lib/site-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const preview = z.object({
  mode: z.literal("preview"),
  text: z.string().max(500_000),
});

const commit = z.object({
  mode: z.literal("commit"),
  rows: z
    .array(z.object({ domain: z.string().max(253), client: z.string().max(120).nullable() }))
    .min(1)
    .max(MAX_IMPORT_ROWS),
  /** Applied to rows without their own client. */
  client: z.string().max(120).optional(),
  schedule: z.enum(["off", "daily", "weekly"]).default("off"),
});

const body = z.discriminatedUnion("mode", [preview, commit]);

export type PreviewStatus = "new" | "existing" | "restore" | "invalid";

export interface PreviewRow {
  domain: string;
  client: string | null;
  status: PreviewStatus;
  reason?: string;
}

/**
 * Bulk import for every signed-in account. Preview resolves each domain and
 * matches it against the org's sites so nothing is written until the customer
 * has seen the list; commit re-checks everything, since the client is untrusted.
 * Importing never scans, so this costs DNS lookups, not browser runs.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Send a list of domains." }, { status: 400 });
  }

  const limit = await rateLimit(`site-import:${parsed.data.mode}:${session.orgId}`, 20, 600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many imports in a row. Give it a few minutes." },
      { status: 429 },
    );
  }

  const database = db();
  const billing = await getBillingState(database, session.orgId);
  const canTagClient = can(billing, "workspaces");

  if (parsed.data.mode === "preview") {
    const { rows, truncated, skipped } = parseImport(parsed.data.text);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No domains found. Put one per line, or a column headed "domain".' },
        { status: 400 },
      );
    }

    const known = new Map(
      (await listOrgSiteRefs(database, session.orgId)).map((s) => [displayHost(s.url), s]),
    );
    const out = await mapLimit(rows, 8, async (row): Promise<PreviewRow> => {
      const client = canTagClient ? row.client : null;
      const existing = known.get(row.domain);
      if (existing) {
        return { domain: row.domain, client, status: existing.archived ? "restore" : "existing" };
      }
      const check = await assertScannableUrl(`https://${row.domain}`);
      return check.ok
        ? { domain: row.domain, client, status: "new" }
        : { domain: row.domain, client, status: "invalid", reason: friendlyReason(check.reason) };
    });

    return NextResponse.json({
      rows: out,
      truncated,
      skipped,
      canTagClient,
      plan: await describePlan(database, session.orgId, billing),
    });
  }

  // Commit.
  const { rows, schedule } = parsed.data;
  const fallbackClient = (parsed.data.client ?? "").trim();
  const failed: { domain: string; reason: string }[] = [];
  const saved = await mapLimit(rows, 8, async (row) => {
    const domain = toDomain(row.domain);
    if (!domain) {
      failed.push({ domain: row.domain, reason: "Not a domain" });
      return null;
    }
    const check = await assertScannableUrl(`https://${domain}`);
    if (!check.ok) {
      failed.push({ domain, reason: friendlyReason(check.reason) });
      return null;
    }
    try {
      const id = await addSite(database, session.orgId, check.url);
      const client = (row.client ?? "").trim() || fallbackClient;
      return { id, client };
    } catch {
      failed.push({ domain, reason: "Couldn't save this one" });
      return null;
    }
  });
  const ok = saved.filter((s): s is { id: string; client: string } => s !== null);
  const siteIds = ok.map((s) => s.id);

  if (canTagClient) {
    const byClient = new Map<string, string[]>();
    for (const s of ok) {
      if (s.client === "") continue;
      byClient.set(s.client, [...(byClient.get(s.client) ?? []), s.id]);
    }
    for (const [client, ids] of byClient) {
      await setSitesClient(database, session.orgId, ids, client);
    }
  }

  // Monitoring fills free slots in import order. What's left comes back as
  // overflow so the client can offer seats or checkout for exactly those sites.
  const { scheduled, overflow } =
    schedule === "off"
      ? { scheduled: [], overflow: [] }
      : await fillSchedules(database, session.orgId, billing, siteIds, schedule);

  return NextResponse.json({
    added: siteIds.length,
    siteIds,
    scheduled: scheduled.length,
    overflow,
    failed,
    plan: overflow.length > 0 ? await describePlan(database, session.orgId, billing) : null,
  });
}
