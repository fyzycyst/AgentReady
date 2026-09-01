/**
 * `audit_site` — the WebMCP tool AgentReady exposes on its own landing page.
 * An agent that lands on `/` can run an audit instead of driving the form.
 *
 * **Why this ships as an inline `<script>` and not as bundled React.**
 * Our own `webmcp-capability` check reads served HTML only, and says so in its
 * own finding: *"a tool registered from a JavaScript bundle would be invisible
 * to us"*. The remediation we hand every audited site is an inline
 * `document.modelContext.registerTool({…})` block. Dogfooding means taking our
 * own advice: the registration is in the HTML an agent (or our auditor) can
 * actually read, and it works before — or without — React hydration.
 * `/demo` keeps the React/`useEffect` variant on purpose, so both patterns are
 * demonstrated somewhere in the product.
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
import { SEVERITY_RANK } from "@/components/report/prioritise";
import { WEIGHTS } from "@/lib/audit/weights";
import { POLYFILL_SCRIPT_ID } from "./polyfill";

/**
 * The tool descriptor, minus `execute`. Kept as typed data so the schema the
 * agent sees, the OpenAPI document and the tests all read the same object.
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
 * Serialize a value for embedding in an inline `<script>`.
 *
 * `<`, `>` and `&` can only occur inside string literals in serialized JSON, so
 * Unicode-escaping them cannot change the value — it only guarantees the result
 * cannot close the element it is embedded in. U+2028/U+2029 are legal in JSON
 * strings and illegal in JS ones. (Same rule as `escapeForScript` in
 * `src/lib/audit/snippets/webmcp-stub.ts`, which applies it to page-derived
 * data; everything embedded here is our own constant.)
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Ranking data for `topFinding`, taken from the same tables the report UI uses
 * (`prioritise.ts`, `weights.ts`) so the tool and the page agree on what "the
 * top finding" is: severity rank × category weight.
 */
const RANKING = { severity: SEVERITY_RANK, weight: WEIGHTS };

/**
 * Source of the inline registration script.
 *
 * Written in ES5-flavoured JavaScript with two `async` functions: it is served
 * verbatim to the browser, so it never goes through the TypeScript or bundler
 * pipeline. Keep it small and dependency-free.
 */
export const AUDIT_SITE_TOOL_SCRIPT = `(function () {
  var TOOL = ${jsonForScript(AUDIT_SITE_TOOL)};
  var RANK = ${jsonForScript(RANKING)};
  // No unregisterTool() exists: aborting this signal is how the tool goes away.
  var controller = new AbortController();
  var registered = false;

  /** Highest severity x category weight, matching the report's "Do this first". */
  function topFinding(report) {
    var best = null;
    var results = report.results || [];
    for (var i = 0; i < results.length; i++) {
      var findings = results[i].findings || [];
      for (var j = 0; j < findings.length; j++) {
        var f = findings[j];
        if (f.positive === true) continue;
        if (/\\.unobserved$/.test(f.id)) continue;
        var priority = (RANK.severity[f.severity] || 0) * (RANK.weight[results[i].category] || 0);
        if (best === null || priority > best.priority) {
          best = { priority: priority, id: f.id, severity: f.severity, title: f.title };
        }
      }
    }
    return best === null ? null : { id: best.id, severity: best.severity, title: best.title };
  }

  async function execute(input, options) {
    var url = input && input.url != null ? String(input.url) : "";
    var response = await fetch("/api/audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: url }),
      signal: options ? options.signal : undefined
    });
    var report = await response.json();
    if (!report || report.ok !== true) {
      return { error: (report && report.message) || "The audit could not be completed.", url: url };
    }
    // Plain JSON-serializable value — the browser stringifies it. Not an MCP envelope.
    return {
      url: report.finalUrl,
      overall: report.score.overall,
      grade: report.score.grade,
      coverage: report.score.coverage,
      topFinding: topFinding(report)
    };
  }

  function register() {
    if (registered || controller.signal.aborted) return;
    // document.modelContext, never the deprecated navigator.modelContext alias.
    if (!document.modelContext || typeof document.modelContext.registerTool !== "function") return;
    registered = true;
    try {
      Promise.resolve(
        document.modelContext.registerTool(
          {
            name: TOOL.name,
            title: TOOL.title,
            description: TOOL.description,
            inputSchema: TOOL.inputSchema,
            annotations: TOOL.annotations,
            execute: execute
          },
          { signal: controller.signal }
        )
      ).catch(function () {
        registered = false;
      });
    } catch {
      registered = false;
    }
  }

  // Either order works: register now if the polyfill (or a browser that ships
  // WebMCP) is already there, otherwise when the polyfill script finishes.
  register();
  var polyfill = document.getElementById(${jsonForScript(POLYFILL_SCRIPT_ID)});
  if (polyfill) polyfill.addEventListener("load", register);
  window.addEventListener("pagehide", function () {
    controller.abort();
  });
})();`;
