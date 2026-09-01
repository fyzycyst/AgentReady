"use client";

import type { Finding, Severity } from "@/lib/audit/contract";
import { CopyButton } from "./copy-button";

export const SEV: Record<Severity, { label: string; cls: string }> = {
  critical: { label: "critical", cls: "text-fail border-fail/40" },
  high: { label: "high", cls: "text-fail border-fail/40" },
  medium: { label: "medium", cls: "text-signal border-signal/40" },
  low: { label: "low", cls: "text-muted border-line-strong" },
  info: { label: "info", cls: "text-info border-info/40" },
};

export function FindingCard({ finding }: { finding: Finding }) {
  const sev = SEV[finding.severity];
  return (
    <details className="card group open:border-line-strong">
      <summary className="flex cursor-pointer items-start gap-3 rounded-[10px] p-4 list-none [&::-webkit-details-marker]:hidden">
        <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${sev.cls}`}>{sev.label}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-medium">{finding.title}</span>
          <span className="block text-sm text-muted mt-0.5">{finding.detail}</span>
        </span>
        <span className="text-faint text-xs mt-1 group-open:rotate-90 transition-transform">▶</span>
      </summary>
      <div className="px-4 pb-4 space-y-4 border-t border-line pt-4">
        {finding.evidence.length > 0 && (
          <div>
            <p className="eyebrow mb-2">Evidence</p>
            <ul className="space-y-1 text-sm">
              {finding.evidence.map((e, i) => (
                <li key={i} className="font-mono text-xs text-muted break-all">
                  <span className="text-faint">{e.source}</span> · {e.summary}
                  {e.path && <span className="text-faint"> @ {e.path}</span>}
                  {e.excerpt && <pre className="snippet mt-1 whitespace-pre-wrap">{e.excerpt}</pre>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {finding.remediation && (
          <div>
            <p className="eyebrow mb-2">Fix</p>
            <p className="text-sm text-text">{finding.remediation.summary}</p>
            <p className="text-sm text-muted mt-1">{finding.remediation.rationale}</p>
            {finding.remediation.snippet && (
              <div className="relative mt-3">
                <pre className="snippet">{finding.remediation.snippet}</pre>
                <div className="absolute right-2 top-2">
                  <CopyButton text={finding.remediation.snippet} />
                </div>
              </div>
            )}
            {finding.remediation.docsUrl && (
              <a href={finding.remediation.docsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-info hover:underline">
                Reference ↗
              </a>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
