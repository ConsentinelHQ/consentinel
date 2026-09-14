import type { Metadata } from "next";
import Link from "next/link";
import { listSitesForOrg } from "@consentinel/db";
import { AddSiteForm } from "@/components/add-site-form";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "Sites" };
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await requireSession();
  const sites = await listSitesForOrg(db(), session.orgId);

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
            you are on a monitoring plan.
          </p>
        </div>
      ) : (
        <ul className="site-list">
          {sites.map((site) => (
            <li key={site.id}>
              <Link className="site-row" href={`/app/sites/${site.id}`}>
                <span className="site-url">{site.label ?? site.url}</span>
                <span className="site-meta">
                  {site.lastStatus === null
                    ? "never scanned"
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
    </div>
  );
}
