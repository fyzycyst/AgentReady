/**
 * Check-module contract.
 *
 * Settled by the Triumvirate synthesis (epic a6bbe277, synthesis/index.md).
 * Checks are PURE: they receive an immutable AuditContext built by the
 * acquisition layer and return a CheckResult. They must not fetch, render,
 * read clocks, or import a parser — they see the DOM only through HtmlQuery.
 *
 * Unknown must never become zero:
 *   applicable:false → the category has no signals on this page (e.g. no
 *                      forms); its weight is redistributed pro-rata.
 *   score:null       → the category applies but could not be observed with
 *                      this acquisition (e.g. needs a rendered DOM); it is
 *                      excluded from the denominator and lowers coverage.
 */

export type AuditCategory =
  | "agent-discovery"
  | "machine-readable-structure"
  | "access-renderability"
  | "form-semantics"
  | "actionability"
  | "webmcp-capability";

/** Story layer the report clusters categories under. */
export type AgentPathStep = "find" | "understand" | "act";

/** Score layer: Survival = can an agent read/act at all; Superpower = WebMCP. */
export type ScoreLayer = "survival" | "superpower";

export interface ElementView {
  /** Stable locator for evidence (e.g. "form#contact > input[2]"). Not executable. */
  readonly path: string;
  readonly tag: string;
  attr(name: string): string | undefined;
  attrs(): Readonly<Record<string, string>>;
  text(): string;
  outerHtml(): string;
  /** Query within this element. */
  all(selector: string): readonly ElementView[];
  first(selector: string): ElementView | undefined;
}

export interface HtmlQuery {
  all(selector: string): readonly ElementView[];
  first(selector: string): ElementView | undefined;
  /** Visible text of <body> with scripts/styles stripped, whitespace-collapsed. */
  bodyText(): string;
}

export interface HtmlSnapshot {
  readonly html: string;
  readonly dom: HtmlQuery;
}

export interface ResourceSnapshot {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly status: number;
  /** Lower-cased header names. Set-Cookie and Authorization are never captured. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly truncated: boolean;
  readonly durationMs: number;
}

export type SidecarKey =
  | "robots.txt"
  | "sitemap.xml"
  | "llms.txt"
  | "well-known"
  | "linked-openapi"
  | "linked-feed";

/**
 * What happened when a sidecar was attempted. "observed" includes 404s — a
 * 404 is evidence of absence; "unobserved" (timeout, DNS, network, budget)
 * is not, and checks must not score it as missing.
 */
export type SidecarOutcome =
  | { readonly kind: "observed"; readonly status: number }
  | { readonly kind: "unobserved"; readonly reason: string };

export interface AuditContext {
  readonly requestedUrl: string;
  /** Injected ISO timestamp; checks do not call Date.now(). */
  readonly fetchedAt: string;
  readonly page: ResourceSnapshot & {
    readonly raw: HtmlSnapshot;
    readonly rendered?: HtmlSnapshot;
  };
  readonly sidecars: Readonly<Partial<Record<SidecarKey, readonly ResourceSnapshot[]>>>;
  readonly acquisition: {
    readonly robotsAllowed: boolean;
    readonly renderedDom: "available" | "skipped" | "failed";
    /** Keyed by pathname ("/robots.txt") for fixed sidecars, full URL for linked ones. */
    readonly sidecarOutcomes: Readonly<Record<string, SidecarOutcome>>;
    readonly notes: readonly string[];
  };
}

export type EvidenceSource =
  | "raw-html"
  | "rendered-html"
  | "response-header"
  | "robots.txt"
  | "sitemap.xml"
  | "llms.txt"
  | "well-known"
  | "linked-resource";

export interface Evidence {
  readonly source: EvidenceSource;
  readonly summary: string;
  readonly path?: string;
  /** Bounded excerpt. The acquisition layer has already capped body size; checks cap excerpts to ~300 chars. */
  readonly excerpt?: string;
}

export interface Remediation {
  readonly summary: string;
  readonly rationale: string;
  readonly snippet?: string;
  readonly language?: "html" | "ts" | "json" | "text";
  readonly docsUrl?: string;
}

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  /** Stable id, e.g. "structure.jsonld.missing". */
  readonly id: string;
  readonly severity: Severity;
  readonly title: string;
  readonly detail: string;
  readonly evidence: readonly Evidence[];
  readonly remediation?: Remediation;
  /** True when this finding is a positive observation ("pass"). */
  readonly positive?: boolean;
}

export type Confidence = "high" | "medium" | "low";

export interface CheckResult {
  readonly checkId: string;
  readonly category: AuditCategory;
  readonly applicable: boolean;
  readonly score: number | null;
  readonly confidence: Confidence;
  readonly findings: readonly Finding[];
  /** Human-readable one-liner for the category bar. */
  readonly summary: string;
}

export interface AuditCheck {
  readonly id: string;
  readonly version: 1;
  readonly category: AuditCategory;
  run(context: Readonly<AuditContext>): CheckResult | Promise<CheckResult>;
}

/** Trim an excerpt for evidence. */
export function excerpt(s: string, max = 300): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
