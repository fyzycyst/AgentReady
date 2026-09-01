import { afterEach, describe, expect, it } from "vitest";
import { absoluteSiteUrl, publicSiteOrigin } from "@/lib/site-origin";

describe("site-origin", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  });

  it("uses NEXT_PUBLIC_SITE_URL when set", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://agentready.example/";
    expect(publicSiteOrigin()).toBe("https://agentready.example");
    expect(absoluteSiteUrl("/demo")).toBe("https://agentready.example/demo");
  });

  it("falls back to root-relative URLs when unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(publicSiteOrigin()).toBeNull();
    expect(absoluteSiteUrl("/demo")).toBe("/demo");
  });
});
