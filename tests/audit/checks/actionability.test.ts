import { describe, expect, it } from "vitest";
import { actionabilityCheck } from "@/lib/audit/checks/actionability";
import { buildContext, fixture } from "../../helpers/context";

describe("actionability", () => {
  it("scores the native fixture at 100 with a positive native finding", async () => {
    const result = await actionabilityCheck.run(buildContext(fixture("agent-ready.html")));

    expect(result.score).toBe(100);
    expect(result.confidence).toBe("high");
    expect(result.findings.map((finding) => finding.id)).toContain("actions.native.ok");
  });

  it("flags a click-handler-only SPA as action soup", async () => {
    const result = await actionabilityCheck.run(buildContext(fixture("div-soup-spa.html")));

    expect(result.score).toBe(0);
    expect(result.findings.find((finding) => finding.id === "actions.soup.handlers")?.severity).toBe("medium");
  });

  it("flags an onclick shop's soup primary action and handler-heavy controls", async () => {
    const result = await actionabilityCheck.run(buildContext(fixture("onclick-shop.html")));

    expect(result.score).toBeLessThanOrEqual(40);
    expect(result.findings.find((finding) => finding.id === "actions.primary.soup")?.severity).toBe("critical");
    expect(result.findings.find((finding) => finding.id === "actions.soup.handlers")?.severity).toBe("high");
  });

  it("is not applicable when the HTML has no interactive elements", async () => {
    const result = await actionabilityCheck.run(buildContext("<main><h1>Read only</h1><p>Nothing to invoke.</p></main>"));

    expect(result.applicable).toBe(false);
    expect(result.score).toBeNull();
    expect(result.findings.map((finding) => finding.id)).toContain("actions.none");
  });
});
