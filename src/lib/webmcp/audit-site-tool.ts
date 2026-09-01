/**
 * `audit_site` — the WebMCP tool AgentReady exposes on its own landing page.
 * An agent that lands on `/` can run an audit instead of driving the form.
 *
 * This module is the small, client-safe half: what the tool *is*, and how a
 * React component binds its lifetime to the landing page. The registration
 * script itself lives in `./audit-site-tool-script`, which only the server
 * component that emits it imports — the script source has no business in the
 * client bundle.
 *
 * API shape per phase3/webmcp-facts:
 *   - `document.modelContext` is canonical; `navigator.modelContext` is a
 *     deprecated alias and is never used here.
 *   - `execute()` resolves to a plain JSON-serializable value — the UA
 *     JSON-stringifies it. It is NOT an MCP `{ content: [...] }` envelope.
 *   - There is no `unregisterTool()`: unregistering means aborting the
 *     `AbortSignal` passed to `registerTool`.
 *   - Tool `name`: 1–128 chars, `[A-Za-z0-9_.-]`.
 */

/**
 * The tool descriptor, minus `execute`. Kept as typed data so the schema the
 * agent sees, the form's declarative attributes and the tests all read the
 * same object.
 */
export const AUDIT_SITE_TOOL = {
  name: "audit_site",
  title: "Audit a site for agent-readiness",
  description:
    "Audit a public web page for agent-readiness and return its 0–100 score, letter grade, coverage and highest-priority finding.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Public URL of the page to audit, e.g. https://example.com/ (a bare hostname is accepted).",
      },
    },
    required: ["url"],
  },
  annotations: { readOnlyHint: true },
} as const;

/**
 * The single global the inline script publishes, so the React tree can own the
 * tool's lifetime without re-implementing the registration.
 */
export const AUDIT_TOOL_GLOBAL = "__agentReadyAuditTool";

export interface AuditSiteToolHandle {
  /** Register (idempotent), and mark the landing page as the current page. */
  register(): void;
  /** Abort the registration signal and stay unregistered until `register()`. */
  unregister(): void;
}

declare global {
  interface Window {
    __agentReadyAuditTool?: AuditSiteToolHandle;
  }
}

/**
 * `useEffect` body for the landing page: a tool declared by `/` must be gone
 * the moment the user is no longer on `/`.
 *
 * The inline script registers before hydration, which is what makes the tool
 * visible in the served HTML — but it runs once per document, so it cannot see
 * a client-side navigation. `router.push()` to `/report` never fires
 * `pagehide`, so without this the tool would stay registered on pages that do
 * not declare it. Mount registers (covering an SPA return to `/`, where the
 * inline script does not re-execute); unmount aborts.
 *
 * Written as a standalone function rather than inline in the component so the
 * leave-and-return sequence is testable without a DOM renderer.
 */
export function bindAuditToolLifecycle(): () => void {
  if (typeof window === "undefined") return () => {};
  const handle = window[AUDIT_TOOL_GLOBAL];
  handle?.register();
  return () => handle?.unregister();
}
