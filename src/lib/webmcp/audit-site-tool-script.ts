/**
 * Source of the inline `audit_site` registration script.
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
 * Ownership of *when* the tool exists is split deliberately:
 *   - this script registers on first paint and unregisters on `pagehide`
 *     (full document unload, and re-registers on bfcache restore);
 *   - the landing page's `AuditToolLifecycle` component owns same-document
 *     navigation via {@link bindAuditToolLifecycle}, through the
 *     `window.__agentReadyAuditTool` handle published at the bottom of this
 *     script. `pagehide` alone cannot see a `router.push()`.
 *
 * The body is ES5-flavoured JavaScript with `async` functions: it is served
 * verbatim to the browser, so it never goes through the TypeScript or bundler
 * pipeline. Keep it small and dependency-free; `tests/app/audit-site-tool.test.ts`
 * evaluates this exact string.
 */
import { SEVERITY_RANK } from "@/components/report/prioritise";
import { WEIGHTS } from "@/lib/audit/weights";
import { AUDIT_SITE_TOOL, AUDIT_TOOL_GLOBAL } from "./audit-site-tool";
import { POLYFILL_SCRIPT_ID } from "./polyfill";

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

export const AUDIT_SITE_TOOL_SCRIPT = `(function () {
  var TOOL = ${jsonForScript(AUDIT_SITE_TOOL)};
  var RANK = ${jsonForScript(RANKING)};
  var GENERIC_ERROR = "The audit could not be completed.";
  // No unregisterTool() exists: aborting this signal is how the tool goes away.
  var controller = null;
  // False while the user is on another route; the polyfill's late load must not
  // resurrect the tool then.
  var active = true;

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
    var report;
    try {
      var response = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url }),
        signal: options ? options.signal : undefined
      });
      report = await response.json();
    } catch (err) {
      // Cancellation is the agent's own doing: let it propagate as a rejection
      // rather than reporting it as an audit failure.
      if (err && (err.name === "AbortError" || err.name === "TimeoutError")) throw err;
      // Anything else (dropped request, proxy HTML error page, malformed JSON)
      // becomes the documented compact error, with no transport detail.
      return { error: GENERIC_ERROR, url: url };
    }
    if (!report || report.ok !== true) {
      return { error: (report && report.message) || GENERIC_ERROR, url: url };
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

  function attempt() {
    if (!active || controller !== null) return;
    // document.modelContext, never the deprecated navigator.modelContext alias.
    if (!document.modelContext || typeof document.modelContext.registerTool !== "function") return;
    var ac = new AbortController();
    controller = ac;
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
          { signal: ac.signal }
        )
      ).catch(function () {
        if (controller === ac) controller = null;
      });
    } catch (err) {
      if (controller === ac) controller = null;
    }
  }

  function register() {
    active = true;
    attempt();
  }

  function unregister() {
    active = false;
    if (controller !== null) {
      controller.abort();
      controller = null;
    }
  }

  // Either order works: register now if the polyfill (or a browser that ships
  // WebMCP) is already there, otherwise when the polyfill script finishes.
  attempt();
  var polyfill = document.getElementById(${jsonForScript(POLYFILL_SCRIPT_ID)});
  if (polyfill) polyfill.addEventListener("load", attempt);

  // Document-level lifetime. Same-document navigation is the React component's
  // job — pagehide does not fire for it.
  window.addEventListener("pagehide", unregister);
  window.addEventListener("pageshow", function (event) {
    if (event && event.persisted) register();
  });

  window[${jsonForScript(AUDIT_TOOL_GLOBAL)}] = { register: register, unregister: unregister };
})();`;
