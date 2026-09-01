import { describe, expect, it } from "vitest";
import { accessRenderabilityCheck } from "@/lib/audit/checks/access-renderability";
import { buildContext, fixture } from "../../helpers/context";

describe("access-renderability", () => {
  it("scores agent-ready.html at ≥90 with high confidence", async () => {
    const r = await accessRenderabilityCheck.run(buildContext(fixture("agent-ready.html")));
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.confidence).toBe("high");
    expect(r.findings.map((f) => f.id)).toContain("access.headers.ok");
    expect(r.findings.map((f) => f.id)).toContain("access.js.static");
  });

  it("scores div-soup-spa.html at 35 with access.js.required and low confidence", async () => {
    const r = await accessRenderabilityCheck.run(buildContext(fixture("div-soup-spa.html")));
    expect(r.score).toBe(35);
    expect(r.confidence).toBe("low");
    expect(r.findings.map((f) => f.id)).toContain("access.js.required");
    expect(r.summary).toMatch(/walled|hidden behind JavaScript/i);
  });

  it("flags CAPTCHA embedded in a login form", async () => {
    const r = await accessRenderabilityCheck.run(buildContext(fixture("captcha-form.html")));
    const f = r.findings.find((x) => x.id === "access.captcha.on-form");
    expect(f?.severity).toBe("high");
    expect(f?.remediation?.language).toBe("text");
    expect(f?.remediation?.snippet).toMatch(/cannot pass CAPTCHAs/i);
    expect(f?.remediation?.snippet).not.toMatch(/data-size|invisible/i);
  });

  it("every non-positive finding carries remediation", async () => {
    const cases = [
      buildContext(fixture("agent-ready.html")),
      buildContext(fixture("div-soup-spa.html")),
      buildContext(fixture("captcha-form.html")),
      buildContext(fixture("infinite-feed.html")),
      buildContext(fixture("agent-ready.html"), { headers: { "cf-mitigated": "challenge" } }),
    ];
    for (const ctx of cases) {
      const r = await accessRenderabilityCheck.run(ctx);
      const missing = r.findings.filter((f) => !f.positive && !f.remediation).map((f) => f.id);
      expect(missing, `missing remediation in ${ctx.page.finalUrl}`).toEqual([]);
    }
  });

  it("flags infinite feed without pagination", async () => {
    const r = await accessRenderabilityCheck.run(buildContext(fixture("infinite-feed.html")));
    expect(r.findings.map((f) => f.id)).toContain("access.scroll.no-pagination");
    expect(r.findings.find((f) => f.id === "access.scroll.no-pagination")?.remediation?.snippet).toContain('rel="next"');
  });

  it("detects x-robots-tag noai via response headers", async () => {
    const r = await accessRenderabilityCheck.run(
      buildContext(fixture("agent-ready.html"), { headers: { "x-robots-tag": "noai" } }),
    );
    expect(r.findings.map((f) => f.id)).toContain("access.headers.noai");
    expect(r.findings.map((f) => f.id)).not.toContain("access.headers.ok");
  });

  it("detects bot-management headers", async () => {
    const r = await accessRenderabilityCheck.run(
      buildContext(fixture("agent-ready.html"), { headers: { "cf-mitigated": "challenge" } }),
    );
    expect(r.findings.map((f) => f.id)).toContain("access.headers.bot-management");
    expect(r.confidence).toBe("medium");
  });
});
