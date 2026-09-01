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

## `HtmlQuery` seam

`all(selector)`, `first(selector)`, `bodyText()`; `ElementView` exposes `path`, `tag`, `attr()`, `attrs()`, `text()`, `outerHtml()`, `all()`, `first()`. Read-only. Backed by cheerio in `acquisition/html-query.ts`; swapping the parser touches only that file.

## `safeFetch(url, policy, deps?) → SafeFetchResult`

`{ ok:true, resource: ResourceSnapshot } | { ok:false, code, message, hops }`. `deps` (`lookupAll`, `request`, `now`) are injectable for tests.
