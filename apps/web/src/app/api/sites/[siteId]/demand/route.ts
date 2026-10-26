import { NextResponse } from "next/server";
import {
  activePlan,
  can,
  getBillingState,
  getDemandPack,
  policyVersionsInWindow,
  verifyPolicyText,
} from "@consentinel/db";
import { buildTimeline } from "@consentinel/shared";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { displayHost } from "@/lib/format";
import { parseRange } from "@/lib/demand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The pack as data: every record exactly as hashed, plus the timeline built from them. */
export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  const { siteId } = await context.params;
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Sign in to download evidence." }, { status: 401 });
  }
  const billing = await getBillingState(db(), session.orgId);
  if (!can(billing, "pdfExport")) {
    return NextResponse.json({ error: "Demand letter packs are on Growth." }, { status: 402 });
  }
  const q = new URL(request.url).searchParams;
  const range = parseRange(
    { from: q.get("from") ?? undefined, to: q.get("to") ?? undefined },
    activePlan(billing)?.historyDays ?? 30,
  );
  const pack = await getDemandPack(db(), siteId, session.orgId, range.from, range.to);
  if (!pack) return NextResponse.json({ error: "Site not found." }, { status: 404 });

  const timeline = buildTimeline(
    pack.scans.map((s) => ({
      id: s.scan.id,
      finishedAt: s.scan.finishedAt!,
      result: s.scan.result!,
    })),
    range.from,
    range.to,
  );
  const body = {
    format: "consentinel-demand-pack/1",
    site: { id: pack.siteId, url: pack.siteUrl, label: pack.siteLabel },
    window: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      timeZone: "America/New_York",
    },
    truncated: pack.truncated,
    coverage: timeline.coverage,
    vendors: timeline.vendors,
    outsideWindow: timeline.outside,
    seal: {
      algorithm: "sha256",
      version: 1,
      hashed: "canonical JSON (keys sorted) of {v, scanId, url, finishedAt, prevHash, result}",
    },
    policyVersions: (await policyVersionsInWindow(db(), pack.siteId, range.from, range.to)).map(
      (p) => ({
        kind: p.kind,
        url: p.url,
        firstSeenAt: p.firstSeenAt.toISOString(),
        lastSeenAt: p.lastSeenAt.toISOString(),
        sha256: p.sha256,
        textMatchesHash: verifyPolicyText(p),
        hashed: "sha256 of the text with whitespace collapsed to single spaces and trimmed",
        text: p.text,
      }),
    ),
    records: pack.scans.map(({ scan, seal, chain }) => ({
      scanId: scan.id,
      url: scan.url,
      finishedAt: scan.finishedAt?.toISOString() ?? null,
      seal: { state: seal.state, chain, hash: scan.evidenceHash, prevHash: scan.prevEvidenceHash },
      result: scan.result,
    })),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="consentinel-demand-pack-${displayHost(pack.siteUrl)}-${range.fromDay}-to-${range.toDay}.json"`,
    },
  });
}
