"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * The scanner reports only "queued" or "running", so step labels advance on a
 * timer and hold on the last one rather than claiming progress we cannot see.
 * The elapsed clock is the one number that is real.
 */
const STEPS = [
  "Opening the page",
  "Declining consent",
  "Recording what fires",
  "Opening a clean browser",
  "Accepting consent",
  "Comparing the two",
];
const STEP_MS = 12_000;

export function ScanProgress({ status }: { status: string }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const running = status === "running";
  const ms = now - startedAt;
  const step = running ? Math.min(STEPS.length - 1, Math.floor(ms / STEP_MS)) : -1;
  const label = step >= 0 ? (STEPS[step] ?? "Comparing the two") : "Waiting for a scanner";
  const secs = Math.floor(ms / 1000);
  const clock = `${String(Math.floor(secs / 60))}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <>
      <div aria-hidden className="scanviz">
        <Pane active={running} label="Declined" tone="denied" />
        <Pane active={running} label="Accepted" tone="granted" />
      </div>
      <div aria-live="polite" className="scanstatus" role="status">
        <span className="scanstatus-step" key={label}>
          {label}
        </span>
        <span className="scanstatus-time">{clock}</span>
      </div>
    </>
  );
}

function Pane({
  active,
  label,
  tone,
}: {
  active: boolean;
  label: string;
  tone: "denied" | "granted";
}) {
  return (
    <div className={`pane is-${tone}${active ? " is-active" : ""}`}>
      <div className="pane-bar">
        <i />
        <i />
        <i />
        <span>{label}</span>
      </div>
      <div className="pane-body">
        <span className="pane-line" style={{ width: "82%" }} />
        <span className="pane-line" style={{ width: "64%" }} />
        <span className="pane-line" style={{ width: "74%" }} />
        <span className="pane-scan" />
        <span className="pane-dots">
          {Array.from({ length: tone === "denied" ? 9 : 6 }, (_, i) => (
            <span className="pane-dot" key={i} style={{ "--i": i } as CSSProperties} />
          ))}
        </span>
      </div>
    </div>
  );
}
