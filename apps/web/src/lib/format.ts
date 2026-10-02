/** "https://www.example.com/" -> "example.com" */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "cloudflare" -> "Blocked by Cloudflare" */
export function blockedLabel(vendor: string): string {
  return `Blocked by ${vendor.charAt(0).toUpperCase()}${vendor.slice(1)}`;
}
