import type { Metadata } from "next";
import Link from "next/link";
import { listSitesForOrg } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

type Site = Awaited<ReturnType<typeof listSitesForOrg>>[number];

// Archived sites stay out of every count.
function isLive(site: Site): boolean {
  const archived = (site as { archivedAt?: unknown }).archivedAt;
  return archived === null || archived === undefined;
}

function crit(site: Site): number {
  return site.lastStatus === "complete" ? (site.lastCritical ?? 0) : 0;
}

function time(site: Site): number {
  return site.lastScanAt === null ? 0 : new Date(site.lastScanAt).getTime();
}

function ago(at: number): string {
  if (at === 0) return "never";
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${String(mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${String(hours)}h ago`;
  return `${String(Math.round(hours / 24))}d ago`;
}

function statusLabel(site: Site): string {
  if (site.lastStatus === null) return "never scanned";
  if (site.lastStatus !== "complete") return site.lastStatus;
  const n = site.lastCritical ?? 0;
  return n === 0 ? "nothing critical" : `${String(n)} critical`;
}

// Bare host reads cleaner than a full URL in a dense list.
function name(site: Site): string {
  return site.label ?? site.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function Row({ site, meta, danger }: { site: Site; meta: string; danger?: boolean }) {
  return (
    <li>
      <Link className="dash-row" href={`/app/sites/${site.id}`}>
        <span className="dash-row-name">{name(site)}</span>
        <span className={danger === true ? "dash-row-meta is-danger" : "dash-row-meta"}>
          {meta}
        </span>
      </Link>
    </li>
  );
}

export default async function Overview() {
  const session = await requireSession();
  const sites = (await listSitesForOrg(db(), session.orgId)).filter(isLive);

  if (sites.length === 0) {
    return (
      <div className="wrap app-content">
        <div className="app-head">
          <h1>Overview</h1>
        </div>
        <div className="empty">
          <h2>Add your first site.</h2>
          <p className="quiet">
            We scan it with consent rejected and granted, then show every tag that ignores the
            visitor&apos;s choice.
          </p>
          <Link className="dash-cta" href="/app/sites">
            Add a site
          </Link>
        </div>
      </div>
    );
  }

  const critical = sites.reduce((sum, s) => sum + crit(s), 0);
  const attention = sites.filter((s) => crit(s) > 0).sort((a, b) => crit(b) - crit(a));
  const monitored = sites.filter((s) => s.schedule !== "off");
  const manual = sites.filter((s) => s.schedule === "off");
  const recent = sites.filter((s) => time(s) > 0).sort((a, b) => time(b) - time(a));
  const lastScan = recent[0] === undefined ? 0 : time(recent[0]);

  return (
    <div className="wrap app-content">
      <div className="app-head">
        <h1>Overview</h1>
        <p className="quiet">
          Where consent is being ignored across your sites, from the latest scans.
        </p>
      </div>

      <div className="kpis">
        <div className={critical > 0 ? "kpi is-danger" : "kpi"}>
          <div className="kpi-label">Critical findings</div>
          <div className="kpi-value">{critical}</div>
          <div className="kpi-sub">tags firing after reject</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Sites with issues</div>
          <div className="kpi-value">
            {attention.length}
            <span className="kpi-of"> / {sites.length}</span>
          </div>
          <div className="kpi-sub">on latest scan</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Monitored</div>
          <div className="kpi-value">
            {monitored.length}
            <span className="kpi-of"> / {sites.length}</span>
          </div>
          <div className="kpi-sub">rescanned on schedule</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Last scan</div>
          <div className="kpi-value">{ago(lastScan)}</div>
          <div className="kpi-sub">
            {recent[0] === undefined ? "no scans yet" : name(recent[0])}
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Needs attention</h2>
            <Link href="/app/sites">All sites</Link>
          </div>
          {attention.length === 0 ? (
            <p className="panel-empty">Nothing critical on your latest scans.</p>
          ) : (
            <ul className="panel-list">
              {attention.slice(0, 6).map((s) => (
                <Row danger key={s.id} meta={`${String(crit(s))} critical`} site={s} />
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Not monitored</h2>
            <Link href="/app/billing">Plans</Link>
          </div>
          {manual.length === 0 ? (
            <p className="panel-empty">Every site rescans on schedule.</p>
          ) : (
            <>
              <p className="panel-note">
                These only scan when you click. A new tag can fire for weeks before anyone notices.
              </p>
              <ul className="panel-list">
                {manual.slice(0, 6).map((s) => (
                  <Row key={s.id} meta="turn on monitoring" site={s} />
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent scans</h2>
        </div>
        {recent.length === 0 ? (
          <p className="panel-empty">No scans yet.</p>
        ) : (
          <ul className="panel-list">
            {recent.slice(0, 8).map((s) => (
              <Row
                danger={crit(s) > 0}
                key={s.id}
                meta={`${statusLabel(s)} - ${ago(time(s))}`}
                site={s}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
