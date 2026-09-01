/**
 * `/report` must be a terminal response, not a loading shell.
 *
 * The landing form's `action="/report" method="get"` is only honest if the
 * first HTTP response already contains the report — a client with JavaScript
 * disabled gets exactly this markup and nothing more. These tests render the
 * server component the way the framework does (await it, then serialize) and
 * assert on that one string.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditCategory, CheckResult } from "@/lib/audit/contract";
import type { Report } from "@/lib/audit/orchestrator";
import { summarize } from "@/lib/audit/scoring";

// The header form is a client component and needs a router; `headers()` needs a
// request scope. Neither changes what the audit boundary does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

let clientIp = "203.0.113.1";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": clientIp }),
}));

const runAudit = vi.fn<(url: string) => Promise<Report>>();
vi.mock("@/lib/audit/orchestrator", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audit/orchestrator")>()),
  runAudit: (url: string) => runAudit(url),
}));

import ReportPage from "@/app/report/page";

function result(category: AuditCategory, score: number | null): CheckResult {
  return {
    checkId: category,
    category,
    applicable: true,
    score,
    confidence: "high",
    findings: [
      { id: `${category}.ok`, severity: "info", positive: true, title: `${category} passes`, detail: "", evidence: [] },
    ],
    summary: `${category} summary`,
  };
}

function okReport(): Extract<Report, { ok: true }> {
  const results = [
    result("agent-discovery", 80),
    result("machine-readable-structure", 100),
    result("access-renderability", 100),
    result("form-semantics", 100),
    result("actionability", 100),
    result("webmcp-capability", 95),
  ];
  return {
    ok: true,
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    fetchedAt: "2026-09-01T18:21:58.459Z",
    status: 200,
    score: summarize(results),
    results,
    acquisition: { robotsAllowed: true, renderedDom: "skipped", notes: [], truncated: false, sidecarsChecked: 8, sidecarsUnobserved: 0 },
    durationMs: 1234,
    version: "test",
  };
}

/** Render `/report?<query>` exactly as the framework would: await, then serialize. */
async function render(searchParams: Record<string, string | string[] | undefined>): Promise<string> {
  const element = await ReportPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

/** The panel the old client-only flow was stuck on forever without JavaScript. */
const LOADING_SHELL = "Checking robots.txt";

beforeEach(() => {
  runAudit.mockReset();
  clientIp = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /report?url= — the no-JavaScript path", () => {
  it("returns the finished report in the first response, not a loading shell", async () => {
    runAudit.mockResolvedValue(okReport());
    const markup = await render({ url: "example.com" });

    expect(runAudit).toHaveBeenCalledWith("https://example.com/");
    expect(markup).toContain("Report for");
    expect(markup).toContain("example.com");
    expect(markup).toContain("Category breakdown");
    // The overall score and grade are in the served bytes — the gauge is not
    // waiting for a count-up that a no-JS client will never run.
    expect(markup).toContain("Score 96 out of 100, grade A");
    expect(markup).toContain(">96</div>");
    expect(markup).toContain(">A</span>");
    expect(markup).not.toContain(LOADING_SHELL);
  });

  it("does not declare audit_site — this page's subject is somebody else's site", async () => {
    runAudit.mockResolvedValue(okReport());
    const markup = await render({ url: "example.com" });
    // Assert on real <form> tags, not on the string: a report legitimately
    // contains escaped `&lt;form … toolname=…` inside remediation snippets.
    const formTags = [...markup.matchAll(/<form[^>]*>/g)].map(([tag]) => tag);
    expect(formTags).toHaveLength(1);
    expect(formTags[0]).not.toContain("toolname");
    expect(formTags[0]).not.toContain("tooldescription");
    expect(formTags[0]).toContain('action="/report"');
  });

  it("degrades the 'already working' lists to native details/summary", async () => {
    runAudit.mockResolvedValue(okReport());
    const markup = await render({ url: "example.com" });
    expect(markup).toContain("<details");
    expect(markup).toContain("<summary");
  });

  it("renders a blocked report as a terminal state too", async () => {
    runAudit.mockResolvedValue({
      ok: false,
      requestedUrl: "https://blocked.example/",
      fetchedAt: "2026-09-01T18:21:58.459Z",
      code: "robots-disallow",
      title: "This site asks agents not to read this page",
      message: "robots.txt disallows this path for our user agent.",
      durationMs: 12,
    });
    const markup = await render({ url: "blocked.example" });

    expect(markup).toContain("This site asks agents not to read this page");
    expect(markup).not.toContain(LOADING_SHELL);
  });

  it("normalises the URL at the page boundary and reports a bad one without auditing", async () => {
    const markup = await render({ url: "not a url" });
    expect(runAudit).not.toHaveBeenCalled();
    expect(markup).toContain("That doesn&#x27;t look like a public web address");
    expect(markup).not.toContain(LOADING_SHELL);
  });

  it("redacts an audit crash instead of leaking it into the page", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    runAudit.mockRejectedValue(new Error("ECONNRESET at internal.host:5432"));
    const markup = await render({ url: "example.com" });

    expect(markup).toContain("The audit couldn&#x27;t be completed");
    expect(markup).not.toContain("internal.host");
    expect(markup).not.toContain(LOADING_SHELL);
    error.mockRestore();
  });

  it("applies the same rate limit as the API, so a page load cannot buy an extra audit", async () => {
    runAudit.mockResolvedValue(okReport());
    clientIp = "198.51.100.7";
    for (let i = 0; i < 12; i++) await render({ url: "example.com" });
    const markup = await render({ url: "example.com" });

    expect(runAudit).toHaveBeenCalledTimes(12);
    expect(markup).toContain("Slow down");
    expect(markup).toContain("Too many audits from this address");
  });

  it("takes the first value when the query string repeats url=", async () => {
    runAudit.mockResolvedValue(okReport());
    await render({ url: ["example.com", "evil.example"] });
    expect(runAudit).toHaveBeenCalledWith("https://example.com/");
  });

  it("shows the idle prompt, and runs nothing, when there is no url", async () => {
    const markup = await render({});
    expect(runAudit).not.toHaveBeenCalled();
    expect(markup).toContain("Enter a web address above to start an audit.");
    expect(markup).not.toContain(LOADING_SHELL);
  });
});
