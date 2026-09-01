"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Report } from "@/lib/audit/orchestrator";
import { UrlAuditForm } from "@/components/landing/url-audit-form";
import { BlockedState } from "./blocked-state";
import { ScoreGauge } from "./score-gauge";
import { AgentPath } from "./agent-path";
import { CategoryBars } from "./category-bars";
import { FindingCard } from "./finding-card";
import { CATEGORIES } from "@/lib/audit/weights";

type Outcome = { url: string; kind: "done"; report: Report } | { url: string; kind: "error"; title: string; message: string };
type State = { phase: "idle" } | { phase: "loading" } | { phase: "done"; report: Report } | { phase: "error"; title: string; message: string };

const STAGES = ["Checking robots.txt", "Fetching the page", "Looking for discovery files", "Reading structure", "Scoring"];

export function ReportView() {
  const params = useSearchParams();
  const url = params.get("url") ?? "";
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [stage, setStage] = useState(0);

  // Derived, not set in an effect: loading = we have a URL but no outcome for it yet.
  const state: State = !url
    ? { phase: "idle" }
    : outcome && outcome.url === url
      ? outcome.kind === "done"
        ? { phase: "done", report: outcome.report }
        : { phase: "error", title: outcome.title, message: outcome.message }
      : { phase: "loading" };

  useEffect(() => {
    if (!url) return;
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
  }, [url]);

  return (
    <div className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-5xl px-6 pt-6 flex flex-wrap items-center gap-4">
        <Link href="/" className="font-mono text-sm tracking-wide text-text shrink-0">
          agent<span className="text-signal">ready</span>
        </Link>
        <div className="flex-1 min-w-[260px]">
          <UrlAuditForm initial={url} compact />
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
          />
        )}

        {state.phase === "done" && state.report.ok && <FullReport report={state.report} />}
      </main>
    </div>
  );
}

function FullReport({ report }: { report: Extract<Report, { ok: true }> }) {
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

  return (
    <div className="space-y-10">
      <section className="panel p-6 md:p-8 grid gap-8 md:grid-cols-[auto_1fr] items-center rise">
        <ScoreGauge score={score.overall} grade={score.grade} coverage={score.coverage} />
        <div className="min-w-0">
          <p className="eyebrow">Report for</p>
          <h1 className="display mt-1 text-3xl md:text-4xl font-semibold break-words">{host}</h1>
          <p className="mt-1 font-mono text-xs text-faint break-all">
            {report.finalUrl !== report.requestedUrl ? `${report.requestedUrl} → ${report.finalUrl}` : report.finalUrl}
          </p>
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
      </section>

      {notObserved.length > 0 && (
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

      <section className="space-y-8 rise" style={{ animationDelay: "200ms" }}>
        {CATEGORIES.map((meta) => {
          const r = resultsByCategory.get(meta.id);
          if (!r) return null;
          const issues = r.findings.filter((f) => !f.positive);
          const passes = r.findings.filter((f) => f.positive);
          return (
            <div key={meta.id}>
              <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2 mb-4">
                <h2 className="text-lg font-medium">{meta.label}</h2>
                <span className="font-mono text-sm tabular text-muted">
                  {r.applicable ? (r.score === null ? "not observed" : `${r.score}/100`) : "not applicable"}
                </span>
              </div>
              <p className="text-sm text-muted mb-4">{r.summary}</p>
              <div className="space-y-3">
                {issues.map((f) => (
                  <FindingCard key={f.id} finding={f} />
                ))}
                {passes.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted hover:text-text">
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
        })}
      </section>

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
