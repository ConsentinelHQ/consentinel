import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  activePlan,
  countScansBefore,
  getBillingState,
  getSiteForOrg,
  HISTORY_SORTS,
  HISTORY_STATUSES,
  isEntitled,
  pageScansForSite,
  type HistoryRow,
} from "@consentinel/db";
import { HistoryControls } from "@/components/history-controls";
import { ScheduleControl } from "@/components/schedule-control";
import { ScanNowButton } from "@/components/scan-now-button";
import { NotifyToggle } from "@/components/notify-toggle";
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

const TRIGGERS = ["all", "scheduled", "manual", "deploy", "jira"] as const;
const SIZES = ["10", "20", "50", "all"] as const;
/** "Show all" still has a ceiling: a year of daily scans plus manual runs fits. */
const ALL_CAP = 1000;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const query = await searchParams;
  const sort = pick(query["sort"], HISTORY_SORTS, "newest");
  const status = pick(query["status"], HISTORY_STATUSES, "all");
  const trigger = pick(query["trigger"], TRIGGERS, "all");
  const per = pick(query["per"], SIZES, "20");
  const pageSize = per === "all" ? ALL_CAP : Number(per);
  const requestedPage = Math.max(1, Math.floor(Number(query["page"]) || 1));
  const session = await requireSession();

  const site = await getSiteForOrg(db(), siteId, session.orgId);
  if (!site) notFound();

  const billing = await getBillingState(db(), session.orgId);
  const entitled = isEntitled(billing);
  // History is kept for every plan; the plan sets how far back it shows.
  const historyDays = activePlan(billing)?.historyDays ?? 30;
  const since = new Date(Date.now() - historyDays * 86_400_000);

  // Latest scans regardless of filters: drive the in-flight state and the allowlist hint.
  const [recent, hidden, first] = await Promise.all([
    pageScansForSite(db(), { siteId, since: new Date(0), limit: 5, offset: 0 }),
    countScansBefore(db(), siteId, since),
    pageScansForSite(db(), {
      siteId,
      since,
      sort,
      status,
      trigger,
      limit: pageSize,
      offset: (requestedPage - 1) * pageSize,
    }),
  ]);
  const { total } = first;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  // A page past the end (filters narrowed, scans aged out) lands on the last real one.
  const page = Math.min(requestedPage, pages);
  const scans =
    page === requestedPage
      ? first.rows
      : (
          await pageScansForSite(db(), {
            siteId,
            since,
            sort,
            status,
            trigger,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          })
        ).rows;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const clearHref = `/app/sites/${siteId}${
    sort !== "newest" || per !== "20"
      ? `?${new URLSearchParams({
          ...(sort !== "newest" ? { sort } : {}),
          ...(per !== "20" ? { per } : {}),
        }).toString()}`
      : ""
  }#history`;

  const href = (p: number): string => {
    const qs = new URLSearchParams();
    if (sort !== "newest") qs.set("sort", sort);
    if (status !== "all") qs.set("status", status);
    if (trigger !== "all") qs.set("trigger", trigger);
    if (per !== "20") qs.set("per", per);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/app/sites/${siteId}${s ? `?${s}` : ""}#history`;
  };

  // Matches the API's 30-minute window: a scan stuck longer than that’s stalled,
  // not in flight, so it can never lock the Scan now button forever.
  const STALL_MS = 30 * 60 * 1000;
  const isActive = (scan: HistoryRow): boolean =>
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
        <ScanNowButton inFlight={recent.rows.some(isActive)} siteId={site.id} />
        <ScheduleControl entitled={entitled} schedule={site.schedule} siteId={site.id} />
        {site.schedule !== "off" && site.archivedAt === null && site.pausedAt === null && (
          <PauseScansButton paused={false} siteId={site.id} />
        )}
        <NotifyToggle />
      </div>

      <p className="quiet demand-site-link">
        Got a demand letter?{" "}
        <Link href={`/app/sites/${site.id}/demand`}>
          Build a response pack for the dates it claims
        </Link>
        {" · "}
        <Link href={`/app/sites/${site.id}/policy`}>Privacy policy history</Link>
      </p>

      <DeployHookPanel entitled={entitled} siteId={site.id} token={site.deployHookToken} />

      <AllowlistPanel open={recent.rows[0]?.blockedBy != null} token={site.scanToken} />

      <AutoRefresh active={recent.rows.some(isActive)} />

      <h2 className="section-label" id="history">
        Scan history
        <span className="quiet history-window">
          {" "}
          · last {historyDays === 365 ? "12 months" : `${String(historyDays)} days`}, sealed
        </span>
      </h2>

      {(total > 0 || status !== "all" || trigger !== "all") && (
        <div className="history-bar">
          <HistoryControls per={per} sort={sort} status={status} trigger={trigger} />
          <p className="quiet history-count">
            {total === 0
              ? "No scans match"
              : `${String(from)}-${String(to)} of ${String(total)} ${total === 1 ? "scan" : "scans"}`}
          </p>
        </div>
      )}

      {scans.length === 0 ? (
        <div className="empty">
          {status !== "all" || trigger !== "all" ? (
            <>
              <h2>No scans match these filters.</h2>
              <p className="quiet">
                <Link href={clearHref}>Clear filters</Link>
              </p>
            </>
          ) : (
            <>
              <h2>No scans yet.</h2>
              <p className="quiet">
                Run one now. The first scan becomes the baseline everything after it’s compared
                against.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="site-list history-list">
          {scans.map((scan) => (
            <li key={scan.id}>
              <Link className="site-row history-row" href={`/app/scans/${scan.id}`}>
                <span className="site-url">
                  {/* A queued scan has no finish time yet; show when it started. */}
                  {(() => {
                    const d = scan.finishedAt ?? scan.startedAt ?? scan.queuedAt;
                    return <LocalTime iso={d.toISOString()} />;
                  })()}
                </span>
                <span className="site-meta">
                  {scan.status === "complete"
                    ? `${String(scan.criticalCount)} critical`
                    : scan.status === "failed" && scan.blockedBy
                      ? blockedLabel(scan.blockedBy)
                      : (scan.status === "queued" || scan.status === "running") && !isActive(scan)
                        ? "stalled"
                        : scan.status}
                </span>
                <span className="site-meta history-a11y">
                  {scan.accessibilityScore !== null
                    ? `a11y ${String(scan.accessibilityScore)}`
                    : ""}
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

      {pages > 1 && (
        <nav aria-label="Scan history pages" className="pager">
          {page > 1 ? (
            <Link className="pager-step" href={href(page - 1)} scroll={false}>
              <span aria-hidden="true">←</span> Previous
            </Link>
          ) : (
            <span aria-disabled="true" className="pager-step is-disabled">
              <span aria-hidden="true">←</span> Previous
            </span>
          )}
          <ol className="pager-pages">
            {pageList(page, pages).map((p, i) =>
              p === null ? (
                <li aria-hidden="true" className="pager-gap" key={`gap-${String(i)}`}>
                  …
                </li>
              ) : (
                <li key={p}>
                  {p === page ? (
                    <span aria-current="page" className="pager-num is-current">
                      {p}
                    </span>
                  ) : (
                    <Link className="pager-num" href={href(p)} scroll={false}>
                      {p}
                    </Link>
                  )}
                </li>
              ),
            )}
          </ol>
          {page < pages ? (
            <Link className="pager-step" href={href(page + 1)} scroll={false}>
              Next <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <span aria-disabled="true" className="pager-step is-disabled">
              Next <span aria-hidden="true">→</span>
            </span>
          )}
        </nav>
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

/** 1 … 4 5 [6] 7 8 … 20: first, last, and two either side of the current page. */
function pageList(current: number, total: number): Array<number | null> {
  const keep = new Set([1, total]);
  for (let p = current - 2; p <= current + 2; p++) if (p > 1 && p < total) keep.add(p);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  for (const [i, p] of sorted.entries()) {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev > 1) out.push(p - prev === 2 ? prev + 1 : null);
    out.push(p);
  }
  return out;
}
