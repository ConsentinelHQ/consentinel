"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "most-critical", label: "Most critical" },
  { value: "fewest-critical", label: "Fewest critical" },
];
const STATUSES = [
  { value: "all", label: "All results" },
  { value: "complete", label: "Completed" },
  { value: "failed", label: "Failed or blocked" },
  { value: "active", label: "In progress" },
];
const TRIGGERS = [
  { value: "all", label: "All triggers" },
  { value: "scheduled", label: "Scheduled" },
  { value: "manual", label: "Manual" },
  { value: "deploy", label: "Deploy" },
  { value: "jira", label: "Jira" },
];
const SIZES = [
  { value: "10", label: "10 per page" },
  { value: "20", label: "20 per page" },
  { value: "50", label: "50 per page" },
  { value: "all", label: "Show all" },
];

/** Sort, filter and page size for scan history. State lives in the URL, so views are linkable. */
export function HistoryControls({
  sort,
  status,
  trigger,
  per,
}: {
  sort: string;
  status: string;
  trigger: string;
  per: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const set = (key: string, value: string, fallback: string): void => {
    const next = new URLSearchParams(params.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    // Any change to the view starts from the first page.
    next.delete("page");
    const qs = next.toString();
    start(() => router.replace(`${pathname}${qs ? `?${qs}` : ""}#history`, { scroll: false }));
  };

  const filtered = status !== "all" || trigger !== "all";

  return (
    <div aria-busy={pending} className={`history-controls${pending ? " is-pending" : ""}`}>
      <Select
        label="Sort"
        onChange={(v) => set("sort", v, "newest")}
        options={SORTS}
        value={sort}
      />
      <Select
        label="Result"
        onChange={(v) => set("status", v, "all")}
        options={STATUSES}
        value={status}
      />
      <Select
        label="Trigger"
        onChange={(v) => set("trigger", v, "all")}
        options={TRIGGERS}
        value={trigger}
      />
      <Select label="Show" onChange={(v) => set("per", v, "20")} options={SIZES} value={per} />
      {filtered && (
        <button
          className="history-clear"
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            next.delete("status");
            next.delete("trigger");
            next.delete("page");
            const qs = next.toString();
            start(() =>
              router.replace(`${pathname}${qs ? `?${qs}` : ""}#history`, { scroll: false }),
            );
          }}
          type="button"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="history-select">
      <select aria-label={label} onChange={(e) => onChange(e.target.value)} value={value}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
