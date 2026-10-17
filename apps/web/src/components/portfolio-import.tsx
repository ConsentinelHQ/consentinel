"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

interface Result {
  added: number;
  scheduled: number;
  overLimit: number;
  failed: { domain: string; reason: string }[];
  truncated: boolean;
}

/** Paste a list or drop a CSV, tag it with a client, optionally turn on monitoring. */
export function PortfolioImport({
  clients,
  canSchedule,
}: {
  clients: string[];
  canSchedule: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [client, setClient] = useState("");
  const [schedule, setSchedule] = useState<"off" | "daily" | "weekly">("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [dragging, setDragging] = useState(false);

  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").length;

  async function readFile(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("That file is over 1 MB. Export just the domain column.");
      return;
    }
    setText(await file.text());
    setError(null);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy || text.trim() === "") return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/portfolio/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, client, schedule }),
      });
      const data = (await res.json()) as Result & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
      } else {
        setResult(data);
        setText("");
        router.refresh();
      }
    } catch {
      setError("Couldn’t reach the server. Try again.");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button className="pf-button" onClick={() => setOpen(true)} type="button">
        Import sites
      </button>
    );
  }

  return (
    <div className="pf-import-wrap">
      <form className="panel pf-import" onSubmit={(e) => void submit(e)}>
        <div className="panel-head">
          <h2>Import sites</h2>
          <button className="pf-close" onClick={() => setOpen(false)} type="button">
            Close
          </button>
        </div>

        <div
          className={dragging ? "pf-drop is-dragging" : "pf-drop"}
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
          <textarea
            aria-label="Domains"
            onChange={(e) => setText(e.target.value)}
            placeholder={"brand-one.com\nbrand-two.com\nhttps://www.brand-three.com"}
            rows={7}
            value={text}
          />
          <p className="pf-hint">
            One domain per line, or drop a CSV. We take the first domain on each row and skip
            emails. Up to 200 at a time.{" "}
            <button className="link-button" onClick={() => fileRef.current?.click()} type="button">
              Choose a file
            </button>
          </p>
          <input
            accept=".csv,.txt,text/csv,text/plain"
            hidden
            onChange={(e: ChangeEvent<HTMLInputElement>) => void readFile(e.target.files?.[0])}
            ref={fileRef}
            type="file"
          />
        </div>

        <div className="pf-import-row">
          <label>
            <span>Client</span>
            <input
              list="pf-clients"
              maxLength={120}
              onChange={(e) => setClient(e.target.value)}
              placeholder="e.g. Northwind Apparel"
              value={client}
            />
            <datalist id="pf-clients">
              {clients.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label>
            <span>Monitoring</span>
            <select
              disabled={!canSchedule}
              onChange={(e) => setSchedule(e.target.value as typeof schedule)}
              value={schedule}
            >
              <option value="off">Manual only</option>
              <option value="daily">Scan daily</option>
              <option value="weekly">Scan weekly</option>
            </select>
          </label>
          <button className="pf-button" disabled={busy || lines === 0} type="submit">
            {busy ? "Importing..." : lines > 0 ? `Import ${String(lines)}` : "Import"}
          </button>
        </div>

        {error !== null && <p className="form-error">{error}</p>}

        {result !== null && (
          <div className="pf-result" role="status">
            <p>
              <strong>{result.added}</strong> site{result.added === 1 ? "" : "s"} added
              {result.scheduled > 0 ? `, ${String(result.scheduled)} now monitored` : ""}.
              {result.overLimit > 0
                ? ` ${String(result.overLimit)} left on manual: your plan’s monitoring slots are full.`
                : ""}
              {result.truncated ? " Only the first 200 were read." : ""}
            </p>
            {result.failed.length > 0 && (
              <ul>
                {result.failed.slice(0, 8).map((f) => (
                  <li key={f.domain}>
                    {f.domain}: {f.reason}
                  </li>
                ))}
                {result.failed.length > 8 && <li>and {result.failed.length - 8} more</li>}
              </ul>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
