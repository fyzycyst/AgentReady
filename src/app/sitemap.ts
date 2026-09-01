import type { MetadataRoute } from "next";

const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: base,
      lastModified: new Date("2026-09-01"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/demo`,
      lastModified: new Date("2026-09-01"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];
}
