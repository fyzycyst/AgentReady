import { describe, expect, it } from "vitest";
import { formSemanticsCheck } from "@/lib/audit/checks/form-semantics";
import { buildContext, fixture } from "../../helpers/context";

describe("form-semantics", () => {
  it("scores agent-ready.html at 100 with positive findings only", async () => {
    const r = await formSemanticsCheck.run(buildContext(fixture("agent-ready.html")));
    expect(r.applicable).toBe(true);
    expect(r.score).toBe(100);
    expect(r.confidence).toBe("high");
    expect(r.findings.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        "forms.label.ok",
        "forms.type.ok",
        "forms.autocomplete.ok",
        "forms.submit.ok",
        "forms.webmcp.declarative",
        "forms.required.ok",
      ]),
    );
    expect(r.findings.some((f) => f.positive !== true && f.id !== "forms.webmcp.declarative" && f.id !== "forms.required.ok")).toBe(false);
    expect(r.summary).toBe("Forms are labelled and typed — an agent can fill them.");
  });

  it("scores bad-form.html at 30 or below with expected findings", async () => {
    const r = await formSemanticsCheck.run(buildContext(fixture("bad-form.html")));
    expect(r.applicable).toBe(true);
    expect(r.score).toBeLessThanOrEqual(30);
    expect(r.findings.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        "forms.label.placeholder-only",
        "forms.label.missing",
        "forms.type.generic",
        "forms.name.missing",
        "forms.autocomplete.missing",
      ]),
    );
    expect(r.findings.find((f) => f.id === "forms.label.placeholder-only")?.remediation?.snippet).toContain("<label");
  });

  it("returns applicable:false for a page with no controls", async () => {
    const r = await formSemanticsCheck.run(buildContext(fixture("div-soup-spa.html")));
    expect(r.applicable).toBe(false);
    expect(r.score).toBeNull();
    expect(r.findings.map((f) => f.id)).toContain("forms.none");
    expect(r.summary).toBe("No forms on this page.");
  });

  it("flags controls outside a form element", async () => {
    const html = `<html><body><input name="q" type="text"><input name="email" type="email"></body></html>`;
    const r = await formSemanticsCheck.run(buildContext(html));
    expect(r.findings.map((f) => f.id)).toContain("forms.no-form-element");
    expect(r.score).toBeLessThan(100);
  });

  it("treats placeholder-only controls as unnamed", async () => {
    const html = `<html><body><form><input placeholder="Email" type="email" name="email"></form></html>`;
    const r = await formSemanticsCheck.run(buildContext(html));
    expect(r.findings.map((f) => f.id)).toContain("forms.label.placeholder-only");
    expect(r.findings.map((f) => f.id)).toContain("forms.label.missing");
  });

  it("accepts aria-label as an accessible name", async () => {
    const html = `<html><body><form><input aria-label="Search" name="q" type="search"><button type="submit">Go</button></form></html>`;
    const r = await formSemanticsCheck.run(buildContext(html));
    expect(r.findings.map((f) => f.id)).toContain("forms.label.ok");
    expect(r.findings.map((f) => f.id)).not.toContain("forms.label.missing");
  });
});
