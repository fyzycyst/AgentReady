import type { MetadataRoute } from "next";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { isAllowed, parseRobots } from "@/lib/acquisition/robots";
import { PRODUCT_TOKEN } from "@/lib/acquisition/safe-fetch";

function robotsToText(config: MetadataRoute.Robots): string {
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
  for (const sitemap of sitemaps) lines.push(`Sitemap: ${sitemap}`);
  return `${lines.join("\n")}\n`;
}

describe("robots policy", () => {
  it("allows AgentReady to fetch /demo and /fixtures/soup", () => {
    const parsed = parseRobots(robotsToText(robots()));
    expect(isAllowed(parsed, PRODUCT_TOKEN, "/demo")).toBe(true);
    expect(isAllowed(parsed, PRODUCT_TOKEN, "/fixtures/soup")).toBe(true);
  });

  it("does not disallow the fixtures tree", () => {
    const text = robotsToText(robots());
    expect(text.toLowerCase()).not.toContain("disallow: /fixtures");
  });
});
