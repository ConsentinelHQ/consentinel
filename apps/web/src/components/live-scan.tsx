"use client";

import { useEffect, useState, type ReactNode } from "react";

interface LiveEvent {
  t: number;
  kind: "phase" | "vendor" | "a11y" | "info";
  label: string;
  detail?: string;
}

export interface LiveState {
  startedAt: number;
  phase: string;
  events: LiveEvent[];
  frame?: string;
  frameAt?: number;
  updatedAt: number;
}

const POLL_MS = 1200;

/**
 * Watch the scan run on your own site: the page as our browser sees it, and
 * every tag and accessibility issue as it turns up. Falls back to `fallback`
 * until the worker has something to show.
 */
export function LiveScan({
  scanId,
  host,
  fallback,
}: {
  scanId: string;
  host: string;
  fallback: ReactNode;
}) {
  const [live, setLive] = useState<LiveState | null>(null);

  useEffect(() => {
    let on = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/scan/${scanId}/live`, { cache: "no-store" });
        const data = (await res.json()) as { status?: string; live?: LiveState | null };
        if (!on) return;
        if (data.live) setLive(data.live);
        if (data.status !== "queued" && data.status !== "running") return;
      } catch {
        // Next poll.
      }
      if (on) timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      on = false;
      clearTimeout(timer);
    };
  }, [scanId]);

  if (!live || (!live.frame && live.events.length === 0)) return <>{fallback}</>;
  return <LiveView host={host} live={live} />;
}

/** The view itself, separate from polling so it can be rendered on its own. */
export function LiveView({ live, host }: { live: LiveState; host: string }) {
  // A vendor that ignores both opt-outs is still one tracker.
  const vendors = [...new Set(live.events.filter((e) => e.kind === "vendor").map((e) => e.label))];
  const a11y = live.events.filter((e) => e.kind === "a11y");
  const feed = live.events
    .filter((e) => e.kind !== "phase")
    .slice(-12)
    .reverse();
  const secs = Math.max(0, Math.floor((live.updatedAt - live.startedAt) / 1000));
  const clock = `${String(Math.floor(secs / 60))}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="live">
      <div className="live-browser">
        <div className="live-bar">
          <i />
          <i />
          <i />
          <span className="live-url">{host}</span>
          <span className="live-rec">
            <b />
            Live
          </span>
        </div>
        <div className="live-screen">
          {live.frame ? (
            // A data URL from our own worker, swapped every couple of seconds.
            <img alt={`${host} as our scanner sees it`} key={live.frameAt} src={live.frame} />
          ) : (
            <div className="live-screen-wait">Opening {host}</div>
          )}
          <span className="live-sweep" />
        </div>
      </div>

      <aside className="live-side">
        <div aria-live="polite" className="live-phase" role="status">
          <span key={live.phase}>{live.phase}</span>
          <span className="live-clock">{clock}</span>
        </div>
        <div className="live-counts">
          <div className={vendors.length ? "is-bad" : ""}>
            <b>{vendors.length}</b>
            <span>{vendors.length === 1 ? "tracker after opt-out" : "trackers after opt-out"}</span>
          </div>
          <div className={a11y.length ? "is-warn" : ""}>
            <b>{a11y.length}</b>
            <span>{a11y.length === 1 ? "accessibility issue" : "accessibility issues"}</span>
          </div>
        </div>
        <ul className="live-feed">
          {feed.map((e) => (
            <li className={`is-${e.kind}`} key={`${String(e.t)}-${e.label}`}>
              <span className="live-dot" />
              <span className="live-text">
                <strong>{e.label}</strong>
                {e.detail && <em>{e.detail}</em>}
              </span>
            </li>
          ))}
          {feed.length === 0 && <li className="is-info live-empty">Watching every request…</li>}
        </ul>
      </aside>
    </div>
  );
}
