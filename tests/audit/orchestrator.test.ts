import { describe, expect, it } from "vitest";
import { runAudit } from "@/lib/audit/orchestrator";
import type { RawResponse, SafeFetchDeps } from "@/lib/acquisition/safe-fetch";
import { fixture } from "../helpers/context";

type Route = { status?: number; headers?: Record<string, string>; body?: string };

function deps(dns: Record<string, string[]>, routes: Record<string, Route>): SafeFetchDeps {
  let t = 0;
  return {
    now: () => (t += 5),
    lookupAll: async (h) => {
      if (!dns[h]) throw new Error("ENOTFOUND");
      return dns[h];
    },
    request: async (url): Promise<RawResponse> => {
      const r = routes[url.toString()];
      if (!r) return { status: 404, headers: new Headers({ "content-type": "text/html" }), body: null };
      const body = new TextEncoder().encode(r.body ?? "");
      return {
        status: r.status ?? 200,
        headers: new Headers(r.headers ?? { "content-type": "text/html; charset=utf-8" }),
        body: new ReadableStream({ start: (c) => (c.enqueue(body), c.close()) }),
      };
    },
  };
}

const PUB = ["93.184.216.34"];
const clock = () => "2026-09-01T12:00:00.000Z";

describe("runAudit", () => {
  it("produces a full report for a well-structured site", async () => {
    const d = deps(
      { "northwind.example": PUB },
      {
        "https://northwind.example/": { body: fixture("agent-ready.html") },
        "https://northwind.example/robots.txt": { body: "User-agent: *\nAllow: /", headers: { "content-type": "text/plain" } },
        "https://northwind.example/sitemap.xml": { body: "<urlset></urlset>", headers: { "content-type": "application/xml" } },
        "https://northwind.example/llms.txt": { body: "# Northwind", headers: { "content-type": "text/plain" } },
        "https://northwind.example/openapi.json": { body: "{}", headers: { "content-type": "application/json" } },
      },
    );
    const r = await runAudit("https://northwind.example/", d, clock);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.score.overall).toBeGreaterThanOrEqual(80);
    expect(r.results).toHaveLength(3);
    expect(r.acquisition.renderedDom).toBe("skipped");
    expect(r.acquisition.sidecarsChecked).toBeGreaterThanOrEqual(4);
    expect(r.score.coverage).toBeCloseTo(0.51, 2);
  });

  it("returns a blocked report without fetching the page when robots disallows us", async () => {
    let pageFetched = false;
    const base = deps(
      { "site.example": PUB },
      { "https://site.example/robots.txt": { body: "User-agent: *\nDisallow: /", headers: { "content-type": "text/plain" } } },
    );
    const d: SafeFetchDeps = {
      ...base,
      request: async (url, pinned, signal) => {
        if (url.pathname === "/") pageFetched = true;
        return base.request(url, pinned, signal);
      },
    };
    const r = await runAudit("https://site.example/", d, clock);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("robots-disallow");
    expect(pageFetched).toBe(false);
  });

  it("returns a blocked report (no score) for a 403 bot challenge", async () => {
    const d = deps(
      { "site.example": PUB },
      { "https://site.example/": { status: 403, body: "<html><body>Attention Required! Cloudflare</body></html>", headers: { "content-type": "text/html", "cf-mitigated": "challenge" } } },
    );
    const r = await runAudit("https://site.example/", d, clock);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("http-error");
    expect(r.status).toBe(403);
    expect(r.evidence).toMatch(/challenge/i);
  });

  it("maps safe-fetch failures to blocked reports", async () => {
    const r = await runAudit("https://169.254.169.254/", deps({}, {}), clock);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid-url");
    const r2 = await runAudit("https://private.example/", deps({ "private.example": ["10.0.0.1"] }, {}), clock);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe("blocked-address");
  });

  it("uses the final origin for sidecars after a redirect", async () => {
    const d = deps(
      { "old.example": PUB, "new.example": PUB },
      {
        "https://old.example/": { status: 301, headers: { location: "https://new.example/home" } },
        "https://new.example/home": { body: fixture("div-soup-spa.html") },
        "https://new.example/robots.txt": { body: "User-agent: *\nAllow: /\nSitemap: https://new.example/s.xml", headers: { "content-type": "text/plain" } },
      },
    );
    const r = await runAudit("https://old.example/", d, clock);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.finalUrl).toBe("https://new.example/home");
    const disc = r.results.find((x) => x.category === "agent-discovery")!;
    expect(disc.findings.map((f) => f.id)).toContain("discovery.sitemap.present");
  });
});
