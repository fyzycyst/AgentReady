# ADR-0001: Phase 1 scaffold, check-module architecture, no-render v1

**Status:** Accepted 2026-09-01 (human-approved Triumvirate synthesis; epic `a6bbe277`, `synthesis/index.md`)

## Context

AgentReady is a hackathon entry (due 2026-09-18) that audits any public URL for agent-readiness. Judges must run it live on arbitrary sites in <30 s. Three planning seats (Claude Fable 5, GPT Sol, Grok 4.6) debated the design over two rounds; this ADR records the settled decisions and justifies the Phase 1 touch budget (a scaffold necessarily exceeds the ≤3-file rule).

## Decisions

1. **Six pure check modules** (`agent-discovery`, `machine-readable-structure`, `access-renderability`, `form-semantics`, `actionability`, `webmcp-capability`) fed an immutable `AuditContext`; UI clusters them under Find → Understand → Act. (3–0)
2. **WebMCP weight 15**; Survival (five categories) vs Superpower (WebMCP) layers; computed "+N opportunity". (3–0)
3. **Unknown never becomes zero**: `applicable:false` redistributes weight; `score:null` lowers coverage; `confidence` per result. (3–0)
4. **No headless browser on the v1 path.** `render.ts` returns `skipped`; JS-dependence is heuristic and labelled. Remote-CDP is a P4 stretch behind an env flag. (3–0; Vercel has no native browser rendering, Sandbox+Chromium cold start ≈ 30 s.)
5. **`HtmlQuery` seam backed by cheerio**; happy-dom excluded (CVE-2025-61927/-62410). (2–1; linkedom recorded as second choice.)
6. **No `script[src]` bundle fetching in v1**; inline scripts only. (2–1; Sol's capped-scan dissent recorded with revisit trigger: `/demo` imperative detection fails from inline source *and* bypass corpus green.)
7. **safe-fetch before any route** — the ten invariants in `docs/INVARIANTS.md`. (Blocking constraint, accepted 3–0.)
8. **Blocked fetch ≠ hostility score.** A 403/challenge from our egress yields a no-score `BlockedReport`.
9. Demo roles: hosted div-soup fixture (D-grade reveal), first-party `/demo` (A-grade control), pre-tested famous sites as optional chips; landing ships safe-URL chips, no Hall of Fame.

## Consequences

- Phase 1 touches ~30 files (scaffold, acquisition, two checks, tests, docs). Justified here; subsequent tickets return to ≤3 files where possible.
- Imperative WebMCP can only be reported as "referenced", never "registered", without JS execution.
- Rendering-dependent signals (hydrated DOM, conditional CAPTCHAs) are reported with low confidence or `score:null`.

## Rollback

Delete `src/lib`, `tests`, `docs`, `src/app/api` and the report page; the scaffold is a stock `create-next-app`. Weights are configuration; category set is a registry.
