import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

// The app shell replaces the marketing nav entirely. Different job, different bar.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="wrap app-bar-inner">
          <Link className="nav-mark" href="/app">
            <Image alt="" height={22} src="/logo.svg" width={22} />
            <span>Consentinel</span>
          </Link>
          <div className="app-bar-right">
            <OrganizationSwitcher
              afterCreateOrganizationUrl="/app"
              afterSelectOrganizationUrl="/app"
              hidePersonal={false}
            />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
