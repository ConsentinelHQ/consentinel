"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/** Bottom of the sidebar: who's signed in, a link to their profile, and sign out. */
export function SideUser() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const active = pathname.startsWith("/app/profile");
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName?.trim() || email;

  return (
    <div className="side-user">
      <Link
        aria-current={active ? "page" : undefined}
        className={active ? "side-user-card is-active" : "side-user-card"}
        href="/app/profile"
      >
        {user?.imageUrl ? (
          // Clerk-hosted avatar; next/image would need Clerk's image domain allowlisted.
          <img alt="" className="side-user-avatar" height={28} src={user.imageUrl} width={28} />
        ) : (
          <span aria-hidden className="side-user-avatar" />
        )}
        <span className="side-user-text">
          <span className="side-user-name">{name || "Profile"}</span>
          {name !== email && email ? <span className="side-user-email">{email}</span> : null}
        </span>
      </Link>
      <button
        className="side-link side-signout"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signOut({ redirectUrl: "/" });
        }}
        type="button"
      >
        <svg
          aria-hidden
          fill="none"
          height={16}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
          width={16}
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        <span>{busy ? "Signing out..." : "Sign out"}</span>
      </button>
    </div>
  );
}
