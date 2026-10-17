import type { Metadata } from "next";
import {
  can,
  getBillingState,
  isEntitled,
  listPortfolio,
  type PortfolioRow,
} from "@consentinel/db";
import { AgencyUpsell } from "@/components/agency-upsell";
import { CountUp } from "@/components/count-up";
import { PortfolioImport } from "@/components/portfolio-import";
import { PortfolioTable, type PortfolioItem } from "@/components/portfolio-table";
import { requireSession } from "@/lib/auth";
import { blockedLabel, displayHost } from "@/lib/format";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "Portfolio" };
export const dynamic = "force-dynamic";

function toItem(r: PortfolioRow): PortfolioItem {
  const running = r.lastStatus === "queued" || r.lastStatus === "running";
  const status: PortfolioItem["status"] = running
    ? "running"
    : r.lastStatus === "failed" && r.lastBlockedBy
      ? "blocked"
      : r.lastStatus === "failed"
        ? "failed"
        : r.critical === null
          ? "never"
          : r.critical > 0
            ? "critical"
            : "clean";
  const label = {
    running: "Scanning",
    blocked: r.lastBlockedBy ? blockedLabel(r.lastBlockedBy) : "Blocked",
    failed: "Scan failed",
    never: "Never scanned",
    critical: "Ignoring opt-outs",
    clean: "Clean",
  }[status];
  return {
    id: r.id,
    host: r.label ?? displayHost(r.url),
    client: r.client,
    status,
    statusLabel: label,
    critical: r.critical,
    change:
      r.critical !== null && r.previousCritical !== null ? r.critical - r.previousCritical : null,
    cmpName: r.cmpName,
    lastScanAt: r.lastFinishedAt?.toISOString() ?? null,
    schedule: r.schedule,
  };
}

export default async function Portfolio() {
  const session = await requireSession();
  const billing = await getBillingState(db(), session.orgId);

  if (!can(billing, "workspaces")) {
    return (
      <div className="wrap app-content">
        <div className="app-head">
          <h1>Portfolio</h1>
          <p className="quiet">Every client store on one screen.</p>
        </div>
        <AgencyUpsell
          points={[
            "Every client site ranked by risk, with what changed since the last scan",
            "Import a client's stores from a CSV in one step",
            "Rescan a whole client before a QBR and export the results",
            "Share reports under your own agency brand",
          ]}
          title="Run privacy monitoring as a service."
        />
      </div>
    );
  }

  const rows = await listPortfolio(db(), session.orgId);
  const items = rows.map(toItem);
  const clients = [
    ...new Set(rows.map((r) => r.client).filter((c): c is string => c !== null)),
  ].sort();

  const critical = items.reduce((s, i) => s + (i.critical ?? 0), 0);
  const failing = items.filter((i) => i.status === "critical").length;
  const fixed = items.reduce((s, i) => s + (i.change !== null && i.change < 0 ? -i.change : 0), 0);
  const monitored = items.filter((i) => i.schedule !== "off").length;

  return (
    <div className="wrap app-content">
      <div className="app-head pf-head">
        <div>
          <h1>Portfolio</h1>
          <p className="quiet">
            {clients.length > 0
              ? `${String(items.length)} sites across ${String(clients.length)} client${clients.length === 1 ? "" : "s"}, ranked by risk.`
              : "Every site you manage, ranked by risk."}
          </p>
        </div>
        <PortfolioImport canSchedule={isEntitled(billing)} clients={clients} />
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <h2>Import your first client.</h2>
          <p className="quiet">
            Paste their domains or drop a CSV. Each store gets scanned with consent rejected and
            with Global Privacy Control on.
          </p>
        </div>
      ) : (
        <>
          <div className="kpis">
            <div className={critical > 0 ? "kpi is-danger" : "kpi"}>
              <div className="kpi-label">Critical findings</div>
              <div className="kpi-value">
                <CountUp to={critical} />
              </div>
              <div className="kpi-sub">across the portfolio</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Sites ignoring opt-outs</div>
              <div className="kpi-value">
                <CountUp to={failing} />
                <span className="kpi-of"> / {items.length}</span>
              </div>
              <div className="kpi-sub">on latest scan</div>
            </div>
            <div className={fixed > 0 ? "kpi is-good" : "kpi"}>
              <div className="kpi-label">Fixed since last scan</div>
              <div className="kpi-value">
                <CountUp to={fixed} />
              </div>
              <div className="kpi-sub">findings resolved</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Monitored</div>
              <div className="kpi-value">
                <CountUp to={monitored} />
                <span className="kpi-of"> / {items.length}</span>
              </div>
              <div className="kpi-sub">rescanned on schedule</div>
            </div>
          </div>
          <PortfolioTable items={items} />
        </>
      )}
    </div>
  );
}
