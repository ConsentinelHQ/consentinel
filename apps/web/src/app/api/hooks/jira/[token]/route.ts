import { NextResponse } from "next/server";
import {
  can,
  getBillingState,
  getJiraConnectionByHookToken,
  getTrackedJiraIssue,
  listActiveSites,
} from "@consentinel/db";
import { JIRA_ISSUE_KEY } from "@consentinel/notify";
import { enqueueScan } from "@consentinel/queue";
import { rateLimit } from "@/lib/rate-limit";
import { db, scanQueue } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Jira calls this when an issue moves to Done. Accepts a Jira Automation "Send web
 * request" (issue data or a custom {"issueKey": "{{issue.key}}"} body) and native
 * Jira webhooks. The token in the path is the credential.
 *
 * Which site: a ticket Consentinel opened knows its site. Otherwise ?site=<domain>
 * on the URL, or the org's only site.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ error: "Unknown Jira hook." }, { status: 404 });
  }
  const conn = await getJiraConnectionByHookToken(db(), token);
  if (!conn) return NextResponse.json({ error: "Unknown Jira hook." }, { status: 404 });

  if (!can(await getBillingState(db(), conn.orgId), "jira")) {
    return NextResponse.json({ error: "Jira is on the Growth and Agency plans." }, { status: 402 });
  }

  const body = (await request.json().catch(() => null)) as JiraPayload | null;
  const issueKey = (body?.issueKey ?? body?.issue?.key ?? "").trim().toUpperCase();
  if (!JIRA_ISSUE_KEY.test(issueKey)) {
    return NextResponse.json({ error: "No issue key in the request body." }, { status: 400 });
  }

  // Only Done. A rule scoped wider than intended, or a native webhook firing on
  // every edit, shouldn't burn scans.
  const category = body?.issue?.fields?.status?.statusCategory?.key;
  if (category !== undefined && category !== "done") {
    return NextResponse.json({ status: "ignored", reason: "issue isn't done" });
  }

  const url = new URL(request.url);
  const siteId = await resolveSite(conn.orgId, issueKey, url);
  if (!siteId) {
    const sites = (await listActiveSites(db(), conn.orgId)).map((s) => hostOf(s.url));
    const wanted = url.searchParams.get("site");
    const error =
      sites.length === 0
        ? "This org has no sites. Add one in Consentinel first."
        : wanted
          ? `No site matching ${wanted} in this org. Use one of: ${sites.join(", ")}`
          : `More than one site. Add ?site=<domain> to the hook URL, one of: ${sites.join(", ")}`;
    return NextResponse.json({ error }, { status: 422 });
  }

  // Jira retries and duplicate rules shouldn't stack scans for one ticket.
  const once = await rateLimit(`jira-issue:${conn.orgId}:${issueKey}`, 1, 300);
  if (!once.allowed) return NextResponse.json({ status: "duplicate" }, { status: 202 });
  // Generous for a busy sprint, a hard stop for a bulk transition.
  const limit = await rateLimit(`jira-hook:${conn.orgId}`, 60, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many Jira-triggered scans in the last hour." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const site = (await listActiveSites(db(), conn.orgId)).find((s) => s.id === siteId);
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });
  const result = await enqueueScan(db(), scanQueue(), site.url, {
    siteId: site.id,
    trigger: "jira",
    jiraIssueKey: issueKey,
  });
  if (result.status === "refused") {
    return NextResponse.json({ error: `Can't scan: ${result.reason}.` }, { status: 422 });
  }
  return NextResponse.json({ status: "queued", scanId: result.scan.id }, { status: 202 });
}

interface JiraPayload {
  issueKey?: string;
  issue?: { key?: string; fields?: { status?: { statusCategory?: { key?: string } } } };
}

function hostOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function resolveSite(orgId: string, issueKey: string, url: URL): Promise<string | null> {
  const sites = await listActiveSites(db(), orgId);
  const tracked = await getTrackedJiraIssue(db(), orgId, issueKey);
  if (tracked && sites.some((s) => s.id === tracked.siteId)) return tracked.siteId;

  const wanted = url.searchParams.get("site");
  if (wanted) {
    const host = hostOf(wanted.toLowerCase());
    return sites.find((s) => s.id === wanted || hostOf(s.url) === host)?.id ?? null;
  }
  return sites.length === 1 ? (sites[0]?.id ?? null) : null;
}
