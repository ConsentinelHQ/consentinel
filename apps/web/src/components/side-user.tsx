"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ICON = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** One compact row at the bottom of the sidebar. Profile and sign out live in its menu. */
export function SideUser() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName?.trim() || email || "Account";

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="side-user" ref={ref}>
      {open ? (
        <div className="side-menu" role="menu">
          {email ? <p className="side-menu-email">{email}</p> : null}
          <Link className="side-menu-item" href="/app/profile" role="menuitem">
            <svg {...ICON}>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
            Profile
          </Link>
          <button
            className="side-menu-item"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void signOut({ redirectUrl: "/" });
            }}
            role="menuitem"
            type="button"
          >
            <svg {...ICON}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {busy ? "Signing out..." : "Sign out"}
          </button>
        </div>
      ) : null}
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="side-user-row"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        {user?.imageUrl ? (
          // Clerk-hosted avatar; next/image would need Clerk's image domain allowlisted.
          <img alt="" className="side-user-avatar" height={22} src={user.imageUrl} width={22} />
        ) : (
          <span aria-hidden className="side-user-avatar" />
        )}
        <span className="side-user-name">{name}</span>
        <svg {...ICON} className="side-user-chevron">
          <path d="m7 15 5-5 5 5" />
        </svg>
      </button>
    </div>
  );
}
