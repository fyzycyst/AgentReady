/**
 * Runtime behaviour of the inline `audit_site` registration.
 *
 * The script is served as text, so nothing else in the build type-checks or
 * executes it. This runs the real source from
 * `@/lib/webmcp/audit-site-tool-script` against a stubbed document/window/fetch
 * and exercises what an agent would actually hit: registration, the polyfill
 * race, `execute()`'s return shape and its failure modes, and — the part the
 * first round got wrong — that the tool is scoped to `/` across client-side
 * navigation, driven through the same `bindAuditToolLifecycle` the landing
 * page's effect uses.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIT_SITE_TOOL, AUDIT_TOOL_GLOBAL, bindAuditToolLifecycle } from "@/lib/webmcp/audit-site-tool";
import { AUDIT_SITE_TOOL_SCRIPT } from "@/lib/webmcp/audit-site-tool-script";
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
    addEventListener(type: string, handler: (event?: unknown) => void) {
      const list = handlers.get(type) ?? [];
      list.push(handler);
      handlers.set(type, list);
    },
    fire(type: string, event?: unknown) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    },
  };
}

interface Harness {
  tools: Map<string, Tool>;
  registerTool: ReturnType<typeof vi.fn>;
  window: ReturnType<typeof target>;
  fetch: ReturnType<typeof vi.fn>;
  /** What the polyfill actually does: install document.modelContext, then fire load. */
  installPolyfill(): void;
  /** Signal handed to `registerTool` on the nth (0-based) registration. */
  signalAt(index: number): AbortSignal;
}

interface RunOptions {
  modelContextAvailable: boolean;
  response?: unknown;
  /** Make `fetch` itself reject, e.g. a dropped request. */
  fetchRejects?: unknown;
  /** Make `response.json()` reject, e.g. a proxy HTML error page. */
  jsonRejects?: boolean;
}

/** Install the globals the inline script touches, then run it. */
function run(opts: RunOptions): Harness {
  const tools = new Map<string, Tool>();
  const registerTool = vi.fn(async (tool: Tool, options: { signal: AbortSignal }) => {
    if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
    options.signal.addEventListener("abort", () => tools.delete(tool.name));
    tools.set(tool.name, tool);
  });

  const polyfillScript = target();
  const win = target() as ReturnType<typeof target> & Record<string, unknown>;
  const fetchMock = vi.fn(async () => {
    if (opts.fetchRejects) throw opts.fetchRejects;
    return {
      json: async () => {
        if (opts.jsonRejects) throw new SyntaxError("Unexpected token < in JSON at position 0");
        return opts.response;
      },
    };
  });

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

  return {
    tools,
    registerTool,
    window: win,
    fetch: fetchMock,
    installPolyfill() {
      doc.modelContext = modelContext;
      polyfillScript.fire("load");
    },
    signalAt: (index) => (registerTool.mock.calls[index] as [Tool, { signal: AbortSignal }])[1].signal,
  };
}

const registered = (h: Harness) => vi.waitFor(() => expect(h.tools.has("audit_site")).toBe(true));

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

const GENERIC_ERROR = "The audit could not be completed.";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("audit_site inline registration", () => {
  it("registers the declared tool as soon as document.modelContext exists", async () => {
    const h = run({ modelContextAvailable: true });
    await registered(h);

    const tool = h.tools.get("audit_site")!;
    expect(tool.description).toBe(AUDIT_SITE_TOOL.description);
    expect(tool.inputSchema).toEqual(AUDIT_SITE_TOOL.inputSchema);
    expect(tool.annotations).toEqual({ readOnlyHint: true });
    expect(h.signalAt(0)).toBeInstanceOf(AbortSignal);
  });

  it("waits for the polyfill's load event when modelContext is not there yet", async () => {
    const h = run({ modelContextAvailable: false });
    expect(h.registerTool).not.toHaveBeenCalled();

    h.installPolyfill();
    await registered(h);
    expect(h.registerTool).toHaveBeenCalledTimes(1);
  });

  it("publishes exactly one namespaced global for the React tree to drive", () => {
    const h = run({ modelContextAvailable: true });
    const handle = (h.window as Record<string, unknown>)[AUDIT_TOOL_GLOBAL] as { register: unknown; unregister: unknown };
    expect(Object.keys(handle).sort()).toEqual(["register", "unregister"]);
  });

  it("unregisters on pagehide by aborting the registration signal", async () => {
    const h = run({ modelContextAvailable: true });
    await registered(h);

    h.window.fire("pagehide");
    expect(h.tools.has("audit_site")).toBe(false);
    expect(h.signalAt(0).aborted).toBe(true);
  });

  it("re-registers when the document comes back from the bfcache", async () => {
    const h = run({ modelContextAvailable: true });
    await registered(h);

    h.window.fire("pagehide");
    expect(h.tools.has("audit_site")).toBe(false);

    h.window.fire("pageshow", { persisted: true });
    await registered(h);
    expect(h.registerTool).toHaveBeenCalledTimes(2);
  });
});

describe("audit_site is scoped to the landing page across client-side navigation", () => {
  it("leaves on unmount and comes back on remount, with a fresh signal each time", async () => {
    const h = run({ modelContextAvailable: true });
    await registered(h);

    // Mount on `/`: the inline script already registered, so this is a no-op.
    const leaveLandingPage = bindAuditToolLifecycle();
    expect(h.registerTool).toHaveBeenCalledTimes(1);
    expect(h.tools.has("audit_site")).toBe(true);

    // router.push("/report?url=…") — same document, so pagehide never fires.
    leaveLandingPage();
    expect(h.tools.has("audit_site")).toBe(false);
    expect(h.signalAt(0).aborted).toBe(true);

    // Back on `/`. The inline script does not re-execute; the component owns this.
    bindAuditToolLifecycle();
    await registered(h);
    expect(h.registerTool).toHaveBeenCalledTimes(2);
    expect(h.signalAt(1)).not.toBe(h.signalAt(0));
    expect(h.signalAt(1).aborted).toBe(false);
  });

  it("does not let a late polyfill load resurrect the tool after the page is left", () => {
    // The polyfill is still in flight when the visitor arrives and leaves again.
    const h = run({ modelContextAvailable: false });
    const leaveLandingPage = bindAuditToolLifecycle();
    leaveLandingPage();

    h.installPolyfill();
    expect(h.registerTool).not.toHaveBeenCalled();
    expect(h.tools.has("audit_site")).toBe(false);
  });
});

describe("audit_site execute()", () => {
  async function executeWith(opts: RunOptions, input: Record<string, unknown>, options: { signal?: AbortSignal } = {}) {
    const h = run(opts);
    await registered(h);
    return { h, result: await h.tools.get("audit_site")!.execute(input, options) };
  }

  it("POSTs the url and returns a compact plain value, not an MCP envelope", async () => {
    const ac = new AbortController();
    const { h, result } = await executeWith(
      { modelContextAvailable: true, response: OK_REPORT },
      { url: "example.com" },
      { signal: ac.signal },
    );

    const [url, init] = h.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/audit");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ url: "example.com" });
    expect(init.signal).toBe(ac.signal);

    expect(result).toEqual({
      url: "https://example.com/",
      overall: 72,
      grade: "B",
      coverage: 1,
      topFinding: { id: "structure.jsonld.missing", severity: "high", title: "No structured data (JSON-LD)" },
    });
    expect(result).not.toHaveProperty("content");
  });

  it("surfaces a blocked report as an error value rather than throwing", async () => {
    const blocked = {
      ok: false,
      code: "robots-disallow",
      title: "This site asks agents not to read this page",
      message: "robots.txt disallows this path.",
    };
    const { result } = await executeWith({ modelContextAvailable: true, response: blocked }, { url: "blocked.example" });
    expect(result).toEqual({ error: blocked.message, url: "blocked.example" });
  });

  it("returns the compact error when the request never completes", async () => {
    const { result } = await executeWith(
      { modelContextAvailable: true, fetchRejects: new TypeError("Failed to fetch") },
      { url: "example.com" },
    );
    expect(result).toEqual({ error: GENERIC_ERROR, url: "example.com" });
  });

  it("returns the compact error when the response is not JSON", async () => {
    const { result } = await executeWith({ modelContextAvailable: true, jsonRejects: true }, { url: "example.com" });
    expect(result).toEqual({ error: GENERIC_ERROR, url: "example.com" });
  });

  it("lets cancellation propagate instead of reporting it as an audit failure", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const h = run({ modelContextAvailable: true, fetchRejects: abort });
    await registered(h);
    await expect(h.tools.get("audit_site")!.execute({ url: "example.com" }, {})).rejects.toBe(abort);
  });
});
