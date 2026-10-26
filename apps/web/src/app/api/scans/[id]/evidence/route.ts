import { NextResponse } from "next/server";
import { can, getBillingState, getEvidencePack } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { displayHost } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The raw sealed record: exactly what was hashed, so anyone can re-verify it. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Sign in to download evidence." }, { status: 401 });
  }
  const pack = await getEvidencePack(db(), id, session.orgId);
  if (!pack) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  if (!can(await getBillingState(db(), session.orgId), "pdfExport")) {
    return NextResponse.json({ error: "Evidence downloads are on Growth." }, { status: 402 });
  }
  const { scan } = pack;
  const body = {
    format: "consentinel-evidence/1",
    seal: {
      algorithm: "sha256",
      version: 1,
      state: pack.seal.state,
      chain: pack.chain,
      hash: scan.evidenceHash,
      prevHash: scan.prevEvidenceHash,
      hashed: "canonical JSON (keys sorted) of {v, scanId, url, finishedAt, prevHash, result}",
    },
    scanId: scan.id,
    url: scan.url,
    finishedAt: scan.finishedAt?.toISOString() ?? null,
    result: scan.result,
  };
  const day = (scan.finishedAt ?? new Date()).toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="consentinel-evidence-${displayHost(scan.url)}-${day}.json"`,
    },
  });
}
