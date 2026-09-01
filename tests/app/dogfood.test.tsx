/**
 * Dogfood: AgentReady audits its own landing page.
 *
 * The page is rendered inside the real root layout, the head is built from the
 * real `metadata` exports, and the sidecars are our real `robots.txt`,
 * `sitemap.xml`, `public/llms.txt` and `/openapi.json` — so nothing here is a
 * hand-written stand-in for what we actually serve. The one thing this cannot
 * reproduce is Next's own `<head>` emission, which is approximated by
 * {@link metadataHead}; the equivalence was checked against `next dev` while
 * this test was written (same six category scores, same findings).
 *
 * **The ceiling we accept.** `agent-discovery` scores 80/100, not 100: the
 * remaining 20 points are `/.well-known/oauth-protected-resource` or an MCP
 * server card, and we do not run an MCP server. Publishing one would be a lie
 * to score points, which is the opposite of this ticket. `webmcp-capability`
 * scores 95/100 for the same kind of reason: the last 5 are an origin-trial
 * token, which is registered per deployment origin, not in the repo.
 *
 * The audit output is the spec: when a check changes, this test should move
 * with it, not be pinned around it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The landing form is a client component: it needs a router, and the root
// layout loads fonts through the Next compiler. Neither exists under vitest,
// and neither changes a byte of the HTML the audit reads.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "--font-test", className: "font-test", style: { fontFamily: "test" } });
  return { Bricolage_Grotesque: font, Geist: font, Geist_Mono: font };
});

import RootLayout, { metadata as rootMetadata } from "@/app/layout";
import { GET as openapiRoute } from "@/app/openapi.json/route";
import Home, { metadata as pageMetadata } from "@/app/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { CHECKS } from "@/lib/audit/checks";
import type { CheckResult, ResourceSnapshot, SidecarKey } from "@/lib/audit/contract";
import { summarize, type ScoreSummary } from "@/lib/audit/scoring";
import { DEV_SITE_ORIGIN } from "@/lib/site-origin";
import { buildContext, resource } from "../helpers/context";
import { robotsToText, sitemapToXml } from "../helpers/site";

const ORIGIN = DEV_SITE_ORIGIN;
const PAGE_URL = `${ORIGIN}/`;

function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The tags Next emits from the `metadata` exports of the layout and the page. */
function metadataHead(): string {
  const og = (rootMetadata.openGraph ?? {}) as { title?: string; description?: string };
  const canonical = String(pageMetadata.alternates?.canonical ?? "");
  return [
    `<title>${attr(String(rootMetadata.title))}</title>`,
    `<meta name="description" content="${attr(String(rootMetadata.description))}">`,
    `<meta property="og:title" content="${attr(String(og.title))}">`,
    `<meta property="og:description" content="${attr(String(og.description))}">`,
    canonical ? `<link rel="canonical" href="${attr(canonical)}">` : "",
  ].join("");
}

function renderLandingPage(): string {
  const shell = renderToStaticMarkup(
    <RootLayout params={Promise.resolve({})}>
      <Home />
    </RootLayout>,
  );
  return `<!doctype html>${shell.replace("<body", `<head>${metadataHead()}</head><body`)}`;
}

async function openapiBody(): Promise<string> {
  return await (await openapiRoute()).text();
}

function findingsOf(results: readonly CheckResult[]) {
  return results.flatMap((r) => r.findings.map((f) => ({ ...f, category: r.category })));
}

function scoreOf(results: readonly CheckResult[], category: string): number | null {
  return results.find((r) => r.category === category)?.score ?? null;
}

describe("dogfood: the AgentReady landing page audits itself", () => {
  let html: string;
  let results: readonly CheckResult[];
  let score: ScoreSummary;

  beforeAll(async () => {
    // robots.txt / sitemap.xml URLs come from the environment; pin the dev
    // default so the fixture origin and the sidecar bodies agree.
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;

    html = renderLandingPage();

    const sidecars: Partial<Record<SidecarKey, ResourceSnapshot[]>> = {
      "robots.txt": [resource(`${ORIGIN}/robots.txt`, robotsToText(robots()))],
      "sitemap.xml": [resource(`${ORIGIN}/sitemap.xml`, sitemapToXml(sitemap()))],
      "llms.txt": [
        resource(`${ORIGIN}/llms.txt`, readFileSync(path.join(import.meta.dirname, "../../public/llms.txt"), "utf8")),
      ],
      "linked-openapi": [resource(`${ORIGIN}/openapi.json`, await openapiBody())],
    };

    const ctx = buildContext(html, { url: PAGE_URL, sidecars });
    results = await Promise.all(CHECKS.map((check) => check.run(ctx)));
    score = summarize(results);
  });

  it("scores at least 90 with an A, at full coverage", () => {
    expect(score.overall).not.toBeNull();
    expect(score.overall!).toBeGreaterThanOrEqual(90);
    expect(score.grade).toBe("A");
    expect(score.coverage).toBe(1);
  });

  it("has no high or critical findings", () => {
    const serious = findingsOf(results).filter((f) => f.severity === "high" || f.severity === "critical");
    expect(serious.map((f) => `${f.id}: ${f.title}`)).toEqual([]);
  });

  it("records the exact category scores, including the two honest ceilings", () => {
    expect({
      "agent-discovery": scoreOf(results, "agent-discovery"),
      "machine-readable-structure": scoreOf(results, "machine-readable-structure"),
      "access-renderability": scoreOf(results, "access-renderability"),
      "form-semantics": scoreOf(results, "form-semantics"),
      actionability: scoreOf(results, "actionability"),
      "webmcp-capability": scoreOf(results, "webmcp-capability"),
    }).toEqual({
      // 80, not 100: no MCP server, so no /.well-known discovery document.
      "agent-discovery": 80,
      "machine-readable-structure": 100,
      "access-renderability": 100,
      "form-semantics": 100,
      actionability: 100,
      // 95, not 100: the missing 5 are a per-origin origin-trial token.
      "webmcp-capability": 95,
    });
  });

  it("declares audit_site both ways and loads the polyfill from the served HTML", () => {
    const ids = findingsOf(results).map((f) => f.id);
    expect(ids).toContain("webmcp.declarative.present");
    expect(ids).toContain("webmcp.imperative.referenced");
    expect(ids).toContain("webmcp.polyfill.present");
    expect(ids).not.toContain("webmcp.imperative.legacy");

    // The registration has to be in the response, not in a bundle we load later.
    expect(html).toContain('toolname="audit_site"');
    expect(html).toContain("document.modelContext.registerTool");
  });

  it("publishes the structured data and the machine entry points it claims", () => {
    const ids = findingsOf(results).map((f) => f.id);
    expect(ids).toContain("structure.jsonld.present");
    expect(ids).toContain("discovery.openapi.present");
    expect(ids).toContain("discovery.llms.present");
    expect(ids).toContain("discovery.sitemap.present");

    const jsonLd = JSON.parse(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1],
    ) as { "@type": string }[];
    expect(jsonLd.map((n) => n["@type"])).toEqual(["WebSite", "WebApplication"]);
  });

  it("serves an OpenAPI 3.1 document describing the two public API routes", async () => {
    const doc = JSON.parse(await openapiBody()) as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).sort()).toEqual(["/api/audit", "/api/card"]);
    expect(Object.keys(doc.paths["/api/audit"]).sort()).toEqual(["get", "post"]);
    expect(Object.keys(doc.paths["/api/card"])).toEqual(["get"]);
  });

  it("keeps the page visually unchanged — the additions are metadata, attributes and scripts", () => {
    expect(html).toContain("Can an agent finish the job?");
    expect(html).toContain(">Audit</button>");
    expect(html).toContain("Web address to audit");
    // The form still submits without JavaScript, to the same place the JS does.
    expect(html).toContain('action="/report"');
    expect(html).toContain('method="get"');
  });
});
