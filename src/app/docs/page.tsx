import Link from "next/link";

export const metadata = {
  title: "Docs — AgentReady",
  description:
    "How AgentReady scores agent-readiness: the six checks, the honesty rules, the HTTP API, and the WebMCP tools this site exposes.",
};

/**
 * One static page that explains the product to people AND to agents — added
 * after watching an agent probe the site for documentation. Server-rendered,
 * no client JS, native landmarks and headings; the content mirrors
 * docs/{ARCH,INTERFACES,INVARIANTS}.md at a reader's altitude.
 */
export default function DocsPage() {
  return (
    <div className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-3xl px-6 pt-8 flex items-center justify-between">
        <Link href="/" className="font-mono text-sm tracking-wide text-text rounded">
          agent<span className="text-signal">ready</span>
        </Link>
        <nav aria-label="Primary" className="flex gap-6 text-sm text-muted">
          <Link href="/demo" className="hover:text-text rounded">Demo</Link>
          <a href="https://github.com/fyzycyst/AgentReady" className="hover:text-text rounded" rel="noreferrer">Source</a>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-14 flex-1 space-y-12">
        <section>
          <p className="eyebrow">Documentation</p>
          <h1 className="display mt-2 text-4xl md:text-5xl font-semibold">How AgentReady works</h1>
          <p className="mt-4 text-muted">
            AgentReady fetches one public page the way a non-rendering agent does — the raw HTML plus the machine
            signals around it — runs six independent checks, and returns a 0–100 score with evidence-backed findings
            and copy-paste fixes. No account, no storage: URL in, report out.
          </p>
        </section>

        <section aria-labelledby="checks">
          <h2 id="checks" className="text-2xl font-semibold">The six checks</h2>
          <dl className="mt-4 space-y-4">
            {[
              ["Agent discovery (18%)", "robots.txt, sitemap.xml, llms.txt, feeds, OpenAPI links, and MCP well-known files — can an agent locate the site's machine entry points?"],
              ["Machine-readable structure (18%)", "JSON-LD with a schema.org context, semantic landmarks, a clean heading outline, canonical metadata — can an agent tell what the page is without guessing?"],
              ["Access & renderability (18%)", "Response headers, bot-management and CAPTCHA signals, and JavaScript-dependence heuristics — does the fetched HTML actually contain the content?"],
              ["Form semantics (16%)", "Labels, names, input types, autocomplete — if an agent finds a form, can it tell what each field wants? Pages with no forms are exempt, not penalised."],
              ["Actionability (15%)", "Real links, buttons and forms versus click-handler soup — of the things a person can do here, how many can an agent invoke?"],
              ["WebMCP capability (15%)", "Declarative tool attributes on forms, imperative registerTool references, the polyfill, and the policy headers that gate the API. Where nothing is declared, the report generates a starter tool from the page's own first form."],
            ].map(([term, def]) => (
              <div key={term} className="card p-4">
                <dt className="font-medium">{term}</dt>
                <dd className="mt-1 text-sm text-muted">{def}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="honesty">
          <h2 id="honesty" className="text-2xl font-semibold">The honesty rules</h2>
          <ul className="mt-4 space-y-2 text-muted list-disc pl-5">
            <li>Unknown never becomes zero: what a check cannot observe is excluded from the score and lowers the visible coverage percentage, and every category carries a confidence label.</li>
            <li>A blocked fetch (robots.txt disallow, bot challenge) produces a no-score report — it proves our request was refused, not that agents in a browser are.</li>
            <li>robots.txt is honoured before any page — including every redirect target — is fetched.</li>
            <li>The &ldquo;+N with WebMCP&rdquo; number is computed by re-scoring the same page with WebMCP at full marks, never a constant.</li>
            <li>Grades change when the rubric changes; treat any published score as a dated observation.</li>
          </ul>
        </section>

        <section aria-labelledby="api">
          <h2 id="api" className="text-2xl font-semibold">API</h2>
          <p className="mt-3 text-muted">
            Machine-readable description: <a href="/openapi.json" className="text-info hover:underline">/openapi.json</a> (OpenAPI 3.1).
            Agent orientation: <a href="/llms.txt" className="text-info hover:underline">/llms.txt</a>.
          </p>
          <pre className="snippet mt-4">{`POST /api/audit          {"url": "https://example.com"}   → full JSON report
GET  /report?url=<url>   server-rendered HTML report (works without JavaScript)
GET  /api/card?url=<url> 1200×630 PNG share card`}</pre>
          <p className="mt-3 text-sm text-faint">
            Rate limit: best-effort, ~12 requests/min per client per instance. Only public http/https URLs on ports
            80/443 are audited; private and internal addresses are refused.
          </p>
        </section>

        <section aria-labelledby="tools">
          <h2 id="tools" className="text-2xl font-semibold">WebMCP tools on this site</h2>
          <p className="mt-3 text-muted">
            AgentReady practises what it measures. In a WebMCP-capable browser (ChatGPT&rsquo;s in-app browser, or Chrome
            with the WebMCP flag), the landing page exposes <code className="font-mono text-text">audit_site</code> — an
            agent can run a full audit and read back the score, grade, coverage and top finding. The{" "}
            <Link href="/demo" className="text-info hover:underline">demo bistro</Link> additionally declares its
            reservation form as a tool and registers an availability checker.
          </p>
        </section>

        <section aria-labelledby="method">
          <h2 id="method" className="text-2xl font-semibold">Methodology &amp; source</h2>
          <p className="mt-3 text-muted">
            The full rubric, the safe-fetch security invariants, and every check&rsquo;s implementation are open source
            (MIT):{" "}
            <a href="https://github.com/fyzycyst/AgentReady" className="text-info hover:underline" rel="noreferrer">
              github.com/fyzycyst/AgentReady
            </a>
            . Weights live in one file; scoring maths in another; each check is a pure function with fixture tests.
          </p>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-6 py-8 text-xs text-faint">
        <Link href="/" className="hover:text-muted rounded">← Back to the auditor</Link>
      </footer>
    </div>
  );
}
