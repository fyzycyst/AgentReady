import type { MetadataRoute } from "next";
import { discoverySiteUrl } from "@/lib/site-origin";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: discoverySiteUrl("/sitemap.xml"),
  };
}
