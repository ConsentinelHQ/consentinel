"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Reusable confirm modal on native <dialog>: Esc, focus, and backdrop for free. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      className="confirm"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        // Clicking the backdrop closes; clicks inside the panel do not.
        if (e.target === e.currentTarget) onCancel();
      }}
      ref={ref}
    >
      <div className="confirm-panel">
        <h2>{title}</h2>
        <div className="confirm-body">{children}</div>
        <div className="confirm-actions">
          <button className="btn-secondary" disabled={busy} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className={danger ? "btn-danger" : undefined}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
