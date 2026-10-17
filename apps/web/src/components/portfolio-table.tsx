"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export interface PortfolioItem {
  id: string;
  host: string;
  client: string | null;
  status: "critical" | "clean" | "blocked" | "failed" | "running" | "never";
  statusLabel: string;
  critical: number | null;
  change: number | null;
  cmpName: string | null;
  lastScanAt: string | null;
  schedule: string;
}

type Filter = "all" | "critical" | "clean" | "attention";
type Sort = "risk" | "site" | "recent";

const NO_CLIENT = "__none__";

function ago(iso: string | null): string {
  if (iso === null) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${String(mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${String(hours)}h ago`;
  return `${String(Math.round(hours / 24))}d ago`;
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="pf-change is-flat">-</span>;
  if (value === 0) return <span className="pf-change is-flat">no change</span>;
  return value > 0 ? (
    <span className="pf-change is-up">+{value} new</span>
  ) : (
    <span className="pf-change is-down">{Math.abs(value)} fixed</span>
  );
}

export function PortfolioTable({ items }: { items: PortfolioItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [client, setClient] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("risk");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  const clients = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      const key = i.client ?? NO_CLIENT;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) =>
      a[0] === NO_CLIENT ? 1 : b[0] === NO_CLIENT ? -1 : a[0].localeCompare(b[0]),
    );
  }, [items]);

  const maxCritical = useMemo(() => Math.max(1, ...items.map((i) => i.critical ?? 0)), [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = items.filter((i) => {
      if (client !== null && (i.client ?? NO_CLIENT) !== client) return false;
      if (filter === "critical" && i.status !== "critical") return false;
      if (filter === "clean" && i.status !== "clean") return false;
      if (filter === "attention" && !["blocked", "failed", "never"].includes(i.status))
        return false;
      if (q === "") return true;
      return i.host.includes(q) || (i.client ?? "").toLowerCase().includes(q);
    });
    const byTime = (i: PortfolioItem): number =>
      i.lastScanAt === null ? 0 : new Date(i.lastScanAt).getTime();
    return [...rows].sort((a, b) => {
      if (sort === "site") return a.host.localeCompare(b.host);
      if (sort === "recent") return byTime(b) - byTime(a);
      return (b.critical ?? -1) - (a.critical ?? -1) || (b.change ?? 0) - (a.change ?? 0);
    });
  }, [items, client, filter, query, sort]);

  const scopeClient = client !== null && client !== NO_CLIENT ? client : undefined;

  async function rescan(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/portfolio/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(scopeClient !== undefined ? { client: scopeClient } : {}),
      });
      const data = (await res.json()) as {
        error?: string;
        queued?: number;
        alreadyRunning?: number;
      };
      if (!res.ok) {
        setNotice({ text: data.error ?? "Couldn’t start the rescan.", error: true });
      } else {
        const running = data.alreadyRunning ?? 0;
        setNotice({
          text: `${String(data.queued ?? 0)} scans queued${running > 0 ? `, ${String(running)} already running` : ""}. Results land here as they finish.`,
          error: false,
        });
        router.refresh();
      }
    } catch {
      setNotice({ text: "Couldn’t reach the server.", error: true });
    }
    setBusy(false);
  }

  const exportHref =
    scopeClient !== undefined
      ? `/api/portfolio/export?client=${encodeURIComponent(scopeClient)}`
      : "/api/portfolio/export";

  return (
    <section className="panel pf">
      <div className="pf-toolbar">
        <div className="pf-chips" role="tablist" aria-label="Clients">
          <button
            aria-selected={client === null}
            className={client === null ? "pf-chip is-active" : "pf-chip"}
            onClick={() => setClient(null)}
            role="tab"
            type="button"
          >
            All clients <span>{items.length}</span>
          </button>
          {clients.map(([name, n]) => (
            <button
              aria-selected={client === name}
              className={client === name ? "pf-chip is-active" : "pf-chip"}
              key={name}
              onClick={() => setClient(name)}
              role="tab"
              type="button"
            >
              {name === NO_CLIENT ? "Unassigned" : name} <span>{n}</span>
            </button>
          ))}
        </div>
        <div className="pf-controls">
          <input
            aria-label="Search sites"
            className="pf-search"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites or clients"
            type="search"
            value={query}
          />
          <select
            aria-label="Filter"
            className="pf-select"
            onChange={(e) => setFilter(e.target.value as Filter)}
            value={filter}
          >
            <option value="all">All statuses</option>
            <option value="critical">Critical</option>
            <option value="clean">Clean</option>
            <option value="attention">Blocked or not scanned</option>
          </select>
          <select
            aria-label="Sort"
            className="pf-select"
            onChange={(e) => setSort(e.target.value as Sort)}
            value={sort}
          >
            <option value="risk">Highest risk</option>
            <option value="recent">Recently scanned</option>
            <option value="site">Site A-Z</option>
          </select>
          <a className="pf-button is-ghost" href={exportHref}>
            Export CSV
          </a>
          <button className="pf-button" disabled={busy} onClick={() => void rescan()} type="button">
            {busy
              ? "Queuing..."
              : scopeClient !== undefined
                ? `Rescan ${scopeClient}`
                : "Rescan all"}
          </button>
        </div>
      </div>

      {notice !== null && (
        <p className={notice.error ? "pf-notice is-error" : "pf-notice"} role="status">
          {notice.text}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="panel-empty">No sites match.</p>
      ) : (
        <div className="pf-scroll">
          <table className="pf-table">
            <thead>
              <tr>
                <th scope="col">Site</th>
                <th scope="col">Client</th>
                <th scope="col">Status</th>
                <th scope="col" className="pf-num">
                  Critical
                </th>
                <th scope="col">Since last scan</th>
                <th scope="col">Consent platform</th>
                <th scope="col">Last scan</th>
                <th scope="col">Schedule</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i, n) => (
                <tr
                  className="pf-row"
                  key={i.id}
                  onClick={() => router.push(`/app/sites/${i.id}`)}
                  style={{ ["--i" as string]: Math.min(n, 20) }}
                >
                  <td>
                    <Link
                      className="pf-site"
                      href={`/app/sites/${i.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {i.host}
                    </Link>
                  </td>
                  <td className="pf-muted">{i.client ?? "-"}</td>
                  <td>
                    <span className={`pf-status is-${i.status}`}>
                      <span className="pf-dot" aria-hidden />
                      {i.statusLabel}
                    </span>
                  </td>
                  <td className="pf-num">
                    {i.critical === null ? (
                      <span className="pf-muted">-</span>
                    ) : (
                      <span className="pf-meter">
                        <span className="pf-meter-value">{i.critical}</span>
                        <span className="pf-meter-track" aria-hidden>
                          <span
                            className="pf-meter-fill"
                            style={{ width: `${String((i.critical / maxCritical) * 100)}%` }}
                          />
                        </span>
                      </span>
                    )}
                  </td>
                  <td>
                    <Change value={i.change} />
                  </td>
                  <td className="pf-muted">{i.cmpName ?? "none detected"}</td>
                  <td className="pf-muted">{ago(i.lastScanAt)}</td>
                  <td className="pf-muted">{i.schedule === "off" ? "manual" : i.schedule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
