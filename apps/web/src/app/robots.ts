import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The app, the API, and individual scan reports are customer data, not content.
      disallow: ["/app", "/api", "/scan/", "/report/", "/sign-in", "/sign-up"],
    },
    sitemap: "https://www.consentinelhq.com/sitemap.xml",
  };
}
