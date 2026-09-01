/**
 * Serialize Next's metadata routes the way Next serves them, so tests can feed
 * our own robots.txt / sitemap.xml back into the audit as sidecar bodies.
 */
import type { MetadataRoute } from "next";

export function robotsToText(config: MetadataRoute.Robots): string {
  const lines: string[] = [];
  const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
  for (const rule of rules) {
    const agents = Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent ?? "*"];
    for (const agent of agents) lines.push(`User-agent: ${agent}`);
    const allows = rule.allow ? (Array.isArray(rule.allow) ? rule.allow : [rule.allow]) : [];
    const disallows = rule.disallow ? (Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow]) : [];
    for (const allow of allows) lines.push(`Allow: ${allow}`);
    for (const disallow of disallows) lines.push(`Disallow: ${disallow}`);
  }
  const sitemaps = config.sitemap ? (Array.isArray(config.sitemap) ? config.sitemap : [config.sitemap]) : [];
  for (const entry of sitemaps) lines.push(`Sitemap: ${entry}`);
  return `${lines.join("\n")}\n`;
}

export function sitemapToXml(entries: MetadataRoute.Sitemap): string {
  const urls = entries
    .map((entry) => `  <url><loc>${entry.url}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
