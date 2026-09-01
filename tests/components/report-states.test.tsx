/**
 * The report has to hold whether a category is scored, `score: null` (not
 * observed) or `applicable: false` — and the three Phase 2 checks land on
 * separate branches, so no single live URL exercises all three at once.
 * These render the real component tree against synthetic reports.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AuditCategory, CheckResult, Finding } from "@/lib/audit/contract";
import type { AuditReport } from "@/lib/audit/orchestrator";
import { summarize } from "@/lib/audit/scoring";
import { CATEGORIES } from "@/lib/audit/weights";
import { BlockedState } from "@/components/report/blocked-state";
import { FullReport } from "@/components/report/report-view";

function finding(id: string, severity: Finding["severity"], extra: Partial<Finding> = {}): Finding {
  return {
    id,
    severity,
    title: `${id} title`,
    detail: `${id} detail`,
    evidence: [],
    remediation: { summary: `${id} fix`, rationale: `${id} why`, snippet: `<!-- ${id} -->` },
    ...extra,
  };
}

function result(category: AuditCategory, score: number | null, opts: { applicable?: boolean; findings?: Finding[]; summary?: string } = {}): CheckResult {
  return {
    checkId: category,
    category,
    applicable: opts.applicable ?? true,
    score,
    confidence: "high",
    findings: opts.findings ?? [],
    summary: opts.summary ?? `${category} summary`,
  };
}

function report(results: CheckResult[], overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    ok: true,
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    fetchedAt: "2026-09-01T18:21:58.459Z",
    status: 200,
    score: summarize(results),
    results,
    acquisition: {
      robotsAllowed: true,
      renderedDom: "skipped",
      notes: [],
      truncated: false,
      sidecarsChecked: 4,
      sidecarsUnobserved: 0,
    },
    durationMs: 1234,
    version: "test",
    ...overrides,
  };
}

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("report — mixed states (today's shape: two checks registered)", () => {
  const markup = html(
    <FullReport
      report={report([
        result("agent-discovery", 15, { findings: [finding("discovery.sitemap.missing", "medium")] }),
        result("machine-readable-structure", 30, {
          findings: [finding("structure.jsonld.missing", "high"), finding("structure.headings.ok", "info", { positive: true })],
        }),
      ])}
    />,
  );

  it("puts the wordmark and audit date inside the hero panel", () => {
    expect(markup).toContain("audited 2026-09-01");
    expect(markup).toContain("ready</span>");
  });

  it("leads with Do this first, ranked by severity × weight", () => {
    expect(markup).toContain("Do this first");
    // structure.jsonld high(4)×18 = 72 outranks discovery.sitemap medium(3)×18 = 54.
    expect(markup.indexOf("structure.jsonld.missing fix")).toBeLessThan(markup.indexOf("discovery.sitemap.missing fix"));
    expect(markup).toContain("01");
  });

  it("keeps positive findings out of Do this first", () => {
    expect(markup).not.toContain("structure.headings.ok fix");
  });

  it("groups the sections under Find / Understand / Act", () => {
    for (const label of ["Find", "Understand", "Act"]) expect(markup).toContain(`>${label}</h2>`);
    expect(markup.indexOf('id="step-find"')).toBeLessThan(markup.indexOf('id="step-understand"'));
    expect(markup.indexOf('id="step-understand"')).toBeLessThan(markup.indexOf('id="step-act"'));
  });

  it("explains the four categories no check has produced yet in one line each", () => {
    const perCategoryLines = markup.split("— not observed in this audit.").length - 1;
    expect(perCategoryLines).toBe(4);
    expect(markup).toContain("excluded from the score rather than counted against it");
    // …and the hero-level coverage note names them once, without repeating the score.
    expect(markup).toContain("Coverage 36%");
    expect(markup).toContain("4 categories not observed in this audit:");
  });
});

describe("report — applicable:false", () => {
  it("collapses a non-applicable category to a single line and never shows it as a failure", () => {
    const markup = html(
      <FullReport
        report={report([
          result("agent-discovery", 100),
          result("machine-readable-structure", 100),
          result("access-renderability", 100),
          result("form-semantics", null, { applicable: false, summary: "This page has no forms." }),
          result("actionability", 100),
          result("webmcp-capability", 0),
        ])}
      />,
    );
    expect(markup).toContain("not applicable. This page has no forms.");
    expect(markup).not.toContain("Form semantics</h3>");
    // Not applicable is not "not observed" — coverage is still complete.
    expect(markup).not.toContain("not observed in this audit");
  });
});

describe("report — overall null (nothing observable)", () => {
  const markup = html(<FullReport report={report(CATEGORIES.map((c) => result(c.id, null)))} />);

  it("shows the gauge dash and a sentence, not a broken layout", () => {
    expect(markup).toContain("No score");
    expect(markup).toContain("Nothing on this page could be observed, so there is no score.");
    expect(markup).toContain("Unknown is not zero");
  });

  it("drops Do this first and the coverage line rather than printing an empty or contradictory one", () => {
    expect(markup).not.toContain("Do this first");
    expect(markup).not.toContain("Coverage 0%");
  });

  it("still renders all three step groups, each lamp off", () => {
    for (const id of ["find", "understand", "act"]) expect(markup).toContain(`id="step-${id}"`);
    expect(markup.split("not observed</span>").length - 1).toBeGreaterThanOrEqual(3);
  });
});

describe("report — long hostname", () => {
  it("wraps rather than overflowing", () => {
    const host = `${"a".repeat(63)}.${"b".repeat(63)}.example.com`;
    const markup = html(
      <FullReport
        report={report([result("agent-discovery", 50)], { finalUrl: `https://${host}/`, requestedUrl: `https://${host}/` })}
      />,
    );
    expect(markup).toContain(host);
    // wrap-anywhere is what lets an unbroken label break mid-token.
    expect(markup).toMatch(/class="display[^"]*wrap-anywhere"/);
  });
});

describe("blocked state", () => {
  it("carries the same wordmark and date corners", () => {
    const markup = html(
      <BlockedState
        title="This site asks agents not to read this page"
        message="robots.txt disallows this path."
        requestedUrl="https://www.google.com/search?q=x"
        code="robots-disallow"
        fetchedAt="2026-09-01T18:21:58.459Z"
      />,
    );
    expect(markup).toContain("audited 2026-09-01");
    expect(markup).toContain("No score · site declined");
  });

  it("omits the date when no audit ran, rather than inventing one", () => {
    const markup = html(<BlockedState title="The audit took too long" message="Try again." requestedUrl="https://slow.example/" />);
    expect(markup).toContain("ready</span>");
    expect(markup).not.toContain("audited");
  });
});
