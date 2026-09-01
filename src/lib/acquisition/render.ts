/**
 * Rendering adapter — deliberately a no-op in v1 (Triumvirate axis J, 3–0).
 *
 * Headless Chromium on Vercel (sparticuz/playwright-core, Sandbox, remote CDP)
 * was rejected for the judge-critical path: 5–30 s cold starts against a
 * 30 s budget. JS-dependence is detected heuristically by the
 * access-renderability check and labelled as heuristic in the report.
 *
 * To add rendering later: implement `render()` behind AGENTREADY_RENDER=1,
 * keep an 8 s sub-budget, and return "failed" (never throw) on any error.
 */
import type { HtmlSnapshot } from "@/lib/audit/contract";

export interface RenderOutcome {
  status: "available" | "skipped" | "failed";
  snapshot?: HtmlSnapshot;
  note?: string;
}

export async function render(url: string): Promise<RenderOutcome> {
  void url; // reserved for the P4 remote-CDP adapter
  return {
    status: "skipped",
    note: "Rendered-DOM checks are not run in v1; JavaScript dependence is estimated from the raw HTML.",
  };
}
