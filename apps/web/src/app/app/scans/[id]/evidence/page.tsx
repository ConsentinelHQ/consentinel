import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, getBillingState, getEvidencePack } from "@consentinel/db";
import { displayCounts, SEVERITY_RANK, type Finding } from "@consentinel/shared";
import { PrintButton } from "@/components/print-button";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { displayHost } from "@/lib/format";
import { consentTested, observedLabel, proofLine, whenBoth } from "@/lib/evidence";

export const metadata: Metadata = { title: "Evidence pack" };
export const dynamic = "force-dynamic";

/**
 * A dated, sealed record of what one scan observed. Built for the day a demand
 * letter arrives: what ran on the site, when, under which consent state, and
 * proof the record hasn't changed since.
 */
export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const pack = await getEvidencePack(db(), id, session.orgId);
  if (!pack) notFound();

  const back = (
    <p className="quiet">
      <Link href={`/app/scans/${id}`}>
        <span aria-hidden="true">←</span> Report
      </Link>
    </p>
  );

  if (!can(await getBillingState(db(), session.orgId), "pdfExport")) {
    return (
      <div className="wrap app-content">
        {back}
        <div className="empty">
          <h2>Evidence packs are on Growth.</h2>
          <p className="quiet">
            A sealed, dated record of every finding, with the request or cookie that proves it. It’s
            what your lawyer asks for first when a demand letter arrives.
          </p>
          <p style={{ marginTop: "1rem" }}>
            <Link className="nav-cta" href="/app/billing">
              See Growth
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const { scan } = pack;
  const result = scan.result!;
  const finished = whenBoth(scan.finishedAt ?? new Date());
  const counts = displayCounts(result);
  const rows: Finding[] = [...result.findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.vendor.localeCompare(b.vendor),
  );
  const host = displayHost(scan.url);

  return (
    <div className="wrap app-content evidence">
      {back}
      <div className="evidence-toolbar">
        <PrintButton label="Save as PDF" />
        <a className="print-button" download href={`/api/scans/${id}/evidence`}>
          Raw evidence (JSON)
        </a>
      </div>

      <header className="evidence-head">
        <p className="evidence-kicker">Consentinel evidence record</p>
        <h1>{pack.siteLabel ?? host}</h1>
        <p className="quiet">{scan.url}</p>
      </header>

      <section className={`evidence-seal ${pack.seal.state}`}>
        <div>
          <strong>
            {pack.seal.state === "verified"
              ? "Sealed and unchanged since it was recorded"
              : pack.seal.state === "mismatch"
                ? "This record does not match its seal"
                : "Recorded before sealing was available"}
          </strong>
          <p className="quiet">
            {pack.seal.state === "unsealed"
              ? "Only scans recorded after sealing shipped carry a SHA-256 seal."
              : pack.chain === "linked"
                ? "Chained to this site’s previous scan, so earlier records can’t be removed or edited unnoticed."
                : pack.chain === "first"
                  ? "First sealed scan for this site."
                  : "The previous scan this record links to is missing."}
          </p>
        </div>
        {pack.seal.state !== "unsealed" && (
          <dl className="evidence-hashes">
            <dt>SHA-256</dt>
            <dd>{pack.seal.hash}</dd>
            {scan.prevEvidenceHash && (
              <>
                <dt>Previous</dt>
                <dd>{scan.prevEvidenceHash}</dd>
              </>
            )}
          </dl>
        )}
      </section>

      <section>
        <h2 className="section-label">Record</h2>
        <table className="evidence-facts">
          <tbody>
            <tr>
              <th>Scan completed</th>
              <td>
                {finished.et}
                <span className="quiet"> ({finished.utc})</span>
              </td>
            </tr>
            <tr>
              <th>Scan ID</th>
              <td className="mono">{scan.id}</td>
            </tr>
            <tr>
              <th>Consent platform</th>
              <td>{result.cmp.detected?.name ?? "None detected"}</td>
            </tr>
            <tr>
              <th>What we tested</th>
              <td>
                <ul className="evidence-list">
                  {consentTested(result).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </td>
            </tr>
            <tr>
              <th>Findings</th>
              <td>
                {counts.critical} critical, {counts.warning} warning, {counts.info} info
              </td>
            </tr>
            {result.gpcCheck && (
              <tr>
                <th>Global Privacy Control</th>
                <td>
                  {result.gpcCheck.ignoredBy.length === 0
                    ? "Every advertising tag stopped with the signal on."
                    : `Kept running: ${result.gpcCheck.ignoredBy.join(", ")}.`}{" "}
                  {result.gpcCheck.acknowledged
                    ? "The page confirmed the opt-out."
                    : "No opt-out confirmation was shown."}
                </td>
              </tr>
            )}
            {result.disclosure && (
              <tr>
                <th>Privacy policy</th>
                <td>
                  {result.disclosure.status === "no-policy"
                    ? "No privacy policy was found linked from the page."
                    : result.disclosure.status === "unreadable"
                      ? "A policy was found but its text could not be read."
                      : result.disclosure.notNamed.length === 0
                        ? "Every vendor that ran is mentioned in the policy."
                        : `Not mentioned in the policy: ${result.disclosure.notNamed.join(", ")}.`}
                  {result.disclosure.policies.map((p) => (
                    <span className="mono proof" key={p.url}>
                      {p.kind} policy {p.url} · sha256 {p.sha256.slice(0, 16)}
                    </span>
                  ))}
                </td>
              </tr>
            )}
            <tr>
              <th>Ran only after accept</th>
              <td>
                {result.correctlyGated.length > 0
                  ? result.correctlyGated.map((g) => g.vendor).join(", ")
                  : "None observed"}
              </td>
            </tr>
            <tr>
              <th>Engine</th>
              <td className="mono">
                engine {result.engineVersion} · signatures {result.signatureLibraryVersion} · CMP
                registry {result.cmpRegistryVersion}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="section-label">Findings ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className="quiet">No findings were recorded in this scan.</p>
        ) : (
          <table className="evidence-findings">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Finding and proof</th>
                <th>Observed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr data-severity={f.severity} key={f.id}>
                  <td className="sev">{f.severity}</td>
                  <td>
                    <strong>{f.title}</strong>
                    {f.causedBy && <span className="quiet"> Loaded by {f.causedBy}.</span>}
                    <span className="mono proof">{proofLine(f)}</span>
                  </td>
                  <td className="observed">{observedLabel(f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="evidence-foot quiet">
        <p>
          How this record was made: the page was loaded in clean, separate Chromium browsers for
          each consent state, and every network request and cookie was captured. Findings are
          matched against a fixed signature library, with no inference. The seal is a SHA-256 hash
          of this scan’s full stored result, its URL, its completion time and the previous scan’s
          hash for the same site.
        </p>
        <p>This record describes what was observed. It is not legal advice.</p>
        <p className="evidence-more">
          Need a date range?{" "}
          <Link href={`/app/sites/${pack.siteId}/demand`}>Build a demand letter pack</Link> with
          every scan around the dates a letter claims.
        </p>
      </footer>
    </div>
  );
}
