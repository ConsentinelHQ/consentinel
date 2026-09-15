"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

const OPTIONS = [
  { value: "off", label: "Manual only" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

export function ScheduleControl({
  siteId,
  schedule,
  entitled,
}: {
  siteId: string;
  schedule: string;
  entitled: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(schedule);
  const [error, setError] = useState<string | null>(null);

  const change = useCallback(
    async (next: string): Promise<void> => {
      const previous = value;
      setValue(next);
      setError(null);
      const response = await fetch(`/api/sites/${siteId}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schedule: next }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        // Revert rather than leave the control lying about the stored state.
        setValue(previous);
        setError(data.error ?? "Could not change the schedule.");
        return;
      }
      router.refresh();
    },
    [router, siteId, value],
  );

  return (
    <label className="schedule-control">
      <span>Scan schedule</span>
      <select onChange={(e) => void change(e.target.value)} value={value} disabled={!entitled}>
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {!entitled && (
        <p className="quiet">
          <Link href="/app/billing">Start monitoring</Link> to schedule scans.
        </p>
      )}
      {error !== null && <p className="form-error">{error}</p>}
    </label>
  );
}
