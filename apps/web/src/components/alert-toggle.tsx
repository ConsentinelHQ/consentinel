"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AlertToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean): Promise<void> {
    setOn(next);
    setSaving(true);
    setError(null);
    let ok = false;
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    setSaving(false);
    if (!ok) {
      // Revert so the switch never lies about the stored state.
      setOn(!next);
      setError("Couldn't save that. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <label className="alert-toggle">
        <input
          checked={on}
          className="switch"
          disabled={saving}
          onChange={(e) => void change(e.target.checked)}
          role="switch"
          type="checkbox"
        />
        <span>
          <strong>Email me about new critical issues</strong>
          <span className="quiet alert-toggle-sub">
            Sent when a scheduled scan finds a tracker firing after reject that wasn't there before.
          </span>
        </span>
      </label>
      {error !== null && <p className="form-error panel-empty">{error}</p>}
    </div>
  );
}
