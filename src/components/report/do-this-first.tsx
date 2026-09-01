"use client";

import { CopyButton } from "./copy-button";
import { SEV } from "./finding-card";
import type { RankedFinding } from "./prioritise";

/**
 * The three highest-impact fixes, in order. The rank numerals are load-bearing:
 * this genuinely is a sequence — do 01, then 02 — which is the whole point of
 * the block. Each row stays one glance tall; the snippet is one keystroke away.
 */
export function DoThisFirst({ items }: { items: readonly RankedFinding[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rise" style={{ animationDelay: "60ms" }} aria-labelledby="do-this-first">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="do-this-first" className="display text-2xl font-semibold md:text-3xl">
          Do this first
        </h2>
        <p className="eyebrow">ranked by severity × category weight</p>
      </div>
      <ol className="space-y-3">
        {items.map((item, i) => (
          <PriorityRow key={`${item.category}:${item.finding.id}`} item={item} rank={i + 1} />
        ))}
      </ol>
    </section>
  );
}

function PriorityRow({ item, rank }: { item: RankedFinding; rank: number }) {
  const { finding } = item;
  const sev = SEV[finding.severity];
  const snippet = finding.remediation?.snippet;
  return (
    <li className="card border-l-2 border-l-signal p-4">
      <div className="flex items-start gap-4">
        <span className="display mt-0.5 shrink-0 font-mono text-xl tabular text-signal" aria-hidden="true">
          {String(rank).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="eyebrow">{item.categoryLabel}</span>
            <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${sev.cls}`}>{sev.label}</span>
          </div>
          <p className="mt-1.5 font-medium">{finding.title}</p>
          <p className="mt-0.5 text-sm text-muted">{finding.remediation?.summary ?? finding.detail}</p>

          {snippet && (
            <details className="mt-3 text-sm">
              <summary className="inline-flex cursor-pointer items-center gap-2 rounded font-mono text-xs text-muted hover:text-text">
                Show the fix
              </summary>
              {finding.remediation?.rationale && <p className="mt-2 text-sm text-muted">{finding.remediation.rationale}</p>}
              <div className="relative mt-2">
                <pre className="snippet">{snippet}</pre>
                <div className="absolute right-2 top-2">
                  <CopyButton text={snippet} />
                </div>
              </div>
              {finding.remediation?.docsUrl && (
                <a
                  href={finding.remediation.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block rounded text-xs text-info hover:underline"
                >
                  Reference ↗
                </a>
              )}
            </details>
          )}
        </div>
      </div>
    </li>
  );
}
