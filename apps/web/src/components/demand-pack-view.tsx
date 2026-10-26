import Link from "next/link";
import { buildTimeline, displayCounts, policyMentions } from "@consentinel/shared";
import type { DemandPack, PolicyVersionRow } from "@consentinel/db";
import { PrintButton } from "@/components/print-button";
import { longDay, type Range } from "@/lib/demand";
import { whenBoth } from "@/lib/evidence";

const plural = (n: number, w: string): string => `${String(n)} ${w}${n === 1 ? "" : "s"}`;

/** The demand letter pack itself. Data comes in; nothing here touches the database. */
export function DemandPackView({
  host,
  back,
  range,
  historyDays,
  pack,
  policies = [],
}: {
  host: string;
  back: React.ReactNode;
  range: Range;
  historyDays: number;
  pack: DemandPack;
  /** Privacy policy versions in effect during the window, oldest first. */
  policies?: PolicyVersionRow[];
}) {
  const site = { id: pack.siteId, url: pack.siteUrl };
  const timeline = buildTimeline(
    pack.scans.map((s) => ({
      id: s.scan.id,
      finishedAt: s.scan.finishedAt!,
      result: s.scan.result!,
    })),
    range.from,
    range.to,
  );
  const inWindow = pack.scans.filter(
    (s) => s.scan.finishedAt! >= range.from && s.scan.finishedAt! <= range.to,
  );
  const verified = pack.scans.filter((s) => s.seal.state === "verified").length;
  const mismatched = pack.scans.filter((s) => s.seal.state === "mismatch").length;
  const unsealed = pack.scans.filter((s) => s.seal.state === "unsealed").length;
  const broken = pack.scans.filter((s) => s.chain === "broken").length;
  const intact = mismatched === 0 && broken === 0;
  const { coverage } = timeline;
  const span = `${longDay(range.from)} to ${longDay(range.to)}`;
  const json = `/api/sites/${site.id}/demand?from=${range.fromDay}&to=${range.toDay}`;

  return (
    <div className="wrap app-content evidence demand">
      {back}

      <form className="demand-range" method="get">
        <label>
          <span>Claimed from</span>
          <input defaultValue={range.fromDay} min={range.earliestDay} name="from" type="date" />
        </label>
        <label>
          <span>to</span>
          <input defaultValue={range.toDay} min={range.earliestDay} name="to" type="date" />
        </label>
        <button type="submit">Build pack</button>
        <div className="evidence-toolbar">
          <PrintButton label="Save as PDF" />
          <a className="print-button" download href={json}>
            Raw evidence (JSON)
          </a>
        </div>
      </form>
      {range.clamped && (
        <p className="quiet demand-note">
          Your plan keeps {historyDays === 365 ? "12 months" : `${String(historyDays)} days`} of
          history, so the pack starts on {longDay(range.from)}.
        </p>
      )}

      <header className="evidence-head">
        <p className="evidence-kicker">Consentinel demand letter response pack</p>
        <h1>{host}</h1>
        <p className="quiet">
          {site.url} · {span} (Eastern)
        </p>
      </header>

      <section className="demand-summary">
        <h2 className="section-label">Summary for counsel</h2>
        <p>
          {coverage.inWindow === 0
            ? `Consentinel did not scan ${host} from ${span}.`
            : `Consentinel scanned ${host} ${plural(coverage.inWindow, "time")} from ${span}. The longest gap between scans was ${coverage.longestGapDays < 1 ? "under a day" : plural(coverage.longestGapDays, "day")}.`}{" "}
          {coverage.before && `The nearest earlier scan was on ${longDay(coverage.before)}.`}{" "}
          {coverage.after && `The nearest later scan was on ${longDay(coverage.after)}.`}
        </p>
        {coverage.inWindow > 0 && (
          <p>
            {timeline.vendors.length === 0
              ? "In every scan in this period, no advertising or analytics vendor was observed firing after a visitor rejected cookies or had Global Privacy Control turned on."
              : `In this period, ${plural(timeline.vendors.length, "vendor")} ${timeline.vendors.length === 1 ? "was" : "were"} observed firing after a visitor opted out: ${timeline.vendors
                  .map(
                    (v) =>
                      `${v.vendor} (${v.current ? "still firing on the latest scan" : v.stoppedBy ? `not seen since ${longDay(v.stoppedBy)}` : `last seen ${longDay(v.lastSeen)}`})`,
                  )
                  .join(", ")}.`}
          </p>
        )}
        <p>
          {intact
            ? `${plural(verified, "record")} in this pack ${verified === 1 ? "is" : "are"} sealed and unchanged since they were recorded, and each links to the one before it.`
            : `${plural(mismatched, "record")} ${mismatched === 1 ? "does" : "do"} not match ${mismatched === 1 ? "its" : "their"} seal and ${plural(broken, "link")} in the chain ${broken === 1 ? "is" : "are"} broken. Treat those records with caution.`}
          {unsealed > 0 &&
            ` ${plural(unsealed, "record")} predate${unsealed === 1 ? "s" : ""} sealing and carr${unsealed === 1 ? "ies" : "y"} no seal.`}
        </p>
        {policies.length > 0 && timeline.vendors.length > 0 && (
          <p>
            {policySentence(
              policies,
              timeline.vendors.map((v) => v.vendor),
            )}
          </p>
        )}
        {pack.truncated && (
          <p className="form-error">
            This period has more than {String(pack.scans.length)} scans. Pick a shorter range to
            include all of them.
          </p>
        )}
      </section>

      <section>
        <h2 className="section-label">Vendors firing after opt-out</h2>
        {timeline.vendors.length === 0 ? (
          <p className="quiet">None observed in this period.</p>
        ) : (
          <table className="evidence-findings demand-vendors">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>After reject</th>
                <th>With GPC on</th>
                <th>First seen</th>
                <th>Last seen</th>
                <th>Status</th>
                {policies.length > 0 && <th>In policy</th>}
              </tr>
            </thead>
            <tbody>
              {timeline.vendors.map((v) => (
                <tr key={v.vendor}>
                  <td>
                    <strong>{v.vendor}</strong>
                  </td>
                  <td data-label="After reject">
                    {v.afterReject} of {coverage.inWindow}
                  </td>
                  <td data-label="With GPC on">
                    {v.withGpc} of {coverage.inWindow}
                  </td>
                  <td data-label="First seen">{longDay(v.firstSeen)}</td>
                  <td data-label="Last seen">{longDay(v.lastSeen)}</td>
                  <td data-label="Status">
                    {v.current
                      ? "Still firing"
                      : v.stoppedBy
                        ? `Stopped by ${longDay(v.stoppedBy)}`
                        : "No later scan"}
                  </td>
                  {policies.length > 0 && (
                    <td data-label="In policy">{mentionLabel(v.vendor, policies)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {timeline.outside.length > 0 && (
          <p className="quiet">
            Seen only outside this period:{" "}
            {timeline.outside.map((v) => `${v.vendor} (${longDay(v.firstSeen)})`).join(", ")}.
          </p>
        )}
      </section>

      <section>
        <h2 className="section-label">Policy in effect</h2>
        {policies.length === 0 ? (
          <p className="quiet">
            No saved policy covers this period. Policies are saved from the first scan after the
            archive was turned on, so earlier dates can’t be shown.
          </p>
        ) : (
          <table className="evidence-findings demand-policies">
            <thead>
              <tr>
                <th>Version</th>
                <th>Policy</th>
                <th>Text check</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id}>
                  <td>
                    Seen {longDay(p.firstSeenAt)}
                    {p.lastSeenAt.getTime() !== p.firstSeenAt.getTime() &&
                      ` to ${longDay(p.lastSeenAt)}`}
                  </td>
                  <td data-label="Policy">
                    <Link href={`/app/sites/${site.id}/policy`}>
                      {p.kind === "privacy" ? "Privacy policy" : "Cookie policy"}
                    </Link>
                    <span className="mono proof">{p.url}</span>
                  </td>
                  <td data-label="Text check">
                    {p.chars.toLocaleString("en-US")} characters
                    <span className="mono proof">sha256 {p.sha256.slice(0, 16)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="section-label">Scan log ({pack.scans.length})</h2>
        {pack.scans.length === 0 ? (
          <p className="quiet">No completed scans for this site yet.</p>
        ) : (
          <table className="evidence-findings demand-log">
            <thead>
              <tr>
                <th>Completed (Eastern)</th>
                <th>Firing after opt-out</th>
                <th>Critical</th>
                <th>Seal</th>
              </tr>
            </thead>
            <tbody>
              {pack.scans.map(({ scan, seal, chain }) => {
                const outsideWindow = !inWindow.some((s) => s.scan.id === scan.id);
                const vendors = timeline.byScan.get(scan.id) ?? [];
                return (
                  <tr data-outside={outsideWindow || undefined} key={scan.id}>
                    <td>
                      <Link href={`/app/scans/${scan.id}/evidence`}>
                        {whenBoth(scan.finishedAt!).et}
                      </Link>
                      {outsideWindow && <span className="quiet"> (outside period)</span>}
                      <span className="mono proof">{scan.id}</span>
                    </td>
                    <td data-label="Firing after opt-out">
                      {vendors.length ? vendors.join(", ") : "None"}
                    </td>
                    <td data-label="Critical">{displayCounts(scan.result!).critical}</td>
                    <td data-label="Seal" className={`demand-seal ${seal.state}`}>
                      {seal.state === "verified"
                        ? chain === "broken"
                          ? "Sealed, chain broken"
                          : "Sealed"
                        : seal.state === "mismatch"
                          ? "Does not match"
                          : "Not sealed"}
                      {seal.state !== "unsealed" && (
                        <span className="mono proof">{seal.hash.slice(0, 16)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <footer className="evidence-foot quiet">
        <p>
          How these records were made: each scan loaded the page in clean, separate Chromium
          browsers for each consent state (rejected, accepted, and Global Privacy Control on with no
          banner interaction) and captured every network request and cookie. Vendors are matched
          against a fixed signature library, with no inference. A vendor counts here only when a
          critical finding showed it firing after reject or with Global Privacy Control on.
        </p>
        <p>
          Each record is sealed with a SHA-256 hash of its full stored result, URL, completion time
          and the previous record’s hash for the same site, so a removed or edited record breaks
          every seal after it. The raw JSON contains exactly what was hashed, so anyone can
          re-verify it.
        </p>
        <p>
          Scans show what ran at the moment of each scan, not during any individual visit. This pack
          describes what was observed. It is not legal advice.
        </p>
      </footer>
    </div>
  );
}

/** Mentioned in every version, none, or only some of those in effect. */
function mentionLabel(vendor: string, policies: PolicyVersionRow[]): string {
  const hits = policies.filter((p) => policyMentions(vendor, p.text)).length;
  if (hits === policies.length) return "Mentioned";
  if (hits === 0) return "Not mentioned";
  return "In some versions";
}

function policySentence(policies: PolicyVersionRow[], vendors: string[]): string {
  const privacy = policies.filter((p) => p.kind === "privacy");
  const list = privacy.length > 0 ? privacy : policies;
  const missing = vendors.filter((v) => list.every((p) => !policyMentions(v, p.text)));
  const versions = `${String(list.length)} version${list.length === 1 ? "" : "s"} of the ${privacy.length > 0 ? "privacy" : "cookie"} policy ${list.length === 1 ? "was" : "were"} in effect during this period`;
  return missing.length === 0
    ? `${versions}, and ${list.length === 1 ? "it mentions" : "each mentions"} every vendor listed below.`
    : `${versions}. ${missing.join(", ")} ${missing.length === 1 ? "was" : "were"} not mentioned in ${list.length === 1 ? "it" : "any of them"}.`;
}
