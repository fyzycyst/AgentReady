import { describe, expect, it } from "vitest";
import type { AuditCategory, Finding, Severity } from "@/lib/audit/contract";
import { SEVERITY_RANK, isActionable, rankFindings, topFindings, type RankableResult } from "@/components/report/prioritise";
import { WEIGHTS } from "@/lib/audit/weights";

function finding(id: string, severity: Severity, extra: Partial<Finding> = {}): Finding {
  return { id, severity, title: id, detail: "", evidence: [], ...extra };
}

function result(category: AuditCategory, findings: Finding[]): RankableResult {
  return { category, findings };
}

describe("isActionable", () => {
  it("skips positive findings", () => {
    expect(isActionable(finding("structure.jsonld.present", "info", { positive: true }))).toBe(false);
  });

  it("skips *.unobserved findings", () => {
    expect(isActionable(finding("discovery.unobserved", "info"))).toBe(false);
    expect(isActionable(finding("access.headers.unobserved", "medium"))).toBe(false);
  });

  it("keeps ordinary problems, including info severity", () => {
    expect(isActionable(finding("structure.jsonld.missing", "high"))).toBe(true);
    expect(isActionable(finding("discovery.llms.missing", "info"))).toBe(true);
  });

  it("does not confuse a substring with the .unobserved suffix", () => {
    expect(isActionable(finding("discovery.unobserved.detail", "low"))).toBe(true);
  });
});

describe("rankFindings", () => {
  it("scores severityRank × categoryWeight", () => {
    const ranked = rankFindings([result("form-semantics", [finding("form.label.missing", "high")])]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].priority).toBe(SEVERITY_RANK.high * WEIGHTS["form-semantics"]);
    expect(ranked[0].categoryLabel).toBe("Form semantics");
    expect(ranked[0].step).toBe("act");
  });

  it("orders by priority, so a critical in a light category outranks a medium in a heavy one", () => {
    // actionability weight 15 × critical 5 = 75; agent-discovery 18 × medium 3 = 54.
    const ranked = rankFindings([
      result("agent-discovery", [finding("discovery.sitemap.missing", "medium")]),
      result("actionability", [finding("action.div-onclick", "critical")]),
    ]);
    expect(ranked.map((r) => r.finding.id)).toEqual(["action.div-onclick", "discovery.sitemap.missing"]);
  });

  it("breaks ties by rubric order then emission order", () => {
    // agent-discovery and machine-readable-structure both weigh 18.
    const ranked = rankFindings([
      result("machine-readable-structure", [finding("structure.b1", "high"), finding("structure.b2", "high")]),
      result("agent-discovery", [finding("discovery.a1", "high"), finding("discovery.a2", "high")]),
    ]);
    expect(ranked.map((r) => r.finding.id)).toEqual(["discovery.a1", "discovery.a2", "structure.b1", "structure.b2"]);
  });

  it("excludes positives and unobserved from the ranking entirely", () => {
    const ranked = rankFindings([
      result("agent-discovery", [
        finding("discovery.robots.ok", "info", { positive: true }),
        finding("discovery.unobserved", "info"),
        finding("discovery.sitemap.missing", "medium"),
      ]),
    ]);
    expect(ranked.map((r) => r.finding.id)).toEqual(["discovery.sitemap.missing"]);
  });

  it("ignores results for categories not in the rubric-ordered walk and tolerates missing categories", () => {
    expect(rankFindings([])).toEqual([]);
    expect(rankFindings([result("webmcp-capability", [])])).toEqual([]);
  });
});

describe("topFindings", () => {
  const results = [
    result("agent-discovery", [finding("d.critical", "critical"), finding("d.low", "low")]),
    result("machine-readable-structure", [finding("s.high", "high")]),
    result("actionability", [finding("a.critical", "critical")]),
  ];

  it("returns the three highest by default", () => {
    // 18×5=90, 15×5=75, 18×4=72, 18×2=36
    expect(topFindings(results).map((r) => r.finding.id)).toEqual(["d.critical", "a.critical", "s.high"]);
  });

  it("returns fewer when fewer exist, and none when nothing is actionable", () => {
    expect(topFindings([result("agent-discovery", [finding("d.only", "low")])])).toHaveLength(1);
    expect(topFindings([result("agent-discovery", [finding("d.ok", "info", { positive: true })])])).toEqual([]);
  });

  it("honours an explicit limit and treats a negative limit as empty", () => {
    expect(topFindings(results, 2).map((r) => r.finding.id)).toEqual(["d.critical", "a.critical"]);
    expect(topFindings(results, -1)).toEqual([]);
  });
});
