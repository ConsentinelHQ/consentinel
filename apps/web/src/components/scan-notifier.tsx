"use client";

import { useEffect } from "react";

interface Finished {
  id: string;
  host: string;
  status: "complete" | "failed";
  critical: number;
  warning: number;
  error: string | null;
}

/** Fast while a scan runs, slow otherwise. */
const ACTIVE_MS = 8_000;
const IDLE_MS = 60_000;

/** Ask once, from a click: browsers only allow the prompt after a user action. */
export function askForScanNotifications(): void {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

function body(s: Finished): string {
  if (s.status === "failed") return s.error ?? "The scan failed.";
  if (s.critical === 0 && s.warning === 0) return "No violations found.";
  const parts = [
    s.critical ? `${String(s.critical)} critical` : "",
    s.warning ? `${String(s.warning)} ${s.warning === 1 ? "warning" : "warnings"}` : "",
  ].filter(Boolean);
  return `${parts.join(", ")}. Open the report.`;
}

/**
 * Desktop notification when a scan in the current org finishes, while any app
 * tab is open. The scan ID is the notification tag, so several open tabs show
 * one notification, not one each.
 */
export function ScanNotifier() {
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    let since = new Date().toISOString();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const poll = async (): Promise<void> => {
      let next = IDLE_MS;
      try {
        const res = await fetch(`/api/scans/activity?since=${encodeURIComponent(since)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { now: string; active: number; finished: Finished[] };
          since = data.now;
          if (data.active > 0) next = ACTIVE_MS;
          if (Notification.permission === "granted") {
            for (const s of data.finished) {
              const n = new Notification(
                s.status === "failed" ? `Scan failed: ${s.host}` : `Scan finished: ${s.host}`,
                { body: body(s), tag: `scan-${s.id}`, icon: "/logo.svg" },
              );
              n.onclick = () => {
                window.focus();
                window.location.href = `/app/scans/${s.id}`;
                n.close();
              };
            }
          }
        }
      } catch {
        // Offline or signed out: try again later.
      }
      if (!stopped) timer = setTimeout(() => void poll(), next);
    };

    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);
  return null;
}
