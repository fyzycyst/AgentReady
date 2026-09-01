/**
 * Acceptance tests for the Phase 1 review findings B1–B7 (GPT Sol).
 * Each block reproduces the reviewer's counterexample, then asserts the fix.
 */
import { describe, expect, it } from "vitest";
import { classifyAddress } from "@/lib/acquisition/net-policy";
import { isAllowed, parseRobots } from "@/lib/acquisition/robots";
import { PAGE_POLICY, SIDECAR_POLICY, contentTypeAllowed, safeFetch, type RawResponse, type SafeFetchDeps } from "@/lib/acquisition/safe-fetch";
import { discoverLinkedSidecars, fetchSidecars } from "@/lib/acquisition/sidecars";
import { createHtmlQuery } from "@/lib/acquisition/html-query";
import { agentDiscoveryCheck } from "@/lib/audit/checks/agent-discovery";
import { runAudit } from "@/lib/audit/orchestrator";
import { buildContext, fixture, resource } from "../helpers/context";

type Route = { status?: number; headers?: Record<string, string>; body?: string };
const PUB = ["93.184.216.34"];

function fakeDeps(dns: Record<string, string[] | "hang">, routes: Record<string, Route>, log: string[] = []): SafeFetchDeps {
  let t = 0;
  return {
    now: () => (t += 3),
    lookupAll: (h) => {
      const r = dns[h];
      if (r === "hang") return new Promise(() => {});
      if (!r) return Promise.reject(new Error("ENOTFOUND"));
      return Promise.resolve(r);
    },
    request: async (url): Promise<RawResponse> => {
      log.push(url.toString());
      const r = routes[url.toString()];
      if (!r) return { status: 404, headers: new Headers({ "content-type": "text/html" }), body: null };
      const bytes = new TextEncoder().encode(r.body ?? "");
      return {
        status: r.status ?? 200,
        headers: new Headers(r.headers ?? { "content-type": "text/html; charset=utf-8" }),
        body: new ReadableStream({ start: (c) => (c.enqueue(bytes), c.close()) }),
      };
    },
  };
}

describe("B1 — DNS is inside the chain deadline", () => {
  it("a never-resolving lookup yields timeout within the policy budget", async () => {
    const deps = fakeDeps({ "hang.example": "hang" }, {});
    const t0 = Date.now();
    const r = await safeFetch("https://hang.example/", { ...PAGE_POLICY, timeoutMs: 40 }, deps);
    expect(r).toMatchObject({ ok: false, code: "timeout" });
    expect(Date.now() - t0).toBeLessThan(1_000);
  });

  it("a hanging DNS on a redirect hop is also bounded", async () => {
    const deps = fakeDeps(
      { "a.example": PUB, "hang.example": "hang" },
      { "https://a.example/": { status: 302, headers: { location: "https://hang.example/" } } },
    );
    const r = await safeFetch("https://a.example/", { ...PAGE_POLICY, timeoutMs: 40 }, deps);
    expect(r).toMatchObject({ ok: false, code: "timeout" });
  });
});

describe("B2 — target-origin robots is checked BEFORE a cross-origin redirect is fetched", () => {
  it("never requests the disallowed page and reports robots-disallow", async () => {
    const log: string[] = [];
    const deps = fakeDeps(
      { "old.example": PUB, "new.example": PUB },
      {
        "https://old.example/": { status: 301, headers: { location: "https://new.example/private" } },
        "https://new.example/robots.txt": { body: "User-agent: *\nDisallow: /private", headers: { "content-type": "text/plain" } },
        "https://new.example/private": { body: fixture("agent-ready.html") },
      },
      log,
    );
    const r = await runAudit("https://old.example/", deps, () => "2026-09-01T00:00:00.000Z");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("robots-disallow");
    expect(log).not.toContain("https://new.example/private");
    // Order: old robots → old page → new robots. Never new page.
    expect(log.indexOf("https://new.example/robots.txt")).toBeGreaterThan(log.indexOf("https://old.example/"));
  });

  it("a same-origin redirect into a disallowed path is also refused", async () => {
    const log: string[] = [];
    const deps = fakeDeps(
      { "site.example": PUB },
      {
        "https://site.example/robots.txt": { body: "User-agent: *\nDisallow: /members/", headers: { "content-type": "text/plain" } },
        "https://site.example/": { status: 302, headers: { location: "/members/home" } },
        "https://site.example/members/home": { body: fixture("agent-ready.html") },
      },
      log,
    );
    const r = await runAudit("https://site.example/", deps, () => "2026-09-01T00:00:00.000Z");
    expect(r.ok).toBe(false);
    expect(log).not.toContain("https://site.example/members/home");
  });

  it("safeFetch surfaces a refused hook as redirect-refused", async () => {
    const deps = fakeDeps({ "a.example": PUB, "b.example": PUB }, { "https://a.example/": { status: 302, headers: { location: "https://b.example/" } } });
    const r = await safeFetch("https://a.example/", PAGE_POLICY, deps, { beforeRedirect: async () => ({ ok: false, message: "nope" }) });
    expect(r).toMatchObject({ ok: false, code: "redirect-refused", message: "nope" });
  });
});

describe("B3 — robots groups are selected by product token and combined (RFC 9309)", () => {
  it("does not let an earlier substring group (Mozilla) shadow the AgentReady group", () => {
    const robots = parseRobots("User-agent: Mozilla\nAllow: /\n\nUser-agent: AgentReady\nDisallow: /private");
    expect(isAllowed(robots, "AgentReady", "/private")).toBe(false);
    expect(isAllowed(robots, "AgentReady", "/public")).toBe(true);
  });

  it("combines multiple groups for the same token", () => {
    const robots = parseRobots("User-agent: agentready\nDisallow: /a\n\nUser-agent: *\nAllow: /\n\nUser-Agent: AgentReady/0.1\nDisallow: /b");
    expect(isAllowed(robots, "AgentReady", "/a/x")).toBe(false);
    expect(isAllowed(robots, "AgentReady", "/b")).toBe(false);
    expect(isAllowed(robots, "AgentReady", "/c")).toBe(true);
  });

  it("falls back to * only when no token group exists; a token group with no rules means allow-all", () => {
    const star = parseRobots("User-agent: *\nDisallow: /");
    expect(isAllowed(star, "AgentReady", "/")).toBe(false);
    const empty = parseRobots("User-agent: AgentReady\nDisallow:\n\nUser-agent: *\nDisallow: /");
    expect(isAllowed(empty, "AgentReady", "/anything")).toBe(true);
  });

  it("token match is exact, not substring", () => {
    const robots = parseRobots("User-agent: Agent\nDisallow: /");
    expect(isAllowed(robots, "AgentReady", "/")).toBe(true);
  });
});

describe("B4 — unobserved sidecars are excluded, not scored as missing", () => {
  it("timeout on every sidecar → score null, low confidence, explicit finding", async () => {
    const ctx = buildContext(fixture("agent-ready.html"), {
      sidecarOutcomes: Object.fromEntries(
        ["/robots.txt", "/sitemap.xml", "/llms.txt", "/.well-known/oauth-protected-resource", "/.well-known/mcp.json", "/.well-known/mcp/server-card.json", "/.well-known/ai-plugin.json", "/.well-known/agent-card.json"].map((p) => [p, { kind: "unobserved", reason: "timeout" }]),
      ),
    });
    const r = await agentDiscoveryCheck.run(ctx);
    // The page-derived OpenAPI link is still observable → not null, but only 15 points available.
    expect(r.confidence).toBe("low");
    expect(r.findings.map((f) => f.id)).toContain("discovery.unobserved");
    expect(r.findings.map((f) => f.id)).not.toContain("discovery.sitemap.missing");
    expect(r.findings.map((f) => f.id)).not.toContain("discovery.robots.missing");
    expect(r.score).toBe(100); // 15/15 from the page's own OpenAPI link
  });

  it("observed 404 IS scored as missing, with high confidence", async () => {
    const r = await agentDiscoveryCheck.run(buildContext(fixture("div-soup-spa.html")));
    expect(r.confidence).toBe("high");
    expect(r.findings.map((f) => f.id)).toContain("discovery.sitemap.missing");
    expect(r.score).toBeLessThanOrEqual(20);
  });

  it("partial: unobserved sitemap renormalises the denominator and lowers confidence", async () => {
    const ctx = buildContext(fixture("div-soup-spa.html"), { sidecarOutcomes: { "/sitemap.xml": { kind: "unobserved", reason: "network" } } });
    const r = await agentDiscoveryCheck.run(ctx);
    expect(r.confidence).toBe("medium");
    // robots missing 15/25, sitemap excluded, llms 0/15, links 0/15, mcp 0/20 → 15/75 = 20
    expect(r.score).toBe(20);
  });

  it("fetchSidecars records an outcome for every attempted target", async () => {
    const deps = fakeDeps({ "site.example": PUB }, { "https://site.example/robots.txt": { body: "ok", headers: { "content-type": "text/plain" } } });
    const { outcomes } = await fetchSidecars("https://site.example", createHtmlQuery("<html></html>"), deps);
    expect(outcomes["/robots.txt"]).toEqual({ kind: "observed", status: 200 });
    expect(outcomes["/llms.txt"]).toEqual({ kind: "observed", status: 404 });
    const hang = fakeDeps({ "site.example": "hang" }, {});
    const r2 = await fetchSidecars("https://site.example", createHtmlQuery("<html></html>"), hang, { budgetMs: 30 });
    expect(r2.outcomes["/robots.txt"].kind).toBe("unobserved");
    expect(r2.notes[0]).toMatch(/could not be checked/);
  });
});

describe("B5 — Teredo is blocked outright", () => {
  it.each(["2001:0:4136:e378:8000:63bf:80ff:fffe", "2001::1", "2001:0:c000:201::1"])("blocked: %s", (ip) => {
    expect(classifyAddress(ip)).toBe("blocked");
  });
  it("2001:db8 docs and real 2001:4860 (Google) still classified correctly", () => {
    expect(classifyAddress("2001:db8::1")).toBe("blocked");
    expect(classifyAddress("2001:4860:4860::8888")).toBe("global");
  });
});

describe("B6 — linked sidecars: global cap of 2, same-origin lock on redirects", () => {
  it("two feeds + two OpenAPI links → only 2 targets", () => {
    const q = createHtmlQuery(`
      <link rel="alternate" type="application/rss+xml" href="/a.xml">
      <link rel="alternate" type="application/atom+xml" href="/b.xml">
      <a href="/openapi.json">x</a><a href="/swagger.yaml">y</a>`);
    expect(discoverLinkedSidecars(q, "https://s.example")).toHaveLength(2);
  });

  it("a sidecar that redirects off-origin is rejected", async () => {
    const deps = fakeDeps(
      { "s.example": PUB, "evil.example": PUB },
      { "https://s.example/robots.txt": { status: 302, headers: { location: "https://evil.example/robots.txt" } } },
    );
    const r = await safeFetch("https://s.example/robots.txt", SIDECAR_POLICY, deps);
    expect(r).toMatchObject({ ok: false, code: "redirect-invalid" });
  });

  it("same-origin sidecar redirects are still followed", async () => {
    const deps = fakeDeps(
      { "s.example": PUB },
      {
        "https://s.example/robots.txt": { status: 301, headers: { location: "/robots-v2.txt" } },
        "https://s.example/robots-v2.txt": { body: "User-agent: *", headers: { "content-type": "text/plain" } },
      },
    );
    const r = await safeFetch("https://s.example/robots.txt", SIDECAR_POLICY, deps);
    expect(r.ok).toBe(true);
  });
});

describe("B7 — content types match exactly or by family, never by prefix", () => {
  it.each(["text/html", "TEXT/HTML; charset=utf-8", "application/xhtml+xml"])("page accepts %s", (ct) => {
    expect(contentTypeAllowed(ct, PAGE_POLICY)).toBe(true);
  });
  it.each(["text/html-evil", "text/htmlfoo", "text/plain", "application/xhtml", "application/json", "", "garbage", "text/", "/html"])("page rejects %s", (ct) => {
    expect(contentTypeAllowed(ct, PAGE_POLICY)).toBe(false);
  });
  it.each(["text/plain", "text/markdown", "application/json", "application/xml", "application/vnd.oai.openapi+json"])("sidecar accepts %s", (ct) => {
    expect(contentTypeAllowed(ct, SIDECAR_POLICY)).toBe(true);
  });
  it.each(["application/jsonp", "application/xmlfoo", "textual/plain", "image/svg+xml", "text/html evil"])("sidecar rejects %s", (ct) => {
    expect(contentTypeAllowed(ct, SIDECAR_POLICY)).toBe(false);
  });
});

describe("N1/N2 — validated credit", () => {
  it("a catch-all 200 text body at /.well-known/mcp.json does not earn MCP points", async () => {
    const ctx = buildContext(fixture("div-soup-spa.html"), {
      sidecars: { "well-known": [resource("https://northwind.example/.well-known/mcp.json", "not found")] },
    });
    const r = await agentDiscoveryCheck.run(ctx);
    expect(r.findings.map((f) => f.id)).not.toContain("discovery.mcp.present");
  });
  it("an oauth-protected-resource without required fields is flagged invalid", async () => {
    const ctx = buildContext(fixture("div-soup-spa.html"), {
      sidecars: { "well-known": [resource("https://northwind.example/.well-known/oauth-protected-resource", "{}")] },
    });
    const r = await agentDiscoveryCheck.run(ctx);
    expect(r.findings.map((f) => f.id)).toContain("discovery.mcp.invalid");
  });
});
