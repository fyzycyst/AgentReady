/**
 * Scoring (axis C + H of the synthesis).
 *
 *  - applicable:false → weight redistributed pro-rata among the rest.
 *  - score:null       → not observed; excluded from the denominator and
 *                       reduces coverage.
 *  - Headline 0–100 = weighted mean over applicable, observed categories.
 *  - Survival = same, excluding the superpower layer.
 *  - Superpower = WebMCP score (or null).
 *  - Opportunity = headline recomputed with WebMCP at 100 — a real number,
 *    never a constant (Sol's condition).
 */
import type { AuditCategory, CheckResult } from "./contract";
import { CATEGORIES, WEIGHTS, letterGrade } from "./weights";

export interface CategoryScore {
  readonly id: AuditCategory;
  readonly label: string;
  readonly weight: number;
  readonly effectiveWeight: number;
  readonly score: number | null;
  readonly applicable: boolean;
  readonly confidence: CheckResult["confidence"];
  readonly summary: string;
  readonly step: "find" | "understand" | "act";
  readonly layer: "survival" | "superpower";
}

export interface ScoreSummary {
  readonly overall: number | null;
  readonly grade: "A" | "B" | "C" | "D" | "F" | null;
  /** Fraction (0–1) of applicable weight that was actually observed. */
  readonly coverage: number;
  readonly survival: number | null;
  readonly superpower: number | null;
  /** Headline if WebMCP were fully adopted; null if already observed at 100 or nothing else is scoreable. */
  readonly opportunity: number | null;
  readonly categories: readonly CategoryScore[];
}

function weightedMean(items: { weight: number; score: number }[]): number | null {
  const w = items.reduce((s, i) => s + i.weight, 0);
  if (w === 0) return null;
  return Math.round(items.reduce((s, i) => s + i.weight * i.score, 0) / w);
}

export function summarize(results: readonly CheckResult[]): ScoreSummary {
  const byCat = new Map(results.map((r) => [r.category, r]));
  const applicable = CATEGORIES.filter((c) => byCat.get(c.id)?.applicable !== false);
  const applicableWeight = applicable.reduce((s, c) => s + c.weight, 0);

  const categories: CategoryScore[] = CATEGORIES.map((c) => {
    const r = byCat.get(c.id);
    const isApplicable = r?.applicable !== false;
    const effectiveWeight = isApplicable && applicableWeight > 0 ? (c.weight / applicableWeight) * 100 : 0;
    return {
      id: c.id,
      label: c.label,
      weight: c.weight,
      effectiveWeight: Math.round(effectiveWeight * 10) / 10,
      score: r ? r.score : null,
      applicable: isApplicable,
      confidence: r?.confidence ?? "low",
      summary: r?.summary ?? "Not checked.",
      step: c.step,
      layer: c.layer,
    };
  });

  const observed = categories.filter((c) => c.applicable && c.score !== null) as (CategoryScore & { score: number })[];
  const observedWeight = observed.reduce((s, c) => s + c.weight, 0);
  const coverage = applicableWeight === 0 ? 0 : observedWeight / applicableWeight;

  const overall = weightedMean(observed.map((c) => ({ weight: c.weight, score: c.score })));
  const survival = weightedMean(
    observed.filter((c) => c.layer === "survival").map((c) => ({ weight: c.weight, score: c.score })),
  );
  const superCat = categories.find((c) => c.layer === "superpower");
  const superpower = superCat && superCat.applicable ? superCat.score : null;

  let opportunity: number | null = null;
  if (overall !== null && superCat && superCat.applicable && (superCat.score ?? 0) < 100) {
    const withFull = observed
      .filter((c) => c.layer !== "superpower")
      .map((c) => ({ weight: c.weight, score: c.score }));
    withFull.push({ weight: WEIGHTS[superCat.id], score: 100 });
    opportunity = weightedMean(withFull);
  }

  return {
    overall,
    grade: overall === null ? null : letterGrade(overall),
    coverage: Math.round(coverage * 100) / 100,
    survival,
    superpower,
    opportunity,
    categories,
  };
}
