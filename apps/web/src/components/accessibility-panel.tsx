import { CollapsibleSection } from "./collapsible-section";
import type { FreeReport } from "@/lib/free-report";

type Summary = NonNullable<FreeReport["accessibility"]>;
type Issue = Summary["issues"][number];

const plural = (n: number, w: string): string => `${String(n)} ${w}${n === 1 ? "" : "s"}`;

const IMPACT_LABEL: Record<Issue["impact"], string> = {
  critical: "Critical",
  serious: "Serious",
  moderate: "Moderate",
  minor: "Minor",
};

/** Key pages keep their label; other pages show their path, which says more than "Page". */
function pageName(p: { url: string; label: string }): string {
  if (p.label !== "Page") return p.label;
  try {
    const path = new URL(p.url).pathname.replace(/\/$/, "");
    return path.length > 32 ? `…${path.slice(-30)}` : path || "/";
  } catch {
    return p.label;
  }
}

function band(score: number): "good" | "fair" | "poor" {
  if (score >= 90) return "good";
  if (score >= 60) return "fair";
  return "poor";
}

/**
 * Accessibility Monitor: automated WCAG 2.2 AA checks on the homepage and key pages.
 * Same card as the GPC and disclosure checks so they read as one set.
 */
export function AccessibilityPanel({
  summary,
  upsell = false,
  planNote = false,
}: {
  summary: Summary;
  /** A prospect's view: point at monitoring. */
  upsell?: boolean;
  /** The owner's in-app view: say what a bigger plan adds. */
  planNote?: boolean;
}) {
  const origin = (() => {
    try {
      return new URL(summary.pages[0]?.url ?? "").origin;
    } catch {
      return "";
    }
  })();
  const pageUrl = (path: string): string => `${origin}${path}`;
  // Free rows never carry a fix, full rows always do.
  const full = summary.issues.some((i) => i.fix !== undefined);
  const total = summary.issues.length + summary.lockedCount;
  const urgent = summary.counts.critical + summary.counts.serious;
  const audited = summary.pages.filter((p) => p.status === "ok");
  const verdict =
    audited.length === 0
      ? "Couldn’t check this site"
      : total === 0
        ? "No automated issues found"
        : urgent > 0
          ? `${plural(urgent, "critical or serious issue")}`
          : plural(total, "issue");
  const tone = band(summary.score);
  // Circumference of r=26.
  const C = 163.4;

  return (
    <CollapsibleSection
      className="gpc-test a11y-test"
      head={
        <div className="gpc-test-head">
          <div>
            <span className="gpc-test-kicker">
              <span aria-hidden="true" className="gpc-test-signal" />
              Accessibility check
            </span>
            <h2 className="gpc-test-title" id="a11y-title">
              Accessibility, {summary.standard}
            </h2>
          </div>
          <span className={`gpc-test-verdict${total === 0 && audited.length > 0 ? " pass" : ""}`}>
            {verdict}
          </span>
        </div>
      }
      id="report-accessibility"
      labelledBy="a11y-title"
    >
      {audited.length > 0 && (
        <div className="a11y-score">
          <svg
            aria-hidden="true"
            className={`a11y-ring ${tone}`}
            height="64"
            viewBox="0 0 64 64"
            width="64"
          >
            <circle className="a11y-ring-track" cx="32" cy="32" r="26" />
            <circle
              className="a11y-ring-fill"
              cx="32"
              cy="32"
              r="26"
              style={{ strokeDasharray: C, strokeDashoffset: C - (C * summary.score) / 100 }}
            />
          </svg>
          <div>
            <p className="a11y-score-num">
              <strong>{summary.score}</strong>
              <span>/100</span>
            </p>
            <p className="a11y-score-counts">
              {summary.counts.critical} critical · {summary.counts.serious} serious ·{" "}
              {summary.counts.moderate} moderate · {summary.counts.minor} minor
            </p>
          </div>
        </div>
      )}

      <p className="gpc-test-lede">
        We ran automated WCAG 2.2 A and AA checks on{" "}
        {audited.length === 1 ? "your homepage" : `${String(audited.length)} pages`}. Online stores
        get most of the ADA website lawsuits filed in the US, and these checks catch the issues
        demand letters cite most: missing alt text, unlabeled fields, low contrast.
      </p>

      {summary.pages.length > 1 && (
        <ul className="gpc-test-list a11y-pages">
          {summary.pages.map((p, i) => (
            <li key={p.url}>
              <a
                className={`gpc-test-chip a11y-page-link ${p.status === "ok" ? (p.issues === 0 ? "good" : "bad") : "skipped"}`}
                href={p.url}
                style={{ animationDelay: `${String(120 + i * 70)}ms` }}
                rel="noopener noreferrer nofollow"
                target="_blank"
                title={
                  p.status === "failed"
                    ? `Not checked (${p.error ?? "failed"}): ${p.url}`
                    : `${plural(p.issues, "issue")} · ${p.url}`
                }
              >
                <span aria-hidden="true" className="gpc-test-dot" />
                {pageName(p)}
                {p.status === "failed" ? " (not checked)" : ""}
                <span aria-hidden="true" className="a11y-page-arrow">
                  ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {summary.issues.length > 0 && (
        <ul className="a11y-issues">
          {summary.issues.map((issue) => (
            <li className="a11y-issue" data-impact={issue.impact} key={issue.rule}>
              <div className="a11y-issue-head">
                <span className="a11y-issue-title">{issue.title}</span>
                <span className="a11y-issue-impact">{IMPACT_LABEL[issue.impact]}</span>
              </div>
              <p className="a11y-issue-meta">
                WCAG {issue.wcag.join(", ") || issue.level} · {plural(issue.instances, "element")}{" "}
                on {plural(issue.pages.length, "page")}
              </p>
              {full && issue.fix && (
                <details className="row-proof">
                  <summary>How to fix it</summary>
                  <p className="proof-fix">{issue.fix}</p>
                  {issue.examples && issue.examples.length > 0 && (
                    <ul className="a11y-examples">
                      {issue.examples.map((e, i) => (
                        <li className="a11y-example" key={`${e.page}-${String(i)}`}>
                          <div className="a11y-example-where">
                            <a
                              href={pageUrl(e.page)}
                              rel="noopener noreferrer nofollow"
                              target="_blank"
                            >
                              {e.page === "/" ? "Homepage" : e.page} ↗
                            </a>
                          </div>
                          {e.shot && (
                            <img
                              alt={`Failing element on ${e.page}, outlined in red`}
                              className="a11y-shot"
                              loading="lazy"
                              src={e.shot}
                            />
                          )}
                          {e.contrast && (
                            <p className="a11y-contrast">
                              <span
                                className="a11y-swatch"
                                style={{ background: e.contrast.bg, color: e.contrast.fg }}
                              >
                                Aa
                              </span>
                              <span>
                                Text {e.contrast.fg} on {e.contrast.bg}:{" "}
                                <strong>{e.contrast.ratio}:1</strong>, needs {e.contrast.required}:1
                              </span>
                            </p>
                          )}
                          {e.summary && !e.contrast && <p className="a11y-reason">{e.summary}</p>}
                          <code className="a11y-code">{e.html}</code>
                          <span className="a11y-selector">{e.selector}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {issue.helpUrl && (
                    <p className="a11y-guide">
                      <a href={issue.helpUrl} rel="noopener noreferrer nofollow" target="_blank">
                        Guidance for this check
                      </a>
                    </p>
                  )}
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {summary.lockedCount > 0 && (
        <p className="a11y-locked">
          {plural(summary.lockedCount, "more issue")} and the fix for each are in the full report.
        </p>
      )}

      {upsell && !full && total > 0 && (
        <p className="disclosure-upsell">
          Monitoring rechecks accessibility on every scan and alerts you when a new issue appears.
          Growth and Agency check up to 10 pages per site. <a href="/pricing">See plans</a>
        </p>
      )}

      {planNote && summary.pageLimit === 1 && (
        <p className="disclosure-upsell">
          Your plan checks the homepage. Growth and Agency also check product, collection and cart
          pages, up to 10 per site. <a href="/app/billing">Upgrade</a>
        </p>
      )}

      <p className="gpc-test-ack a11y-note">
        Automated checks find a share of WCAG issues, not all of them. This isn’t a legal opinion or
        a certification of compliance.
        {summary.needsReview > 0
          ? ` ${plural(summary.needsReview, "check")} need a manual look.`
          : ""}
      </p>
    </CollapsibleSection>
  );
}
