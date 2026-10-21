"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { sheetToText } from "@/lib/import-parse";

type Status = "new" | "existing" | "restore" | "invalid";
type Schedule = "off" | "daily" | "weekly";

interface Row {
  domain: string;
  client: string | null;
  status: Status;
  reason?: string;
}

interface Plan {
  name: string | null;
  entitled: boolean;
  perSite: boolean;
  limit: number;
  used: number;
  canAddSeats: boolean;
  unitPrice: number;
  interval: "month" | "year";
}

interface Preview {
  rows: Row[];
  truncated: boolean;
  skipped: number;
  canTagClient: boolean;
  plan: Plan;
}

interface Done {
  added: number;
  scheduled: number;
  overflow: string[];
  failed: { domain: string; reason: string }[];
  plan: Plan | null;
}

const PENDING_KEY = "consentinel:pending-import";
const MAX_FILE = 5_000_000;

const STATUS_LABEL: Record<Status, string> = {
  new: "Ready",
  existing: "Already added",
  restore: "Restores from archive",
  invalid: "Can't import",
};

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function plural(n: number, word: string): string {
  return `${String(n)} ${word}${n === 1 ? "" : "s"}`;
}

/** Upload or paste sites, review them, then import with monitoring in one go. */
export function SiteImport({ label = "Import sites" }: { label?: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"input" | "review" | "done">("input");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [client, setClient] = useState("");
  const [schedule, setSchedule] = useState<Schedule>("daily");

  const [done, setDone] = useState<Done | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [upsold, setUpsold] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function reset(): void {
    setStep("input");
    setText("");
    setFileName(null);
    setError(null);
    setPreview(null);
    setSelected(new Set());
    setDone(null);
    setConfirming(false);
    setUpsold(null);
  }

  function close(): void {
    if (busy) return;
    setOpen(false);
    if (step === "done") router.refresh();
    reset();
  }

  async function readFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE) {
      setError("That file is over 5 MB. Export just the domain column.");
      return;
    }
    try {
      if (/\.xlsx$/i.test(file.name)) {
        // Loaded on demand: most imports are a paste or a CSV.
        const { readSheet } = await import("read-excel-file/browser");
        setText(sheetToText(await readSheet(file)));
      } else if (/\.xls$/i.test(file.name)) {
        setError("Old .xls files aren't supported. Save it as .xlsx or CSV.");
        return;
      } else {
        setText(await file.text());
      }
      setFileName(file.name);
    } catch {
      setError("Couldn't read that file. Try saving it as CSV.");
    }
  }

  async function runPreview(): Promise<void> {
    if (busy || text.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sites/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "preview", text }),
      });
      const data = (await res.json()) as Preview & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't read that list.");
      } else {
        setPreview(data);
        setSelected(new Set(data.rows.filter((r) => r.status !== "invalid").map((r) => r.domain)));
        setStep("review");
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    }
    setBusy(false);
  }

  async function runCommit(): Promise<void> {
    if (busy || !preview) return;
    const rows = preview.rows
      .filter((r) => r.status !== "invalid" && selected.has(r.domain))
      .map((r) => ({ domain: r.domain, client: r.client }));
    if (rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sites/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "commit", rows, client, schedule }),
      });
      const data = (await res.json()) as Done & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
      } else {
        setDone(data);
        setStep("done");
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    }
    setBusy(false);
  }

  async function addSeats(): Promise<void> {
    if (busy || !done || schedule === "off") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteIds: done.overflow, schedule }),
      });
      const data = (await res.json()) as { scheduled?: number; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't add sites to your plan.");
      } else {
        setUpsold(`${plural(data.scheduled ?? 0, "more site")} now monitored ${schedule}.`);
        setConfirming(false);
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    }
    setBusy(false);
  }

  async function startCheckout(): Promise<void> {
    if (busy || !done || schedule === "off") return;
    setBusy(true);
    setError(null);
    try {
      try {
        sessionStorage.setItem(
          PENDING_KEY,
          JSON.stringify({ siteIds: done.overflow, schedule, at: Date.now() }),
        );
      } catch {
        // No storage: checkout still works, they just switch sites on by hand.
      }
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan: "monitoring",
          quantity: done.overflow.length,
          returnTo: "sites",
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Couldn't open checkout.");
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't reach the server. Try again.");
      setBusy(false);
    }
  }

  const counts = preview
    ? {
        ready: preview.rows.filter((r) => r.status === "new").length,
        existing: preview.rows.filter((r) => r.status === "existing" || r.status === "restore")
          .length,
        invalid: preview.rows.filter((r) => r.status === "invalid").length,
      }
    : null;
  const chosen = preview
    ? preview.rows.filter((r) => r.status !== "invalid" && selected.has(r.domain)).length
    : 0;

  // Live quote on the review step: how many fit, how many need paying for.
  const plan = preview?.plan ?? null;
  const free = plan ? Math.max(0, plan.limit - plan.used) : 0;
  const overQuote =
    schedule !== "off" && plan ? Math.max(0, chosen - (plan.entitled ? free : 0)) : 0;

  const overflowPlan = done?.plan ?? plan;
  const overflowCount = done?.overflow.length ?? 0;
  const overflowCost = overflowPlan ? overflowCount * overflowPlan.unitPrice : 0;
  const per = overflowPlan?.interval === "year" ? "year" : "month";

  return (
    <>
      <button className="pf-button" onClick={() => setOpen(true)} type="button">
        {label}
      </button>

      <dialog
        className="import-dialog"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        ref={dialogRef}
      >
        <div className="imp-panel">
          <div className="imp-head">
            <div>
              <h2>Import sites</h2>
              <ol className="imp-steps" aria-label="Progress">
                <li className={step === "input" ? "is-on" : "is-past"}>Add</li>
                <li className={step === "review" ? "is-on" : step === "done" ? "is-past" : ""}>
                  Review
                </li>
                <li className={step === "done" ? "is-on" : ""}>Done</li>
              </ol>
            </div>
            <button className="pf-close" disabled={busy} onClick={close} type="button">
              Close
            </button>
          </div>

          {step === "input" && (
            <div className="imp-body imp-fade" key="input">
              <div
                className={dragging ? "imp-drop is-dragging" : "imp-drop"}
                onDragLeave={() => setDragging(false)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void readFile(e.dataTransfer.files[0]);
                }}
              >
                <svg aria-hidden="true" className="imp-drop-icon" viewBox="0 0 24 24">
                  <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
                <p className="imp-drop-title">{fileName ? fileName : "Drop a CSV or Excel file"}</p>
                <p className="imp-drop-sub">
                  or{" "}
                  <button
                    className="link-button"
                    onClick={() => fileRef.current?.click()}
                    type="button"
                  >
                    choose a file
                  </button>
                  . Up to 200 sites.{" "}
                  <a download href="/consentinel-sites-template.csv">
                    Download template
                  </a>
                </p>
                <input
                  accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain"
                  hidden
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    void readFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                  ref={fileRef}
                  type="file"
                />
              </div>

              <label className="imp-paste">
                <span>Or paste domains</span>
                <textarea
                  onChange={(e) => {
                    setText(e.target.value);
                    setFileName(null);
                  }}
                  placeholder={"brand-one.com\nbrand-two.com\nhttps://www.brand-three.com"}
                  rows={6}
                  value={text}
                />
              </label>

              {error !== null && <p className="form-error">{error}</p>}

              <div className="imp-actions">
                <button
                  className="pf-button"
                  disabled={busy || text.trim() === ""}
                  onClick={() => void runPreview()}
                  type="button"
                >
                  {busy ? "Checking domains..." : "Review"}
                </button>
              </div>
            </div>
          )}

          {step === "review" && preview && counts && (
            <div className="imp-body imp-fade" key="review">
              <div className="imp-summary">
                <span className="imp-pill is-good">{plural(counts.ready, "new site")}</span>
                {counts.existing > 0 && (
                  <span className="imp-pill">{String(counts.existing)} already added</span>
                )}
                {counts.invalid > 0 && (
                  <span className="imp-pill is-bad">{String(counts.invalid)} can't import</span>
                )}
                {preview.skipped > 0 && (
                  <span className="imp-pill">{plural(preview.skipped, "line")} skipped</span>
                )}
                {preview.truncated && <span className="imp-pill">Only the first 200 read</span>}
              </div>

              <div className="imp-table-wrap">
                <table className="imp-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          aria-label="Select all"
                          checked={
                            chosen === preview.rows.filter((r) => r.status !== "invalid").length
                          }
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? new Set(
                                    preview.rows
                                      .filter((r) => r.status !== "invalid")
                                      .map((r) => r.domain),
                                  )
                                : new Set(),
                            )
                          }
                          type="checkbox"
                        />
                      </th>
                      <th>Domain</th>
                      {preview.canTagClient && <th>Client</th>}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr
                        className={r.status === "invalid" ? "is-invalid" : undefined}
                        key={r.domain}
                        style={{ animationDelay: `${String(Math.min(i, 20) * 18)}ms` }}
                      >
                        <td>
                          <input
                            aria-label={`Import ${r.domain}`}
                            checked={selected.has(r.domain)}
                            disabled={r.status === "invalid"}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(r.domain);
                              else next.delete(r.domain);
                              setSelected(next);
                            }}
                            type="checkbox"
                          />
                        </td>
                        <td className="imp-domain">{r.domain}</td>
                        {preview.canTagClient && <td className="pf-muted">{r.client ?? ""}</td>}
                        <td>
                          <span className={`imp-status is-${r.status}`}>
                            {r.reason ?? STATUS_LABEL[r.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="imp-options">
                {preview.canTagClient && (
                  <label>
                    <span>Client for untagged rows</span>
                    <input
                      maxLength={120}
                      onChange={(e) => setClient(e.target.value)}
                      placeholder="e.g. Northwind Apparel"
                      value={client}
                    />
                  </label>
                )}
                <label>
                  <span>Monitoring</span>
                  <select
                    onChange={(e) => setSchedule(e.target.value as Schedule)}
                    value={schedule}
                  >
                    <option value="daily">Scan daily</option>
                    <option value="weekly">Scan weekly</option>
                    <option value="off">Manual only</option>
                  </select>
                </label>
              </div>

              {schedule !== "off" && plan && (
                <p className="imp-quote">
                  {plan.entitled
                    ? overQuote === 0
                      ? `All ${String(chosen)} fit your plan.`
                      : `${String(Math.min(chosen, free))} fit your plan. ${plural(overQuote, "more site")} at ${money(plan.unitPrice)}/${plan.interval} each${plan.canAddSeats ? ", added after import" : ""}.`
                    : `Monitoring is ${money(plan.unitPrice)}/month per site. You'll pick it up after import.`}
                </p>
              )}

              {error !== null && <p className="form-error">{error}</p>}

              <div className="imp-actions">
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => setStep("input")}
                  type="button"
                >
                  Back
                </button>
                <button
                  className="pf-button"
                  disabled={busy || chosen === 0}
                  onClick={() => void runCommit()}
                  type="button"
                >
                  {busy ? "Importing..." : `Import ${plural(chosen, "site")}`}
                </button>
              </div>
            </div>
          )}

          {step === "done" && done && (
            <div className="imp-body imp-fade" key="done">
              <div className="imp-done">
                <svg aria-hidden="true" className="imp-check" viewBox="0 0 52 52">
                  <circle cx="26" cy="26" r="24" />
                  <path d="m15 27 7 7 15-15" />
                </svg>
                <p className="imp-done-title">{plural(done.added, "site")} imported</p>
                <p className="quiet">
                  {done.scheduled > 0
                    ? `${String(done.scheduled)} now monitored ${schedule}.`
                    : "Run a scan from any site, or turn on monitoring below."}
                </p>
              </div>

              {done.failed.length > 0 && (
                <ul className="imp-failed">
                  {done.failed.slice(0, 6).map((f) => (
                    <li key={f.domain}>
                      {f.domain}: {f.reason}
                    </li>
                  ))}
                  {done.failed.length > 6 && <li>and {done.failed.length - 6} more</li>}
                </ul>
              )}

              {upsold !== null ? (
                <p className="pf-result">{upsold}</p>
              ) : (
                overflowCount > 0 &&
                overflowPlan && (
                  <div className="imp-upsell">
                    <div>
                      <p className="imp-upsell-title">
                        {plural(overflowCount, "site")} still on manual
                      </p>
                      <p className="quiet">
                        {overflowPlan.canAddSeats
                          ? `Add them to your plan for ${money(overflowCost)}/${per}. Prorated, charged today.`
                          : !overflowPlan.entitled
                            ? `Monitor all ${String(overflowCount)} for ${money(overflowCost)}/month. Daily rescans and an email the moment a tracker fires after opt-out.`
                            : `Your ${overflowPlan.name ?? ""} plan covers ${plural(overflowPlan.limit, "monitored site")}. Change plans in Billing to cover the rest.`}
                      </p>
                    </div>
                    {overflowPlan.canAddSeats ? (
                      confirming ? (
                        <div className="imp-confirm">
                          <button
                            className="btn-secondary"
                            disabled={busy}
                            onClick={() => setConfirming(false)}
                            type="button"
                          >
                            Cancel
                          </button>
                          <button
                            className="pf-button"
                            disabled={busy}
                            onClick={() => void addSeats()}
                            type="button"
                          >
                            {busy ? "Charging..." : `Confirm ${money(overflowCost)}/${per}`}
                          </button>
                        </div>
                      ) : (
                        <button
                          className="pf-button"
                          onClick={() => setConfirming(true)}
                          type="button"
                        >
                          Add {plural(overflowCount, "site")}
                        </button>
                      )
                    ) : !overflowPlan.entitled ? (
                      <button
                        className="pf-button"
                        disabled={busy}
                        onClick={() => void startCheckout()}
                        type="button"
                      >
                        {busy ? "Opening checkout..." : "Start monitoring"}
                      </button>
                    ) : (
                      <a className="pf-button is-ghost" href="/app/billing">
                        Billing
                      </a>
                    )}
                  </div>
                )
              )}

              {error !== null && <p className="form-error">{error}</p>}

              <div className="imp-actions">
                <button className="btn-secondary" disabled={busy} onClick={reset} type="button">
                  Import more
                </button>
                <button className="pf-button" disabled={busy} onClick={close} type="button">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

interface PendingImport {
  siteIds: string[];
  schedule: "daily" | "weekly";
  at: number;
}

function readPending(): PendingImport | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingImport) : null;
  } catch {
    return null;
  }
}

/**
 * Back from checkout: switch on the sites the import asked for. The webhook can
 * land a few seconds after the redirect, so this retries briefly on 402.
 */
export function ImportResume() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || params.get("checkout") !== "success") return;
    ran.current = true;

    const pending = readPending();
    if (!pending || Date.now() - pending.at > 60 * 60 * 1000) {
      setMessage("You're subscribed. Turn on monitoring from any site.");
      return;
    }
    const job = pending;
    setMessage("Payment received. Switching on monitoring...");

    void (async () => {
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          const res = await fetch("/api/sites/schedule-bulk", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ siteIds: job.siteIds, schedule: job.schedule }),
          });
          if (res.ok) {
            const data = (await res.json()) as { scheduled: number };
            try {
              sessionStorage.removeItem(PENDING_KEY);
            } catch {
              // fine
            }
            setMessage(`${plural(data.scheduled, "site")} now monitored ${job.schedule}.`);
            router.refresh();
            return;
          }
          if (res.status !== 402) break;
        } catch {
          // retry
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      setMessage("You're subscribed. Monitoring is taking a moment, refresh in a minute.");
    })();
  }, [params, router]);

  if (message === null) return null;
  return (
    <p className="pf-notice" role="status">
      {message}
    </p>
  );
}
