import { OrganizationSwitcher } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { SideUser } from "@/components/side-user";
import { ScanNotifier } from "@/components/scan-notifier";

// Side rail on desktop, top bar on mobile.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dash">
      <ScanNotifier />
      <aside className="dash-side">
        <Link className="nav-mark dash-mark" href="/app">
          <Image alt="" height={22} src="/logo.svg" width={22} />
          <span>Consentinel</span>
        </Link>
        <AppNav />
        {/* Company and person at the bottom, like most apps. */}
        <div className="side-bottom">
          <div className="dash-account">
            <OrganizationSwitcher
              afterCreateOrganizationUrl="/app"
              afterSelectOrganizationUrl="/app"
              hidePersonal={false}
              appearance={{
                variables: {
                  colorBackground: "#ffffff",
                  colorForeground: "#18181b",
                  colorMutedForeground: "#71717a",
                  colorNeutral: "#18181b",
                  colorPrimary: "#18181b",
                },
                elements: {
                  organizationSwitcherTrigger: {
                    color: "#18181b",
                    padding: "6px 10px",
                    borderRadius: "8px",
                    "&:hover": { backgroundColor: "#f4f4f5", color: "#18181b" },
                    "&:focus": { boxShadow: "none" },
                  },
                  organizationSwitcherPopoverCard: {
                    backgroundColor: "#ffffff",
                    border: "1px solid #e4e4e7",
                  },
                  organizationSwitcherPreviewButton: {
                    "&:hover": { backgroundColor: "#f4f4f5" },
                  },
                  organizationSwitcherPopoverActionButton: {
                    color: "#3f3f46",
                    "&:hover": { backgroundColor: "#f4f4f5", color: "#18181b" },
                  },
                  organizationPreviewMainIdentifier: { color: "#18181b" },
                  organizationPreviewSecondaryIdentifier: { color: "#71717a" },
                },
              }}
            />
          </div>
          <SideUser />
        </div>
      </aside>
      <main className="dash-main">{children}</main>
    </div>
  );
}
