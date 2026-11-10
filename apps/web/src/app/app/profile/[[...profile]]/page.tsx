import { UserProfile } from "@clerk/nextjs";
import type { Metadata } from "next";
import { getBillingState, listUserOrgs } from "@consentinel/db";
import { AccountActions } from "@/components/account-actions";
import { ProfileTabs } from "@/components/profile-tabs";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "Profile" };

// Clerk owns identity, so its profile handles avatar, name, emails, password,
// two-step verification, connected Google sign-in and signed-in devices.
export const dynamic = "force-dynamic";

export default async function Profile() {
  const session = await requireSession();
  const [billing, orgs] = await Promise.all([
    getBillingState(db(), session.orgId),
    listUserOrgs(db(), session.userId),
  ]);
  const teamOrgs = orgs.filter((o) => o.memberCount > 1).map((o) => o.name);
  return (
    <div className="wrap app-content">
      <div className="app-head">
        <h1>Profile</h1>
        <p className="quiet">
          Your photo, name, email, password and sign-in security. Team and billing settings live
          under your organization.
        </p>
      </div>
      <ProfileTabs />
      <div className="profile-shell">
        <UserProfile
          path="/app/profile"
          routing="path"
          appearance={{
            variables: {
              colorBackground: "#ffffff",
              colorForeground: "#18181b",
              colorMutedForeground: "#71717a",
              colorNeutral: "#18181b",
              colorPrimary: "#18181b",
              borderRadius: "10px",
            },
            elements: {
              // Flatten Clerk's card into the page: no second sidebar, no box.
              rootBox: { width: "100%" },
              cardBox: {
                width: "100%",
                maxWidth: "none",
                boxShadow: "none",
                border: "none",
                borderRadius: "0",
                display: "block",
              },
              navbar: { display: "none" },
              navbarMobileMenuRow: { display: "none" },
              scrollBox: { borderRadius: "0", boxShadow: "none", border: "none" },
              pageScrollBox: { padding: "0" },
              // Clerk's delete only removes the sign-in. Ours below also cancels billing and data.
              profileSection__danger: { display: "none" },
            },
          }}
        />
      </div>
      <AccountActions
        archived={Boolean(billing?.archivedAt)}
        canManage={session.role === "owner" || session.role === "org:admin"}
        teamOrgs={teamOrgs}
      />
    </div>
  );
}
