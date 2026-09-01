/**
 * safe-fetch — the ONLY way this app talks to the public internet.
 *
 * Implements docs/INVARIANTS.md safe-fetch invariants:
 *  1. http/https only, no userinfo, ports 80/443          → net-policy.validateUrl
 *  2. DNS: reject if ANY address is non-global             → resolveAllowed (deadline-aware)
 *  3. Pinned lookup on the undici dispatcher (no re-resolve → no rebinding)
 *  4. redirect:"manual"; each hop re-runs 1–3; max hops; no https→http;
 *     optional same-origin lock; optional beforeRedirect hook (robots)
 *  5. Streaming caps: ONE deadline for DNS + every hop + body, decoded bytes,
 *     exact media-type allowlist checked before the body is read
 *  7. No cookies/credentials outbound; browser-like UA
 *  8. Upstream bodies/errors are never surfaced verbatim (callers get codes)
 *
 * All I/O is injectable (`deps`) so the bypass corpus runs without a network.
 */
import { promises as dns } from "node:dns";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";
import type { LookupFunction } from "node:net";
import type { ResourceSnapshot } from "@/lib/audit/contract";
import { allAddressesGlobal, isDowngrade, validateUrl } from "./net-policy";

export interface SafeFetchPolicy {
  /** Whole-chain deadline in ms: DNS + every redirect hop + body. */
  readonly timeoutMs: number;
  /** Cap on DECODED body bytes; body is truncated (not rejected) beyond this. */
  readonly maxBytes: number;
  readonly maxRedirects: number;
  /**
   * Accepted media types. Exact types ("text/html") or a family wildcard
   * ("text/*"). Empty = any. Compared against the parsed, lower-cased type
   * with parameters stripped; malformed tokens never match (review B7).
   */
  readonly allowedContentTypes: readonly string[];
  /** Every redirect hop must stay on the initial origin (sidecar mode, review B6). */
  readonly sameOrigin?: boolean;
}

export const PAGE_POLICY: SafeFetchPolicy = {
  timeoutMs: 10_000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 3,
  allowedContentTypes: ["text/html", "application/xhtml+xml"],
};

export const SIDECAR_POLICY: SafeFetchPolicy = {
  timeoutMs: 4_000,
  maxBytes: 256 * 1024,
  maxRedirects: 2,
  allowedContentTypes: [
    "text/*",
    "application/xml",
    "application/json",
    "application/rss+xml",
    "application/atom+xml",
    "application/feed+json",
    "application/yaml",
    "application/x-yaml",
    "application/vnd.oai.openapi",
    "application/vnd.oai.openapi+json",
  ],
  sameOrigin: true,
};

export type SafeFetchErrorCode =
  | "invalid-url"
  | "blocked-address"
  | "dns-failure"
  | "too-many-redirects"
  | "redirect-downgrade"
  | "redirect-invalid"
  | "redirect-refused"
  | "timeout"
  | "network"
  | "content-type";

export type SafeFetchResult =
  | { ok: true; resource: ResourceSnapshot }
  | { ok: false; code: SafeFetchErrorCode; message: string; hops: number };

export interface SafeFetchDeps {
  /** Resolve a hostname to ALL its addresses. */
  lookupAll: (hostname: string) => Promise<readonly string[]>;
  /** Perform one HTTP request with the given pinned addresses. Never follows redirects. */
  request: (url: URL, pinned: readonly string[], signal: AbortSignal) => Promise<RawResponse>;
  now: () => number;
}

export interface SafeFetchHooks {
  /**
   * Called before a redirect hop is requested. Return ok:false to refuse the
   * hop (result code "redirect-refused"). The orchestrator uses this to check
   * the target origin's robots.txt before the target page is ever fetched
   * (review B2).
   */
  beforeRedirect?: (next: URL, hops: number) => Promise<{ ok: true } | { ok: false; message: string }>;
}

/** Minimal response shape so tests can fake it without undici. */
export interface RawResponse {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

/** Product token (RFC 9309) used for robots matching; the full UA string carries it. */
export const PRODUCT_TOKEN = "AgentReady";
export const USER_AGENT = `Mozilla/5.0 (compatible; ${PRODUCT_TOKEN}/0.1; +https://github.com/fyzycyst/AgentReady)`;

const HEADER_DENYLIST = new Set(["set-cookie", "authorization", "proxy-authorization", "cookie"]);

// ---------- default deps (real network) ----------

async function defaultLookupAll(hostname: string): Promise<readonly string[]> {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

function pinnedDispatcher(pinned: readonly string[]): Dispatcher {
  // undici passes `connect` options through to net/tls.connect, which accept a
  // custom `lookup`. We answer from the already-validated list and never hit
  // DNS again, so the address that was validated is the address we connect to.
  // TLS `servername` is still derived from the hostname (confirmed in review
  // against undici/lib/core/connect.js), so certificate verification is unaffected.
  const lookup: LookupFunction = (_hostname, options, callback) => {
    const wantAll = typeof options === "object" && options !== null && "all" in options && options.all === true;
    const entries = pinned.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    if (wantAll) {
      (callback as unknown as (err: null, entries: { address: string; family: number }[]) => void)(null, entries);
    } else {
      callback(null, entries[0].address, entries[0].family);
    }
  };
  return new Agent({
    connect: { lookup, timeout: 5_000 },
    headersTimeout: 8_000,
    bodyTimeout: 8_000,
    maxHeaderSize: 32 * 1024,
  });
}

async function defaultRequest(url: URL, pinned: readonly string[], signal: AbortSignal): Promise<RawResponse> {
  const dispatcher = pinnedDispatcher(pinned);
  try {
    const res = await undiciFetch(url, {
      method: "GET",
      redirect: "manual",
      dispatcher,
      signal,
      credentials: "omit",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
        "accept-language": "en-US,en;q=0.8",
        "accept-encoding": "gzip, br",
      },
    });
    return { status: res.status, headers: res.headers as unknown as Headers, body: res.body as ReadableStream<Uint8Array> | null };
  } finally {
    // Close idle sockets once the body has been consumed; undici keeps the
    // connection alive for the body read, so defer.
    setTimeout(() => void dispatcher.close().catch(() => {}), 15_000).unref();
  }
}

export const defaultDeps: SafeFetchDeps = {
  lookupAll: defaultLookupAll,
  request: defaultRequest,
  now: () => Date.now(),
};

// ---------- core ----------

class DeadlineError extends Error {
  constructor() {
    super("deadline");
    this.name = "AbortError";
  }
}

/** Our abort, or undici's own headers/body/connect timeouts (which surface with UND_ERR_* codes, not AbortError). */
function isTimeoutError(err: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  const code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
  return code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT";
}

/** Race any promise against the chain deadline (review B1: DNS was outside it). Late results are discarded. */
function withDeadline<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DeadlineError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DeadlineError());
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Resolve and validate a host. Returns the pinned address list or an error.
 * IP literals skip DNS but are still classified (validateUrl already did).
 */
async function resolveAllowed(
  url: URL,
  hostIsIpLiteral: boolean,
  deps: SafeFetchDeps,
  signal: AbortSignal,
): Promise<{ ok: true; addresses: readonly string[] } | { ok: false; code: SafeFetchErrorCode; message: string }> {
  if (hostIsIpLiteral) {
    const bare = url.hostname.replace(/^\[|\]$/g, "");
    return { ok: true, addresses: [bare] };
  }
  let addresses: readonly string[];
  try {
    addresses = await withDeadline(deps.lookupAll(url.hostname), signal);
  } catch (err) {
    if (isTimeoutError(err, signal)) return { ok: false, code: "timeout", message: "The site's address did not resolve in time." };
    return { ok: false, code: "dns-failure", message: "Host could not be resolved." };
  }
  if (!allAddressesGlobal(addresses)) {
    return { ok: false, code: "blocked-address", message: "Host resolves to a non-public address." };
  }
  return { ok: true, addresses };
}

const MEDIA_TYPE_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

export interface ParsedMediaType {
  readonly mime: string;
  /** Untrusted charset label, normalized but not validated against TextDecoder. */
  readonly charset: string | null;
}

/** Parse a Content-Type header into its normalised media type and charset, or null if malformed. */
export function parseMediaType(ct: string | null): ParsedMediaType | null {
  if (!ct) return null;
  const [rawMime, ...params] = ct.split(";");
  const mime = rawMime.trim().toLowerCase();
  if (!MEDIA_TYPE_RE.test(mime)) return null;
  const charsetParam = params.find((param) => /^\s*charset\s*=/i.test(param));
  const rawCharset = charsetParam?.replace(/^\s*charset\s*=\s*/i, "").trim();
  const charset = rawCharset?.replace(/^['"]|['"]$/g, "").trim().toLowerCase() || null;
  return { mime, charset };
}

/** Exact type or family wildcard ("text/*") match; malformed types never pass. */
export function contentTypeAllowed(ct: string | null, policy: SafeFetchPolicy): boolean {
  if (policy.allowedContentTypes.length === 0) return true;
  const mediaType = parseMediaType(ct);
  if (!mediaType) return false;
  const family = mediaType.mime.split("/")[0];
  return policy.allowedContentTypes.some((rule) => (rule.endsWith("/*") ? rule.slice(0, -2) === family : rule === mediaType.mime));
}

function metaCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder("latin1", { fatal: false }).decode(bytes.subarray(0, 1024));
  const match = /<meta\b[^>]*\bcharset\s*=\s*(?:["']([^"']+)["']|([^\s/>]+))/i.exec(head);
  return (match?.[1] ?? match?.[2] ?? "").trim().toLowerCase() || null;
}

function decode(bytes: Uint8Array, charset: string | null): string {
  try {
    return new TextDecoder(charset ?? "utf-8", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal: AbortSignal,
  headerCharset: string | null,
): Promise<{ text: string; truncated: boolean }> {
  if (!body) return { text: "", truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  try {
    while (true) {
      if (signal.aborted) throw new DeadlineError();
      const { done, value } = await withDeadline(reader.read(), signal);
      if (done) break;
      if (!value) continue;
      if (received + value.byteLength > maxBytes) {
        chunks.push(value.subarray(0, maxBytes - received));
        received = maxBytes;
        truncated = true;
        break;
      }
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    if (truncated || signal.aborted) await reader.cancel().catch(() => {});
    else reader.releaseLock();
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return { text: decode(merged, headerCharset ?? metaCharset(merged)), truncated };
}

function captureHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    const k = key.toLowerCase();
    if (HEADER_DENYLIST.has(k)) return;
    out[k] = value.length > 2048 ? value.slice(0, 2048) : value;
  });
  return out;
}

/**
 * Fetch a URL under the policy. Follows redirects manually, re-validating
 * every hop. Never throws for upstream conditions — returns a result union.
 */
export async function safeFetch(
  input: string,
  policy: SafeFetchPolicy,
  deps: SafeFetchDeps = defaultDeps,
  hooks: SafeFetchHooks = {},
): Promise<SafeFetchResult> {
  const started = deps.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  const signal = controller.signal;

  try {
    let hops = 0;
    let current = validateUrl(input);
    if (!current.ok) return { ok: false, code: "invalid-url", message: current.message, hops };
    const requestedUrl = current.url.toString();
    const lockedOrigin = policy.sameOrigin ? current.url.origin : null;

    while (true) {
      const resolved = await resolveAllowed(current.url, current.hostIsIpLiteral, deps, signal);
      if (!resolved.ok) return { ok: false, code: resolved.code, message: resolved.message, hops };

      let res: RawResponse;
      try {
        res = await withDeadline(deps.request(current.url, resolved.addresses, signal), signal);
      } catch (err) {
        if (isTimeoutError(err, signal)) {
          return { ok: false, code: "timeout", message: "The site did not respond in time.", hops };
        }
        return { ok: false, code: "network", message: "Could not connect to the site.", hops };
      }

      if (REDIRECT_STATUSES.has(res.status)) {
        await res.body?.cancel().catch(() => {});
        const location = res.headers.get("location");
        if (!location) return { ok: false, code: "redirect-invalid", message: "Redirect without a Location header.", hops };
        if (hops >= policy.maxRedirects) {
          return { ok: false, code: "too-many-redirects", message: "Too many redirects.", hops };
        }
        let nextRaw: string;
        try {
          nextRaw = new URL(location, current.url).toString();
        } catch {
          return { ok: false, code: "redirect-invalid", message: "Redirect target is not a valid URL.", hops };
        }
        const next = validateUrl(nextRaw);
        if (!next.ok) return { ok: false, code: "redirect-invalid", message: `Redirect rejected: ${next.message}`, hops };
        if (isDowngrade(current.url, next.url)) {
          return { ok: false, code: "redirect-downgrade", message: "Redirect from https to http is not followed.", hops };
        }
        if (lockedOrigin && next.url.origin !== lockedOrigin) {
          return { ok: false, code: "redirect-invalid", message: "Redirect left the site's origin.", hops };
        }
        if (hooks.beforeRedirect) {
          let verdict: { ok: true } | { ok: false; message: string };
          try {
            verdict = await withDeadline(hooks.beforeRedirect(next.url, hops + 1), signal);
          } catch (err) {
            if (isTimeoutError(err, signal)) return { ok: false, code: "timeout", message: "The site did not respond in time.", hops };
            verdict = { ok: false, message: "Redirect could not be checked." };
          }
          if (!verdict.ok) return { ok: false, code: "redirect-refused", message: verdict.message, hops };
        }
        hops += 1;
        current = next;
        continue;
      }

      const ct = res.headers.get("content-type");
      if (!contentTypeAllowed(ct, policy)) {
        await res.body?.cancel().catch(() => {});
        const shown = parseMediaType(ct);
        return { ok: false, code: "content-type", message: `Unsupported content type${shown ? ` (${shown.mime})` : ""}.`, hops };
      }

      let bodyRead: { text: string; truncated: boolean };
      try {
        bodyRead = await readBounded(res.body, policy.maxBytes, signal, parseMediaType(ct)?.charset ?? null);
      } catch (err) {
        if (isTimeoutError(err, signal)) {
          return { ok: false, code: "timeout", message: "The site took too long to send its content.", hops };
        }
        return { ok: false, code: "network", message: "Connection dropped while reading.", hops };
      }

      return {
        ok: true,
        resource: {
          requestedUrl,
          finalUrl: current.url.toString(),
          status: res.status,
          headers: captureHeaders(res.headers),
          body: bodyRead.text,
          truncated: bodyRead.truncated,
          durationMs: deps.now() - started,
        },
      };
    }
  } finally {
    clearTimeout(timer);
  }
}
