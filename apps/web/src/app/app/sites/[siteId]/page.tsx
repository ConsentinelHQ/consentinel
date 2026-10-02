import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBillingState, getSiteForOrg, isEntitled, listScansForSite } from "@consentinel/db";
import { ScheduleControl } from "@/components/schedule-control";
import { ScanNowButton } from "@/components/scan-now-button";
import { ScanProgress } from "@/components/scan-progress";
import { AutoRefresh } from "@/components/auto-refresh";
import { LocalTime } from "@/components/local-time";
import { AllowlistPanel } from "@/components/allowlist-panel";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "Site" };
export const dynamic = "force-dynamic";

function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const session = await requireSession();

  const site = await getSiteForOrg(db(), siteId, session.orgId);
  if (!site) notFound();

  const scans = await listScansForSite(db(), siteId, 20);
  const entitled = isEntitled(await getBillingState(db(), session.orgId));

  return (
    <div className="wrap app-content">
      <p className="quiet">
        <Link href="/app">Sites</Link>
      </p>

      <div className="app-head">
        <h1>{site.label ?? displayHost(site.url)}</h1>
        <p className="quiet">{site.url}</p>
      </div>

      <div className="site-actions">
        <ScanNowButton siteId={site.id} />
        <ScheduleControl entitled={entitled} schedule={site.schedule} siteId={site.id} />
      </div>

      <AllowlistPanel open={scans[0]?.blockedBy != null} token={site.scanToken} />

      <AutoRefresh active={scans.some((s) => s.status === "queued" || s.status === "running")} />

      <h2 className="section-label">Scan history</h2>

      {scans.length === 0 ? (
        <div className="empty">
          <h2>No scans yet.</h2>
          <p className="quiet">
            Run one now. The first scan becomes the baseline everything after it is compared
            against.
          </p>
        </div>
      ) : (
        <ul className="site-list">
          {scans.map((scan) => (
            <li key={scan.id}>
              <Link className="site-row" href={`/app/scans/${scan.id}`}>
                <span className="site-url">
                  {/* A queued scan has no finish time yet; show when it started. */}
                  {(() => {
                    const d = scan.finishedAt ?? scan.startedAt;
                    return d ? <LocalTime iso={d.toISOString()} /> : "just now";
                  })()}
                </span>
                <span className="site-meta">
                  {scan.status === "complete"
                    ? `${String(scan.criticalCount ?? 0)} critical`
                    : scan.status === "failed" && scan.blockedBy
                      ? `Blocked by ${scan.blockedBy.charAt(0).toUpperCase()}${scan.blockedBy.slice(1)}`
                      : scan.status}
                </span>
                <span className="site-schedule">{scan.trigger}</span>
                {(scan.status === "queued" || scan.status === "running") && (
                  <ScanProgress status={scan.status} />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
