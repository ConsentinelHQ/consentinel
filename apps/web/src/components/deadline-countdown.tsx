"use client";

import { useEffect, useState } from "react";

/** Midnight Pacific, January 1, 2027: when AB 566 takes effect. */
const DEADLINE = Date.parse("2027-01-01T00:00:00-08:00");

function parts(ms: number): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(ms / 60_000));
  return {
    days: Math.floor(total / 1440),
    hours: Math.floor((total % 1440) / 60),
    minutes: total % 60,
  };
}

/**
 * Live countdown to the browser deadline. Renders the date on the server and
 * the count after mount, so static HTML never shows a stale number.
 */
export function DeadlineCountdown() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (now === null) {
    return (
      <div className="countdown" aria-label="January 1, 2027">
        <span className="countdown-date">January 1, 2027</span>
      </div>
    );
  }

  if (now >= DEADLINE) {
    return (
      <div className="countdown">
        <span className="countdown-live">
          <span aria-hidden="true" className="countdown-dot" />
          In effect since January 1, 2027
        </span>
      </div>
    );
  }

  const { days, hours, minutes } = parts(DEADLINE - now);
  return (
    <div
      aria-label={`${String(days)} days, ${String(hours)} hours until January 1, 2027`}
      className="countdown"
      role="timer"
    >
      <Unit label="days" value={days} />
      <Unit label="hours" value={hours} />
      <Unit label="minutes" value={minutes} />
    </div>
  );
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <span className="countdown-unit">
      <span className="countdown-num" key={value}>
        {String(value).padStart(2, "0")}
      </span>
      <span className="countdown-label">{label}</span>
    </span>
  );
}
