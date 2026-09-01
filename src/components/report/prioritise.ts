/**
 * "Do this first" ranking (synthesis axis H — the report has to read as a
 * verdict plus a plan, not a wall of findings).
 *
 * Priority = severityRank × categoryWeight. Severity says how badly this
 * blocks an agent; the category weight says how much that category matters to
 * the score, so the product is "fix this and the number moves most".
 *
 * Two kinds of finding are never ranked:
 *   - `positive: true`  — already working, nothing to do.
 *   - `*.unobserved`    — a checker saying it could not see something. Unknown
 *                         must never become a to-do item any more than it
 *                         becomes a zero (contract.ts).
 *
 * Pure and framework-free so it can be unit-tested without a DOM.
 */
import type { AgentPathStep, AuditCategory, CheckResult, Finding, Severity } from "@/lib/audit/contract";
import { CATEGORIES } from "@/lib/audit/weights";

export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

/** The slice of a CheckResult ranking needs — keeps callers free to pass richer objects. */
export type RankableResult = Pick<CheckResult, "category" | "findings">;

export interface RankedFinding {
  readonly finding: Finding;
  readonly category: AuditCategory;
  readonly categoryLabel: string;
  readonly categoryWeight: number;
  readonly step: AgentPathStep;
  /** severityRank × categoryWeight. */
  readonly priority: number;
}

/** A finding is actionable when it is a real problem the site owner can fix. */
export function isActionable(finding: Finding): boolean {
  return finding.positive !== true && !finding.id.endsWith(".unobserved");
}

/**
 * Every actionable finding across all categories, most impactful first.
 *
 * Ties are broken deterministically: categories in rubric order (weights.ts),
 * then the order the check emitted its findings — Array.prototype.sort is
 * stable, and the input is walked in rubric order.
 */
export function rankFindings(results: readonly RankableResult[]): RankedFinding[] {
  const byCategory = new Map(results.map((r) => [r.category, r]));
  const ranked: RankedFinding[] = [];

  for (const meta of CATEGORIES) {
    const result = byCategory.get(meta.id);
    if (!result) continue;
    for (const finding of result.findings) {
      if (!isActionable(finding)) continue;
      ranked.push({
        finding,
        category: meta.id,
        categoryLabel: meta.label,
        categoryWeight: meta.weight,
        step: meta.step,
        priority: SEVERITY_RANK[finding.severity] * meta.weight,
      });
    }
  }

  return ranked.sort((a, b) => b.priority - a.priority);
}

/** The top `limit` actionable findings. Returns fewer (or none) when there are fewer. */
export function topFindings(results: readonly RankableResult[], limit = 3): RankedFinding[] {
  return rankFindings(results).slice(0, Math.max(0, limit));
}
