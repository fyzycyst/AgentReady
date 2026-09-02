"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AgentPathStep, CheckResult } from "@/lib/audit/contract";
import type { CategoryScore } from "@/lib/audit/scoring";
import type { Report } from "@/lib/audit/orchestrator";
import { UrlAuditForm } from "@/components/landing/url-audit-form";
import { BlockedState } from "./blocked-state";
import { ScoreGauge } from "./score-gauge";
import { AgentPath, LAMP, stepState } from "./agent-path";
import { CategoryBars } from "./category-bars";
import { CopyButton } from "./copy-button";
import { DoThisFirst } from "./do-this-first";
import { FindingCard } from "./finding-card";
import { PanelRail } from "./panel-rail";
import { topFindings } from "./prioritise";

/** A finished audit, handed to the view by the server (`/report`) or fetched here. */
export type InitialOutcome =
  | { kind: "done"; report: Report }
  | { kind: "error"; title: string; message: string };

type Outcome = InitialOutcome & { url: string };
type State = { phase: "idle" } | { phase: "loading" } | { phase: "done"; report: Report } | { phase: "error"; title: string; message: string };

const STAGES = ["Checking robots.txt", "Fetching the page", "Looking for discovery files", "Reading structure", "Scoring"];

/** The story layer, in the order an agent walks it. */
const STEPS: { id: AgentPathStep; label: string; question: string }[] = [
  { id: "find", label: "Find", question: "Can an agent locate this page and its entry points?" },
  { id: "understand", label: "Understand", question: "Can it tell what the page is without guessing?" },
  { id: "act", label: "Act", question: "Can it complete the task — book, buy, submit?" },
];

/**
 * `initial` is the server-rendered audit for `?url=`; when it is present this
 * view renders a finished report on the first paint and never fetches. The
 * client fetch below is the fallback for a caller that mounts the view without
 * a server-side result.
 */
export function ReportView({ url = "", initial }: { url?: string; initial?: InitialOutcome } = {}) {
  const cardHost = (() => {
    try {
      return new URL(url.includes("://") ? url : `https://${url}`).hostname;
    } catch {
      return "report";
    }
  })();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [stage, setStage] = useState(0);

  // Derived, not set in an effect: loading = we have a URL but no outcome for
  // it yet. A server-provided outcome wins outright, so a client navigation
  // that swaps `initial` cannot be shadowed by stale state.
  const resolved: Outcome | null = initial ? { url, ...initial } : outcome && outcome.url === url ? outcome : null;
  const state: State = !url
    ? { phase: "idle" }
    : resolved
      ? resolved.kind === "done"
        ? { phase: "done", report: resolved.report }
        : { phase: "error", title: resolved.title, message: resolved.message }
      : { phase: "loading" };

  useEffect(() => {
    if (!url || initial) return;
    let cancelled = false;
    const ticker = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 700);
    fetch("/api/audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(35_000), // just above the server's 30 s budget
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as Report | { ok: false; title?: string; message?: string; code?: string } | null;
        if (cancelled) return;
        if (!body || res.status >= 400) {
          setOutcome({
            url,
            kind: "error",
            title: body && "title" in body && body.title ? body.title : "Something went wrong",
            message: body && "message" in body && body.message ? body.message : "",
          });
          return;
        }
        setOutcome({ url, kind: "done", report: body as Report });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        setOutcome({
          url,
          kind: "error",
          title: timedOut ? "The audit took too long" : "The audit couldn't be completed",
          message: timedOut ? "The site was too slow to audit within our time budget. Try again, or try another page." : "Check your connection and try again.",
        });
      })
      .finally(() => {
        clearInterval(ticker);
        setStage(0);
      });
    return () => {
      cancelled = true;
      clearInterval(ticker);
    };
  }, [url, initial]);

  return (
    <div className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-5xl px-6 pt-6 flex flex-wrap items-center gap-4">
        <Link href="/" className="font-mono text-sm tracking-wide text-text shrink-0 rounded">
          agent<span className="text-signal">ready</span>
        </Link>
        <div className="flex-1 min-w-[260px]">
          <UrlAuditForm initial={url} compact />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <CopyButton text={() => window.location.href} label="Copy link" copiedLabel="Link copied" />
          {url && (
            <a
              href={`/api/card?url=${encodeURIComponent(url)}`}
              download={`agentready-${cardHost}.png`}
              className="rounded font-mono text-[11px] text-muted hover:text-text"
            >
              Download card
            </a>
          )}
          <Link href="/" className="rounded font-mono text-[11px] text-muted hover:text-text">
            Audit another
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10 flex-1">
        {state.phase === "idle" && <p className="text-muted">Enter a web address above to start an audit.</p>}

        {state.phase === "loading" && (
          <div className="panel p-8 md:p-12 flex flex-col items-start gap-6">
            <p className="eyebrow">Auditing</p>
            <p className="font-mono text-sm break-all text-text">{url}</p>
            <ol className="space-y-2 text-sm">
              {STAGES.map((s, i) => (
                <li key={s} className={`flex items-center gap-3 ${i > stage ? "text-faint" : i === stage ? "text-text" : "text-muted"}`}>
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      i < stage ? "bg-pass" : i === stage ? "bg-signal lamp-scan" : "bg-line-strong"
                    }`}
                  />
                  {s}
                </li>
              ))}
            </ol>
          </div>
        )}

        {state.phase === "error" && (
          <BlockedState title={state.title} message={state.message} requestedUrl={url} />
        )}

        {state.phase === "done" && !state.report.ok && (
          <BlockedState
            title={state.report.title}
            message={state.report.message}
            requestedUrl={state.report.requestedUrl}
            status={state.report.status}
            evidence={state.report.evidence}
            code={state.report.code}
            fetchedAt={state.report.fetchedAt}
          />
        )}

        {state.phase === "done" && state.report.ok && <FullReport report={state.report} />}
      </main>
    </div>
  );
}

/** Exported for the render smoke test — the page always reaches it through ReportView. */
export function FullReport({ report }: { report: Extract<Report, { ok: true }> }) {
  const { score } = report;
  const host = (() => {
    try {
      return new URL(report.finalUrl).hostname;
    } catch {
      return report.finalUrl;
    }
  })();
  const resultsByCategory = new Map(report.results.map((r) => [r.category, r]));
  const notObserved = score.categories.filter((c) => c.applicable && c.score === null);
  const priorities = topFindings(report.results);

  return (
    <div className="space-y-10">
      <section className="panel p-6 md:p-8 rise">
        <PanelRail fetchedAt={report.fetchedAt} />
        <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
          <ScoreGauge score={score.overall} grade={score.grade} coverage={score.coverage} />
          <div className="min-w-0">
            <p className="eyebrow">Report for</p>
            <h1 className="display mt-1 text-3xl md:text-4xl font-semibold wrap-anywhere">{host}</h1>
            <p className="mt-1 font-mono text-xs text-faint wrap-anywhere">
              {report.finalUrl !== report.requestedUrl ? `${report.requestedUrl} → ${report.finalUrl}` : report.finalUrl}
              {/* finalUrl came back from safe-fetch, so it is already a validated http(s) URL. */}
              <a
                href={report.finalUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Visit ${host} in a new tab`}
                className="ml-2 rounded text-info hover:underline"
              >
                visit site ↗
              </a>
            </p>
            {score.overall === null && (
              <p className="mt-4 max-w-xl text-sm text-muted">
                Nothing on this page could be observed, so there is no score. Unknown is not zero — the sections below say what each
                check looked for and why it came back empty.
              </p>
            )}
            <div className="mt-6">
              <AgentPath categories={score.categories} />
            </div>
            <dl className="mt-6 grid grid-cols-3 gap-4 text-sm">
              <Stat label="Survival" value={score.survival} hint="Can an agent read and act at all?" />
              <Stat label="Superpower" value={score.superpower} hint="WebMCP tools exposed" />
              <Stat
                label="If WebMCP added"
                value={score.opportunity}
                hint="Headline with WebMCP at full marks"
                accent
              />
            </dl>
          </div>
        </div>
      </section>

      <DoThisFirst items={priorities} />

      {score.overall !== null && notObserved.length > 0 && (
        <p className="text-sm text-muted">
          <span className="text-signal">Coverage {Math.round(score.coverage * 100)}%.</span>{" "}
          {notObserved.length === 1 ? "One category" : `${notObserved.length} categories`} not observed in this audit:{" "}
          {notObserved.map((c) => c.label).join(", ")}. They don&apos;t count against the score.
        </p>
      )}

      <section className="rise" style={{ animationDelay: "120ms" }}>
        <p className="eyebrow mb-4">Category breakdown</p>
        <CategoryBars categories={score.categories} />
      </section>

      <div className="space-y-12 rise" style={{ animationDelay: "200ms" }}>
        {STEPS.map((step) => (
          <StepGroup
            key={step.id}
            step={step}
            categories={score.categories.filter((c) => c.step === step.id)}
            results={resultsByCategory}
          />
        ))}
      </div>

      <section className="text-xs text-faint space-y-1 border-t border-line pt-6">
        <p>
          Fetched {new Date(report.fetchedAt).toUTCString()} in {(report.durationMs / 1000).toFixed(1)}s · HTTP {report.status} ·{" "}
          {report.acquisition.sidecarsChecked} discovery files checked
          {report.acquisition.sidecarsUnobserved > 0 ? ` (${report.acquisition.sidecarsUnobserved} unreachable, not counted)` : ""} · rendered DOM:{" "}
          {report.acquisition.renderedDom}
        </p>
        {report.acquisition.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </section>
    </div>
  );
}

/** One layer of the Find → Understand → Act story, carrying the same lamp as the hero path. */
function StepGroup({
  step,
  categories,
  results,
}: {
  step: { id: AgentPathStep; label: string; question: string };
  categories: readonly CategoryScore[];
  results: Map<string, CheckResult>;
}) {
  if (categories.length === 0) return null;
  const lamp = LAMP[stepState(categories)];

  return (
    <section aria-labelledby={`step-${step.id}`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line-strong pb-3">
        <span className={`inline-block h-2.5 w-2.5 shrink-0 self-center rounded-full ${lamp.dot}`} aria-hidden="true" />
        <h2 id={`step-${step.id}`} className="display text-2xl font-semibold">
          {step.label}
        </h2>
        <span className={`font-mono text-xs ${lamp.text}`}>{lamp.word}</span>
        <p className="w-full text-sm text-muted md:ml-auto md:w-auto">{step.question}</p>
      </div>

      <div className="mt-6 space-y-8">
        {categories.map((c) => (
          <CategorySection key={c.id} category={c} result={results.get(c.id)} />
        ))}
      </div>
    </section>
  );
}

function CategorySection({ category, result }: { category: CategoryScore; result?: CheckResult }) {
  // Not applicable: the category has no signals on this page. One line, no ceremony.
  if (!category.applicable) {
    return (
      <p className="text-sm text-muted">
        <span className="text-text">{category.label}</span> — not applicable.{" "}
        {result?.summary ?? "This page has nothing for this check to look at, so its weight went to the other categories."}
      </p>
    );
  }

  // Not observed: applies, but this audit could not see it. Never a failure.
  if (category.score === null) {
    return (
      <p className="text-sm text-muted">
        <span className="text-text">{category.label}</span> — not observed in this audit.{" "}
        {result ? result.summary : "This check does not run yet."} It is excluded from the score rather than counted against it.
      </p>
    );
  }

  const issues = result ? result.findings.filter((f) => !f.positive) : [];
  const passes = result ? result.findings.filter((f) => f.positive) : [];

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-line pb-2">
        <h3 className="text-lg font-medium">{category.label}</h3>
        <span className="font-mono text-sm tabular text-muted">{category.score}/100</span>
      </div>
      <p className="mb-4 text-sm text-muted">{result?.summary}</p>
      <div className="space-y-3">
        {issues.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
        {passes.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer rounded text-muted hover:text-text">
              {passes.length} thing{passes.length > 1 ? "s" : ""} already working
            </summary>
            <ul className="mt-2 space-y-1 pl-4 text-muted">
              {passes.map((f) => (
                <li key={f.id} className="flex gap-2">
                  <span className="text-pass">✓</span>
                  <span>
                    <span className="text-text">{f.title}</span>
                    {f.detail ? ` — ${f.detail}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: number | null; hint: string; accent?: boolean }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1 font-mono text-2xl tabular ${accent && value !== null ? "text-signal" : "text-text"}`}>
        {value === null ? "—" : value}
      </dd>
      <dd className="text-xs text-faint">{hint}</dd>
    </div>
  );
}
