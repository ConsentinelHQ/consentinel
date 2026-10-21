import type { Metadata } from "next";
import Link from "next/link";
import { listArchivedSitesForOrg, listSitesForOrg } from "@consentinel/db";
import { Suspense } from "react";
import { AddSiteForm } from "@/components/add-site-form";
import { ImportResume, SiteImport } from "@/components/site-import";
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
      <div className="app-head pf-head">
        <div>
          <h1>Sites</h1>
          <p className="quiet">
            Each site is scanned under both consent states. Add one, or import a whole list.
          </p>
        </div>
        <SiteImport />
      </div>

      <Suspense fallback={null}>
        <ImportResume />
      </Suspense>

      {sites.length === 0 ? (
        <div className="empty">
          <h2>No sites yet.</h2>
          <p className="quiet">
            Add the domain you want watched, or import a CSV or Excel file of every store you run.
            You can scan right away and turn on monitoring when you’re ready.
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
