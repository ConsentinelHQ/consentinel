import type { Metadata } from "next";
import Link from "next/link";
import { listArchivedSitesForOrg, listSitesForOrg } from "@consentinel/db";
import { AddSiteForm } from "@/components/add-site-form";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { blockedLabel, displayHost } from "@/lib/format";

export const metadata: Metadata = { title: "Sites" };
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await requireSession();
  const [sites, archived] = await Promise.all([
    listSitesForOrg(db(), session.orgId),
    listArchivedSitesForOrg(db(), session.orgId),
  ]);

  return (
    <div className="wrap app-content">
      <div className="app-head">
        <h1>Sites</h1>
        <p className="quiet">
          Each site is scanned under both consent states. Add one to start tracking it.
        </p>
      </div>

      {sites.length === 0 ? (
        <div className="empty">
          <h2>No sites yet.</h2>
          <p className="quiet">
            Add the domain you want watched. You can run a scan immediately, and set a schedule once
            you’re on a monitoring plan.
          </p>
        </div>
      ) : (
        <ul className="site-list">
          {sites.map((site) => (
            <li key={site.id}>
              <Link className="site-row" href={`/app/sites/${site.id}`}>
                <span className="site-url">{site.label ?? displayHost(site.url)}</span>
                <span className="site-meta">
                  {site.lastStatus === null
                    ? "never scanned"
                    : site.lastStatus === "failed" && site.lastBlockedBy
                      ? blockedLabel(site.lastBlockedBy)
                      : site.lastStatus !== "complete"
                        ? site.lastStatus
                        : site.lastCritical === 0
                          ? "nothing critical"
                          : `${String(site.lastCritical ?? 0)} critical`}
                </span>
                <span className="site-schedule">
                  {site.schedule === "off" ? "manual" : site.schedule}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <AddSiteForm />

      {archived.length > 0 && (
        <details className="archived-sites">
          <summary>Archived sites ({archived.length})</summary>
          <ul className="site-list">
            {archived.map((site) => (
              <li key={site.id}>
                <Link className="site-row" href={`/app/sites/${site.id}`}>
                  <span className="site-url">{site.label ?? displayHost(site.url)}</span>
                  <span className="site-meta">archived</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
