"use client";

import { useId, useState } from "react";

export type FaqItem = { q: string; a: string };

/** Single-open accordion. Height animates via grid rows, no measuring. */
export function Faq({ items }: { items: readonly FaqItem[] }) {
  const [open, setOpen] = useState<number>(0);
  const base = useId();

  return (
    <div className="qa">
      {items.map((item, i) => {
        const isOpen = open === i;
        const id = `${base}-${String(i)}`;
        return (
          <div className="qa-item" data-open={isOpen ? "" : undefined} key={item.q}>
            <button
              aria-controls={id}
              aria-expanded={isOpen}
              className="qa-q"
              onClick={() => {
                setOpen(isOpen ? -1 : i);
              }}
              type="button"
            >
              <span>{item.q}</span>
              <span aria-hidden="true" className="qa-icon" />
            </button>
            <div className="qa-a" id={id} role="region">
              <div>
                <p>{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
