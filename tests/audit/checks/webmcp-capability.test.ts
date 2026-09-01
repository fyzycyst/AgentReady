import { describe, expect, it } from "vitest";
import { webmcpCapabilityCheck } from "@/lib/audit/checks/webmcp-capability";
import { buildContext, fixture } from "../../helpers/context";

function ids(findings: readonly { id: string }[]): string[] {
  return findings.map((f) => f.id);
}

describe("webmcp-capability", () => {
  it("credits agent-ready.html's declared form but withholds the param bonus", async () => {
    // 4 controls, 1 with toolparamdescription → 25 % described, under the 50 % bar.
    const r = await webmcpCapabilityCheck.run(buildContext(fixture("agent-ready.html")));
    expect(r.applicable).toBe(true);
    expect(r.score).toBe(60);
    expect(Number.isInteger(r.score)).toBe(true);
    expect(r.confidence).toBe("high");
    expect(ids(r.findings)).toEqual(["webmcp.declarative.present", "webmcp.declarative.params"]);
    expect(ids(r.findings)).not.toContain("webmcp.none");
    const params = r.findings.find((f) => f.id === "webmcp.declarative.params")!;
    expect(params.remediation?.snippet).toContain("toolparamdescription=");
    expect(params.remediation?.language).toBe("html");
  });

  it("scores webmcp-declarative.html above 90 with declarative, imperative and polyfill signals", async () => {
    const r = await webmcpCapabilityCheck.run(buildContext(fixture("webmcp-declarative.html")));
    // 60 declarative + 10 params + 30 imperative → capped at 90, +5 polyfill.
    expect(r.score).toBe(95);
    expect(r.confidence).toBe("high");
    expect(ids(r.findings)).toEqual([
      "webmcp.declarative.present",
      "webmcp.imperative.referenced",
      "webmcp.polyfill.present",
    ]);
    expect(r.summary).toBe("This site already exposes tools agents can call.");
  });

  it("awards the param bonus at exactly 50 % coverage", async () => {
    const html = `<html><body><form toolname="t" tooldescription="Does a thing">
      <input name="a" toolparamdescription="First"><input name="b">
      <input type="hidden" name="csrf"><button type="submit">Go</button>
    </form></body></html>`;
    const r = await webmcpCapabilityCheck.run(buildContext(html));
    expect(r.score).toBe(70);
    expect(ids(r.findings)).toContain("webmcp.declarative.params");
  });

  it("flags a form that declares only one of the two required attributes", async () => {
    const html = `<html><body><h2>Book a table</h2>
      <form id="book" toolname="book_table"><input name="party"><button type="submit">Book</button></form>
    </body></html>`;
    const r = await webmcpCapabilityCheck.run(buildContext(html));
    expect(r.score).toBe(0);
    expect(ids(r.findings)).toContain("webmcp.declarative.incomplete");
    // The incomplete finding carries the fix, so the opportunity finding stays quiet.
    expect(ids(r.findings)).not.toContain("webmcp.none");
    const snippet = r.findings.find((f) => f.id === "webmcp.declarative.incomplete")!.remediation!.snippet!;
    expect(snippet).toContain('toolname="book_table"');
    expect(snippet).toContain('tooldescription="Book a table"');
  });

  it("credits an imperative reference and flags the deprecated navigator alias", async () => {
    const r = await webmcpCapabilityCheck.run(buildContext(fixture("webmcp-legacy.html")));
    expect(r.score).toBe(25);
    expect(r.confidence).toBe("medium");
    expect(ids(r.findings)).toEqual(["webmcp.imperative.referenced", "webmcp.imperative.legacy"]);
    const legacy = r.findings.find((f) => f.id === "webmcp.imperative.legacy")!;
    expect(legacy.remediation?.snippet).toContain("document.modelContext.registerTool");
    expect(legacy.remediation?.snippet).not.toContain("navigator.modelContext");
  });

  it("adds 5 for an inputSchema in the same script and ignores external scripts", async () => {
    const inline = `<html><body><script>document.modelContext.registerTool({ name: "x", description: "d", inputSchema: { type: "object" }, execute: () => "ok" });</script></body></html>`;
    expect((await webmcpCapabilityCheck.run(buildContext(inline))).score).toBe(30);

    // A bundle that registers tools is invisible to a raw-HTML audit; a src
    // attribute must never be read as a registration.
    const external = `<html><body><script src="/app.js">document.modelContext.registerTool(</script></body></html>`;
    const r = await webmcpCapabilityCheck.run(buildContext(external));
    expect(r.score).toBe(0);
    expect(ids(r.findings)).toContain("webmcp.none");
  });

  it("reports the opportunity with a stub built from the page's own form", async () => {
    const r = await webmcpCapabilityCheck.run(buildContext(fixture("bad-form.html")));
    expect(r.score).toBe(0);
    expect(r.confidence).toBe("medium");
    const none = r.findings.find((f) => f.id === "webmcp.none")!;
    expect(none.severity).toBe("high");
    expect(none.title).toBe("No WebMCP tools — this is the biggest single upgrade available");
    expect(none.detail).toMatch(/JavaScript bundle would be invisible/);
    expect(none.remediation?.summary).toBe('Declare your "Checkout" form as a tool');
    expect(none.remediation?.language).toBe("html");
    expect(none.remediation?.snippet).toContain('toolname="checkout"');
    expect(none.remediation?.snippet).toContain('action="/checkout"');
    expect(none.remediation?.docsUrl).toBe("https://developer.chrome.com/docs/ai/webmcp/declarative-api");

    const imperative = r.findings.find((f) => f.id === "webmcp.stub.imperative")!;
    expect(imperative.severity).toBe("info");
    expect(imperative.remediation?.language).toBe("ts");
    expect(imperative.remediation?.snippet).toContain("document.modelContext.registerTool");
    expect(imperative.remediation?.rationale).toContain("webmcp-polyfill@5.1.0");
  });

  it("falls back to a generic search tool when the page has no form", async () => {
    const r = await webmcpCapabilityCheck.run(buildContext(fixture("div-soup-spa.html"), { url: "https://spa.example/app" }));
    expect(r.applicable).toBe(true);
    expect(r.score).toBe(0);
    expect(ids(r.findings)).toEqual(["webmcp.none", "webmcp.stub.imperative"]);
    expect(r.findings[0].remediation?.summary).toBe("Declare a site-search tool");
    expect(r.findings[0].remediation?.snippet).toContain('tooldescription="Search https://spa.example"');
    expect(r.summary).toBe("No WebMCP tools — the single biggest upgrade available here.");
  });

  it("scores an empty page 0 and stays applicable", async () => {
    const r = await webmcpCapabilityCheck.run(buildContext("<html><body></body></html>"));
    expect(r.applicable).toBe(true);
    expect(r.score).toBe(0);
    expect(ids(r.findings)).toContain("webmcp.none");
  });

  it("zeroes the score when Permissions-Policy disables the tools feature", async () => {
    const r = await webmcpCapabilityCheck.run(
      buildContext(fixture("webmcp-declarative.html"), {
        headers: { "content-type": "text/html", "permissions-policy": "geolocation=(self), tools=()" },
      }),
    );
    expect(r.score).toBe(0);
    expect(r.confidence).toBe("high");
    expect(ids(r.findings)).toContain("webmcp.policy.disabled");
    expect(r.findings.find((f) => f.id === "webmcp.policy.disabled")!.severity).toBe("high");
    expect(r.summary).toBe("WebMCP is switched off by this site's Permissions-Policy.");
  });

  it("does not treat an allowlisted tools directive as disabled", async () => {
    for (const value of ["tools=(self)", 'tools=(self "https://agent.example")', "camera=(), tools=(self)"]) {
      const r = await webmcpCapabilityCheck.run(
        buildContext(fixture("webmcp-declarative.html"), {
          headers: { "content-type": "text/html", "permissions-policy": value },
        }),
      );
      expect(r.score, value).toBe(95);
      expect(ids(r.findings), value).not.toContain("webmcp.policy.disabled");
    }
  });

  it("caps the score at 20 when origin isolation is turned off", async () => {
    const r = await webmcpCapabilityCheck.run(
      buildContext(fixture("webmcp-declarative.html"), {
        headers: { "content-type": "text/html", "origin-agent-cluster": "?0" },
      }),
    );
    expect(r.score).toBe(20);
    expect(ids(r.findings)).toContain("webmcp.origin-cluster.off");
    expect(r.findings.find((f) => f.id === "webmcp.origin-cluster.off")!.severity).toBe("medium");
  });

  it("credits an origin trial token from a meta tag or a response header", async () => {
    const meta = `<html><head><meta http-equiv="origin-trial" content="A1b2c3"></head><body></body></html>`;
    const fromMeta = await webmcpCapabilityCheck.run(buildContext(meta));
    expect(fromMeta.score).toBe(5);
    expect(ids(fromMeta.findings)).toContain("webmcp.origin-trial.present");

    const fromHeader = await webmcpCapabilityCheck.run(
      buildContext("<html><body></body></html>", {
        headers: { "content-type": "text/html", "origin-trial": "A1b2c3" },
      }),
    );
    expect(fromHeader.score).toBe(5);
    expect(ids(fromHeader.findings)).toContain("webmcp.origin-trial.present");
  });

  it("never emits a snippet that uses the deprecated navigator alias", async () => {
    for (const name of ["agent-ready.html", "bad-form.html", "div-soup-spa.html", "webmcp-legacy.html"]) {
      const r = await webmcpCapabilityCheck.run(buildContext(fixture(name)));
      for (const f of r.findings) {
        expect(f.remediation?.snippet ?? "", name).not.toContain("navigator.modelContext");
      }
    }
  });
});
