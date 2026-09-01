/**
 * Agent discovery (Find): can an agent locate this site's machine entry points?
 * Discovery is a menu of signals (Grok R1 §C) — no single file is mandatory.
 *
 * Points (100):
 *   robots.txt present and not blocking everyone .... 25
 *   sitemap (file or robots Sitemap:) ................ 25
 *   llms.txt present with a heading .................. 15
 *   feed (RSS/Atom) or OpenAPI link on the page ....... 15
 *   MCP / agent well-known files (validated JSON) ..... 20
 *
 * Unknown never becomes zero (review B4): a signal whose sidecar could not be
 * observed (timeout/DNS/network) is excluded from the denominator, the score
 * is renormalised over what WAS observed, confidence drops, and an info
 * finding names what could not be checked. If nothing is observable → null.
 */
import type { AuditCheck, AuditContext, CheckResult, Confidence, Finding, ResourceSnapshot, SidecarOutcome } from "../contract";
import { excerpt } from "../contract";
import { AI_AGENT_TOKENS, isAllowed, parseRobots } from "@/lib/acquisition/robots";

const DOCS = {
  robots: "https://developers.google.com/search/docs/crawling-indexing/robots/intro",
  sitemap: "https://www.sitemaps.org/protocol.html",
  llms: "https://llmstxt.org/",
  openapi: "https://spec.openapis.org/oas/latest.html",
  mcpAuth: "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery",
};

const WELL_KNOWN_PATHS = [
  "/.well-known/oauth-protected-resource",
  "/.well-known/mcp.json",
  "/.well-known/mcp/server-card.json",
  "/.well-known/ai-plugin.json",
  "/.well-known/agent-card.json",
];

function firstOk(list: readonly ResourceSnapshot[] | undefined): ResourceSnapshot | undefined {
  return list?.find((r) => r.status >= 200 && r.status < 300);
}

function looksLikeHtml(body: string): boolean {
  return /<html|<!doctype html|<body/i.test(body.slice(0, 2048));
}

/** Parse a JSON object (not array/scalar) or return null. */
function jsonObject(body: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(body) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function observed(o: SidecarOutcome | undefined): boolean {
  return o?.kind === "observed";
}

export const agentDiscoveryCheck: AuditCheck = {
  id: "agent-discovery",
  version: 1,
  category: "agent-discovery",
  run(ctx: AuditContext): CheckResult {
    const findings: Finding[] = [];
    const outcomes = ctx.acquisition.sidecarOutcomes;
    const finalUrl = new URL(ctx.page.finalUrl);
    const origin = finalUrl.origin;
    const pathWithQuery = finalUrl.pathname + finalUrl.search;

    let earned = 0;
    let available = 0;
    const unobservable: string[] = [];
    /** Register a signal: `max` points, whether it could be observed, and the points earned if so. */
    const signal = (label: string, max: number, isObserved: boolean, got: () => number) => {
      if (!isObserved) {
        unobservable.push(label);
        return;
      }
      available += max;
      earned += Math.min(max, got());
    };

    // ---- robots.txt (25)
    const robots = firstOk(ctx.sidecars["robots.txt"]);
    const robotsObserved = observed(outcomes["/robots.txt"]) || !!robots;
    let robotsSitemaps: string[] = [];
    signal("robots.txt", 25, robotsObserved, () => {
      if (robots && !looksLikeHtml(robots.body)) {
        const parsed = parseRobots(robots.body);
        robotsSitemaps = parsed.sitemaps;
        const starBlocksAll = !isAllowed(parsed, "*", "/") && !isAllowed(parsed, "*", pathWithQuery);
        if (starBlocksAll) {
          findings.push({
            id: "discovery.robots.blocks-all",
            severity: "critical",
            title: "robots.txt disallows all crawlers",
            detail: "Every well-behaved agent will refuse to read this page. If that is intentional, agents cannot help your users here.",
            evidence: [{ source: "robots.txt", summary: "Disallow rule matches / for User-agent: *", excerpt: excerpt(robots.body) }],
            remediation: {
              summary: "Allow the pages you want agents to use.",
              rationale: "robots.txt is the first thing an agent reads; a blanket Disallow ends the visit.",
              snippet: "User-agent: *\nAllow: /\nSitemap: " + origin + "/sitemap.xml",
              language: "text",
              docsUrl: DOCS.robots,
            },
          });
          return 0;
        }
        const blockedAi = AI_AGENT_TOKENS.filter((t) => !isAllowed(parsed, t, pathWithQuery));
        if (blockedAi.length > 0) {
          findings.push({
            id: "discovery.robots.blocks-ai-agents",
            severity: blockedAi.length >= 4 ? "high" : "medium",
            title: `robots.txt blocks ${blockedAi.length} AI agent${blockedAi.length > 1 ? "s" : ""}`,
            detail: `Blocked for this page: ${blockedAi.join(", ")}. Blocking training crawlers is a legitimate choice, but user-driven agents (e.g. ChatGPT-User, Claude-User) act on behalf of a person and cannot complete tasks here.`,
            evidence: [{ source: "robots.txt", summary: `Disallowed tokens: ${blockedAi.join(", ")}` }],
            remediation: {
              summary: "Distinguish training crawlers from user agents.",
              rationale: "Block GPTBot/CCBot if you like; allow ChatGPT-User and Claude-User so people's agents can act for them.",
              snippet: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: ChatGPT-User\nAllow: /\n\nUser-agent: Claude-User\nAllow: /",
              language: "text",
              docsUrl: DOCS.robots,
            },
          });
          return 25;
        }
        findings.push({
          id: "discovery.robots.present",
          severity: "info",
          positive: true,
          title: "robots.txt present and permits agents",
          detail: "Crawlers and user agents are allowed to read this page.",
          evidence: [{ source: "robots.txt", summary: `${robots.finalUrl} (${robots.status})` }],
        });
        return 25;
      }
      // Observed absent (404 or HTML soft-404) = allow-all; most credit, nudge for the sitemap pointer.
      findings.push({
        id: "discovery.robots.missing",
        severity: "low",
        title: "No robots.txt",
        detail: "Absence means allow-all, but you lose the chance to point agents at your sitemap and declare agent policy.",
        evidence: [{ source: "robots.txt", summary: `${origin}/robots.txt not found` }],
        remediation: {
          summary: "Add a minimal robots.txt with a Sitemap line.",
          rationale: "Two lines that every crawler and agent reads first.",
          snippet: "User-agent: *\nAllow: /\nSitemap: " + origin + "/sitemap.xml",
          language: "text",
          docsUrl: DOCS.robots,
        },
      });
      return 15;
    });

    // ---- sitemap (25) — observable if sitemap.xml was observed OR robots (observed) declares one
    const sitemap = firstOk(ctx.sidecars["sitemap.xml"]);
    const sitemapOk = !!sitemap && /<urlset|<sitemapindex/i.test(sitemap.body);
    signal("sitemap.xml", 25, observed(outcomes["/sitemap.xml"]) || sitemapOk || robotsSitemaps.length > 0, () => {
      if (sitemapOk || robotsSitemaps.length > 0) {
        findings.push({
          id: "discovery.sitemap.present",
          severity: "info",
          positive: true,
          title: "Sitemap available",
          detail: sitemapOk ? "sitemap.xml is present and well-formed." : `Declared in robots.txt: ${robotsSitemaps[0]}`,
          evidence: [{ source: sitemapOk ? "sitemap.xml" : "robots.txt", summary: sitemapOk ? sitemap!.finalUrl : robotsSitemaps[0] }],
        });
        return 25;
      }
      findings.push({
        id: "discovery.sitemap.missing",
        severity: "medium",
        title: "No sitemap found",
        detail: "Agents that plan multi-step tasks use the sitemap to find the right page without crawling.",
        evidence: [{ source: "sitemap.xml", summary: `${origin}/sitemap.xml not found and no Sitemap: line in robots.txt` }],
        remediation: {
          summary: "Publish /sitemap.xml and reference it from robots.txt.",
          rationale: "Most frameworks generate one; Next.js supports app/sitemap.ts.",
          snippet: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${origin}/</loc></url>\n</urlset>`,
          language: "html",
          docsUrl: DOCS.sitemap,
        },
      });
      return 0;
    });

    // ---- llms.txt (15)
    const llms = firstOk(ctx.sidecars["llms.txt"]);
    signal("llms.txt", 15, observed(outcomes["/llms.txt"]) || !!llms, () => {
      if (llms && !looksLikeHtml(llms.body)) {
        const hasH1 = /^#\s+\S/m.test(llms.body);
        findings.push({
          id: "discovery.llms.present",
          severity: "info",
          positive: true,
          title: hasH1 ? "llms.txt present" : "llms.txt present but lacks a heading",
          detail: hasH1
            ? "A curated, LLM-friendly summary of the site is available. (Adoption by agents is still uneven — this is a bonus, not a foundation.)"
            : "llms.txt should start with an H1 naming the site, then a short blockquote summary and link sections.",
          evidence: [{ source: "llms.txt", summary: llms.finalUrl, excerpt: excerpt(llms.body, 200) }],
          remediation: hasH1
            ? undefined
            : { summary: "Start llms.txt with '# Site name' and a > summary line.", rationale: "That is the spec's minimal structure.", docsUrl: DOCS.llms },
        });
        return hasH1 ? 15 : 10;
      }
      findings.push({
        id: "discovery.llms.missing",
        severity: "low",
        title: "No llms.txt",
        detail: "An optional Markdown file that tells LLM-based agents what the site is and where the important pages are. Cheap to add; adoption by agents is still emerging.",
        evidence: [{ source: "llms.txt", summary: `${origin}/llms.txt not found` }],
        remediation: {
          summary: "Add /llms.txt (Markdown).",
          rationale: "Five minutes of work; some agents and Lighthouse's agentic audit already look for it.",
          snippet: `# ${finalUrl.hostname}\n\n> One-paragraph description of what this site is for and who it serves.\n\n## Key pages\n\n- [Home](${origin}/): what visitors can do here\n- [Docs](${origin}/docs): how to use the product\n`,
          language: "text",
          docsUrl: DOCS.llms,
        },
      });
      return 0;
    });

    // ---- feed or OpenAPI (15) — page-derived, always observable
    const dom = ctx.page.raw.dom;
    const feedLink = dom.first('link[type="application/rss+xml"], link[type="application/atom+xml"], link[type="application/feed+json"]');
    const openapiSidecar = firstOk(ctx.sidecars["linked-openapi"]);
    const openapiLink = dom.first('link[rel~="openapi"], link[rel~="service-desc"], link[type*="openapi"], a[href*="openapi."], a[href*="swagger."]');
    signal("feeds/API links", 15, true, () => {
      if (openapiSidecar || openapiLink) {
        findings.push({
          id: "discovery.openapi.present",
          severity: "info",
          positive: true,
          title: "API description discoverable",
          detail: "An OpenAPI/Swagger document is linked from the page — the strongest 'machine entry point' after WebMCP.",
          evidence: [{ source: openapiSidecar ? "linked-resource" : "raw-html", summary: openapiSidecar?.finalUrl ?? openapiLink!.attr("href") ?? "" }],
        });
        return 15;
      }
      if (feedLink) {
        findings.push({
          id: "discovery.feed.present",
          severity: "info",
          positive: true,
          title: "Feed advertised",
          detail: "An RSS/Atom feed is declared, giving agents a structured view of new content.",
          evidence: [{ source: "raw-html", summary: feedLink.attr("href") ?? "", path: feedLink.path }],
        });
        return 10;
      }
      findings.push({
        id: "discovery.machine-entry.missing",
        severity: "low",
        title: "No feed or API description linked",
        detail: "Nothing on the page tells an agent where structured data or an API lives.",
        evidence: [{ source: "raw-html", summary: "No <link rel=alternate type=application/rss+xml> or OpenAPI link" }],
        remediation: {
          summary: "Link your API description or a feed from <head>.",
          rationale: "A single <link> makes the machine entry point discoverable without guessing URLs.",
          snippet: `<link rel="service-desc" type="application/vnd.oai.openapi+json" href="${origin}/openapi.json">\n<!-- or -->\n<link rel="alternate" type="application/rss+xml" title="Updates" href="${origin}/feed.xml">`,
          language: "html",
          docsUrl: DOCS.openapi,
        },
      });
      return 0;
    });

    // ---- MCP / agent well-known (20) — validated JSON only (review N1)
    const wk = (ctx.sidecars["well-known"] ?? []).filter((r) => r.status >= 200 && r.status < 300 && !looksLikeHtml(r.body));
    const prm = wk.find((r) => r.finalUrl.includes("oauth-protected-resource"));
    const prmJson = prm ? jsonObject(prm.body) : null;
    const prmValid = !!prmJson && typeof prmJson.resource === "string" && Array.isArray(prmJson.authorization_servers);
    const card = wk.find((r) => /\/mcp\.json$|server-card\.json$/.test(r.finalUrl));
    const cardJson = card ? jsonObject(card.body) : null;
    const cardValid = !!cardJson && Object.keys(cardJson).length > 0 && (typeof cardJson.name === "string" || typeof cardJson.url === "string" || typeof cardJson.endpoint === "string" || Array.isArray(cardJson.servers));
    const others = wk.filter((r) => r !== prm && r !== card && jsonObject(r.body) !== null);
    const anyWkObserved = WELL_KNOWN_PATHS.some((p) => observed(outcomes[p])) || wk.length > 0;
    signal("MCP well-known files", 20, anyWkObserved, () => {
      if (prmValid || cardValid) {
        const src = (prmValid ? prm : card)!;
        findings.push({
          id: "discovery.mcp.present",
          severity: "info",
          positive: true,
          title: "MCP discovery metadata published",
          detail: prmValid
            ? "/.well-known/oauth-protected-resource is valid — the MCP spec's normative discovery document for protected servers."
            : "An MCP server card is published under /.well-known.",
          evidence: [{ source: "well-known", summary: src.finalUrl, excerpt: excerpt(src.body, 200) }],
        });
        return 20;
      }
      if (prm || card) {
        findings.push({
          id: "discovery.mcp.invalid",
          severity: "medium",
          title: "MCP discovery file present but not valid",
          detail: prm
            ? "oauth-protected-resource must be a JSON object with `resource` and `authorization_servers` (RFC 9728)."
            : "The server card is not a JSON object with a name/url/endpoint.",
          evidence: [{ source: "well-known", summary: (prm ?? card)!.finalUrl, excerpt: excerpt((prm ?? card)!.body, 160) }],
          remediation: {
            summary: "Return a valid JSON document.",
            rationale: "Clients that find an invalid discovery document give up; a catch-all 200 is worse than a 404.",
            snippet: `{\n  "resource": "${origin}/mcp",\n  "authorization_servers": ["https://auth.${finalUrl.hostname}"]\n}`,
            language: "json",
            docsUrl: DOCS.mcpAuth,
          },
        });
        return 5;
      }
      if (others.length > 0) {
        findings.push({
          id: "discovery.wellknown.other",
          severity: "info",
          positive: true,
          title: "Agent metadata found under /.well-known",
          detail: others.map((r) => new URL(r.finalUrl).pathname).join(", "),
          evidence: others.map((r) => ({ source: "well-known" as const, summary: r.finalUrl })),
        });
        return 8;
      }
      findings.push({
        id: "discovery.mcp.missing",
        severity: "low",
        title: "No MCP discovery files",
        detail: "Nothing under /.well-known tells an agent whether this site exposes an MCP server. Only relevant if you run one — but if you do, this is how agents find it.",
        evidence: [{ source: "well-known", summary: `${origin}/.well-known/oauth-protected-resource, mcp.json, mcp/server-card.json not found` }],
        remediation: {
          summary: "If you host an MCP server, publish /.well-known/oauth-protected-resource.",
          rationale: "Required by the MCP authorization spec; clients use it to locate your authorization server.",
          snippet: `{\n  "resource": "${origin}/mcp",\n  "authorization_servers": ["https://auth.${finalUrl.hostname}"],\n  "scopes_supported": ["read"],\n  "bearer_methods_supported": ["header"]\n}`,
          language: "json",
          docsUrl: DOCS.mcpAuth,
        },
      });
      return 0;
    });

    if (unobservable.length > 0) {
      findings.push({
        id: "discovery.unobserved",
        severity: "info",
        title: `Could not check: ${unobservable.join(", ")}`,
        detail: "These requests timed out or failed at the network level. They are excluded from this score rather than counted as missing.",
        evidence: unobservable.map((u) => ({ source: "linked-resource" as const, summary: `${u}: ${describeOutcome(u, outcomes)}` })),
      });
    }

    const score = available === 0 ? null : Math.round((earned / available) * 100);
    const confidence: Confidence = available === 100 ? "high" : available >= 60 ? "medium" : "low";
    const positives = findings.filter((f) => f.positive).length;
    return {
      checkId: "agent-discovery",
      category: "agent-discovery",
      applicable: true,
      score,
      confidence,
      findings,
      summary:
        score === null
          ? "Discovery files could not be reached."
          : score >= 75
            ? "Agents can find the important entry points."
            : score >= 40
              ? `${positives} of 5 discovery signals present.`
              : "Agents have little to go on beyond the HTML itself.",
    };
  },
};

function describeOutcome(label: string, outcomes: Readonly<Record<string, SidecarOutcome>>): string {
  const key = label === "robots.txt" ? "/robots.txt" : label === "sitemap.xml" ? "/sitemap.xml" : label === "llms.txt" ? "/llms.txt" : null;
  const o = key ? outcomes[key] : WELL_KNOWN_PATHS.map((p) => outcomes[p]).find((x) => x?.kind === "unobserved");
  return o?.kind === "unobserved" ? o.reason : "unknown";
}
