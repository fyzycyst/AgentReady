/**
 * The one place the WebMCP polyfill is pinned.
 *
 * Verified 2026-09-01 (phase3/webmcp-facts §3): `@mcp-b/webmcp-polyfill@5.1.0`
 * is the current release and installs `document.modelContext`. We are loading
 * third-party code from a CDN, so the exact version is pinned in the URL and
 * the bytes are pinned by Subresource Integrity. **Bumping the version REQUIRES
 * recomputing the hash** — the same constraint the generated snippet carries in
 * `src/lib/audit/snippets/webmcp-stub.ts`.
 *
 *   curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A
 */
export const POLYFILL_URL = "https://unpkg.com/@mcp-b/webmcp-polyfill@5.1.0/dist/index.iife.js";
export const POLYFILL_INTEGRITY = "sha384-ZLqD1afbu2b2LJVDDqBf95wR/DGWh5FT1bx6E2S+4uMPdMOc8QGIIfw2gBWLKIB2";

/**
 * Element id of the polyfill `<script>`. An inline registration that runs
 * before the polyfill has finished loading listens for this element's `load`
 * event instead of polling for `document.modelContext`.
 */
export const POLYFILL_SCRIPT_ID = "webmcp-polyfill";
