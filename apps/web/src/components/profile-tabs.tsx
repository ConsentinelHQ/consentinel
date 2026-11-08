"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app/profile", label: "Profile" },
  { href: "/app/profile/security", label: "Security" },
];

/** Page-level tabs, so Clerk's own side menu isn't a second sidebar. */
export function ProfileTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Profile sections" className="profile-tabs">
      {TABS.map((t) => {
        const active =
          t.href === "/app/profile"
            ? !pathname.startsWith("/app/profile/security")
            : pathname.startsWith(t.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? "profile-tab is-active" : "profile-tab"}
            href={t.href}
            key={t.href}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
