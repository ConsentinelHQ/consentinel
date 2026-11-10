"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";

/** Fired by the jump bar so a collapsed section opens before it's scrolled to. */
export const OPEN_SECTION_EVENT = "report:open-section";

/**
 * A report section that folds to its header. Open by default: a report is read
 * top to bottom the first time, and folded when someone only owns one part.
 */
export function CollapsibleSection({
  id,
  className,
  labelledBy,
  head,
  children,
  style,
}: {
  id: string;
  className: string;
  labelledBy?: string;
  head: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();

  useEffect(() => {
    const onOpen = (e: Event): void => {
      if ((e as CustomEvent<string>).detail === id) setOpen(true);
    };
    window.addEventListener(OPEN_SECTION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SECTION_EVENT, onOpen);
  }, [id]);

  return (
    <section
      aria-labelledby={labelledBy}
      className={`${className} collapsible${open ? "" : " is-collapsed"}`}
      id={id}
      style={style}
    >
      <div
        className="collapsible-head"
        onClick={(e) => {
          // Links in the header keep working.
          if ((e.target as HTMLElement).closest("a, button")) return;
          setOpen((o) => !o);
        }}
      >
        <div className="collapsible-head-main">{head}</div>
        <button
          aria-controls={bodyId}
          aria-expanded={open}
          aria-label={open ? "Collapse section" : "Expand section"}
          className="collapsible-toggle"
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
            <path
              d="M3 5.5l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        </button>
      </div>
      <div className="collapsible-body" id={bodyId}>
        <div className="collapsible-inner">{children}</div>
      </div>
    </section>
  );
}
