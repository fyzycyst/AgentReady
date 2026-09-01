import type { MetadataRoute } from "next";
import { afterEach, describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { isAllowed, parseRobots } from "@/lib/acquisition/robots";
import { PRODUCT_TOKEN } from "@/lib/acquisition/safe-fetch";
import { DEV_SITE_ORIGIN } from "@/lib/site-origin";

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
  for (const entry of sitemaps) lines.push(`Sitemap: ${entry}`);
  return `${lines.join("\n")}\n`;
}

function assertAbsolute(url: string) {
  expect(url.startsWith("http://") || url.startsWith("https://")).toBe(true);
}

describe("robots policy", () => {
  const prevPublic = process.env.NEXT_PUBLIC_SITE_URL;
  const prevVercel = process.env.VERCEL_URL;

  afterEach(() => {
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prevPublic;
    if (prevVercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = prevVercel;
  });

  it("allows AgentReady to fetch /demo and /fixtures/soup", () => {
    const parsed = parseRobots(robotsToText(robots()));
    expect(isAllowed(parsed, PRODUCT_TOKEN, "/demo")).toBe(true);
    expect(isAllowed(parsed, PRODUCT_TOKEN, "/fixtures/soup")).toBe(true);
  });

  it("does not disallow the fixtures tree", () => {
    const text = robotsToText(robots());
    expect(text.toLowerCase()).not.toContain("disallow: /fixtures");
  });

  it("emits an absolute Sitemap URL from NEXT_PUBLIC_SITE_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://agentready.example";
    delete process.env.VERCEL_URL;
    const sitemapUrl = robots().sitemap;
    expect(sitemapUrl).toBe("https://agentready.example/sitemap.xml");
    assertAbsolute(String(sitemapUrl));
  });

  it("emits an absolute Sitemap URL from VERCEL_URL when NEXT_PUBLIC_SITE_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "agentready-preview.vercel.app";
    const sitemapUrl = robots().sitemap;
    expect(sitemapUrl).toBe("https://agentready-preview.vercel.app/sitemap.xml");
    assertAbsolute(String(sitemapUrl));
  });

  it("emits an absolute Sitemap URL from the dev default when no env is set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    const sitemapUrl = robots().sitemap;
    expect(sitemapUrl).toBe(`${DEV_SITE_ORIGIN}/sitemap.xml`);
    assertAbsolute(String(sitemapUrl));
  });
});

describe("sitemap.xml entries", () => {
  const prevPublic = process.env.NEXT_PUBLIC_SITE_URL;
  const prevVercel = process.env.VERCEL_URL;

  afterEach(() => {
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prevPublic;
    if (prevVercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = prevVercel;
  });

  it("uses absolute loc URLs from NEXT_PUBLIC_SITE_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://agentready.example";
    delete process.env.VERCEL_URL;
    const entries = sitemap();
    expect(entries.map((entry) => entry.url)).toEqual(["https://agentready.example/", "https://agentready.example/demo"]);
    for (const entry of entries) assertAbsolute(entry.url);
  });

  it("uses absolute loc URLs from VERCEL_URL when NEXT_PUBLIC_SITE_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "agentready-preview.vercel.app";
    const entries = sitemap();
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://agentready-preview.vercel.app/",
      "https://agentready-preview.vercel.app/demo",
    ]);
  });

  it("uses absolute loc URLs from the dev default when no env is set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    const entries = sitemap();
    expect(entries.map((entry) => entry.url)).toEqual([`${DEV_SITE_ORIGIN}/`, `${DEV_SITE_ORIGIN}/demo`]);
  });
});
