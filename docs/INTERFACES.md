# INTERFACES

## HTTP: `POST /api/audit` (also `GET /api/audit?url=`)

Request: `{ "url": string }` — scheme optional on input; normalised to absolute https.

Response `200`: `AuditReport | BlockedReport` (JSON, `cache-control: no-store`).
Response `400`: `{ ok:false, code:"invalid-url", title, message }`.
Response `429`: `{ ok:false, code:"rate-limited", ... }` with `retry-after`.

Stability: `AuditReport.version` (`REPORT_VERSION`) bumps on shape changes.

```ts
interface AuditReport {
  ok: true;
  requestedUrl: string; finalUrl: string; fetchedAt: string; status: number;
  score: ScoreSummary;          // overall, grade, coverage (0–1), survival, superpower, opportunity, categories[]
  results: CheckResult[];       // one per registered check
  acquisition: { robotsAllowed; renderedDom: "available"|"skipped"|"failed"; notes: string[]; truncated; sidecarsChecked };
  durationMs: number; version: string;
}
interface BlockedReport {
  ok: false; requestedUrl; fetchedAt;
  code: SafeFetchErrorCode | "robots-disallow" | "http-error" | "not-html";
  title: string; message: string; status?: number; evidence?: string; durationMs: number;
}
```

## Check-module contract — `src/lib/audit/contract.ts`

`AuditCheck.run(ctx: AuditContext) → CheckResult | Promise<CheckResult>`

- Input `AuditContext`: `requestedUrl`, `fetchedAt`, `page` (ResourceSnapshot + `raw: HtmlSnapshot` + optional `rendered`), `sidecars` (by `SidecarKey`), `acquisition` (`robotsAllowed`, `renderedDom`, `notes`).
- Output `CheckResult`: `checkId`, `category`, `applicable`, `score: number|null`, `confidence`, `findings[]`, `summary`.
- `Finding`: stable `id` (`<category>.<topic>.<state>`), `severity`, `title`, `detail`, `evidence[]`, optional `remediation {summary, rationale, snippet?, language?, docsUrl?}`, `positive?`.

Guarantees: context is immutable; checks are pure (see INVARIANTS). Adding a check = add a file under `checks/` and register in `checks/index.ts`; add its weight in `weights.ts`.

## Snippet generators — `src/lib/audit/snippets/webmcp-stub.ts`

`generateWebMcpStub(dom: HtmlQuery, pageUrl: string) → WebMcpStub | null`

- `WebMcpStub`: `formPath`, `formIndex`, `toolName` (`[a-z0-9_]`, ≤40), `description` (≤120), `declarative` (HTML), `imperative` (TS), `params[] {name, type, description, required}`.
- `null` when the page has no form with a non-hidden control; callers use `genericStubSnippets(pageUrl)` for the site-search fallback.
- Also exported for check remediations: `correctedFormTag(dom, form)`, `controlSnippetLine(dom, control)`, `toolParamControls(form)`, `inputSchemaFor(params)`, and the verified WebMCP constants (`POLYFILL_SCRIPT_TAG`, `DOCS_*`).
- Generated `execute()` bodies resolve to a plain JSON-serializable value — the WebMCP surface stringifies it and does **not** expect an MCP `{ content: [...] }` envelope.
- **`StubParam.name` and `description` are RAW page values**, never truncated in the case of `name`. A name is an identity: it is the key the agent sends and the key `form.elements.namedItem()` looks up, so it must match the page byte for byte. Encoding happens once per sink — `escapeAttr` for HTML attributes and prose, `JSON.stringify` + `<>&` escapes for JavaScript/JSON.
- Params are dropped, not half-supported, when the name is `__proto__`/`constructor`/`prototype`, when it duplicates an earlier control, or when the control is `type=file` (its value cannot be assigned).
- The generated code finds its form as `document.forms[formIndex]` guarded by `instanceof HTMLFormElement`, never via a selector built from page text (`id="billing:email"` is legal HTML and illegal CSS). Assignment is type-aware: `checked` for checkboxes, `value` otherwise.
- Output is text only. Nothing here is executed or used as a live selector.

## `HtmlQuery` seam

`all(selector)`, `first(selector)`, `bodyText()`; `ElementView` exposes `path`, `tag`, `attr()`, `attrs()`, `text()`, `outerHtml()`, `all()`, `first()`. Read-only. Backed by cheerio in `acquisition/html-query.ts`; swapping the parser touches only that file.

## `safeFetch(url, policy, deps?) → SafeFetchResult`

`{ ok:true, resource: ResourceSnapshot } | { ok:false, code, message, hops }`. `deps` (`lookupAll`, `request`, `now`) are injectable for tests.
