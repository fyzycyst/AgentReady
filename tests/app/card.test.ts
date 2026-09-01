import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckResult } from "@/lib/audit/contract";
import type { AuditReport, BlockedReport } from "@/lib/audit/orchestrator";
import { summarize } from "@/lib/audit/scoring";
import { CATEGORIES } from "@/lib/audit/weights";

const { runAudit } = vi.hoisted(() => ({ runAudit: vi.fn() }));

vi.mock("@/lib/audit/orchestrator", () => ({ runAudit }));

import { GET, opportunityLabel } from "@/app/api/card/route";

function scoredReport(): AuditReport {
  const results: CheckResult[] = CATEGORIES.map((category) => ({
    checkId: category.id,
    category: category.id,
    applicable: true,
    score: category.layer === "superpower" ? 0 : 80,
    confidence: "high",
    findings: [],
    summary: "Observed.",
  }));

  return {
    ok: true,
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    fetchedAt: "2026-09-01T12:00:00.000Z",
    status: 200,
    score: { ...summarize(results), overall: 60, grade: "C", opportunity: 67 },
    results,
    acquisition: { robotsAllowed: true, renderedDom: "skipped", notes: [], truncated: false, sidecarsChecked: 0, sidecarsUnobserved: 0 },
    durationMs: 100,
    version: "test",
  };
}

function blockedReport(): BlockedReport {
  return {
    ok: false,
    requestedUrl: "https://example.com/",
    fetchedAt: "2026-09-01T12:00:00.000Z",
    code: "robots-disallow",
    title: "This site asks agents not to read this page",
    message: "robots.txt disallows this path.",
    durationMs: 20,
  };
}

describe("GET /api/card", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a no-store JSON error for an invalid URL", async () => {
    const response = await GET(new NextRequest("http://localhost/api/card?url=not%20a%20url"));

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "invalid-url" });
  });

  it("renders a scored audit as a non-trivial PNG", async () => {
    runAudit.mockResolvedValueOnce(scoredReport());

    const response = await GET(new NextRequest("http://localhost/api/card?url=https%3A%2F%2Fexample.com"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1_000);
  });

  it("labels the WebMCP opportunity as a gain and destination", () => {
    expect(opportunityLabel(60, 67)).toBe("+7 WITH WEBMCP → 67");
    expect(opportunityLabel(67, 67)).toBeNull();
  });

  it("renders a blocked audit as a PNG", async () => {
    runAudit.mockResolvedValueOnce(blockedReport());

    const response = await GET(new NextRequest("http://localhost/api/card?url=https%3A%2F%2Fexample.com"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1_000);
  });
});
