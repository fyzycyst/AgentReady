import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SoupFixturePage from "@/app/fixtures/soup/page";
import { CHECKS } from "@/lib/audit/checks";
import { summarize } from "@/lib/audit/scoring";
import { buildContext } from "../helpers/context";

describe("/fixtures/soup", () => {
  it("grades D or F with actions.primary.soup and form findings", async () => {
    const body = renderToStaticMarkup(<SoupFixturePage />);
    const html = `<!doctype html><html lang="en"><head><title>FlowStack</title></head><body>${body}</body></html>`;
    const ctx = buildContext(html, { url: "https://agentready.example/fixtures/soup" });
    const results = await Promise.all(CHECKS.map((check) => check.run(ctx)));
    const score = summarize(results);

    expect(score.grade === "D" || score.grade === "F").toBe(true);
    expect(score.overall).not.toBeNull();
    expect(score.overall!).toBeLessThan(60);

    const actionability = results.find((r) => r.category === "actionability");
    expect(actionability?.findings.some((f) => f.id === "actions.primary.soup")).toBe(true);

    const forms = results.find((r) => r.category === "form-semantics");
    expect(forms?.applicable).toBe(true);
    expect(forms?.score).not.toBeNull();
    expect(forms!.score!).toBeLessThan(50);
    expect(forms?.findings.some((f) => f.id.startsWith("forms."))).toBe(true);
  });
});
