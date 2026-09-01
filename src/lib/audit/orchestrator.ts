/**
 * Orchestrator: the only place acquisition and checks meet.
 *
 * Order (invariant 9 — honour robots before auditing):
 *   1. robots.txt for the requested origin (4 s); disallow → blocked, page never fetched
 *   2. page (10 s). On every redirect hop the target origin's robots.txt is
 *      fetched and evaluated BEFORE the hop is requested (review B2)
 *   3. remaining sidecars against the validated FINAL origin (shared 4.5 s),
 *      reusing any robots.txt already fetched
 *   4. render adapter (skipped in v1)
 *   5. run checks → summarize
 */
import { createHtmlSnapshot } from "@/lib/acquisition/html-query";
import { render } from "@/lib/acquisition/render";
import { isAllowed, parseRobots, type ParsedRobots } from "@/lib/acquisition/robots";
import {
  PAGE_POLICY,
  PRODUCT_TOKEN,
  SIDECAR_POLICY,
  defaultDeps,
  safeFetch,
  type SafeFetchDeps,
  type SafeFetchErrorCode,
  type SafeFetchResult,
} from "@/lib/acquisition/safe-fetch";
import { fetchSidecars, type SidecarMap } from "@/lib/acquisition/sidecars";
import { CHECKS } from "./checks";
import type { AuditContext, CheckResult } from "./contract";
import { summarize, type ScoreSummary } from "./scoring";

export type BlockedCode = Exclude<SafeFetchErrorCode, "redirect-refused"> | "robots-disallow" | "http-error" | "not-html";

export interface BlockedReport {
  readonly ok: false;
  readonly requestedUrl: string;
  readonly fetchedAt: string;
  readonly code: BlockedCode;
  readonly title: string;
  readonly message: string;
  readonly status?: number;
  readonly evidence?: string;
  readonly durationMs: number;
}

export interface AuditReport {
  readonly ok: true;
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly fetchedAt: string;
  readonly status: number;
  readonly score: ScoreSummary;
  readonly results: readonly CheckResult[];
  readonly acquisition: Omit<AuditContext["acquisition"], "sidecarOutcomes"> & {
    readonly truncated: boolean;
    readonly sidecarsChecked: number;
    readonly sidecarsUnobserved: number;
  };
  readonly durationMs: number;
  readonly version: string;
}

export type Report = AuditReport | BlockedReport;

export const REPORT_VERSION = "0.1.0-phase1";

const BLOCK_TITLES: Record<BlockedCode, string> = {
  "invalid-url": "That doesn't look like a public web address",
  "blocked-address": "That address isn't publicly reachable",
  "dns-failure": "We couldn't find that host",
  "too-many-redirects": "The site redirected too many times",
  "redirect-downgrade": "The site redirected from HTTPS to HTTP",
  "redirect-invalid": "The site redirected somewhere we won't follow",
  timeout: "The site didn't respond in time",
  network: "We couldn't connect to the site",
  "content-type": "That URL isn't an HTML page",
  "robots-disallow": "This site asks agents not to read this page",
  "http-error": "The site returned an error instead of a page",
  "not-html": "The response wasn't an HTML page",
};

function blocked(
  requestedUrl: string,
  fetchedAt: string,
  code: BlockedCode,
  message: string,
  started: number,
  now: () => number,
  extra: Partial<Pick<BlockedReport, "status" | "evidence">> = {},
): BlockedReport {
  return { ok: false, requestedUrl, fetchedAt, code, title: BLOCK_TITLES[code], message, durationMs: now() - started, ...extra };
}

function looksLikeChallenge(body: string, headers: Readonly<Record<string, string>>): string | null {
  if (headers["cf-mitigated"] === "challenge") return "Cloudflare challenge (cf-mitigated: challenge)";
  const head = body.slice(0, 20_000).toLowerCase();
  if (/captcha|cf-challenge|__cf_chl|are you a human|verify you are human|attention required/.test(head)) return "Bot challenge page detected in body";
  if (/access denied|request blocked|akamai|perimeterx|datadome|imperva/.test(head) && head.length < 20_000) return "Bot-management block page";
  return null;
}

const ROBOTS_DISALLOW_MESSAGE =
  "robots.txt disallows this path for our user agent, so we did not fetch it. That is itself the most important finding: well-behaved agents will not operate here.";

export async function runAudit(
  requestedUrl: string,
  deps: SafeFetchDeps = defaultDeps,
  clock: () => string = () => new Date().toISOString(),
): Promise<Report> {
  const started = deps.now();
  const fetchedAt = clock();

  let requested: URL;
  try {
    requested = new URL(requestedUrl);
  } catch {
    return blocked(requestedUrl, fetchedAt, "invalid-url", "Not an absolute URL.", started, deps.now);
  }

  // robots.txt per origin, fetched at most once; absence/error = allow (best effort, invariant 9).
  const robotsFetches = new Map<string, SafeFetchResult>();
  const robotsFor = async (origin: string): Promise<ParsedRobots | null> => {
    let r = robotsFetches.get(origin);
    if (!r) {
      r = await safeFetch(origin + "/robots.txt", SIDECAR_POLICY, deps);
      robotsFetches.set(origin, r);
    }
    return r.ok && r.resource.status === 200 ? parseRobots(r.resource.body) : null;
  };
  const robotsAllows = async (url: URL): Promise<{ ok: true } | { ok: false; message: string; body?: string }> => {
    const parsed = await robotsFor(url.origin);
    if (!parsed || isAllowed(parsed, PRODUCT_TOKEN, url.pathname + url.search)) return { ok: true };
    const r = robotsFetches.get(url.origin);
    return { ok: false, message: ROBOTS_DISALLOW_MESSAGE, body: r?.ok ? r.resource.body.slice(0, 500) : undefined };
  };

  // 1. requested origin
  const first = await robotsAllows(requested);
  if (!first.ok) {
    return blocked(requestedUrl, fetchedAt, "robots-disallow", first.message, started, deps.now, { evidence: first.body });
  }

  // 2. page — every redirect target is robots-checked before it is requested
  let refusedEvidence: string | undefined;
  const page = await safeFetch(requestedUrl, PAGE_POLICY, deps, {
    beforeRedirect: async (next) => {
      const v = await robotsAllows(next);
      if (!v.ok) {
        refusedEvidence = v.body;
        return { ok: false, message: `The page redirected to ${next.origin}${next.pathname}, which that site's robots.txt disallows for agents. We did not fetch it.` };
      }
      return { ok: true };
    },
  });
  if (!page.ok) {
    if (page.code === "redirect-refused") {
      return blocked(requestedUrl, fetchedAt, "robots-disallow", page.message, started, deps.now, { evidence: refusedEvidence });
    }
    return blocked(requestedUrl, fetchedAt, page.code, page.message, started, deps.now);
  }
  const res = page.resource;
  if (res.status >= 400) {
    const challenge = looksLikeChallenge(res.body, res.headers);
    return blocked(
      requestedUrl,
      fetchedAt,
      "http-error",
      challenge
        ? `The site returned ${res.status} with a bot challenge. This proves our fetch was blocked — not necessarily that agents in a user's browser are — so no score is given.`
        : `The site returned HTTP ${res.status}. No score is given for an error page.`,
      started,
      deps.now,
      { status: res.status, evidence: challenge ?? undefined },
    );
  }
  if (!/<html|<!doctype html|<body|<head|<div|<p[\s>]/i.test(res.body.slice(0, 4096))) {
    return blocked(requestedUrl, fetchedAt, "not-html", "The response body does not look like HTML.", started, deps.now, { status: res.status });
  }

  const raw = createHtmlSnapshot(res.body);
  const finalOrigin = new URL(res.finalUrl).origin;

  // 3. sidecars against the final origin (reuse the robots fetch already made for it)
  const preset: Record<string, SafeFetchResult> = {};
  const cachedRobots = robotsFetches.get(finalOrigin);
  if (cachedRobots) preset["/robots.txt"] = cachedRobots;
  const { sidecars, outcomes, notes } = await fetchSidecars(finalOrigin, raw.dom, deps, { preset });
  const sidecarMap: SidecarMap = { ...sidecars };

  // 4. render (skipped in v1)
  const rendered = await render(res.finalUrl);
  if (rendered.note) notes.push(rendered.note);
  if (res.truncated) notes.push("The page exceeded 2 MB; only the first 2 MB was analysed.");

  const ctx: AuditContext = {
    requestedUrl,
    fetchedAt,
    page: { ...res, raw, rendered: rendered.snapshot },
    sidecars: sidecarMap,
    acquisition: { robotsAllowed: true, renderedDom: rendered.status, sidecarOutcomes: outcomes, notes },
  };

  // 5. checks
  const results: CheckResult[] = [];
  for (const check of CHECKS) {
    try {
      results.push(await check.run(ctx));
    } catch (err) {
      // A crashing check must not sink the report; it becomes "not observed".
      results.push({
        checkId: check.id,
        category: check.category,
        applicable: true,
        score: null,
        confidence: "low",
        findings: [],
        summary: "This check could not run on this page.",
      });
      notes.push(`Check ${check.id} failed: ${err instanceof Error ? err.name : "error"}`);
    }
  }

  const all = Object.values(outcomes);
  return {
    ok: true,
    requestedUrl,
    finalUrl: res.finalUrl,
    fetchedAt,
    status: res.status,
    score: summarize(results),
    results,
    acquisition: {
      robotsAllowed: true,
      renderedDom: rendered.status,
      notes,
      truncated: res.truncated,
      sidecarsChecked: all.filter((o) => o.kind === "observed").length,
      sidecarsUnobserved: all.filter((o) => o.kind === "unobserved").length,
    },
    durationMs: deps.now() - started,
    version: REPORT_VERSION,
  };
}
