"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { FreeReport } from "@/lib/free-report";

type State =
  | { kind: "loading"; status: string }
  | { kind: "failed"; message: string }
  | { kind: "ready"; report: FreeReport };

const POLL_MS = 2000;

export function ScanResultView({ scanId }: { scanId: string }) {
  const [state, setState] = useState<State>({ kind: "loading", status: "queued" });

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/scan/${scanId}`);
        const data = (await response.json()) as {
          status?: string;
          report?: FreeReport;
          error?: string;
        };
        if (!live) return;

        if (data.status === "complete" && data.report) {
          setState({ kind: "ready", report: data.report });
          return;
        }
        if (data.status === "failed") {
          setState({ kind: "failed", message: data.error ?? "The scan could not be completed." });
          return;
        }
        setState({ kind: "loading", status: data.status ?? "queued" });
        timer = setTimeout(() => void poll(), POLL_MS);
      } catch {
        if (live) timer = setTimeout(() => void poll(), POLL_MS);
      }
    };

    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [scanId]);

  if (state.kind === "failed") {
    return (
      <>
        <h1>That scan didn&apos;t finish.</h1>
        <p className="lede" style={{ marginTop: "1.25rem" }}>
          {state.message}
        </p>
        <p style={{ marginTop: "2rem" }}>
          <a href="/">Scan a different address</a>
        </p>
      </>
    );
  }

  if (state.kind === "loading") {
    return (
      <>
        <h1>Loading your site twice.</h1>
        <p className="lede" style={{ marginTop: "1.25rem" }}>
          Once refusing consent, once accepting it. This takes about a minute.
        </p>
        <div className="status">
          <span className="pulse" />
          <span>{state.status === "running" ? "Scanning" : "Waiting for a scanner"}</span>
        </div>
      </>
    );
  }

  return <Report report={state.report} scanId={scanId} />;
}

function Report({ report, scanId }: { report: FreeReport; scanId: string }) {
  const clean = report.findings.length === 0;

  // A clean site is a result, not an empty screen. It is also the moment to offer
  // monitoring: nothing is worth protecting until there is a clean baseline.
  if (clean) {
    return (
      <>
        <h1>Nothing fired before consent.</h1>
        <p className="lede" style={{ marginTop: "1.25rem" }}>
          {report.cmpName
            ? `${report.cmpName} held every tracker on ${hostOf(report.url)} until consent was given.`
            : `We found no trackers running on ${hostOf(report.url)} before consent.`}
        </p>

        <div className="specimen" style={{ marginTop: "3rem" }}>
          <div className="specimen-head">
            <span className="specimen-url">{report.url}</span>
            <span className="verdict pass">No violations found</span>
          </div>
          <ul className="ledger">
            {report.correctlyGated.length > 0 ? (
              report.correctlyGated.map((vendor) => (
                <li className="row" data-severity="ok" key={`gated-${vendor}`}>
                  <span className="gutter" />
                  <span className="row-title">{vendor} waited for consent</span>
                  <span className="row-vendor">ok</span>
                </li>
              ))
            ) : (
              <li className="row" data-severity="ok">
                <span className="gutter" />
                <span className="row-title">
                  No trackers were observed on this page in either state.
                </span>
                <span className="row-vendor">ok</span>
              </li>
            )}
          </ul>
        </div>

        <div className="gate">
          <h3>Keep it that way.</h3>
          <p className="quiet">
            This page is clean today. Consentinel can re-scan it on a schedule and tell you the
            moment someone ships a tag that is not.
          </p>
          <p style={{ marginTop: "1rem" }}>
            <a href="/">Scan another page</a>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>{report.headline}</h1>
      <p className="lede" style={{ marginTop: "1.25rem" }}>
        {report.cmpName
          ? `${report.cmpName} is installed on ${hostOf(report.url)}, and these trackers ran anyway.`
          : `No consent banner was found on ${hostOf(report.url)}, so everything below runs ungated.`}
      </p>

      <div className="specimen" style={{ marginTop: "3rem" }}>
        <div className="specimen-head">
          <span className="specimen-url">{report.url}</span>
          <span className={`verdict${report.counts.critical === 0 ? " pass" : ""}`}>
            {/* "0 critical, 1 to clean up" reads as a contradiction next to a
                headline about trackers firing. Say the thing that is true. */}
            {report.counts.critical > 0
              ? `${report.counts.critical} critical, ${report.counts.warning} to clean up`
              : report.counts.warning > 0
                ? `${report.counts.warning} to clean up, nothing critical`
                : "Nothing firing before consent"}
          </span>
        </div>
        <ul className="ledger">
          {report.findings.map((finding) => (
            <li
              className={`row${finding.locked ? " locked" : ""}`}
              data-severity={finding.severity}
              key={finding.id}
            >
              <span className="gutter" />
              {/* Locked rows already carry their own grouped title. */}
              <span className="row-title">{finding.title}</span>
              <span className="row-vendor">{finding.severity}</span>
            </li>
          ))}
          {report.correctlyGated.map((vendor) => (
            <li className="row" data-severity="ok" key={`gated-${vendor}`}>
              <span className="gutter" />
              <span className="row-title">{vendor} waited for consent</span>
              <span className="row-vendor">ok</span>
            </li>
          ))}
        </ul>

        {report.unattributedCookies.length > 0 && (
          // Evidence, not findings. Collapsed because we cannot prove these are
          // non-essential, and listing them inline buries the ones we can prove.
          <details className="unattributed">
            <summary>
              {report.unattributedCookies.length} more cookies we could not attribute
            </summary>
            <p className="quiet">
              These were set before consent but we could not tie them to a known vendor. Confirm
              with your team whether each one is strictly necessary.
            </p>
            <ul className="cookie-names">
              {report.unattributedCookies.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <EmailGate scanId={scanId} lockedCount={report.lockedCount} />
    </>
  );
}

function EmailGate({ scanId, lockedCount }: { scanId: string; lockedCount: number }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailed, setEmailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scanId, email, contactConsent: consent }),
        });
        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          setError(data.error ?? "That didn't work. Try again.");
          setBusy(false);
          return;
        }
        const data = (await response.json()) as { emailed?: boolean };
        setEmailed(data.emailed === true);
        setSent(true);
      } catch {
        setError("That didn't work. Check your connection and try again.");
        setBusy(false);
      }
    },
    [busy, consent, email, scanId],
  );

  if (sent) {
    return (
      <div className="gate">
        <h3>{emailed ? "Your full report is on its way." : "Your full report is unlocked."}</h3>
        <p className="quiet">
          {emailed
            ? "Check your inbox. Every finding comes with the request that proves it and what to change."
            : "We couldn't email it just now, so it's below. Every finding comes with the request that proves it."}
        </p>
      </div>
    );
  }

  return (
    <form className="gate" onSubmit={(e) => void submit(e)}>
      <h3>
        {lockedCount > 0
          ? `See the other ${lockedCount} findings`
          : "Get the evidence behind each finding"}
      </h3>
      <p className="quiet">
        The full report shows the exact request or cookie behind every finding, and how to fix it.
      </p>
      <input
        type="email"
        required
        placeholder="you@company.com"
        aria-label="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Email me occasionally about consent and tracking issues. Optional.</span>
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Sending" : "Send me the full report"}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
