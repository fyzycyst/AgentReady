# INVARIANTS

Non-negotiables. A change that violates one of these needs an ADR, not a PR comment.

## Safe-fetch (SSRF) — `src/lib/acquisition/safe-fetch.ts`, `net-policy.ts`

Settled by the Triumvirate (GPT Sol's blocking concern + Grok's sourced pitfalls). `/api/audit` may not exist without these and their bypass tests (`tests/acquisition/*.test.ts`).

1. Absolute `http:`/`https:` only. No userinfo, no fragments, ports 80/443 only.
2. Resolve DNS with `all: true`; reject if **any** address is non-global: loopback, RFC1918, CGNAT `100.64/10`, link-local `169.254/16` & `fe80::/10`, multicast, reserved, documentation ranges, unspecified, IPv6 forms that embed an IPv4 (mapped `::ffff:`, compatible, NAT64 `64:ff9b::`, 6to4 `2002::`), and **all of Teredo `2001:0::/32`** (its client address is obfuscated, so it is blocked wholesale). Cloud metadata (`169.254.169.254`, `169.254.100.1`, `fd00:ec2::254`) is covered by those ranges. There is no official Vercel statement that IMDS is unreachable — **fail closed**. DNS resolution runs **inside** the chain deadline (a hung resolver yields `timeout`).
3. Connect through an undici `Agent` whose `connect.lookup` is **pinned** to the validated addresses. There is never a second resolve, so DNS rebinding has no window. TLS `servername` still comes from the hostname (verified against `undici/lib/core/connect.js`).
4. `redirect: "manual"`. Every `Location` re-runs 1–3 (undici auto-follow skips DNS for IP-literal redirects). Max 3 hops for pages, 2 for sidecars. No `https→http` downgrade. Sidecar fetches are **origin-locked** (a hop off the origin is rejected). The orchestrator supplies a `beforeRedirect` hook that fetches and evaluates the **target origin's robots.txt before the redirected page is requested**; a disallow yields `robots-disallow` with the target never fetched.
5. Streaming caps: one deadline per chain covering DNS + every hop + body (page 10 s, sidecar 4 s), decoded bytes (page 2 MB, sidecar 256 KB — truncated, flagged, never rejected), `maxHeaderSize` 32 KB, content-type allowlist checked before the body is read. Media types match **exactly** or by family wildcard (`text/*`); malformed tokens (`text/html-evil`, `application/jsonp`) never pass.
6. Sidecars are fetched only against the **validated final origin** from a fixed path allowlist (`sidecars.ts: FIXED_SIDECARS`) plus a **global maximum of 2** page-declared same-origin `<link>`/`<a>` targets that pass the same policy. **No `script[src]` fetching in v1.** Every attempted sidecar records a `SidecarOutcome` (`observed` with status — 404 included — or `unobserved` with reason) in `AuditContext.acquisition.sidecarOutcomes`.
7. No cookies, credentials, `Authorization`, or user-controlled headers outbound. Fixed browser-like UA (`USER_AGENT`).
8. Upstream bodies, headers and transport errors are never echoed to the client. `set-cookie`/`authorization` are dropped from captured headers. Callers get a `SafeFetchErrorCode`, not an error message from the network.
9. Per-client rate limit (`rate-limit.ts`, best-effort per instance, LRU-bounded to 2 000 keys; trusts the first `x-forwarded-for` entry, which Vercel sets) and robots.txt honoured **before** the page — and before every redirect target — is fetched (`orchestrator.ts`). Robots groups are selected by the product token `AgentReady` (RFC 9309: exact, case-insensitive, all matching groups combined; `*` only as fallback).
10. The bypass corpus in `tests/acquisition/net-policy.test.ts` and `safe-fetch.test.ts` must stay green.

## Checks

- Checks are **pure**: no fetch, no render, no `Date.now()`, no parser import. They see the DOM only through `HtmlQuery`.
- `applicable:false` = no signals on this page → weight redistributed. `score:null` = not observable with this acquisition → excluded from denominator, lowers coverage. **Unknown never becomes zero.** Within a check, a signal whose sidecar was `unobserved` is excluded from that check's denominator (renormalised), lowers `confidence`, and is named in an info finding; an observed 404 *is* evidence of absence.
- Positive credit requires validated evidence: MCP well-known files must be JSON objects with the spec's required fields; JSON-LD must have a schema.org `@context` and a non-empty `@type`. A catch-all 200 never earns points.
- Every non-positive finding carries a `remediation` with a concrete `summary`; snippets use `document.modelContext` (never `navigator.modelContext`) for WebMCP.
- A crashing check yields `score:null` and a note; it never sinks the report.

## Rendering

- No headless browser on the v1 path (`render.ts` returns `skipped`). JS-dependence is heuristic and labelled as such in the report.

## Scoring

- Weights live only in `src/lib/audit/weights.ts` and sum to 100.
- The "+N opportunity" number is computed by re-scoring with WebMCP at 100, never a constant.

## Time

- All timestamps are ISO-8601 UTC, injected via `fetchedAt`.
