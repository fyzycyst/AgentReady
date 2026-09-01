import { afterEach, describe, expect, it } from "vitest";
import {
  DEV_SITE_ORIGIN,
  absoluteSiteUrl,
  discoverySiteOrigin,
  discoverySiteUrl,
  publicSiteOrigin,
} from "@/lib/site-origin";

describe("site-origin", () => {
  const prevPublic = process.env.NEXT_PUBLIC_SITE_URL;
  const prevVercel = process.env.VERCEL_URL;

  afterEach(() => {
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prevPublic;
    if (prevVercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = prevVercel;
  });

  it("uses NEXT_PUBLIC_SITE_URL when set", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://agentready.example/";
    delete process.env.VERCEL_URL;
    expect(publicSiteOrigin()).toBe("https://agentready.example");
    expect(discoverySiteOrigin()).toBe("https://agentready.example");
    expect(absoluteSiteUrl("/demo")).toBe("https://agentready.example/demo");
    expect(discoverySiteUrl("/sitemap.xml")).toBe("https://agentready.example/sitemap.xml");
  });

  it("falls back to root-relative in-page URLs when unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    expect(publicSiteOrigin()).toBeNull();
    expect(absoluteSiteUrl("/demo")).toBe("/demo");
  });

  it("uses https://VERCEL_URL for discovery when NEXT_PUBLIC_SITE_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "agentready-preview.vercel.app";
    expect(discoverySiteOrigin()).toBe("https://agentready-preview.vercel.app");
    expect(discoverySiteUrl("/demo")).toBe("https://agentready-preview.vercel.app/demo");
    expect(absoluteSiteUrl("/demo")).toBe("/demo");
  });

  it("uses the documented dev default for discovery when no env is set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    expect(discoverySiteOrigin()).toBe(DEV_SITE_ORIGIN);
    expect(discoverySiteUrl("/sitemap.xml")).toBe(`${DEV_SITE_ORIGIN}/sitemap.xml`);
  });
});
