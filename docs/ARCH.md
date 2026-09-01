# ARCH

AgentReady audits a single public URL for agent-readiness. Stateless: URL in, report out.

```mermaid
flowchart LR
  UI[Landing / Report UI] -- POST {url} --> API[/api/audit route]
  API --> V[validation/audit-request]
  V --> O[audit/orchestrator]
  O --> R1[robots.txt of requested origin]
  O --> P[safe-fetch page]
  O --> S[sidecars on final origin]
  O --> X[render adapter: skipped]
  O --> C[checks/* pure]
  C --> SC[scoring.summarize]
  SC --> API
  subgraph acquisition [lib/acquisition — the only network boundary]
    R1; P; S; X
  end
```

## Modules

| Module | Responsibility | Trust boundary |
|---|---|---|
| `src/app/api/audit/route.ts` | HTTP surface. Rate-limit, normalise input, call orchestrator, return JSON. `runtime: nodejs`, `maxDuration: 30`. | Untrusted input (URL) |
| `src/lib/validation/` | URL normalisation (`example.com` → `https://example.com/`), rate limit. | — |
| `src/lib/acquisition/` | **All** network I/O. `safe-fetch` (SSRF policy, pinned DNS, redirects, caps), `sidecars`, `robots`, `html-query` (cheerio behind `HtmlQuery`), `render` (no-op). | Untrusted remote content |
| `src/lib/audit/contract.ts` | The check-module contract (see INTERFACES.md). | — |
| `src/lib/audit/orchestrator.ts` | Sequences acquisition → context → checks → score; produces `AuditReport` or `BlockedReport`. | — |
| `src/lib/audit/checks/` | Pure check modules, one per category, registered in `index.ts`. | Consume untrusted HTML via `HtmlQuery` only |
| `src/lib/audit/scoring.ts`, `weights.ts` | Weighted mean with redistribution/coverage; Survival/Superpower/opportunity. | — |
| `src/components/`, `src/app/*` | UI. Report page is a client component that calls the API. | — |

## Data flow

1. Robots for the requested origin is fetched first; a disallow for the `AgentReady` token returns a `BlockedReport` **without** fetching the page.
2. The page is fetched with `PAGE_POLICY`. On every redirect hop, safe-fetch calls the orchestrator's `beforeRedirect` hook, which fetches/evaluates the target origin's robots.txt (cached per origin) before the hop is requested. Non-2xx/3xx or non-HTML → `BlockedReport` (with challenge detection for 403/429/503).
3. Sidecars (`robots`, `sitemap`, `llms.txt`, `/.well-known/*`, ≤2 page-declared feed/OpenAPI links) are fetched in parallel against the **final** origin under a shared 4.5 s budget, reusing any robots.txt already fetched. Each attempt yields a `SidecarOutcome` so checks can distinguish "404 observed" from "could not observe".
4. `AuditContext` is built once (immutable) and handed to every check.
5. `summarize()` computes the headline, layers, coverage and opportunity.

## Report states

- `AuditReport` (`ok:true`) — score + categories + findings.
- `BlockedReport` (`ok:false`) — polished no-score state with a `code`, human title/message, optional status/evidence. A blocked fetch is *not* scored as hostility (Sol's R2 finding).

## Phases

P1 (this): scaffold, safe-fetch, discovery + structure checks, minimal UI.
P2: access-renderability, form-semantics, actionability; report polish.
P3: webmcp-capability, snippet generator, `/demo`, share view.
P4: edge cases, deploy config, optional remote-CDP render behind a flag.
