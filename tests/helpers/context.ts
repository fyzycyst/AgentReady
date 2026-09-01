import { readFileSync } from "node:fs";
import path from "node:path";
import { createHtmlSnapshot } from "@/lib/acquisition/html-query";
import { FIXED_SIDECARS } from "@/lib/acquisition/sidecars";
import type { AuditContext, ResourceSnapshot, SidecarKey, SidecarOutcome } from "@/lib/audit/contract";

export function fixture(name: string): string {
  return readFileSync(path.join(import.meta.dirname, "..", "fixtures", name), "utf8");
}

export function resource(url: string, body: string, status = 200, headers: Record<string, string> = {}): ResourceSnapshot {
  return { requestedUrl: url, finalUrl: url, status, headers, body, truncated: false, durationMs: 10 };
}

export interface ContextOptions {
  url?: string;
  status?: number;
  headers?: Record<string, string>;
  sidecars?: Partial<Record<SidecarKey, ResourceSnapshot[]>>;
  /** Overrides per fixed path. Default: every fixed sidecar observed as 404 unless a resource for it was supplied. */
  sidecarOutcomes?: Record<string, SidecarOutcome>;
  renderedDom?: AuditContext["acquisition"]["renderedDom"];
}

export function buildContext(html: string, opts: ContextOptions = {}): AuditContext {
  const url = opts.url ?? "https://northwind.example/";
  const sidecars = opts.sidecars ?? {};
  const outcomes: Record<string, SidecarOutcome> = {};
  for (const s of FIXED_SIDECARS) {
    const supplied = sidecars[s.key]?.find((r) => new URL(r.finalUrl).pathname === s.path);
    outcomes[s.path] = supplied ? { kind: "observed", status: supplied.status } : { kind: "observed", status: 404 };
  }
  Object.assign(outcomes, opts.sidecarOutcomes ?? {});
  return {
    requestedUrl: url,
    fetchedAt: "2026-09-01T12:00:00.000Z",
    page: { ...resource(url, html, opts.status ?? 200, opts.headers ?? { "content-type": "text/html" }), raw: createHtmlSnapshot(html) },
    sidecars,
    acquisition: { robotsAllowed: true, renderedDom: opts.renderedDom ?? "skipped", sidecarOutcomes: outcomes, notes: [] },
  };
}
