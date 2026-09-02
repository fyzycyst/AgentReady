# AgentReady

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-☕-FFDD00.svg)](https://buymeacoffee.com/themodeleer)

**Your site works for humans. Can an agent finish the job?**

Live: **https://agent-ready-cyan.vercel.app** · [Docs](https://agent-ready-cyan.vercel.app/docs) · [Demo](https://agent-ready-cyan.vercel.app/demo)

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

## Features

- **Six checks**: agent discovery, machine-readable structure, access & renderability, form semantics, actionability, WebMCP capability — weights published, methodology at [/docs](https://agent-ready-cyan.vercel.app/docs).
- **WebMCP stub generator**: every audited page gets a paste-ready tool built from its own first form — declarative `toolname` attributes plus `document.modelContext.registerTool` code with a correct JSON schema.
- **WebMCP app, not just a WebMCP judge**: in ChatGPT's in-app browser (or Chrome with the WebMCP flag), the landing page exposes an `audit_site` tool an agent can call directly. [/demo](https://agent-ready-cyan.vercel.app/demo) shows a bookable reservation form declared as a tool; [/fixtures/soup](https://agent-ready-cyan.vercel.app/fixtures/soup) shows the beautiful-but-broken alternative.
- **Honest scoring**: unobserved evidence never counts against a site; coverage and confidence are always shown; blocked fetches yield "no score", not a fake grade.
- **Works without JavaScript**: `GET /report?url=` is fully server-rendered. Programmatic access via `POST /api/audit` ([OpenAPI](https://agent-ready-cyan.vercel.app/openapi.json)); share cards at `/api/card?url=`.

## Status

**v1 complete and deployed.** All four build phases shipped (348 tests, incl. an SSRF bypass corpus and a runtime test of generated tool code). AgentReady audits itself at **96/A** — the missing points are documented, not gamed. Submitted to the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/); built 2026-09-01/02 by a human-directed multi-agent AI team with adversarial cross-review on every merge (see `docs/adr/` and the git history).
