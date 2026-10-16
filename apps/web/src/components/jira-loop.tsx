"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The Jira story as one loop: regression opens a ticket, someone closes it,
 * the rescan catches that the fix didn't ship, it goes back, then it's verified.
 * The false fix is the point - it's the thing a plain integration can't show.
 *
 * Runs only while on screen. Reduced motion gets the finished state, no loop.
 */

type Col = 0 | 1 | 2;
interface Step {
  col: Col;
  status: string;
  tone: "neutral" | "critical" | "gated";
  card: boolean;
  scanning: boolean;
  comments: 0 | 1 | 2;
  ms: number;
}

const STEPS: Step[] = [
  {
    col: 0,
    status: "Daily scan: 2 new trackers firing after opt-out",
    tone: "critical",
    card: false,
    scanning: false,
    comments: 0,
    ms: 1600,
  },
  {
    col: 0,
    status: "Ticket opened with the evidence and the fix",
    tone: "neutral",
    card: true,
    scanning: false,
    comments: 0,
    ms: 1700,
  },
  {
    col: 1,
    status: "Your team picks it up",
    tone: "neutral",
    card: true,
    scanning: false,
    comments: 0,
    ms: 1400,
  },
  {
    col: 2,
    status: "Moved to Done. Rescanning the site",
    tone: "neutral",
    card: true,
    scanning: true,
    comments: 0,
    ms: 2200,
  },
  {
    col: 2,
    status: "1 tracker still fires. Not fixed",
    tone: "critical",
    card: true,
    scanning: false,
    comments: 1,
    ms: 2000,
  },
  {
    col: 1,
    status: "Back to In Progress",
    tone: "neutral",
    card: true,
    scanning: false,
    comments: 1,
    ms: 1500,
  },
  {
    col: 2,
    status: "Moved to Done. Rescanning the site",
    tone: "neutral",
    card: true,
    scanning: true,
    comments: 1,
    ms: 2200,
  },
  {
    col: 2,
    status: "Verified fixed",
    tone: "gated",
    card: true,
    scanning: false,
    comments: 2,
    ms: 3400,
  },
];

const FINAL = STEPS.length - 1;
// Background tickets so it reads as a real team board, not a demo with one card.
const COLUMNS = [
  { name: "To Do", ghost: { title: "Update returns page copy", key: "SHOP-145" } },
  { name: "In Progress", ghost: { title: "Compress product images", key: "SHOP-139" } },
  { name: "Done", ghost: { title: "Fix mobile nav overlap", key: "SHOP-131" } },
] as const;

export function JiraLoop() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(FINAL);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setLive(entry?.isIntersecting ?? false);
      },
      { threshold: 0.35 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // Start from the top each time it comes into view.
  useEffect(() => {
    if (live) setStep(0);
  }, [live]);

  useEffect(() => {
    if (!live) return;
    const current = STEPS[step];
    if (!current) return;
    const t = window.setTimeout(() => setStep((s) => (s + 1) % STEPS.length), current.ms);
    return () => window.clearTimeout(t);
  }, [live, step]);

  const s = STEPS[step] ?? STEPS[FINAL]!;

  return (
    <div aria-hidden="true" className="jl" ref={ref}>
      <div className="jl-board">
        <div className="jl-bar">
          <span className="jl-crumb">SHOP board</span>
          <span className={`jl-status is-${s.tone}`} key={step}>
            <span className="jl-dot" />
            {s.status}
          </span>
        </div>
        <div className="jl-cols">
          {COLUMNS.map((col) => (
            <div className="jl-col" key={col.name}>
              <span className="jl-col-name">{col.name}</span>
              <span className="jl-ghost">
                <span className="jl-ghost-title">{col.ghost.title}</span>
                <span className="jl-key">{col.ghost.key}</span>
              </span>
            </div>
          ))}
          <div className="jl-track">
            <div
              className={`jl-card${s.card ? " is-on" : ""}${s.scanning ? " is-scanning" : ""}`}
              style={{ "--col": s.col } as React.CSSProperties}
            >
              <span className="jl-card-title">2 new critical privacy issues on northvale.com</span>
              <span className="jl-card-meta">
                <span className="jl-key">SHOP-142</span>
                <span className="jl-label">consentinel</span>
              </span>
              <span className="jl-sweep" />
            </div>
          </div>
        </div>
      </div>

      <div className="jl-feed">
        <span className="jl-feed-head">SHOP-142 activity</span>
        <div className={`jl-comment is-critical${s.comments >= 1 ? " is-on" : ""}`}>
          <span className="jl-avatar">C</span>
          <p>
            <strong>Not fixed.</strong> 1 of 2 findings still fires after opt-out: Meta Pixel.
            Reopen this ticket.
          </p>
        </div>
        <div className={`jl-comment is-gated${s.comments >= 2 ? " is-on" : ""}`}>
          <span className="jl-avatar">C</span>
          <p>
            <strong>Verified fixed.</strong> Rescanned northvale.com. None of the 2 findings fire
            after opt-out anymore.
          </p>
        </div>
      </div>
    </div>
  );
}
