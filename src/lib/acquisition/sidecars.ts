/**
 * Bounded sidecar acquisition (invariant 6): fixed same-origin paths against
 * the VALIDATED FINAL ORIGIN of the page, plus ≤2 page-declared same-origin
 * <link>/<a> targets (global cap, review B6). Every request goes through
 * safe-fetch with SIDECAR_POLICY (same-origin lock on redirects), in parallel,
 * under one shared budget.
 *
 * Every attempted target gets an explicit outcome (review B4) so checks can
 * tell "observed a 404" from "could not observe" and never turn the latter
 * into a failing score.
 */
import type { HtmlQuery, ResourceSnapshot, SidecarKey, SidecarOutcome } from "@/lib/audit/contract";
import { SIDECAR_POLICY, safeFetch, type SafeFetchDeps, type SafeFetchResult, defaultDeps } from "./safe-fetch";

export const FIXED_SIDECARS: readonly { key: SidecarKey; path: string }[] = [
  { key: "robots.txt", path: "/robots.txt" },
  { key: "sitemap.xml", path: "/sitemap.xml" },
  { key: "llms.txt", path: "/llms.txt" },
  { key: "well-known", path: "/.well-known/oauth-protected-resource" },
  { key: "well-known", path: "/.well-known/mcp.json" },
  { key: "well-known", path: "/.well-known/mcp/server-card.json" },
  { key: "well-known", path: "/.well-known/ai-plugin.json" },
  { key: "well-known", path: "/.well-known/agent-card.json" },
];

/** Global cap on page-declared targets, across all kinds. */
export const MAX_LINKED = 2;
export const SIDECAR_BUDGET_MS = 4_500;

/** Discover same-origin OpenAPI / feed links declared on the page (deterministic order, deduped, capped). */
export function discoverLinkedSidecars(dom: HtmlQuery, origin: string): { key: SidecarKey; url: string }[] {
  const out: { key: SidecarKey; url: string }[] = [];
  const sameOrigin = (href: string | undefined): string | null => {
    if (!href) return null;
    try {
      const u = new URL(href, origin);
      u.hash = "";
      return u.origin === origin ? u.toString() : null;
    } catch {
      return null;
    }
  };
  for (const link of dom.all("link[rel], a[href]")) {
    if (out.length >= MAX_LINKED) break;
    const rel = (link.attr("rel") ?? "").toLowerCase();
    const type = (link.attr("type") ?? "").toLowerCase();
    const href = link.attr("href") ?? "";
    const lower = href.toLowerCase();
    const isFeed = type.includes("rss") || type.includes("atom") || (rel === "alternate" && (type.includes("xml") || type.includes("json")));
    const isOpenApi =
      rel.includes("openapi") ||
      rel.includes("service-desc") ||
      rel.includes("describedby") ||
      type.includes("openapi") ||
      /(openapi|swagger)[^/]*\.(json|ya?ml)$/.test(lower);
    if (!isFeed && !isOpenApi) continue;
    const url = sameOrigin(href);
    if (!url) continue;
    if (out.some((o) => o.url === url)) continue;
    out.push({ key: isOpenApi ? "linked-openapi" : "linked-feed", url });
  }
  return out;
}

export type SidecarMap = Partial<Record<SidecarKey, ResourceSnapshot[]>>;

export interface SidecarAcquisition {
  sidecars: SidecarMap;
  /** Keyed by pathname for fixed targets, full URL for linked ones. */
  outcomes: Record<string, SidecarOutcome>;
  notes: string[];
}

function outcomeOf(r: SafeFetchResult | "budget"): SidecarOutcome {
  if (r === "budget") return { kind: "unobserved", reason: "timeout" };
  if (r.ok) return { kind: "observed", status: r.resource.status };
  return { kind: "unobserved", reason: r.code };
}

export async function fetchSidecars(
  finalOrigin: string,
  dom: HtmlQuery,
  deps: SafeFetchDeps = defaultDeps,
  opts: { budgetMs?: number; preset?: Record<string, SafeFetchResult> } = {},
): Promise<SidecarAcquisition> {
  const budgetMs = opts.budgetMs ?? SIDECAR_BUDGET_MS;
  const preset = opts.preset ?? {};
  const targets = [
    ...FIXED_SIDECARS.map((s) => ({ key: s.key, url: finalOrigin + s.path, id: s.path })),
    ...discoverLinkedSidecars(dom, finalOrigin).map((t) => ({ ...t, id: t.url })),
  ];
  const notes: string[] = [];
  const sidecars: SidecarMap = {};
  const outcomes: Record<string, SidecarOutcome> = {};

  const budget = new Promise<"budget">((resolve) => {
    const t = setTimeout(() => resolve("budget"), budgetMs);
    if (typeof t === "object" && "unref" in t) t.unref();
  });

  const results = await Promise.all(
    targets.map(async (t) => {
      const fromPreset: SafeFetchResult | undefined = preset[t.id];
      const r: SafeFetchResult | "budget" = fromPreset ?? (await Promise.race([safeFetch(t.url, SIDECAR_POLICY, deps), budget]));
      return { ...t, r };
    }),
  );

  let unobserved = 0;
  for (const { key, id, r } of results) {
    const o = outcomeOf(r);
    outcomes[id] = o;
    if (o.kind === "unobserved") {
      unobserved++;
      continue;
    }
    if (typeof r === "object" && r.ok) (sidecars[key] ??= []).push(r.resource);
  }
  if (unobserved > 0) {
    notes.push(`${unobserved} discovery file${unobserved > 1 ? "s" : ""} could not be checked (timeout or network); they are not counted against the score.`);
  }
  return { sidecars, outcomes, notes };
}
