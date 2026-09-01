import { describe, expect, it } from "vitest";
import { machineReadableStructureCheck } from "@/lib/audit/checks/machine-readable-structure";
import { buildContext, fixture } from "../../helpers/context";

describe("machine-readable-structure", () => {
  it("scores the well-structured fixture at 100", async () => {
    const r = await machineReadableStructureCheck.run(buildContext(fixture("agent-ready.html")));
    expect(r.score).toBe(100);
    expect(r.findings.map((f) => f.id)).toContain("structure.jsonld.present");
  });

  it("scores the div-soup SPA near zero with a JSON-LD remediation snippet", async () => {
    const r = await machineReadableStructureCheck.run(buildContext(fixture("div-soup-spa.html")));
    expect(r.score).toBeLessThanOrEqual(10);
    const ld = r.findings.find((f) => f.id === "structure.jsonld.missing");
    expect(ld?.severity).toBe("high");
    expect(ld?.remediation?.snippet).toContain('"@context": "https://schema.org"');
    expect(r.findings.map((f) => f.id)).toContain("structure.landmarks.no-main");
    expect(r.findings.map((f) => f.id)).toContain("structure.headings.hierarchy");
  });

  it("detects invalid JSON-LD", async () => {
    const html = `<html lang="en"><head><title>T</title><script type="application/ld+json">{not json</script></head><body><main><h1>x</h1></main></body></html>`;
    const r = await machineReadableStructureCheck.run(buildContext(html));
    expect(r.findings.map((f) => f.id)).toContain("structure.jsonld.invalid");
  });

  it("reads @type from @graph", async () => {
    const html = `<html lang="en"><head><title>T</title><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"WebPage"}]}</script></head><body><main><h1>x</h1></main></body></html>`;
    const r = await machineReadableStructureCheck.run(buildContext(html));
    expect(r.findings.find((x) => x.id === "structure.jsonld.present")?.title).toContain("Organization");
  });

  it("JSON-LD without a schema.org @context gets partial credit only (review N2)", async () => {
    const html = `<html lang="en"><head><title>T</title><script type="application/ld+json">{"@type":"MadeUp"}</script></head><body><main><h1>x</h1></main></body></html>`;
    const r = await machineReadableStructureCheck.run(buildContext(html));
    const f = r.findings.find((x) => x.id === "structure.jsonld.invalid");
    expect(f?.detail).toMatch(/schema\.org/);
    expect(r.findings.map((x) => x.id)).not.toContain("structure.jsonld.present");
  });

  it("flags skipped heading levels and multiple h1s", async () => {
    const html = `<html lang="en"><head><title>T</title></head><body><main><h1>a</h1><h1>b</h1><h4>c</h4></main></body></html>`;
    const r = await machineReadableStructureCheck.run(buildContext(html));
    expect(r.findings.find((x) => x.id === "structure.headings.hierarchy")?.title).toContain("2 <h1>");
  });
});
