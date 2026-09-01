/**
 * happy-dom is dev-only: production never parses attacker HTML with it. These
 * tests execute generated snippets against our own static fixtures only.
 */
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { createHtmlQuery } from "@/lib/acquisition/html-query";
import { generateWebMcpStub } from "@/lib/audit/snippets/webmcp-stub";
import { fixture } from "../../helpers/context";

type CapturedTool = {
  name: string;
  inputSchema: { properties: Record<string, unknown> };
  execute(input: Record<string, unknown>): Promise<string>;
};

function install(html: string, pageUrl = "https://northwind.example/"): { window: Window; captured: () => CapturedTool } {
  const stub = generateWebMcpStub(createHtmlQuery(html), pageUrl);
  if (!stub) throw new Error("fixture did not generate a WebMCP stub");
  const window = new Window();
  window.document.write(html);
  window.document.close();
  let tool: CapturedTool | undefined;
  Object.assign(window.document, { modelContext: { registerTool: (candidate: CapturedTool) => { tool = candidate; } } });
  window.eval(stub.imperative.split("\n").filter((line) => !line.trimStart().startsWith("//")).join("\n"));
  return { window, captured: () => {
    if (!tool) throw new Error("generated stub did not register a tool");
    return tool;
  } };
}

describe("generated WebMCP stub runtime", () => {
  it("registers and executes the AgentReady repair fixture", async () => {
    const { window, captured } = install(fixture("agent-ready.html"));
    const tool = captured();
    const form = window.document.forms[0]!;
    let submitted = false;
    form.requestSubmit = () => { submitted = true; };

    expect(tool.name).toBe("book_repair");
    expect(Object.keys(tool.inputSchema.properties)).toEqual(["name", "email", "date", "issue"]);
    await expect(tool.execute({ name: "Ada", email: "a@b.c", date: "2026-09-18", issue: "brakes" })).resolves.toBe("Submitted book_repair");
    expect(form.elements.namedItem("name")).toHaveProperty("value", "Ada");
    expect(form.elements.namedItem("email")).toHaveProperty("value", "a@b.c");
    expect(form.elements.namedItem("date")).toHaveProperty("value", "2026-09-18");
    expect(form.elements.namedItem("issue")).toHaveProperty("value", "brakes");
    expect(submitted).toBe(true);
  });

  it("assigns checkbox state and preserves raw punctuation in field names", async () => {
    const html = `<form id="account"><label><input name="agree" type="checkbox"> Agree</label><label for="role">Role</label><input id="role" name="account&amp;role"><button>Save</button></form>`;
    const { window, captured } = install(html);
    const form = window.document.forms[0]!;
    form.requestSubmit = () => {};

    await captured().execute({ agree: true, "account&role": "owner" });
    expect(form.elements.namedItem("agree")).toHaveProperty("checked", true);
    expect(form.elements.namedItem("account&role")).toHaveProperty("value", "owner");
  });

  it("evaluates safely when page labels contain a closing-script sequence and quotes", async () => {
    const html = `<form><label for="x">&lt;/script&gt; &quot;quoted&quot;</label><input id="x" name="value"><button>Go</button></form>`;
    const { window, captured } = install(html);
    const form = window.document.forms[0]!;
    form.requestSubmit = () => {};

    await captured().execute({ value: "safe" });
    expect(form.elements.namedItem("value")).toHaveProperty("value", "safe");
  });
});
