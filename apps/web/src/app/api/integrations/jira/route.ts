import { NextResponse } from "next/server";
import {
  can,
  deleteJiraConnection,
  getBillingState,
  saveJiraConnection,
  setJiraAutoCreate,
} from "@consentinel/db";
import { JIRA_PROJECT_KEY, checkJira, normaliseJiraUrl } from "@consentinel/notify";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function gate(orgId: string): Promise<NextResponse | null> {
  if (can(await getBillingState(db(), orgId), "jira")) return null;
  return NextResponse.json({ error: "Jira is on the Growth and Agency plans." }, { status: 402 });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Connect or replace. Credentials are tested against Jira before anything is saved. */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const denied = await gate(session.orgId);
  if (denied) return denied;

  const data = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const baseUrl = normaliseJiraUrl(str(data.url));
  const email = str(data.email);
  const apiToken = str(data.apiToken);
  const projectKey = str(data.projectKey).toUpperCase();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Use your Jira Cloud URL, like yourcompany.atlassian.net" },
      { status: 400 },
    );
  }
  if (!/^\S+@\S+\.\S+$/.test(email) || apiToken.length < 10) {
    return NextResponse.json(
      { error: "Enter the Jira account email and an API token." },
      { status: 400 },
    );
  }
  if (!JIRA_PROJECT_KEY.test(projectKey)) {
    return NextResponse.json({ error: "Project key looks like WEB or SHOP." }, { status: 400 });
  }

  const check = await checkJira({ baseUrl, email, apiToken }, projectKey);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  await saveJiraConnection(db(), session.orgId, {
    baseUrl,
    email,
    apiToken,
    projectKey,
    issueTypeId: check.issueTypeId,
    issueTypeName: check.issueTypeName,
    autoCreate: data.autoCreate !== false,
  });
  return NextResponse.json({
    ok: true,
    project: check.projectName,
    issueType: check.issueTypeName,
  });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const denied = await gate(session.orgId);
  if (denied) return denied;
  const data = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (typeof data.autoCreate !== "boolean") {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  await setJiraAutoCreate(db(), session.orgId, data.autoCreate);
  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  const session = await requireSession();
  await deleteJiraConnection(db(), session.orgId);
  return NextResponse.json({ ok: true });
}
