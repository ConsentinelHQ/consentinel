import type { FreeReport } from "@/lib/free-report";

type GtmSummary = NonNullable<FreeReport["gtm"]>;

/**
 * What the site's Google Tag Manager container says, read from its public file.
 * Most marketing tags live in GTM, so this is where most fixes happen.
 */
export function GtmPanel({ report }: { report: FreeReport }) {
  const gtm = report.gtm as GtmSummary;
  // Free rows never carry evidence, full rows always do.
  const full = report.findings.some((f) => f.evidence !== undefined);
  const hasFixes = report.findings.some((f) => (f.gtmFixes?.length ?? 0) > 0);
  const unguarded = gtm.containers.reduce((n, c) => n + c.unguarded, 0);
  const verdict =
    unguarded === 0
      ? "Every marketing tag has a consent check"
      : `${String(unguarded)} marketing ${unguarded === 1 ? "tag has" : "tags have"} no consent check`;

  return (
    <section aria-labelledby="gtm-title" className="gpc-test">
      <div className="gpc-test-head">
        <div>
          <span className="gpc-test-kicker">Tag manager check</span>
          <h2 className="gpc-test-title" id="gtm-title">
            Google Tag Manager
          </h2>
        </div>
        <span className={`gpc-test-verdict${unguarded === 0 ? " pass" : ""}`}>{verdict}</span>
      </div>

      <p className="gpc-test-lede">
        We read the published {gtm.containers.length === 1 ? "container" : "containers"} (
        {gtm.containers.map((c) => `${c.id}, ${String(c.tags)} tags`).join("; ")}) and checked each
        marketing tag’s consent settings and triggers.{" "}
        {report.findings.length === 0
          ? ""
          : hasFixes
            ? "Findings that load through GTM name the exact tag to change and the setting to use."
            : full
              ? "None of the findings above load through GTM, so their fixes are in your site code or apps."
              : "The full report names the exact tag behind each finding and the setting to change."}
      </p>
    </section>
  );
}
