/**
 * Link-preview and canonical metadata for our own pages: every indexable page
 * names its canonical URL, and shared links get a large preview image.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// The root layout loads fonts through the Next compiler, which vitest lacks.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "--font-test", className: "font-test", style: { fontFamily: "test" } });
  return { Bricolage_Grotesque: font, Geist: font, Geist_Mono: font };
});

const SITE = "https://agentready.ftlenterprises.us";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("/docs metadata", () => {
  it("declares its canonical URL on the public origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
    const { metadata } = await import("@/app/docs/page");

    expect(metadata.alternates?.canonical).toBe(`${SITE}/docs`);
  });

  it("falls back to a root-relative canonical when no origin is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const { metadata } = await import("@/app/docs/page");

    expect(metadata.alternates?.canonical).toBe("/docs");
  });
});

describe("share image", () => {
  it("asks for a large preview card", async () => {
    const { metadata } = await import("@/app/layout");

    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("is a 1200×630 PNG with alt text", async () => {
    const image = await import("@/app/opengraph-image");

    expect(image.size).toEqual({ width: 1200, height: 630 });
    expect(image.contentType).toBe("image/png");
    expect(image.alt).toMatch(/AgentReady/);

    const response = await image.default();
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    // PNG signature, so the route really renders an image rather than an error body.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
