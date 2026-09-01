/**
 * Runtime behaviour of the inline `audit_site` registration.
 *
 * The script is served as text, so nothing else in the build type-checks or
 * executes it. This runs the real source from
 * `@/lib/webmcp/audit-site-tool` against a stubbed document/window/fetch and
 * exercises what an agent would actually hit: registration, the polyfill
 * race, `execute()`'s return shape, and unregistration by abort.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIT_SITE_TOOL, AUDIT_SITE_TOOL_SCRIPT } from "@/lib/webmcp/audit-site-tool";
import { POLYFILL_SCRIPT_ID } from "@/lib/webmcp/polyfill";

type Tool = {
  name: string;
  description: string;
  inputSchema: unknown;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>, options: { signal?: AbortSignal }) => Promise<unknown>;
};

/** Minimal addEventListener target: one array of handlers per event name. */
function target() {
  const handlers = new Map<string, ((event?: unknown) => void)[]>();
  return {
    addEventListener(type: string, handler: () => void) {
      const list = handlers.get(type) ?? [];
      list.push(handler);
      handlers.set(type, list);
    },
    fire(type: string) {
      for (const handler of handlers.get(type) ?? []) handler();
    },
  };
}

interface Harness {
  tools: Map<string, Tool>;
  registerTool: ReturnType<typeof vi.fn>;
  polyfillScript: ReturnType<typeof target>;
  window: ReturnType<typeof target>;
  fetch: ReturnType<typeof vi.fn>;
}

/** Install the globals the inline script touches, then run it. */
function run(opts: { modelContextAvailable: boolean; response?: unknown }): Harness {
  const tools = new Map<string, Tool>();
  const registerTool = vi.fn(async (tool: Tool, options: { signal: AbortSignal }) => {
    if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
    options.signal.addEventListener("abort", () => tools.delete(tool.name));
    tools.set(tool.name, tool);
  });

  const polyfillScript = target();
  const win = target();
  const fetchMock = vi.fn(async () => ({ json: async () => opts.response }));

  const modelContext = { registerTool };
  const doc: Record<string, unknown> = {
    getElementById: (id: string) => (id === POLYFILL_SCRIPT_ID ? polyfillScript : null),
  };
  if (opts.modelContextAvailable) doc.modelContext = modelContext;

  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  vi.stubGlobal("fetch", fetchMock);

  // The script is an IIFE; Function() evaluates it against the stubbed globals.
  new Function(AUDIT_SITE_TOOL_SCRIPT)();

  // Late-arriving polyfill: the load handler is what makes registration happen.
  if (!opts.modelContextAvailable) doc.modelContext = modelContext;

  return { tools, registerTool, polyfillScript, window: win, fetch: fetchMock };
}

const OK_REPORT = {
  ok: true,
  finalUrl: "https://example.com/",
  score: { overall: 72, grade: "B", coverage: 1 },
  results: [
    {
      category: "agent-discovery",
      findings: [
        { id: "discovery.robots.present", severity: "info", title: "robots.txt present", positive: true },
        { id: "discovery.mcp.missing", severity: "low", title: "No MCP discovery files" },
        // Unknown is never a to-do item, so it must never win the ranking.
        { id: "discovery.unobserved", severity: "critical", title: "Could not check: llms.txt" },
      ],
    },
    {
      category: "machine-readable-structure",
      // high (4) x weight 18 = 72, the highest priority in this report.
      findings: [{ id: "structure.jsonld.missing", severity: "high", title: "No structured data (JSON-LD)" }],
    },
    {
      category: "webmcp-capability",
      // high (4) x weight 15 = 60.
      findings: [{ id: "webmcp.none", severity: "high", title: "No WebMCP tools" }],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("audit_site inline registration", () => {
  it("registers the declared tool as soon as document.modelContext exists", async () => {
    const h = run({ modelContextAvailable: true });
    await vi.waitFor(() => expect(h.tools.has("audit_site")).toBe(true));

    const tool = h.tools.get("audit_site")!;
    expect(tool.description).toBe(AUDIT_SITE_TOOL.description);
    expect(tool.inputSchema).toEqual(AUDIT_SITE_TOOL.inputSchema);
    expect(tool.annotations).toEqual({ readOnlyHint: true });
    expect(h.registerTool.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("waits for the polyfill's load event when modelContext is not there yet", async () => {
    const h = run({ modelContextAvailable: false });
    expect(h.registerTool).not.toHaveBeenCalled();

    h.polyfillScript.fire("load");
    await vi.waitFor(() => expect(h.tools.has("audit_site")).toBe(true));
    expect(h.registerTool).toHaveBeenCalledTimes(1);
  });

  it("unregisters on pagehide by aborting the registration signal", async () => {
    const h = run({ modelContextAvailable: true });
    await vi.waitFor(() => expect(h.tools.has("audit_site")).toBe(true));

    h.window.fire("pagehide");
    expect(h.tools.has("audit_site")).toBe(false);
  });

  it("execute() POSTs the url and returns a compact plain value, not an MCP envelope", async () => {
    const h = run({ modelContextAvailable: true, response: OK_REPORT });
    await vi.waitFor(() => expect(h.tools.has("audit_site")).toBe(true));

    const ac = new AbortController();
    const out = await h.tools.get("audit_site")!.execute({ url: "example.com" }, { signal: ac.signal });

    const [url, init] = h.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/audit");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ url: "example.com" });
    expect(init.signal).toBe(ac.signal);

    expect(out).toEqual({
      url: "https://example.com/",
      overall: 72,
      grade: "B",
      coverage: 1,
      topFinding: { id: "structure.jsonld.missing", severity: "high", title: "No structured data (JSON-LD)" },
    });
    expect(out).not.toHaveProperty("content");
  });

  it("execute() surfaces a blocked report as an error value rather than throwing", async () => {
    const blocked = { ok: false, code: "robots-disallow", title: "This site asks agents not to read this page", message: "robots.txt disallows this path." };
    const h = run({ modelContextAvailable: true, response: blocked });
    await vi.waitFor(() => expect(h.tools.has("audit_site")).toBe(true));

    const out = await h.tools.get("audit_site")!.execute({ url: "blocked.example" }, {});
    expect(out).toEqual({ error: blocked.message, url: "blocked.example" });
  });
});
