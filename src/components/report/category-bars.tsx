import type { CategoryScore } from "@/lib/audit/scoring";

export function CategoryBars({ categories }: { categories: readonly CategoryScore[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {categories.map((c) => {
        const pct = c.score ?? 0;
        const colour = !c.applicable || c.score === null ? "var(--line-strong)" : pct >= 75 ? "var(--pass)" : pct >= 40 ? "var(--signal)" : "var(--fail)";
        return (
          <li key={c.id} className="card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {c.label}
                  {c.layer === "superpower" && <span className="ml-2 eyebrow text-signal">superpower</span>}
                </p>
                <p className="text-xs text-faint truncate">{c.summary}</p>
              </div>
              <span className="font-mono text-sm tabular shrink-0" style={{ color: colour }}>
                {!c.applicable ? "n/a" : c.score === null ? "—" : c.score}
              </span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-line overflow-hidden">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${c.applicable && c.score !== null ? pct : 0}%`, background: colour }} />
            </div>
            <p className="mt-2 text-[11px] font-mono text-faint">
              weight {c.effectiveWeight}% · confidence {c.confidence}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
