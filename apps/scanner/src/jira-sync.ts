import {
  can,
  findingsStillPresent,
  getBillingState,
  getJiraCredentialsForSite,
  getScan,
  getTrackedJiraIssue,
  recordJiraIssue,
  type Database,
  type DiffItem,
  type JiraCredentials,
  type ScanRow,
} from "@consentinel/db";
import { adf, commentOnJiraIssue, createJiraIssue, type AdfNode } from "@consentinel/notify";
import { newCriticalFindings } from "./alerting.js";
import type { ScannerConfig } from "./config.js";

/**
 * Two-way Jira sync.
 *
 * Out: a new critical regression opens a ticket with the evidence and the fix.
 * Back: when any ticket moves to Done, Jira calls our hook, we rescan, and the
 * verdict lands on that ticket. Tickets we opened are checked finding by finding,
 * so a ticket can't be closed on a fix that didn't ship.
 */

const LABELS = ["consentinel", "privacy"];

function host(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

function reportUrl(config: ScannerConfig, scanId: string): string {
  return `${config.APP_URL}/app/scans/${scanId}`;
}

/** Connected and on a plan that includes Jira. */
async function credentials(db: Database, siteId: string): Promise<JiraCredentials | null> {
  const creds = await getJiraCredentialsForSite(db, siteId);
  if (!creds) return null;
  if (!can(await getBillingState(db, creds.orgId), "jira")) return null;
  return creds;
}

function findingItems(items: { vendor: string; title: string; remediation?: string }[]): AdfNode {
  return adf.bullets(
    items.map((f) => [
      adf.text(`${f.vendor}: `, { bold: true }),
      adf.text(f.title),
      ...(f.remediation ? [adf.text(` Fix: ${f.remediation}`)] : []),
    ]),
  );
}

/** Never throws: Jira being down must not block the email alert. */
export async function openJiraIssueForRegression(
  db: Database,
  scan: ScanRow,
  added: DiffItem[],
  config: ScannerConfig,
): Promise<void> {
  if (!scan.siteId || added.length === 0) return;
  try {
    const creds = await credentials(db, scan.siteId);
    if (!creds?.autoCreate) return;
    const site = host(scan.url);
    const noun = added.length === 1 ? "issue" : "issues";
    const key = await createJiraIssue(creds, {
      projectKey: creds.projectKey,
      issueTypeId: creds.issueTypeId,
      summary: `${String(added.length)} new critical privacy ${noun} on ${site}`,
      labels: LABELS,
      description: adf.doc(
        adf.p(
          adf.text(
            `Consentinel's ${scan.trigger} scan of ${site} found trackers firing after a visitor opted out. This is the pattern behind CIPA wiretap suits and state privacy enforcement.`,
          ),
        ),
        findingItems(added),
        adf.p(adf.text("See the evidence", { href: reportUrl(config, scan.id) })),
        adf.p(
          adf.text(
            "When you move this ticket to Done, Consentinel rescans the site and comments here with whether each finding is actually gone.",
          ),
        ),
      ),
    });
    await recordJiraIssue(db, {
      orgId: creds.orgId,
      siteId: scan.siteId,
      issueKey: key,
      scanId: scan.id,
      fingerprints: added.map((f) => f.fingerprint),
    });
    console.log(`jira issue ${key} opened for ${scan.url}`);
  } catch (error) {
    console.error("jira issue not created", { scanId: scan.id, error });
  }
}

/** After a Jira-triggered scan completes, post the verdict to the ticket. */
export async function postJiraVerdict(
  db: Database,
  scanId: string,
  config: ScannerConfig,
): Promise<void> {
  const scan = await getScan(db, scanId);
  if (!scan?.siteId || scan.trigger !== "jira" || !scan.jiraIssueKey) return;
  const creds = await credentials(db, scan.siteId);
  if (!creds) return;

  const site = host(scan.url);
  // The token belongs to whoever connected Jira, so the comment says who's speaking.
  const link = adf.p(
    adf.text("Consentinel", { bold: true }),
    adf.text(" automated verification. "),
    adf.text("See the full report", { href: reportUrl(config, scanId) }),
  );
  const tracked = await getTrackedJiraIssue(db, creds.orgId, scan.jiraIssueKey);
  const added = (await newCriticalFindings(db, scan)) ?? [];
  // Findings this ticket was opened for are not "new" when they persist, but drop
  // them from the regression list anyway so nothing is reported twice.
  const trackedSet = new Set(tracked?.fingerprints ?? []);
  const regressions = added.filter((f) => !trackedSet.has(f.fingerprint));
  const content: AdfNode[] = [];

  if (tracked && tracked.fingerprints.length > 0) {
    const still = await findingsStillPresent(db, scanId, tracked.fingerprints);
    if (still.length === 0) {
      content.push(
        adf.p(
          adf.text("Verified fixed. ", { bold: true }),
          adf.text(
            `Consentinel rescanned ${site} and none of the ${String(tracked.fingerprints.length)} findings in this ticket fire after opt-out anymore.`,
          ),
        ),
      );
    } else {
      content.push(
        adf.p(
          adf.text("Not fixed. ", { bold: true }),
          adf.text(
            `${String(still.length)} of ${String(tracked.fingerprints.length)} findings in this ticket still fire after opt-out on ${site}. Reopen this ticket.`,
          ),
        ),
        findingItems(still),
      );
    }
  } else if (regressions.length === 0) {
    content.push(
      adf.p(
        adf.text("No new issues. ", { bold: true }),
        adf.text(
          `Consentinel scanned ${site} after this ticket closed. No new trackers fire after opt-out. ${String(scan.criticalCount)} critical open on the site overall.`,
        ),
      ),
    );
  }

  if (regressions.length > 0) {
    const noun = regressions.length === 1 ? "finding" : "findings";
    content.push(
      adf.p(
        adf.text("New regression. ", { bold: true }),
        adf.text(
          `${String(regressions.length)} new critical ${noun} on ${site} since the last scan. If this ticket shipped code, it likely caused them.`,
        ),
      ),
      findingItems(regressions),
    );
  }

  content.push(link);
  try {
    await commentOnJiraIssue(creds, scan.jiraIssueKey, adf.doc(...content));
  } catch (error) {
    console.error("jira verdict not posted", { scanId, issue: scan.jiraIssueKey, error });
  }
}

/** A Jira-triggered scan that couldn't run still owes the ticket an answer. */
export async function postJiraScanFailure(
  db: Database,
  scanId: string,
  reason: string,
): Promise<void> {
  try {
    const scan = await getScan(db, scanId);
    if (!scan?.siteId || scan.trigger !== "jira" || !scan.jiraIssueKey) return;
    const creds = await credentials(db, scan.siteId);
    if (!creds) return;
    const why = scan.blockedBy
      ? `${scan.blockedBy} bot protection blocked the scanner. Add the Consentinel allowlist rule for this site.`
      : reason.slice(0, 300);
    await commentOnJiraIssue(
      creds,
      scan.jiraIssueKey,
      adf.doc(
        adf.p(
          adf.text("Couldn't verify. ", { bold: true }),
          adf.text(`Consentinel couldn't scan ${host(scan.url)} after this ticket closed. ${why}`),
        ),
        adf.p(adf.text("Consentinel", { bold: true }), adf.text(" automated verification.")),
      ),
    );
  } catch (error) {
    console.error("jira failure comment not posted", { scanId, error });
  }
}
