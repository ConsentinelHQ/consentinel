import Link from "next/link";
import type { Metadata } from "next";
import {
  can,
  externalRecipientLimit,
  getJiraConnectionSummary,
  getSlackWebhook,
  getTeamsWebhook,
  getBillingState,
  listExternalRecipients,
  listOrgAlertSettings,
} from "@consentinel/db";
import { AlertToggle } from "@/components/alert-toggle";
import { RecipientManager } from "@/components/recipient-manager";
import { JiraConnect } from "@/components/jira-connect";
import { ConnectHelp } from "@/components/connect-help";
import { WebhookConnect } from "@/components/webhook-connect";
import { requireSession } from "@/lib/auth";
import { integrationHelp } from "@/lib/integration-help";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "Alerts" };
export const dynamic = "force-dynamic";

export default async function Alerts() {
  const session = await requireSession();
  const [members, external, billing] = await Promise.all([
    listOrgAlertSettings(db(), session.orgId),
    listExternalRecipients(db(), session.orgId),
    getBillingState(db(), session.orgId),
  ]);
  const limit = externalRecipientLimit(billing);
  const slackAllowed = can(billing, "slack");
  const slackUrl = slackAllowed ? await getSlackWebhook(db(), session.orgId) : null;
  const teamsAllowed = can(billing, "teams");
  const teamsUrl = teamsAllowed ? await getTeamsWebhook(db(), session.orgId) : null;
  const jiraAllowed = can(billing, "jira");
  const jira = jiraAllowed ? await getJiraConnectionSummary(db(), session.orgId) : null;
  const me = members.find((m) => m.userId === session.userId);
  const receiving = members.filter((m) => m.alertsEnabled).length;

  return (
    <div className="wrap app-content">
      <div className="app-head">
        <h1>Alerts</h1>
        <p className="quiet">
          New critical issues on scheduled scans are emailed to the people below, and so is any
          vendor that starts running without your privacy policy mentioning it. Warnings, fixes and
          manual scans don&apos;t alert.
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
          <h2>Team members</h2>
          <span className="panel-count">
            {receiving} of {members.length} receiving
          </span>
        </div>
        {receiving + external.length === 0 && (
          <p className="panel-note is-danger">
            Nobody gets alerts. Scans still run, but regressions go unseen.
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

      <section className="panel panel-gap">
        <div className="panel-head">
          <h2>Also notify</h2>
          <span className="panel-count">
            {external.length} of {limit}
          </span>
        </div>
        <p className="panel-note">
          Your agency, privacy counsel, or anyone without an account. Each gets their own email with
          an unsubscribe link.
        </p>
        <RecipientManager limit={limit} recipients={external} />
      </section>
      <section className="panel panel-gap">
        <div className="panel-head">
          <h2>Slack</h2>
          {slackAllowed ? null : <Link href="/app/billing">Growth and Agency</Link>}
        </div>
        {slackAllowed ? (
          <>
            <WebhookConnect
              connected={slackUrl !== null}
              endpoint="/api/alerts/slack"
              label="Slack webhook URL"
              name="Slack"
              placeholder="https://hooks.slack.com/services/..."
            />
            {slackUrl === null ? <ConnectHelp help={integrationHelp("slack-alerts")} open /> : null}
          </>
        ) : (
          <p className="panel-empty">
            Post new critical findings to a Slack channel. Available on Growth and Agency.
          </p>
        )}
      </section>
      <section className="panel panel-gap">
        <div className="panel-head">
          <h2>Microsoft Teams</h2>
          {teamsAllowed ? null : <Link href="/app/billing">Growth and Agency</Link>}
        </div>
        {teamsAllowed ? (
          <>
            <WebhookConnect
              connected={teamsUrl !== null}
              endpoint="/api/alerts/teams"
              label="Teams webhook URL"
              name="Teams"
              placeholder="https://...powerplatform.com/..."
            />
            {teamsUrl === null ? (
              <ConnectHelp help={integrationHelp("microsoft-teams-alerts")} open />
            ) : null}
          </>
        ) : (
          <p className="panel-empty">
            Post new critical findings to a Teams channel. Available on Growth and Agency.
          </p>
        )}
      </section>
      <section className="panel panel-gap">
        <div className="panel-head">
          <h2>Jira</h2>
          {jiraAllowed ? null : <Link href="/app/billing">Growth and Agency</Link>}
        </div>
        {jiraAllowed ? (
          <>
            <JiraConnect
              connection={
                jira
                  ? {
                      baseUrl: jira.baseUrl,
                      projectKey: jira.projectKey,
                      issueTypeName: jira.issueTypeName,
                      autoCreate: jira.autoCreate,
                      hookToken: jira.hookToken,
                    }
                  : null
              }
            />
            {jira ? null : <ConnectHelp help={integrationHelp("jira-integration")} open />}
          </>
        ) : (
          <p className="panel-empty">
            Open a Jira ticket for every new critical finding, and rescan automatically when a
            ticket moves to Done so nothing closes on a fix that didn&apos;t ship. Available on
            Growth and Agency.
          </p>
        )}
      </section>
    </div>
  );
}
