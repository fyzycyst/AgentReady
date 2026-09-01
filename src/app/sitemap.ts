import type { MetadataRoute } from "next";
import { discoverySiteUrl } from "@/lib/site-origin";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: discoverySiteUrl("/"),
      lastModified: new Date("2026-09-01"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: discoverySiteUrl("/demo"),
      lastModified: new Date("2026-09-01"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];
}
