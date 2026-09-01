import { describe, expect, it } from "vitest";
import type { AuditCategory, CheckResult } from "@/lib/audit/contract";
import { summarize } from "@/lib/audit/scoring";
import { CATEGORIES, letterGrade } from "@/lib/audit/weights";

function res(category: AuditCategory, score: number | null, applicable = true): CheckResult {
  return { checkId: category, category, applicable, score, confidence: "high", findings: [], summary: "" };
}

describe("weights", () => {
  it("sum to 100", () => {
    expect(CATEGORIES.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });
  it("letter bands", () => {
    expect(letterGrade(90)).toBe("A");
    expect(letterGrade(75)).toBe("B");
    expect(letterGrade(60)).toBe("C");
    expect(letterGrade(40)).toBe("D");
    expect(letterGrade(39)).toBe("F");
  });
});

describe("summarize", () => {
  const all: AuditCategory[] = CATEGORIES.map((c) => c.id);

  it("full coverage, all 100 → 100/A, opportunity null", () => {
    const s = summarize(all.map((c) => res(c, 100)));
    expect(s.overall).toBe(100);
    expect(s.grade).toBe("A");
    expect(s.coverage).toBe(1);
    expect(s.opportunity).toBeNull();
  });

  it("score:null reduces coverage and is excluded from the mean", () => {
    const s = summarize([res("agent-discovery", 80), res("machine-readable-structure", 40), ...all.slice(2).map((c) => res(c, null))]);
    expect(s.overall).toBe(60);
    expect(s.coverage).toBeCloseTo(36 / 100, 2);
    expect(s.superpower).toBeNull();
  });

  it("applicable:false redistributes weight (blog with no forms)", () => {
    const s = summarize([
      res("agent-discovery", 100),
      res("machine-readable-structure", 100),
      res("access-renderability", 100),
      res("form-semantics", 0, false),
      res("actionability", 100),
      res("webmcp-capability", 0),
    ]);
    // weights: 18+18+18+15 = 69 at 100, 15 at 0 → 6900/84 = 82
    expect(s.overall).toBe(82);
    expect(s.coverage).toBe(1);
    const forms = s.categories.find((c) => c.id === "form-semantics")!;
    expect(forms.applicable).toBe(false);
    expect(forms.effectiveWeight).toBe(0);
  });

  it("survival excludes WebMCP; opportunity is computed with WebMCP at 100", () => {
    const s = summarize([
      res("agent-discovery", 60),
      res("machine-readable-structure", 60),
      res("access-renderability", 60),
      res("form-semantics", 60),
      res("actionability", 60),
      res("webmcp-capability", 0),
    ]);
    expect(s.survival).toBe(60);
    expect(s.superpower).toBe(0);
    expect(s.overall).toBe(51); // 60*85/100
    expect(s.opportunity).toBe(66); // 60*85 + 100*15 = 6600/100
  });

  it("nothing observed → null overall, zero coverage", () => {
    const s = summarize(all.map((c) => res(c, null)));
    expect(s.overall).toBeNull();
    expect(s.grade).toBeNull();
    expect(s.coverage).toBe(0);
  });
});
