import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  activePlan,
  getBillingState,
  getSiteForOrg,
  isEntitled,
  listScansForSite,
} from "@consentinel/db";
import { ScheduleControl } from "@/components/schedule-control";
import { ScanNowButton } from "@/components/scan-now-button";
import { ScanProgress } from "@/components/scan-progress";
import { AutoRefresh } from "@/components/auto-refresh";
import { LocalTime } from "@/components/local-time";
import { AllowlistPanel } from "@/components/allowlist-panel";
import { DeployHookPanel } from "@/components/deploy-hook-panel";
import { ArchiveSiteButton } from "@/components/archive-site-button";
import { PauseScansButton } from "@/components/pause-scans-button";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { blockedLabel, displayHost } from "@/lib/format";

export const metadata: Metadata = { title: "Site" };
export const dynamic = "force-dynamic";

export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const session = await requireSession();

  const site = await getSiteForOrg(db(), siteId, session.orgId);
  if (!site) notFound();

  const billing = await getBillingState(db(), session.orgId);
  const entitled = isEntitled(billing);
  // History is kept for every plan; the plan sets how far back it shows.
  const historyDays = activePlan(billing)?.historyDays ?? 30;
  const cutoff = Date.now() - historyDays * 86_400_000;
  const all = await listScansForSite(db(), siteId, 400);
  const scans = all.filter((s) => (s.finishedAt ?? s.queuedAt).getTime() >= cutoff).slice(0, 60);
  const hidden =
    all.length - all.filter((s) => (s.finishedAt ?? s.queuedAt).getTime() >= cutoff).length;

  // Matches the API's 30-minute window: a scan stuck longer than that’s stalled,
  // not in flight, so it can never lock the Scan now button forever.
  const STALL_MS = 30 * 60 * 1000;
  const isActive = (scan: (typeof scans)[number]): boolean =>
    (scan.status === "queued" || scan.status === "running") &&
    Date.now() - (scan.queuedAt ?? scan.startedAt ?? new Date()).getTime() < STALL_MS;

  return (
    <div className="wrap app-content">
      <p className="quiet">
        <Link href="/app/sites">
          <span aria-hidden="true">←</span> Sites
        </Link>
      </p>

      <div className="app-head">
        <h1>{site.label ?? displayHost(site.url)}</h1>
        <p className="quiet">{site.url}</p>
      </div>

      {site.archivedAt !== null && (
        <div className="archived-banner">
          <span>
            This site is archived. Scheduled scans are off and it’s hidden from your list.
          </span>
          <ArchiveSiteButton archived host={displayHost(site.url)} siteId={site.id} />
        </div>
      )}

      {site.pausedAt !== null && site.archivedAt === null && site.schedule !== "off" && (
        <div className="archived-banner">
          <span>
            Scheduled scans have been paused since{" "}
            {site.pausedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Scan
            now still works.
          </span>
          <PauseScansButton paused siteId={site.id} />
        </div>
      )}

      <div className="site-actions">
        <ScanNowButton inFlight={scans.some(isActive)} siteId={site.id} />
        <ScheduleControl entitled={entitled} schedule={site.schedule} siteId={site.id} />
        {site.schedule !== "off" && site.archivedAt === null && site.pausedAt === null && (
          <PauseScansButton paused={false} siteId={site.id} />
        )}
      </div>

      <p className="quiet demand-site-link">
        Got a demand letter?{" "}
        <Link href={`/app/sites/${site.id}/demand`}>
          Build a response pack for the dates it claims
        </Link>
      </p>

      <DeployHookPanel entitled={entitled} siteId={site.id} token={site.deployHookToken} />

      <AllowlistPanel open={scans[0]?.blockedBy != null} token={site.scanToken} />

      <AutoRefresh active={scans.some(isActive)} />

      <h2 className="section-label">
        Scan history
        <span className="quiet history-window">
          {" "}
          · last {historyDays === 365 ? "12 months" : `${String(historyDays)} days`}, sealed
        </span>
      </h2>

      {scans.length === 0 ? (
        <div className="empty">
          <h2>No scans yet.</h2>
          <p className="quiet">
            Run one now. The first scan becomes the baseline everything after it’s compared against.
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
                    const d = scan.finishedAt ?? scan.startedAt ?? scan.queuedAt;
                    return d ? <LocalTime iso={d.toISOString()} /> : "just now";
                  })()}
                </span>
                <span className="site-meta">
                  {scan.status === "complete"
                    ? `${String(scan.criticalCount ?? 0)} critical`
                    : scan.status === "failed" && scan.blockedBy
                      ? blockedLabel(scan.blockedBy)
                      : (scan.status === "queued" || scan.status === "running") && !isActive(scan)
                        ? "stalled"
                        : scan.status}
                </span>
                <span className="site-schedule">{scan.trigger}</span>
                {isActive(scan) && (
                  <ScanProgress
                    key={scan.status}
                    since={(
                      (scan.status === "running" ? scan.startedAt : scan.queuedAt) ?? new Date()
                    ).toISOString()}
                    status={scan.status}
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <p className="quiet history-more">
          {hidden} older {hidden === 1 ? "scan is" : "scans are"} kept and sealed.{" "}
          <Link href="/app/billing">Growth shows 12 months of history.</Link>
        </p>
      )}

      {site.archivedAt === null && (
        <div className="site-archive">
          <p className="quiet">
            Archiving stops scans and removes the site from your list. Reports and shared links keep
            working. Add the URL again any time to restore it with its history.
          </p>
          <ArchiveSiteButton archived={false} host={displayHost(site.url)} siteId={site.id} />
        </div>
      )}
    </div>
  );
}
