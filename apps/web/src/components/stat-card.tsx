"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Source = { label: string; url: string };

/** A stat that opens a modal with the story behind the number and its sources. */
export function StatCard({
  value,
  label,
  title,
  children,
  sources,
  jump,
}: {
  value: ReactNode;
  label: string;
  title: string;
  children: ReactNode;
  sources: Source[];
  jump?: { label: string; href: string };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button className="gpc-stat" onClick={() => setOpen(true)} type="button">
        <span className="gpc-stat-num">{value}</span>
        <span className="gpc-stat-label">{label}</span>
        <span className="gpc-stat-more">
          Details <span aria-hidden="true">&rarr;</span>
        </span>
      </button>
      <dialog
        className="stat-dialog"
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        ref={ref}
      >
        <div className="stat-dialog-panel">
          <button
            aria-label="Close"
            className="stat-dialog-close"
            onClick={() => setOpen(false)}
            type="button"
          >
            &times;
          </button>
          <p className="stat-dialog-value">{value}</p>
          <h2>{title}</h2>
          <div className="stat-dialog-body">{children}</div>
          {jump && (
            <a className="stat-dialog-jump" href={jump.href} onClick={() => setOpen(false)}>
              {jump.label} <span aria-hidden="true">&rarr;</span>
            </a>
          )}
          <p className="stat-dialog-sources-label">Sources</p>
          <ul className="stat-dialog-sources">
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} rel="noopener noreferrer" target="_blank">
                  {s.label} <span aria-hidden="true">&#8599;</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
