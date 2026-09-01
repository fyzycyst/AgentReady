# RISK REGISTER

| # | Risk | Likelihood | Impact | Mitigation | Owner/Status |
|---|---|---|---|---|---|
| 1 | Famous sites 403 the Vercel egress IP during the live judge demo | High | High | Landing ships one-click **safe-URL chips** (pre-tested) + first-party `/demo` (P3). Blocked fetch → polished `BlockedReport`, never a spinner. Re-test chips on recording day. | Open (P3) |
| 2 | SSRF via the public URL field | Medium | Critical | Invariants 1–10 in `docs/INVARIANTS.md`; bypass corpus in `tests/acquisition/`. | Mitigated (P1) |
| 3 | Audit exceeds the 30 s judge budget | Medium | High | Page 10 s, sidecars shared 4.5 s, no rendering, `maxDuration: 30`. Typical audit ≈ 1–3 s. | Mitigated |
| 4 | Every site scores F because WebMCP adoption is ~0 | High | High | WebMCP weighted 15; Survival vs Superpower layers; computed "+N opportunity". | Mitigated by design (P3 to wire UI) |
| 5 | Unobservable evidence counted as failure (trust loss) | Medium | Medium | `score:null` + coverage %, `applicable:false` redistribution, `confidence` per category. | Mitigated |
| 6 | WebMCP spec drift before demo (API names, attributes) | Medium | Medium | Snippets use `document.modelContext`; detector also matches deprecated `navigator.*`. Re-verify against spec before recording. | Open (P3) |
| 7 | ChatGPT Desktop WebMCP claim unverified in OpenAI docs | Medium | Low | Live-test before naming it in the video; else say "browsers and agents shipping WebMCP". | Open |
| 8 | In-memory rate limit is per-instance on serverless | High | Low | LRU-bounded (2 000 keys); trusts Vercel's `x-forwarded-for`. Acceptable for hackathon traffic; KV limiter + concurrency cap before public launch. | Accepted |
| 9 | Decompression bomb (`Content-Encoding` chain) | Low | Medium | Decoded-byte cap with streaming cancel; undici bounds header size. Not a full step-count bound. | Accepted (documented) |
| 10 | Next.js 16 API drift vs. training data | Medium | Low | Read `node_modules/next/dist/docs` before touching framework surfaces. | Ongoing |
