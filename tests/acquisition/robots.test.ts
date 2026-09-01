import { describe, expect, it } from "vitest";
import { isAllowed, parseRobots } from "@/lib/acquisition/robots";

describe("robots", () => {
  const body = `
# comment
User-agent: GPTBot
Disallow: /

User-agent: *
Disallow: /private/
Disallow: /tmp/*.pdf$
Allow: /private/public-doc
Sitemap: https://example.com/sitemap.xml
`;
  const r = parseRobots(body);

  it("parses groups and sitemaps", () => {
    expect(r.groups).toHaveLength(2);
    expect(r.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("applies specific agent group over *", () => {
    expect(isAllowed(r, "GPTBot/1.0", "/")).toBe(false);
    expect(isAllowed(r, "Mozilla/5.0 (compatible; AgentReady/0.1)", "/")).toBe(true);
  });

  it("longest match wins; Allow ties beat Disallow", () => {
    expect(isAllowed(r, "x", "/private/secret")).toBe(false);
    expect(isAllowed(r, "x", "/private/public-doc")).toBe(true);
  });

  it("wildcards and end anchor", () => {
    expect(isAllowed(r, "x", "/tmp/a.pdf")).toBe(false);
    expect(isAllowed(r, "x", "/tmp/a.pdfx")).toBe(true);
  });

  it("empty file allows all", () => {
    expect(isAllowed(parseRobots(""), "x", "/anything")).toBe(true);
  });

  it("stacked user-agents share a group", () => {
    const rr = parseRobots("User-agent: a\nUser-agent: b\nDisallow: /x");
    expect(rr.groups).toHaveLength(1);
    expect(isAllowed(rr, "b", "/x/y")).toBe(false);
  });
});
