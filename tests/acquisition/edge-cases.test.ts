import { describe, expect, it } from "vitest";
import { runAudit } from "@/lib/audit/orchestrator";
import { PAGE_POLICY, safeFetch, type RawResponse, type SafeFetchDeps } from "@/lib/acquisition/safe-fetch";

type Route = { body?: string | Uint8Array; headers?: Record<string, string>; status?: number };

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

function fakeDeps(routes: Record<string, Route>): SafeFetchDeps {
  let time = 0;
  return {
    now: () => ++time,
    lookupAll: async () => ["93.184.216.34"],
    request: async (url): Promise<RawResponse> => {
      const route = routes[url.toString()] ?? {};
      const bytes = typeof route.body === "string" || route.body === undefined
        ? new TextEncoder().encode(route.body ?? "")
        : route.body;
      return {
        status: route.status ?? 200,
        headers: new Headers(route.headers ?? { "content-type": "text/html" }),
        body: stream(bytes),
      };
    },
  };
}

const URL = "https://example.com/";
const CLOCK = () => "2026-09-01T12:00:00.000Z";

describe("acquisition edge cases", () => {
  it("decodes a declared legacy header charset and a meta charset when the header has none", async () => {
    const latin1 = new Uint8Array([60, 104, 116, 109, 108, 62, 60, 98, 111, 100, 121, 62, 99, 97, 102, 233, 60, 47, 98, 111, 100, 121, 62, 60, 47, 104, 116, 109, 108, 62]);
    const metaLatin1 = new Uint8Array([60, 109, 101, 116, 97, 32, 99, 104, 97, 114, 115, 101, 116, 61, 105, 115, 111, 45, 56, 56, 53, 57, 45, 49, 62, 60, 112, 62, 99, 97, 102, 233, 60, 47, 112, 62]);

    const header = await safeFetch(URL, PAGE_POLICY, fakeDeps({ [URL]: { body: latin1, headers: { "content-type": "text/html; charset=iso-8859-1" } } }));
    const meta = await safeFetch(URL, PAGE_POLICY, fakeDeps({ [URL]: { body: metaLatin1 } }));

    expect(header.ok && header.resource.body).toContain("café");
    expect(meta.ok && meta.resource.body).toContain("café");
  });

  it("keeps the byte cap while tolerating a truncated tag and multi-byte character", async () => {
    const prefix = "<html><body><div data-note=\"";
    const bytes = new TextEncoder().encode(`${prefix}${"x".repeat(PAGE_POLICY.maxBytes - prefix.length - 1)}€`);
    const report = await runAudit(URL, fakeDeps({ [URL]: { body: bytes } }), CLOCK);

    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.acquisition.truncated).toBe(true);
    expect(report.acquisition.notes).toContain("The page exceeded 2 MB; only the first 2 MB was analysed.");
  });

  it("records same-origin meta refresh and frame-shell notes without fetching either target", async () => {
    const requests: string[] = [];
    const base = fakeDeps({
      [URL]: { body: '<html><head><meta content="3; url=/next" http-equiv="refresh"></head><body><iframe src="/inside"></iframe></body></html>' },
    });
    const deps: SafeFetchDeps = {
      ...base,
      request: async (url, pinned, signal) => {
        requests.push(url.toString());
        return base.request(url, pinned, signal);
      },
    };

    const report = await runAudit(URL, deps, CLOCK);

    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.acquisition.notes).toContain("Page redirects via meta refresh to https://example.com/next; audit reflects the URL you gave.");
    expect(report.acquisition.notes).toContain("Content lives inside a frame; agents (and this audit) see only the shell.");
    expect(requests).not.toContain("https://example.com/next");
    expect(requests).not.toContain("https://example.com/inside");
  });

  it("accepts BOM, comments, and whitespace before the doctype", async () => {
    const report = await runAudit(URL, fakeDeps({ [URL]: { body: "\uFEFF \n<!-- leading comment -->\n<!doctype html><html><body>ok</body></html>" } }), CLOCK);
    expect(report.ok).toBe(true);
  });
});
