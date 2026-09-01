/**
 * THE one configuration file for category weights.
 * Triumvirate synthesis rubric — sums to 100.
 */
import type { AgentPathStep, AuditCategory, ScoreLayer } from "./contract";

export interface CategoryMeta {
  readonly id: AuditCategory;
  readonly label: string;
  readonly weight: number;
  readonly step: AgentPathStep;
  readonly layer: ScoreLayer;
  readonly blurb: string;
}

export const CATEGORIES: readonly CategoryMeta[] = [
  {
    id: "agent-discovery",
    label: "Agent discovery",
    weight: 18,
    step: "find",
    layer: "survival",
    blurb: "robots.txt, sitemap, llms.txt, feeds, OpenAPI and MCP well-known files",
  },
  {
    id: "machine-readable-structure",
    label: "Machine-readable structure",
    weight: 18,
    step: "understand",
    layer: "survival",
    blurb: "JSON-LD, landmarks, headings, metadata",
  },
  {
    id: "access-renderability",
    label: "Access & renderability",
    weight: 18,
    step: "understand",
    layer: "survival",
    blurb: "Status, headers, bot policy, JavaScript dependence",
  },
  {
    id: "form-semantics",
    label: "Form semantics",
    weight: 16,
    step: "act",
    layer: "survival",
    blurb: "Labels, names, input types, autocomplete",
  },
  {
    id: "actionability",
    label: "Actionability",
    weight: 15,
    step: "act",
    layer: "survival",
    blurb: "Real links, buttons and forms vs. click-handler soup",
  },
  {
    id: "webmcp-capability",
    label: "WebMCP capability",
    weight: 15,
    step: "act",
    layer: "superpower",
    blurb: "Tools exposed to agents via WebMCP",
  },
];

export const WEIGHTS: Readonly<Record<AuditCategory, number>> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.weight]),
) as Record<AuditCategory, number>;

export function categoryMeta(id: AuditCategory): CategoryMeta {
  const m = CATEGORIES.find((c) => c.id === id);
  if (!m) throw new Error(`Unknown category ${id}`);
  return m;
}

/** Letter grade bands. */
export function letterGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}
