import { UserProfile } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Profile" };

// Clerk owns identity, so its profile handles avatar, name, emails, password,
// two-step verification, connected Google sign-in and signed-in devices.
export default function Profile() {
  return (
    <div className="wrap app-content">
      <div className="app-head">
        <h1>Profile</h1>
        <p className="quiet">
          Your photo, name, email, password and sign-in security. Team and billing settings live
          under your organization.
        </p>
      </div>
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
              rootBox: { width: "100%" },
              cardBox: {
                width: "100%",
                maxWidth: "none",
                boxShadow: "none",
                border: "1px solid #e4e4e7",
                borderRadius: "14px",
              },
              navbar: { background: "#fafafa", borderRight: "1px solid #e4e4e7" },
              // Deleting here would orphan sites and keep a subscription billing. Support does it.
              profileSection__danger: { display: "none" },
            },
          }}
        />
      </div>
      <p className="quiet profile-foot">
        Need to delete your account? <Link href="/contact">Contact us</Link> and we&apos;ll remove
        it along with your sites and any subscription.
      </p>
    </div>
  );
}
