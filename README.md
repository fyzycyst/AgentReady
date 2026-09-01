# AgentReady

**Your site works for humans. Can an agent finish the job?**

Paste any public URL and get an agent-readiness report: a 0–100 score, where AI agents get stuck (Find → Understand → Act), and copy-paste fixes — including WebMCP tool stubs.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest: SSRF bypass corpus, check fixtures, scoring
npm run typecheck
```

## How it works

One server-side fetch of the page (through a hardened `safe-fetch`), a handful of bounded same-origin sidecar fetches (`robots.txt`, `sitemap.xml`, `llms.txt`, `/.well-known/*`), then six pure check modules score the page. No database, no headless browser, nothing stored.

- `docs/ARCH.md` — modules and data flow
- `docs/INTERFACES.md` — API and check-module contract
- `docs/INVARIANTS.md` — safe-fetch (SSRF) rules and scoring invariants
- `docs/adr/` — decisions

## Status

Phase 1: discovery + structure checks, report UI. Phases 2–4 add access/forms/actionability, WebMCP detection + stub generator, `/demo`, share view, deploy.
