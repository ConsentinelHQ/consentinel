"use client";

import { useEffect, useState } from "react";

type State = "unsupported" | NotificationPermission;

/** Turns on desktop alerts for finished scans, or says why they're off. */
export function NotifyToggle() {
  const [state, setState] = useState<State>("unsupported");
  useEffect(() => {
    if (typeof Notification !== "undefined") setState(Notification.permission);
  }, []);

  if (state === "unsupported") return null;
  if (state === "granted") return <span className="notify-state">Desktop alerts on</span>;
  if (state === "denied") {
    return <span className="notify-state">Desktop alerts blocked in your browser settings</span>;
  }
  return (
    <button
      className="notify-toggle"
      onClick={() => void Notification.requestPermission().then(setState)}
      type="button"
    >
      Get a desktop alert when scans finish
    </button>
  );
}
