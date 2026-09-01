import { describe, expect, it } from "vitest";
import { createHtmlQuery } from "@/lib/acquisition/html-query";
import { POLYFILL_SCRIPT_TAG, generateWebMcpStub, genericStubSnippets } from "@/lib/audit/snippets/webmcp-stub";
import { fixture } from "../../helpers/context";

const PAGE = "https://northwind.example/";

function dom(html: string) {
  return createHtmlQuery(html);
}

/**
 * Pull the `inputSchema` object literal out of the generated code by brace
 * matching and parse it. It only parses because the generator serializes the
 * schema with JSON.stringify — that is the property under test.
 */
function extractInputSchema(imperative: string): unknown {
  const marker = imperative.indexOf("inputSchema: ");
  expect(marker).toBeGreaterThan(-1);
  const start = imperative.indexOf("{", marker);
  let depth = 0;
  for (let i = start; i < imperative.length; i++) {
    if (imperative[i] === "{") depth++;
    else if (imperative[i] === "}" && --depth === 0) {
      return JSON.parse(imperative.slice(start, i + 1));
    }
  }
  throw new Error("unterminated inputSchema object");
}

describe("generateWebMcpStub", () => {
  it("turns agent-ready.html's booking form into a tool", () => {
    const stub = generateWebMcpStub(dom(fixture("agent-ready.html")), PAGE)!;
    expect(stub).not.toBeNull();
    expect(stub.toolName).toBe("book_repair");
    expect(stub.description).toBe("Book a repair");
    expect(stub.formPath).toBe("main > section:nth-of-type(1) > form");
    expect(stub.params).toEqual([
      { name: "name", type: "string", description: "Your name", required: true },
      { name: "email", type: "string", description: "Email", required: true },
      { name: "date", type: "string", description: "Preferred date", required: true },
      { name: "issue", type: "string", description: "What's wrong?", required: true },
    ]);
  });

  it("emits a declarative snippet with the tool attributes and the form's own attributes", () => {
    const stub = generateWebMcpStub(dom(fixture("agent-ready.html")), PAGE)!;
    expect(stub.declarative).toContain('toolname="book_repair"');
    expect(stub.declarative).toContain('tooldescription="Book a repair"');
    expect(stub.declarative).toContain('toolparamdescription="Your name"');
    // Existing attributes survive; the tool attributes are emitted once.
    expect(stub.declarative).toContain('action="/book"');
    expect(stub.declarative.match(/toolname=/g)).toHaveLength(1);
    // One line per named control, textarea included.
    expect(stub.declarative).toContain('<textarea id="issue" name="issue" toolparamdescription="What\'s wrong?"></textarea>');
  });

  it("emits an imperative snippet with a JSON-valid inputSchema and a plain return value", () => {
    const stub = generateWebMcpStub(dom(fixture("agent-ready.html")), PAGE)!;
    expect(stub.imperative).toContain("document.modelContext.registerTool");
    expect(stub.imperative).not.toContain("navigator.modelContext");
    expect(stub.imperative).toContain("https://unpkg.com/@mcp-b/webmcp-polyfill@5.1.0/dist/index.iife.js");
    // execute() resolves to a plain value, not an MCP { content } envelope.
    expect(stub.imperative).toContain('return "Submitted book_repair";');
    expect(stub.imperative).not.toContain("content:");
    // The selector is a constant string in the output, not run at audit time.
    expect(stub.imperative).toContain('document.querySelector("main > section:nth-of-type(1) > form")');

    expect(extractInputSchema(stub.imperative)).toEqual({
      type: "object",
      properties: {
        name: { type: "string", description: "Your name" },
        email: { type: "string", description: "Email" },
        date: { type: "string", description: "Preferred date" },
        issue: { type: "string", description: "What's wrong?" },
      },
      required: ["name", "email", "date", "issue"],
    });
  });

  it("maps control types to JSON Schema types", () => {
    const html = `<html><body><h1>Order</h1><form id="order">
      <label for="qty">How many</label><input id="qty" name="qty" type="number" required>
      <label for="len">Length</label><input id="len" name="len" type="range">
      <label for="gift">Gift wrap</label><input id="gift" name="gift" type="checkbox">
      <label for="when">When</label><input id="when" name="when" type="date">
      <label for="size">Size</label><select id="size" name="size"><option>S</option></select>
      <input type="hidden" name="csrf" value="x">
      <button type="submit">Order</button>
    </form></body></html>`;
    const stub = generateWebMcpStub(dom(html), PAGE)!;
    expect(stub.toolName).toBe("order");
    expect(stub.params.map((p) => [p.name, p.type, p.required])).toEqual([
      ["qty", "number", true],
      ["len", "number", false],
      ["gift", "boolean", false],
      ["when", "string", false],
      ["size", "string", false],
    ]);
    // Hidden fields are never tool parameters.
    expect(stub.params.some((p) => p.name === "csrf")).toBe(false);
  });

  it("resolves descriptions from label[for], wrapping label, aria-label, then placeholder", () => {
    const html = `<html><body><h1>Signup</h1><form id="signup">
      <label for="a">By for</label><input id="a" name="a">
      <label>Wrapping<input name="b"></label>
      <input name="c" aria-label="Aria label">
      <input name="d" placeholder="Placeholder only">
      <input name="e">
      <button type="submit">Go</button>
    </form></body></html>`;
    const stub = generateWebMcpStub(dom(html), PAGE)!;
    expect(stub.params.map((p) => p.description)).toEqual([
      "By for",
      "Wrapping",
      "Aria label",
      "Placeholder only",
      "e", // no label at all → fall back to the control name
    ]);
  });

  it("skips a search-only form when a real form exists, and uses it when it is the only one", () => {
    const searchForm = `<form id="site-search"><input name="q" type="search"><button type="submit">Search</button></form>`;
    const realForm = `<form id="contact"><label for="m">Message</label><input id="m" name="m" required><button type="submit">Send</button></form>`;

    expect(generateWebMcpStub(dom(`<html><body>${searchForm}${realForm}</body></html>`), PAGE)!.toolName).toBe("contact");
    expect(generateWebMcpStub(dom(`<html><body>${searchForm}</body></html>`), PAGE)!.toolName).toBe("site_search");
  });

  it("falls back through id, name, submit text and heading for the tool name", () => {
    const heading = `<html><body><h2>Book a table</h2><form><input name="a"><button type="submit"></button></form></body></html>`;
    expect(generateWebMcpStub(dom(heading), PAGE)!.toolName).toBe("book_a_table");

    const submit = `<html><body><form><input name="a"><input type="submit" value="Join the list"></form></body></html>`;
    expect(generateWebMcpStub(dom(submit), PAGE)!.toolName).toBe("join_the_list");

    const nothing = `<html><body><form><input name="a"></form></body></html>`;
    const stub = generateWebMcpStub(dom(nothing), PAGE)!;
    expect(stub.toolName).toBe("submit_form");
    expect(stub.description).toBe("Submit the submit_form form");
  });

  it("returns null when there is no form with a usable control", () => {
    expect(generateWebMcpStub(dom(fixture("div-soup-spa.html")), PAGE)).toBeNull();
    expect(generateWebMcpStub(dom(`<html><body><form><input type="hidden" name="csrf"></form></body></html>`), PAGE)).toBeNull();
  });

  it("escapes hostile page content in both snippets", () => {
    const html = `<html><body>
      <h2>Sign up &lt;script&gt;</h2>
      <form name='x" onload="alert(1)' action='/s" onsubmit="alert(3)'>
        <label for="e">Email "quoted" &amp; &lt;b&gt;bold&lt;/b&gt;</label>
        <input id="e" name='q" onfocus="alert(2)' type="text" required>
        <button type="submit">Go</button>
      </form></body></html>`;
    const stub = generateWebMcpStub(dom(html), PAGE)!;

    // Tool name is slugged to [a-z0-9_], so nothing hostile survives at all.
    expect(stub.toolName).toBe("x_onload_alert_1");
    expect(stub.toolName).toMatch(/^[a-z0-9_]{1,40}$/);

    // Everything else is escaped rather than interpolated raw.
    expect(stub.params[0].name).toBe("q&quot; onfocus=&quot;alert(2)");
    expect(stub.declarative).toContain('name="q&quot; onfocus=&quot;alert(2)"');
    expect(stub.declarative).toContain('action="/s&quot; onsubmit=&quot;alert(3)"');
    for (const snippet of [stub.declarative, stub.imperative]) {
      expect(snippet).not.toContain('onload="');
      expect(snippet).not.toContain('onfocus="');
      expect(snippet).not.toContain('onsubmit="');
    }
    // The generated code still parses as JSON where it claims to.
    expect(extractInputSchema(stub.imperative)).toEqual({
      type: "object",
      properties: {
        "q&quot; onfocus=&quot;alert(2)": {
          type: "string",
          description: "Email &quot;quoted&quot; &amp; &lt;b&gt;bold&lt;/b&gt;",
        },
      },
      required: ["q&quot; onfocus=&quot;alert(2)"],
    });
  });

  it("drops selector characters that could break out of the generated string literal", () => {
    const html = `<html><body><form id='a" + alert(1) + "b'><input name="x"><button type="submit">Go</button></form></body></html>`;
    const stub = generateWebMcpStub(dom(html), PAGE)!;
    const selector = stub.imperative.match(/document\.querySelector\("([^"]*)"\)/)![1];
    // Quotes and `+` are dropped outright, so the literal cannot be escaped.
    // The result is inert output text — a hostile id costs the site a working
    // selector, never us an injection.
    expect(selector).toBe("form#a  alert(1)  b");
    expect(selector).not.toContain('"');
    expect(selector).not.toContain("\\");
  });
});

describe("POLYFILL_SCRIPT_TAG", () => {
  // The version and the hash are one unit: bumping the polyfill without
  // recomputing sha384 must fail here rather than at a visitor's browser.
  it("pins the polyfill by version and by Subresource Integrity", () => {
    expect(POLYFILL_SCRIPT_TAG).toBe(
      '<script src="https://unpkg.com/@mcp-b/webmcp-polyfill@5.1.0/dist/index.iife.js" ' +
        'integrity="sha384-ZLqD1afbu2b2LJVDDqBf95wR/DGWh5FT1bx6E2S+4uMPdMOc8QGIIfw2gBWLKIB2" ' +
        'crossorigin="anonymous"></script>',
    );
  });

  it("carries the integrity attributes into every snippet that recommends the polyfill", () => {
    const fromForm = generateWebMcpStub(dom(fixture("agent-ready.html")), PAGE)!.imperative;
    const { imperative: generic } = genericStubSnippets(PAGE);
    for (const snippet of [fromForm, generic]) {
      expect(snippet).toContain(POLYFILL_SCRIPT_TAG);
      expect(snippet).toContain('integrity="sha384-');
      expect(snippet).toContain('crossorigin="anonymous"');
    }
  });
});

describe("genericStubSnippets", () => {
  it("builds a site-search tool from the page origin in both flavours", () => {
    const { declarative, imperative } = genericStubSnippets("https://spa.example/app?x=1");
    expect(declarative).toContain('toolname="search_site"');
    expect(declarative).toContain('tooldescription="Search https://spa.example"');
    expect(declarative).toContain('toolparamdescription="Search query"');
    expect(imperative).toContain("document.modelContext.registerTool");
    expect(imperative).toContain("readOnlyHint: true");
    expect(imperative).toContain("https://unpkg.com/@mcp-b/webmcp-polyfill@5.1.0/dist/index.iife.js");
    expect(extractInputSchema(imperative)).toEqual({
      type: "object",
      properties: { q: { type: "string", description: "Search query" } },
      required: ["q"],
    });
  });

  it("does not throw on an unparseable url", () => {
    expect(() => genericStubSnippets("not a url")).not.toThrow();
  });
});
