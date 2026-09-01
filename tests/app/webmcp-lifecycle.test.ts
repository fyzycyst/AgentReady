import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAvailabilityTool } from "@/lib/demo/register-availability-tool";

type MockModelContext = {
  registerTool: ReturnType<typeof vi.fn>;
  getTools?: () => Promise<{ name: string }[]>;
};

function installMockModelContext(): { tools: Map<string, unknown>; mc: MockModelContext } {
  const tools = new Map<string, unknown>();
  const registerTool = vi.fn(async (tool: { name: string }, options: { signal: AbortSignal }) => {
    if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
    options.signal.addEventListener("abort", () => tools.delete(tool.name));
    tools.set(tool.name, tool);
  });
  const mc: MockModelContext = {
    registerTool,
    getTools: async () => [...tools.values()].map((tool) => ({ name: (tool as { name: string }).name })),
  };
  vi.stubGlobal("document", { modelContext: mc });
  return { tools, mc };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerAvailabilityTool", () => {
  it("passes the registration AbortSignal to document.modelContext.registerTool", async () => {
    const { mc } = installMockModelContext();
    const ac = new AbortController();
    await registerAvailabilityTool(ac.signal);
    expect(mc.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: "check_availability" }), { signal: ac.signal });
  });

  it("simulates /demo → / → /demo by aborting and re-registering", async () => {
    const { tools, mc } = installMockModelContext();

    const onDemo = new AbortController();
    await registerAvailabilityTool(onDemo.signal);
    expect(tools.has("check_availability")).toBe(true);

    onDemo.abort();
    expect(tools.has("check_availability")).toBe(false);

    const backOnDemo = new AbortController();
    await registerAvailabilityTool(backOnDemo.signal);
    expect(tools.has("check_availability")).toBe(true);
    expect(mc.registerTool).toHaveBeenCalledTimes(2);
  });

  it("skips registration when the signal is already aborted", async () => {
    const { mc } = installMockModelContext();
    const ac = new AbortController();
    ac.abort();
    await registerAvailabilityTool(ac.signal);
    expect(mc.registerTool).not.toHaveBeenCalled();
  });
});
