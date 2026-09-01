import { describe, expect, it } from "vitest";
import { agentDiscoveryCheck } from "@/lib/audit/checks/agent-discovery";
import { buildContext, fixture, resource } from "../../helpers/context";

const O = "https://northwind.example";

describe("agent-discovery", () => {
  it("scores a fully discoverable site at 100 with only positive findings", async () => {
    const ctx = buildContext(fixture("agent-ready.html"), {
      sidecars: {
        "robots.txt": [resource(`${O}/robots.txt`, "User-agent: *\nAllow: /\nSitemap: https://northwind.example/sitemap.xml")],
        "sitemap.xml": [resource(`${O}/sitemap.xml`, '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://northwind.example/</loc></url></urlset>')],
        "llms.txt": [resource(`${O}/llms.txt`, "# Northwind Bikes\n\n> Repairs and rentals.\n")],
        "linked-openapi": [resource(`${O}/openapi.json`, '{"openapi":"3.1.0"}')],
        "well-known": [resource(`${O}/.well-known/oauth-protected-resource`, '{"resource":"https://northwind.example/mcp","authorization_servers":["https://auth.northwind.example"]}')],
      },
    });
    const r = await agentDiscoveryCheck.run(ctx);
    expect(r.score).toBe(100);
    expect(r.applicable).toBe(true);
    expect(r.findings.every((f) => f.positive)).toBe(true);
  });

  it("gives a div-soup SPA with no sidecars a low score and remediations with snippets", async () => {
    const r = await agentDiscoveryCheck.run(buildContext(fixture("div-soup-spa.html")));
    expect(r.score).toBeLessThanOrEqual(20);
    const ids = r.findings.map((f) => f.id);
    expect(ids).toContain("discovery.sitemap.missing");
    expect(ids).toContain("discovery.llms.missing");
    expect(ids).toContain("discovery.mcp.missing");
    expect(r.findings.filter((f) => f.remediation?.snippet).length).toBeGreaterThanOrEqual(3);
  });

  it("flags a robots.txt that disallows everything as critical", async () => {
    const ctx = buildContext(fixture("agent-ready.html"), {
      sidecars: { "robots.txt": [resource(`${O}/robots.txt`, "User-agent: *\nDisallow: /")] },
    });
    const r = await agentDiscoveryCheck.run(ctx);
    expect(r.findings.find((x) => x.id === "discovery.robots.blocks-all")?.severity).toBe("critical");
  });

  it("names blocked AI agents", async () => {
    const ctx = buildContext(fixture("agent-ready.html"), {
      sidecars: {
        "robots.txt": [resource(`${O}/robots.txt`, "User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nAllow: /")],
      },
    });
    const r = await agentDiscoveryCheck.run(ctx);
    const f = r.findings.find((x) => x.id === "discovery.robots.blocks-ai-agents");
    expect(f?.detail).toMatch(/gptbot/i);
    expect(f?.detail).toMatch(/claudebot/i);
  });

  it("credits a sitemap declared only in robots.txt", async () => {
    const ctx = buildContext(fixture("div-soup-spa.html"), {
      sidecars: { "robots.txt": [resource(`${O}/robots.txt`, "User-agent: *\nAllow: /\nSitemap: https://northwind.example/sm.xml")] },
    });
    const r = await agentDiscoveryCheck.run(ctx);
    expect(r.findings.map((f) => f.id)).toContain("discovery.sitemap.present");
  });

  it("does not treat an HTML 200 (soft-404) as a real llms.txt", async () => {
    const ctx = buildContext(fixture("div-soup-spa.html"), {
      sidecars: { "llms.txt": [resource(`${O}/llms.txt`, "<!doctype html><html><body>Not found</body></html>")] },
    });
    const r = await agentDiscoveryCheck.run(ctx);
    expect(r.findings.map((f) => f.id)).toContain("discovery.llms.missing");
  });
});
