import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { activePlan, can, getBillingState, getDemandPack, getSiteForOrg } from "@consentinel/db";
import { DemandPackView } from "@/components/demand-pack-view";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { displayHost } from "@/lib/format";
import { parseRange } from "@/lib/demand";

export const metadata: Metadata = { title: "Demand letter pack" };
export const dynamic = "force-dynamic";

/**
 * Everything a lawyer needs when a demand letter claims tracking on a date:
 * every sealed scan around it, which vendors fired after opt-out and when they
 * stopped, and proof none of the records changed.
 */
export default async function DemandPackPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { siteId } = await params;
  const session = await requireSession();
  const site = await getSiteForOrg(db(), siteId, session.orgId);
  if (!site) notFound();
  const host = site.label ?? displayHost(site.url);
  const back = (
    <p className="quiet">
      <Link href={`/app/sites/${site.id}`}>
        <span aria-hidden="true">←</span> {host}
      </Link>
    </p>
  );

  const billing = await getBillingState(db(), session.orgId);
  if (!can(billing, "pdfExport")) {
    return (
      <div className="wrap app-content">
        {back}
        <div className="empty">
          <h2>Demand letter packs are on Growth.</h2>
          <p className="quiet">
            Pick the date a letter claims, and get every sealed scan around it: which vendors fired
            after a visitor opted out, when each one stopped, and proof the records haven’t changed.
            It’s what your lawyer asks for first.
          </p>
          <p style={{ marginTop: "1rem" }}>
            <Link className="nav-cta" href="/app/billing">
              See Growth
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const historyDays = activePlan(billing)?.historyDays ?? 30;
  const range = parseRange(await searchParams, historyDays);
  const pack = await getDemandPack(db(), site.id, session.orgId, range.from, range.to);
  if (!pack) notFound();

  return (
    <DemandPackView back={back} historyDays={historyDays} host={host} pack={pack} range={range} />
  );
}
