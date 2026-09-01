import { describe, expect, it } from "vitest";
import { escapeAttr, formSemanticsCheck } from "@/lib/audit/checks/form-semantics";
import { buildContext, fixture } from "../../helpers/context";

describe("form-semantics", () => {
  it("scores agent-ready.html at 100 with positive findings only", async () => {
    const r = await formSemanticsCheck.run(buildContext(fixture("agent-ready.html")));
    expect(r.applicable).toBe(true);
    expect(r.score).toBe(100);
    expect(Number.isInteger(r.score)).toBe(true);
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
    expect(Number.isInteger(r.score)).toBe(true);
    expect(r.findings.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        "forms.label.placeholder-only",
        "forms.label.missing",
        "forms.type.generic",
        "forms.name.missing",
        "forms.autocomplete.missing",
        "forms.submit.missing",
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
    expect(r.findings.map((f) => f.id)).toContain("forms.submit.missing");
    expect(r.score).toBeLessThan(100);
    expect(Number.isInteger(r.score)).toBe(true);
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

  it("resolves aria-labelledby with colon-containing ids without throwing", async () => {
    const html = `<html><body><form>
      <span id="billing:email">Email</span>
      <input id="billing:email" aria-labelledby="billing:email" name="email" type="email">
      <button type="submit">Pay</button>
    </form></body></html>`;
    const r = await formSemanticsCheck.run(buildContext(html));
    expect(r.findings.map((f) => f.id)).toContain("forms.label.ok");
    expect(r.findings.map((f) => f.id)).not.toContain("forms.label.missing");
  });

  it("escapes adversarial attribute values in remediation snippets", async () => {
    const html = `<html><body><form><input name='x" onload="alert(1)' type="text"><button type="submit">Go</button></form></html>`;
    const r = await formSemanticsCheck.run(buildContext(html));
    const snippet = r.findings.find((f) => f.id === "forms.label.missing")?.remediation?.snippet ?? "";
    expect(snippet).toContain('name="x&quot; onload=&quot;alert(1)"');
    expect(snippet).not.toContain('onload="alert(1)"');
  });

  it("preserves select options in remediation snippets", async () => {
    const html = `<html><body><form>
      <select id="country" name="country">
        <option value="us">United States</option>
        <option value="ca">Canada</option>
      </select>
      <button type="submit">Go</button>
    </form></html>`;
    const r = await formSemanticsCheck.run(buildContext(html));
    const snippet = r.findings.find((f) => f.id === "forms.label.missing")?.remediation?.snippet ?? "";
    expect(snippet).toContain('<option value="us">United States</option>');
    expect(snippet).toContain('<option value="ca">Canada</option>');
  });

  it("does not give full submit credit when an orphan control exists beside an unrelated form", async () => {
    const html = `<html><body>
      <form><button type="submit">Unrelated</button></form>
      <label for="email">Email</label>
      <input id="email" name="email" type="email">
    </body></html>`;
    const r = await formSemanticsCheck.run(buildContext(html));
    expect(r.score).not.toBe(100);
    expect(r.findings.map((f) => f.id)).toContain("forms.no-form-element");
    expect(r.findings.map((f) => f.id)).toContain("forms.submit.missing");
    expect(r.findings.map((f) => f.id)).not.toContain("forms.submit.ok");
    expect(Number.isInteger(r.score)).toBe(true);
  });

  it("escapeAttr collapses whitespace and caps length", () => {
    expect(escapeAttr('  hello   world  ')).toBe("hello world");
    expect(escapeAttr("a".repeat(80))).toHaveLength(60);
    expect(escapeAttr('a&b"c<d>')).toBe("a&amp;b&quot;c&lt;d&gt;");
  });
});
