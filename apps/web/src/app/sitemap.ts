import type { MetadataRoute } from "next";

const BASE = "https://www.consentinelhq.com";

/** Public marketing pages only. App, API, and scan reports stay out of search. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/how-it-works`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/pricing`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/gpc`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/contact`, changeFrequency: "monthly", priority: 0.5 },
  ];
  return pages.map((page) => ({ ...page, lastModified }));
}
