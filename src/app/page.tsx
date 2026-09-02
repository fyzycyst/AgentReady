import type { Metadata } from "next";
import Link from "next/link";
import { SafeUrlChips } from "@/components/landing/safe-url-chips";
import { UrlAuditForm } from "@/components/landing/url-audit-form";
import { WebMcpAuditTool } from "@/components/landing/webmcp-audit-tool";
import { AUDIT_SITE_TOOL } from "@/lib/webmcp/audit-site-tool";
import { absoluteSiteUrl } from "@/lib/site-origin";

const canonical = absoluteSiteUrl("/");

export const metadata: Metadata = {
  alternates: { canonical },
};

/**
 * Two entities, because an agent asks two questions here: what is this site
 * (`WebSite`, with the audit form as its `potentialAction`) and what does the
 * tool do (`WebApplication`). `potentialAction` points at the same `/report`
 * URL the form GETs, so the JSON-LD, the form and the WebMCP tool all describe
 * one action.
 */
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "AgentReady",
    url: canonical,
    description:
      "Audit any public URL for agent-readiness: WebMCP tools, structured data, discovery files, forms and actionability.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteSiteUrl("/report")}?url={url}`,
      },
      "query-input": "required name=url",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "AgentReady",
    url: canonical,
    applicationCategory: "DeveloperApplication",
    browserRequirements: "Works in any browser; WebMCP tools require Chrome 149+ with the origin trial or flag.",
    description:
      "Scores a page 0–100 across agent discovery, machine-readable structure, access and renderability, form semantics, actionability and WebMCP capability, and generates the code that fixes what it finds.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    potentialAction: {
      "@type": "Action",
      name: AUDIT_SITE_TOOL.name,
      description: AUDIT_SITE_TOOL.description,
      target: absoluteSiteUrl("/api/audit"),
    },
  },
];

export default function Home() {
  return (
    <div className="flex-1 flex flex-col">
      <link rel="service-desc" type="application/vnd.oai.openapi+json" href="/openapi.json" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <WebMcpAuditTool />
      <header className="mx-auto w-full max-w-5xl px-6 pt-8 flex items-center justify-between">
        <Link href="/" className="font-mono text-sm tracking-wide text-text">
          agent<span className="text-signal">ready</span>
        </Link>
        <nav className="flex gap-6 text-sm text-muted">
          <a href="#how" className="hover:text-text">How it scores</a>
          <Link href="/docs" className="hover:text-text rounded">Docs</Link>
          <a href="https://github.com/fyzycyst/AgentReady" className="hover:text-text" rel="noreferrer">
            Source
          </a>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 flex-1">
        <section className="pt-24 pb-16 md:pt-32">
          <p className="eyebrow rise">Agent-readiness audit · WebMCP · structured data · discovery</p>
          <h1 className="display mt-5 max-w-4xl text-5xl md:text-7xl font-semibold rise" style={{ animationDelay: "60ms" }}>
            Your site works for humans.
            <br />
            <span className="text-signal">Can an agent finish the job?</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted rise" style={{ animationDelay: "120ms" }}>
            Paste any public URL. In a few seconds you get a score, the exact places an AI agent gets stuck, and the code
            that fixes them.
          </p>

          <div className="mt-10 rise" style={{ animationDelay: "180ms" }}>
            {/* Only here: `/` is the page that owns the audit_site tool. */}
            <UrlAuditForm declareTool />
            <div className="mt-4">
              <SafeUrlChips />
            </div>
          </div>
        </section>

        <section id="how" className="pb-24 grid gap-6 md:grid-cols-3">
          {[
            {
              step: "Find",
              q: "Can an agent locate the right page and its entry points?",
              what: "robots.txt, sitemap, llms.txt, feeds, OpenAPI, MCP well-known files",
            },
            {
              step: "Understand",
              q: "Can it tell what the page is without guessing?",
              what: "JSON-LD, landmarks, headings, metadata, JavaScript dependence, bot policy",
            },
            {
              step: "Act",
              q: "Can it complete the task — book, buy, submit?",
              what: "Labelled forms, real buttons and links, WebMCP tools",
            },
          ].map((s) => (
            <div key={s.step} className="card p-6">
              <p className="eyebrow">{s.step}</p>
              <p className="mt-3 text-lg font-medium">{s.q}</p>
              <p className="mt-2 text-sm text-muted">{s.what}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 py-8 text-xs text-faint flex flex-wrap gap-x-6 gap-y-2">
        <span>Reads one page, respects robots.txt, stores nothing.</span>
        <span>WebMCP is a W3C community draft; Chrome origin trial 149–156.</span>
        <a href="https://buymeacoffee.com/themodeleer" rel="noreferrer" className="hover:text-muted rounded">
          Support this project ☕
        </a>
      </footer>
    </div>
  );
}
