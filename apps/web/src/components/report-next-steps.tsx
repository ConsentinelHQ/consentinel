"use client";

import { useState } from "react";

/**
 * What a prospect does after reading their report. Three paths, in the order a
 * cold reader takes them: talk it through, hand it to a developer, keep it fixed.
 */
export function ReportNextSteps({
  host,
  fixes,
  fixCount,
  deadline,
}: {
  host: string;
  fixes: string;
  fixCount: number;
  /** Shown when ad tags ignored Global Privacy Control. */
  deadline: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const walkthrough = `mailto:charlie@consentinelhq.com?subject=${encodeURIComponent(`Walkthrough: ${host} report`)}`;
  const toDev = `mailto:?subject=${encodeURIComponent(`Consent fixes for ${host}`)}&body=${encodeURIComponent(fixes)}`;

  return (
    <section aria-labelledby="next-steps-title" className="next-steps">
      <h2 className="next-steps-title" id="next-steps-title">
        What to do with this
      </h2>
      {deadline && (
        <p className="next-steps-deadline">
          <span aria-hidden="true" className="next-steps-dot" />
          From January 1, 2027, every browser has to offer Global Privacy Control, so far more
          visitors will be sending it.
        </p>
      )}
      <ol className="next-steps-grid">
        <li className="next-step">
          <span className="next-step-num">1</span>
          <h3>Walk through it</h3>
          <p>
            15 minutes with Charlie, the founder. Which fixes matter most and what each one takes.
          </p>
          <a className="nav-cta" href={walkthrough}>
            Ask for a walkthrough
          </a>
        </li>
        <li className="next-step">
          <span className="next-step-num">2</span>
          <h3>Send it to your developer</h3>
          <p>
            {fixCount > 0
              ? `A plain list of the ${String(fixCount)} ${fixCount === 1 ? "change" : "changes"} to make, with the evidence link.`
              : "A plain summary with the evidence link."}
          </p>
          <div className="next-step-actions">
            <a className="btn-outline" href={toDev}>
              Email the fix list
            </a>
            <button
              className="btn-outline"
              onClick={() => {
                void navigator.clipboard.writeText(fixes).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                });
              }}
              type="button"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </li>
        <li className="next-step">
          <span className="next-step-num">3</span>
          <h3>Keep it fixed</h3>
          <p>
            Daily rescans and an alert the moment a tag starts ignoring an opt-out again. $99 a
            month per site.
          </p>
          <a className="btn-outline" href="/pricing">
            See monitoring
          </a>
        </li>
      </ol>
    </section>
  );
}
