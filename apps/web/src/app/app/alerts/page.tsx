import type { Metadata } from "next";
import { listOrgAlertSettings } from "@consentinel/db";
import { AlertToggle } from "@/components/alert-toggle";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "Alerts" };
export const dynamic = "force-dynamic";

export default async function Alerts() {
  const session = await requireSession();
  const members = await listOrgAlertSettings(db(), session.orgId);
  const me = members.find((m) => m.userId === session.userId);
  const receiving = members.filter((m) => m.alertsEnabled).length;

  return (
    <div className="wrap app-content">
      <div className="app-head">
        <h1>Alerts</h1>
        <p className="quiet">
          New critical issues on scheduled scans are emailed to the people below. Warnings, fixes
          and manual scans don&apos;t alert.
        </p>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Your alerts</h2>
        </div>
        <AlertToggle enabled={me?.alertsEnabled ?? true} />
      </section>

      <section className="panel panel-gap">
        <div className="panel-head">
          <h2>Who gets alerts</h2>
          <span className="panel-count">
            {receiving} of {members.length}
          </span>
        </div>
        {receiving === 0 && (
          <p className="panel-note is-danger">
            Nobody here gets alerts. Scans still run, but regressions go unseen.
          </p>
        )}
        <ul className="panel-list">
          {members.map((m) => (
            <li key={m.userId}>
              <div className="dash-row">
                <span className="dash-row-name">
                  {m.email === "" ? "No email on file" : m.email}
                  {m.userId === session.userId ? " (you)" : ""}
                </span>
                <span className="dash-row-meta">{m.alertsEnabled ? "on" : "off"}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
