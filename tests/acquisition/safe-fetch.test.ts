/**
 * SSRF bypass corpus for safe-fetch (invariants 2–5, 7, 8).
 * Runs with a fake resolver + fake transport; no network.
 */
import { describe, expect, it } from "vitest";
import {
  PAGE_POLICY,
  SIDECAR_POLICY,
  safeFetch,
  type RawResponse,
  type SafeFetchDeps,
  type SafeFetchPolicy,
} from "@/lib/acquisition/safe-fetch";

type Route = {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array | (() => ReadableStream<Uint8Array>);
  delayMs?: number;
};

interface FakeNet {
  dns: Record<string, string[] | Error>;
  routes: Record<string, Route>;
  log: { url: string; pinned: readonly string[] }[];
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i < chunks.length) c.enqueue(chunks[i++]);
      else c.close();
    },
  });
}

function makeDeps(net: FakeNet): SafeFetchDeps {
  let clock = 1_000;
  return {
    now: () => clock++,
    lookupAll: async (host) => {
      const r = net.dns[host];
      if (r === undefined) throw new Error("ENOTFOUND");
      if (r instanceof Error) throw r;
      return r;
    },
    request: async (url, pinned, signal): Promise<RawResponse> => {
      net.log.push({ url: url.toString(), pinned });
      const route = net.routes[url.toString()] ?? net.routes[url.origin + url.pathname];
      if (!route) throw new Error("ECONNREFUSED");
      if (route.delayMs) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, route.delayMs);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }
      const headers = new Headers(route.headers ?? { "content-type": "text/html; charset=utf-8" });
      let body: ReadableStream<Uint8Array> | null;
      if (typeof route.body === "function") body = route.body();
      else if (route.body instanceof Uint8Array) body = streamOf([route.body]);
      else body = streamOf([new TextEncoder().encode(route.body ?? "")]);
      return { status: route.status ?? 200, headers, body };
    },
  };
}

const PUBLIC = ["93.184.216.34"];

describe("safeFetch happy path", () => {
  it("returns a ResourceSnapshot with lower-cased, denylisted headers", async () => {
    const net: FakeNet = {
      dns: { "example.com": PUBLIC },
      routes: {
        "https://example.com/": {
          body: "<html><body>hi</body></html>",
          headers: {
            "Content-Type": "text/html",
            "Set-Cookie": "a=b",
            "X-Robots-Tag": "noai",
          },
        },
      },
      log: [],
    };
    const r = await safeFetch("https://example.com", PAGE_POLICY, makeDeps(net));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resource.status).toBe(200);
    expect(r.resource.body).toContain("hi");
    expect(r.resource.headers["x-robots-tag"]).toBe("noai");
    expect(r.resource.headers["set-cookie"]).toBeUndefined();
    expect(r.resource.truncated).toBe(false);
    expect(net.log[0].pinned).toEqual(PUBLIC);
  });
});

describe("DNS policy (invariant 2)", () => {
  it("rejects when ANY resolved address is private (multi-answer trick)", async () => {
    const net: FakeNet = {
      dns: { "evil.example": ["93.184.216.34", "10.0.0.5"] },
      routes: { "https://evil.example/": { body: "x" } },
      log: [],
    };
    const r = await safeFetch("https://evil.example", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "blocked-address" });
    expect(net.log).toHaveLength(0);
  });

  it("rejects DNS names that resolve to metadata IPs (nip.io style)", async () => {
    const net: FakeNet = {
      dns: { "169-254-169-254.nip.io": ["169.254.169.254"] },
      routes: {},
      log: [],
    };
    const r = await safeFetch("https://169-254-169-254.nip.io/", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "blocked-address" });
  });

  it("rejects IPv4-mapped IPv6 answers", async () => {
    const net: FakeNet = { dns: { "evil.example": ["::ffff:169.254.169.254"] }, routes: {}, log: [] };
    const r = await safeFetch("https://evil.example", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "blocked-address" });
  });

  it("reports unresolvable hosts as dns-failure", async () => {
    const net: FakeNet = { dns: {}, routes: {}, log: [] };
    const r = await safeFetch("https://nx.example", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "dns-failure" });
  });

  it("rejects empty resolution", async () => {
    const net: FakeNet = { dns: { "empty.example": [] }, routes: {}, log: [] };
    const r = await safeFetch("https://empty.example", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "blocked-address" });
  });
});

describe("pinning (invariant 3)", () => {
  it("passes the validated addresses to the transport (so no second resolve can rebind)", async () => {
    const net: FakeNet = {
      dns: { "example.com": ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"] },
      routes: { "https://example.com/": { body: "x" } },
      log: [],
    };
    await safeFetch("https://example.com", PAGE_POLICY, makeDeps(net));
    expect(net.log[0].pinned).toEqual(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"]);
  });
});

describe("redirects (invariant 4)", () => {
  it("follows a safe redirect and reports finalUrl", async () => {
    const net: FakeNet = {
      dns: { "example.com": PUBLIC, "www.example.com": PUBLIC },
      routes: {
        "https://example.com/": { status: 301, headers: { location: "https://www.example.com/home" } },
        "https://www.example.com/home": { body: "final" },
      },
      log: [],
    };
    const r = await safeFetch("https://example.com", PAGE_POLICY, makeDeps(net));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resource.finalUrl).toBe("https://www.example.com/home");
      expect(r.resource.requestedUrl).toBe("https://example.com/");
    }
  });

  it("re-validates a redirect to an IP-literal metadata address (undici auto-follow would skip DNS here)", async () => {
    const net: FakeNet = {
      dns: { "example.com": PUBLIC },
      routes: {
        "https://example.com/": { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } },
      },
      log: [],
    };
    const r = await safeFetch("https://example.com", PAGE_POLICY, makeDeps(net));
    expect(r.ok).toBe(false);
    expect(net.log).toHaveLength(1);
  });

  it("re-resolves and rejects a redirect to a hostname that maps to a private IP", async () => {
    const net: FakeNet = {
      dns: { "example.com": PUBLIC, "internal.example": ["10.1.1.1"] },
      routes: {
        "https://example.com/": { status: 307, headers: { location: "https://internal.example/" } },
      },
      log: [],
    };
    const r = await safeFetch("https://example.com", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "blocked-address" });
    expect(net.log).toHaveLength(1);
  });

  it("rejects https→http downgrade", async () => {
    const net: FakeNet = {
      dns: { "example.com": PUBLIC },
      routes: { "https://example.com/": { status: 302, headers: { location: "http://example.com/" } } },
      log: [],
    };
    const r = await safeFetch("https://example.com", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "redirect-downgrade" });
  });

  it("rejects redirect to non-http scheme", async () => {
    const net: FakeNet = {
      dns: { "example.com": PUBLIC },
      routes: { "https://example.com/": { status: 302, headers: { location: "file:///etc/passwd" } } },
      log: [],
    };
    const r = await safeFetch("https://example.com", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "redirect-invalid" });
  });

  it("rejects redirect with credentials or bad port", async () => {
    const net: FakeNet = {
      dns: { "example.com": PUBLIC },
      routes: { "https://example.com/": { status: 302, headers: { location: "https://a:b@example.com:8443/" } } },
      log: [],
    };
    const r = await safeFetch("https://example.com", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "redirect-invalid" });
  });

  it("caps redirect hops", async () => {
    const routes: Record<string, Route> = {};
    for (let i = 0; i < 6; i++) {
      routes[`https://example.com/${i}`] = { status: 302, headers: { location: `https://example.com/${i + 1}` } };
    }
    const net: FakeNet = { dns: { "example.com": PUBLIC }, routes, log: [] };
    const r = await safeFetch("https://example.com/0", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "too-many-redirects", hops: PAGE_POLICY.maxRedirects });
  });

  it("resolves relative Location headers against the current URL", async () => {
    const net: FakeNet = {
      dns: { "example.com": PUBLIC },
      routes: {
        "https://example.com/a": { status: 302, headers: { location: "/b" } },
        "https://example.com/b": { body: "b" },
      },
      log: [],
    };
    const r = await safeFetch("https://example.com/a", PAGE_POLICY, makeDeps(net));
    expect(r.ok && r.resource.finalUrl).toBe("https://example.com/b");
  });
});

describe("size, time and content-type caps (invariant 5)", () => {
  it("truncates bodies over maxBytes and flags it", async () => {
    const policy: SafeFetchPolicy = { ...PAGE_POLICY, maxBytes: 10 };
    const net: FakeNet = {
      dns: { "example.com": PUBLIC },
      routes: {
        "https://example.com/": {
          body: () => streamOf([new TextEncoder().encode("0123456"), new TextEncoder().encode("789ABCDEF")]),
        },
      },
      log: [],
    };
    const r = await safeFetch("https://example.com", policy, makeDeps(net));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resource.body).toBe("0123456789");
      expect(r.resource.truncated).toBe(true);
    }
  });

  it("stops reading an infinite stream", async () => {
    const policy: SafeFetchPolicy = { ...PAGE_POLICY, maxBytes: 1024 };
    const net: FakeNet = {
      dns: { "example.com": PUBLIC },
      routes: {
        "https://example.com/": {
          body: () =>
            new ReadableStream({
              pull(c) {
                c.enqueue(new Uint8Array(100));
              },
            }),
        },
      },
      log: [],
    };
    const r = await safeFetch("https://example.com", policy, makeDeps(net));
    expect(r.ok && r.resource.truncated).toBe(true);
    expect(r.ok && r.resource.body.length).toBe(1024);
  });

  it("times out slow responses", async () => {
    const policy: SafeFetchPolicy = { ...PAGE_POLICY, timeoutMs: 50 };
    const net: FakeNet = {
      dns: { "example.com": PUBLIC },
      routes: { "https://example.com/": { body: "x", delayMs: 500 } },
      log: [],
    };
    const r = await safeFetch("https://example.com", policy, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "timeout" });
  });

  it("rejects disallowed content types without reading the body", async () => {
    const net: FakeNet = {
      dns: { "example.com": PUBLIC },
      routes: { "https://example.com/big.zip": { body: "PK...", headers: { "content-type": "application/zip" } } },
      log: [],
    };
    const r = await safeFetch("https://example.com/big.zip", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "content-type" });
  });

  it("sidecar policy accepts text/plain and application/json", async () => {
    const net: FakeNet = {
      dns: { "example.com": PUBLIC },
      routes: {
        "https://example.com/robots.txt": { body: "User-agent: *", headers: { "content-type": "text/plain" } },
        "https://example.com/x.json": { body: "{}", headers: { "content-type": "application/json" } },
      },
      log: [],
    };
    expect((await safeFetch("https://example.com/robots.txt", SIDECAR_POLICY, makeDeps(net))).ok).toBe(true);
    expect((await safeFetch("https://example.com/x.json", SIDECAR_POLICY, makeDeps(net))).ok).toBe(true);
  });
});

describe("error hygiene (invariant 8)", () => {
  it("never surfaces transport error text", async () => {
    const net: FakeNet = { dns: { "example.com": PUBLIC }, routes: {}, log: [] };
    const r = await safeFetch("https://example.com", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "network" });
    if (!r.ok) expect(r.message).not.toContain("ECONNREFUSED");
  });

  it("rejects invalid input before any network activity", async () => {
    const net: FakeNet = { dns: {}, routes: {}, log: [] };
    const r = await safeFetch("ftp://example.com", PAGE_POLICY, makeDeps(net));
    expect(r).toMatchObject({ ok: false, code: "invalid-url" });
    expect(net.log).toHaveLength(0);
  });
});
