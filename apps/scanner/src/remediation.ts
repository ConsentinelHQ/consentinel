/**
 * One fix per vendor, shared by the request and cookie paths so a vendor flagged
 * for both reads as one instruction, not two templates glued together.
 * Specific advice where generic advice would be wrong or useless.
 */
const EMBEDS = ["youtube", "vimeo", "google maps", "spotify", "soundcloud"];

export function remediationFor(vendor: string): string {
  const v = vendor.toLowerCase();

  if (v === "google tag manager") {
    return (
      "Loading Google Tag Manager is fine, and blocking it can break your consent banner. " +
      "The fix is inside the container: set Consent Mode defaults to denied and add consent " +
      "checks to each marketing and analytics tag."
    );
  }
  if (v.startsWith("shopify")) {
    return (
      "Shopify sets this when its Customer Privacy API was not told the visitor opted out. " +
      "Check that your consent app is connected to Shopify's Customer Privacy API and passes " +
      "Global Privacy Control through."
    );
  }
  if (v === "klaviyo") {
    return (
      "Delay Klaviyo's onsite script until marketing consent, using your consent app's " +
      "script blocking or Klaviyo's consent settings."
    );
  }
  if (v === "microsoft clarity") {
    return (
      "Load Clarity only after consent, or use Clarity's consent API so it waits for an " +
      "opt-in before recording sessions."
    );
  }

  const base =
    `Gate ${vendor} behind consent so it cannot load, send data, or set cookies until the ` +
    `visitor opts in - Consent Mode default-denied for Google tags, your consent app's ` +
    `script blocking for everything else.`;
  return EMBEDS.some((e) => v.includes(e))
    ? `${base} If it comes from an embed, use the privacy-enhanced or click-to-load variant.`
    : base;
}
