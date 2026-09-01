import type { MetadataRoute } from "next";
import { absoluteSiteUrl } from "@/lib/site-origin";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteSiteUrl("/"),
      lastModified: new Date("2026-09-01"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteSiteUrl("/demo"),
      lastModified: new Date("2026-09-01"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];
}
