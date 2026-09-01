import type { CategoryScore } from "@/lib/audit/scoring";

const STEPS: { id: "find" | "understand" | "act"; label: string }[] = [
  { id: "find", label: "Find" },
  { id: "understand", label: "Understand" },
  { id: "act", label: "Act" },
];

type Lamp = "pass" | "warn" | "fail" | "off";

function stepState(cats: readonly CategoryScore[]): Lamp {
  const observed = cats.filter((c) => c.applicable && c.score !== null) as (CategoryScore & { score: number })[];
  if (observed.length === 0) return "off";
  const w = observed.reduce((s, c) => s + c.weight, 0);
  const mean = observed.reduce((s, c) => s + c.weight * c.score, 0) / w;
  return mean >= 75 ? "pass" : mean >= 40 ? "warn" : "fail";
}

const LAMP: Record<Lamp, { dot: string; text: string; word: string }> = {
  pass: { dot: "bg-pass shadow-[0_0_12px_rgba(93,211,158,0.6)]", text: "text-pass", word: "clear" },
  warn: { dot: "bg-signal shadow-[0_0_12px_rgba(242,179,61,0.6)]", text: "text-signal", word: "friction" },
  fail: { dot: "bg-fail shadow-[0_0_12px_rgba(240,102,94,0.6)]", text: "text-fail", word: "blocked" },
  off: { dot: "bg-line-strong", text: "text-faint", word: "not observed" },
};

/** The Find → Understand → Act track. Lamps encode the state of each step. */
export function AgentPath({ categories }: { categories: readonly CategoryScore[] }) {
  return (
    <ol className="flex items-stretch gap-0" aria-label="Agent path">
      {STEPS.map((s, i) => {
        const lamp = LAMP[stepState(categories.filter((c) => c.step === s.id))];
        return (
          <li key={s.id} className="flex-1 relative">
            {i > 0 && <span className="absolute left-0 top-[9px] -translate-x-1/2 h-px w-4 bg-line-strong hidden sm:block" />}
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${lamp.dot}`} />
              <span className="text-sm font-medium">{s.label}</span>
            </div>
            <p className={`mt-1 text-xs font-mono ${lamp.text}`}>{lamp.word}</p>
          </li>
        );
      })}
    </ol>
  );
}
