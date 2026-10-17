import type { Metadata } from "next";
import { can, getBillingState, getOrgBranding } from "@consentinel/db";
import { AgencyUpsell } from "@/components/agency-upsell";
import { BrandingForm } from "@/components/branding-form";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "Branding" };
export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  const session = await requireSession();
  const billing = await getBillingState(db(), session.orgId);

  if (!can(billing, "whiteLabel")) {
    return (
      <div className="wrap app-content">
        <div className="app-head">
          <h1>Branding</h1>
          <p className="quiet">Shared reports under your own name.</p>
        </div>
        <AgencyUpsell
          points={[
            "Your logo, name and color on every shared report",
            "No Consentinel branding or upsell anywhere your client looks",
            "Clients get a print-ready PDF from the same link",
          ]}
          title="Hand clients reports that look like yours."
        />
      </div>
    );
  }

  const brand = await getOrgBranding(db(), session.orgId);

  return (
    <div className="wrap app-content">
      <div className="app-head">
        <h1>Branding</h1>
        <p className="quiet">
          Applies to every share link from this workspace, including links you’ve already sent.
        </p>
      </div>
      <BrandingForm
        initial={{
          brandName: brand?.brandName ?? "",
          brandLogoUrl: brand?.brandLogoUrl ?? "",
          brandColor: brand?.brandColor ?? "",
          brandWebsite: brand?.brandWebsite ?? "",
        }}
      />
    </div>
  );
}
