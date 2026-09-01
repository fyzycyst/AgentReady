/**
 * WebMCP capability (Act, "superpower" layer): does this page expose tools an
 * agent can call, instead of a form an agent has to guess its way through?
 *
 * Points (100):
 *   Declarative tools on forms ................... 60
 *     + all/most controls described ..............  10
 *   Imperative registerTool referenced ........... 25
 *     + inputSchema in the same script ...........   5
 *   (declarative + imperative capped at ............ 90)
 *   Polyfill loaded ..............................  5
 *   Origin trial token ...........................  5
 *
 * Detection is raw-HTML only. An imperative registration is *referenced*, never
 * executed — we cannot know a bundle registered a tool without running the
 * page, which is why the "nothing found" verdict carries medium confidence and
 * says so out loud.
 *
 * Zero is the expected result for nearly every site today. The finding is
 * therefore written as the opportunity it is, and carries a stub generated
 * from the page's own form (snippets/webmcp-stub.ts).
 */
import type {
  AuditCheck,
  AuditContext,
  CheckResult,
  ElementView,
  Evidence,
  Finding,
  HtmlQuery,
} from "../contract";
import { excerpt } from "../contract";
import {
  DOCS_DECLARATIVE_API,
  DOCS_IMPERATIVE_API,
  DOCS_OVERVIEW,
  POLYFILL_SCRIPT_TAG,
  controlSnippetLine,
  correctedFormTag,
  generateWebMcpStub,
  genericStubSnippets,
  toolParamControls,
} from "../snippets/webmcp-stub";

const REGISTER_TOOL = /\b(?:document|navigator)\.modelContext\.registerTool\s*\(/;
const REGISTER_TOOL_MODERN = /\bdocument\.modelContext\.registerTool\s*\(/;
const POLYFILL_SRC = /webmcp-polyfill|@mcp-b\/(?:webmcp-polyfill|global)/i;

/** An empty `tools=()` allowlist turns the API off. `tools=(self)` must not match. */
const TOOLS_DISABLED_DIRECTIVE = /^\s*tools\s*=\s*\(\s*\)\s*$/;

function toolsDisabledByPolicy(headers: Readonly<Record<string, string>>): boolean {
  const raw = headers["permissions-policy"];
  if (!raw) return false;
  // Permissions-Policy is a comma-separated list of `feature=(allowlist)`;
  // the allowlist itself is space-separated, so splitting on commas is safe.
  return raw.split(",").some((directive) => TOOLS_DISABLED_DIRECTIVE.test(directive));
}

function attrValue(el: ElementView, name: string): string {
  return el.attr(name)?.trim() ?? "";
}

interface DeclarativeForms {
  readonly valid: readonly ElementView[];
  readonly incomplete: readonly ElementView[];
}

function declarativeForms(dom: HtmlQuery): DeclarativeForms {
  const valid: ElementView[] = [];
  const incomplete: ElementView[] = [];
  for (const form of dom.all("form")) {
    const name = attrValue(form, "toolname");
    const description = attrValue(form, "tooldescription");
    if (name && description) valid.push(form);
    else if (name || description) incomplete.push(form);
  }
  return { valid, incomplete };
}

interface ImperativeSignals {
  readonly referenced: boolean;
  readonly hasSchema: boolean;
  readonly legacyOnly: boolean;
  readonly excerpt: string;
}

function imperativeSignals(dom: HtmlQuery): ImperativeSignals {
  let referenced = false;
  let hasSchema = false;
  let modern = false;
  let snippet = "";
  for (const script of dom.all("script")) {
    if (script.attr("src") !== undefined) continue; // inline scripts only
    const text = script.text();
    if (!REGISTER_TOOL.test(text)) continue;
    referenced = true;
    if (text.includes("inputSchema")) hasSchema = true;
    if (REGISTER_TOOL_MODERN.test(text)) modern = true;
    if (!snippet) snippet = excerpt(text);
  }
  return { referenced, hasSchema, legacyOnly: referenced && !modern, excerpt: snippet };
}

function originTrialPresent(dom: HtmlQuery, headers: Readonly<Record<string, string>>): boolean {
  if (headers["origin-trial"] !== undefined) return true;
  return dom.all("meta").some((m) => attrValue(m, "http-equiv").toLowerCase() === "origin-trial");
}

function summaryFor(score: number, policyDisabled: boolean): string {
  if (policyDisabled) return "WebMCP is switched off by this site's Permissions-Policy.";
  if (score >= 60) return "This site already exposes tools agents can call.";
  if (score > 0) return "Partial WebMCP support — the tools aren't fully declared yet.";
  return "No WebMCP tools — the single biggest upgrade available here.";
}

export const webmcpCapabilityCheck: AuditCheck = {
  id: "webmcp-capability",
  version: 1,
  category: "webmcp-capability",
  run(ctx: AuditContext): CheckResult {
    const dom = ctx.page.raw.dom;
    const headers = ctx.page.headers;
    const findings: Finding[] = [];

    const { valid, incomplete } = declarativeForms(dom);
    const imperative = imperativeSignals(dom);
    const polyfills = dom.all("script[src]").filter((s) => POLYFILL_SRC.test(attrValue(s, "src")));
    const originTrial = originTrialPresent(dom, headers);
    const policyDisabled = toolsDisabledByPolicy(headers);
    const originClusterOff = (headers["origin-agent-cluster"] ?? "").trim() === "?0";

    // ---- Declarative (60 + 10)
    let declarativePoints = 0;
    const describedControls: ElementView[] = [];
    const undescribedControls: ElementView[] = [];
    if (valid.length > 0) {
      declarativePoints = 60;
      for (const form of valid) {
        for (const control of toolParamControls(form)) {
          if (attrValue(control, "toolparamdescription")) describedControls.push(control);
          else undescribedControls.push(control);
        }
      }
      const total = describedControls.length + undescribedControls.length;
      if (total > 0 && describedControls.length / total >= 0.5) declarativePoints += 10;

      findings.push({
        id: "webmcp.declarative.present",
        severity: "info",
        positive: true,
        title: `${valid.length} WebMCP tool${valid.length > 1 ? "s" : ""} declared on forms`,
        detail:
          "An agent can discover and call these without guessing at the form — this is what the rest of the report is trying to get you to.",
        evidence: valid.slice(0, 3).map((form) => ({
          source: "raw-html" as const,
          summary: `${form.path}: toolname="${attrValue(form, "toolname")}"`,
          path: form.path,
        })),
      });

      if (undescribedControls.length > 0) {
        const sample = undescribedControls[0];
        findings.push({
          id: "webmcp.declarative.params",
          severity: "low",
          title: "Tool parameters have no description",
          detail: `${undescribedControls.length} control${undescribedControls.length > 1 ? "s in your declared tools carry" : " in your declared tool carries"} no toolparamdescription — the agent falls back to the label, which may not say what a valid value looks like.`,
          evidence: undescribedControls.slice(0, 3).map((c) => ({
            source: "raw-html" as const,
            summary: c.path,
            path: c.path,
          })),
          remediation: {
            summary: "Add toolparamdescription to each control in a declared tool.",
            rationale:
              "It becomes the parameter's description in the synthesized JSON Schema; without it agents guess the format.",
            snippet: controlSnippetLine(dom, sample),
            language: "html",
            docsUrl: DOCS_DECLARATIVE_API,
          },
        });
      }
    }

    if (incomplete.length > 0) {
      const sample = incomplete[0];
      findings.push({
        id: "webmcp.declarative.incomplete",
        severity: "medium",
        title: "Incomplete WebMCP form declaration",
        detail: `${incomplete.length} form${incomplete.length > 1 ? "s declare" : " declares"} only one of toolname / tooldescription. Chrome needs both — with one missing, no tool is registered at all.`,
        evidence: incomplete.slice(0, 3).map((form) => ({
          source: "raw-html" as const,
          summary: `${form.path}: ${attrValue(form, "toolname") ? "tooldescription missing" : "toolname missing"}`,
          path: form.path,
        })),
        remediation: {
          summary: "Give the form both toolname and tooldescription.",
          rationale: "Removing either attribute is how a form is opted out; both are required to register.",
          snippet: correctedFormTag(dom, sample),
          language: "html",
          docsUrl: DOCS_DECLARATIVE_API,
        },
      });
    }

    // ---- Imperative (25 + 5) — referenced, never executed
    let imperativePoints = 0;
    if (imperative.referenced) {
      imperativePoints = 25;
      if (imperative.hasSchema) imperativePoints += 5;
      findings.push({
        id: "webmcp.imperative.referenced",
        severity: "info",
        positive: true,
        title: "modelContext.registerTool referenced in page script",
        detail:
          "document.modelContext.registerTool is referenced in an inline script — registration can't be verified without executing the page, so this is credited as a strong signal rather than a confirmed tool.",
        evidence: [{ source: "raw-html", summary: "inline <script> calls registerTool", excerpt: imperative.excerpt }],
      });

      if (imperative.legacyOnly) {
        findings.push({
          id: "webmcp.imperative.legacy",
          severity: "low",
          title: "Uses the deprecated navigator.modelContext alias",
          detail:
            "The 27 May 2026 draft moved the modelContext getter from Navigator to Document. navigator.modelContext still works as a deprecated alias, but document.modelContext is the canonical surface.",
          evidence: [{ source: "raw-html", summary: "navigator.modelContext.registerTool( in inline script", excerpt: imperative.excerpt }],
          remediation: {
            summary: "Call document.modelContext.registerTool instead.",
            rationale: "navigator.modelContext is a compatibility alias and logs a deprecation warning.",
            snippet: "document.modelContext.registerTool({ /* …your existing tool… */ });",
            language: "ts",
            docsUrl: DOCS_IMPERATIVE_API,
          },
        });
      }
    }

    // ---- Supporting signals (5 + 5)
    let supportPoints = 0;
    if (polyfills.length > 0) {
      supportPoints += 5;
      findings.push({
        id: "webmcp.polyfill.present",
        severity: "info",
        positive: true,
        title: "WebMCP polyfill loaded",
        detail: "The polyfill installs document.modelContext where the browser has not shipped it yet.",
        evidence: polyfills.slice(0, 2).map((s) => ({
          source: "raw-html" as const,
          summary: excerpt(attrValue(s, "src"), 120),
          path: s.path,
        })),
      });
    }
    if (originTrial) {
      supportPoints += 5;
      findings.push({
        id: "webmcp.origin-trial.present",
        severity: "info",
        positive: true,
        title: "Origin trial token present",
        detail: "An origin-trial token is served, so the API can be live for real visitors before Chrome ships it by default.",
        evidence: [
          {
            source: headers["origin-trial"] !== undefined ? ("response-header" as const) : ("raw-html" as const),
            summary: "origin-trial token found",
          },
        ],
      });
    }

    // ---- Gating headers
    if (policyDisabled) {
      findings.push({
        id: "webmcp.policy.disabled",
        severity: "high",
        title: "WebMCP is disabled by Permissions-Policy",
        detail:
          "This page sends Permissions-Policy: tools=(), which switches the WebMCP API off entirely — registerTool throws, and no tool can be exposed no matter what the markup says.",
        evidence: [
          {
            source: "response-header",
            summary: "permissions-policy disables the tools feature",
            excerpt: excerpt(headers["permissions-policy"] ?? "", 200),
          },
        ],
        remediation: {
          summary: "Drop tools=() from Permissions-Policy (the default allowlist is already self).",
          rationale: "tools defaults to 'self' — you only need a directive to widen it to a cross-origin frame.",
          snippet: "Permissions-Policy: tools=(self)",
          language: "text",
          docsUrl: DOCS_OVERVIEW,
        },
      });
    }

    if (originClusterOff) {
      findings.push({
        id: "webmcp.origin-cluster.off",
        severity: "medium",
        title: "Origin isolation is turned off",
        detail:
          "Origin-Agent-Cluster: ?0 opts this page out of origin-keyed agent clustering (the document.domain path), which disables the WebMCP APIs.",
        evidence: [
          { source: "response-header", summary: "origin-agent-cluster: ?0" },
        ],
        remediation: {
          summary: "Remove Origin-Agent-Cluster: ?0 (or set ?1).",
          rationale: "WebMCP requires origin isolation; the legacy document.domain path is incompatible with it.",
          snippet: "Origin-Agent-Cluster: ?1",
          language: "text",
          docsUrl: DOCS_OVERVIEW,
        },
      });
    }

    // ---- Score
    let score = Math.min(90, declarativePoints + imperativePoints) + supportPoints;
    if (originClusterOff) score = Math.min(score, 20);
    if (policyDisabled) score = 0;
    score = Math.max(0, Math.min(100, Math.round(score)));

    // ---- The opportunity finding
    const hasTools = valid.length > 0 || imperative.referenced;
    if (!hasTools && incomplete.length === 0 && !policyDisabled) {
      const stub = generateWebMcpStub(dom, ctx.page.finalUrl);
      const generic = stub ? null : genericStubSnippets(ctx.page.finalUrl);
      const declarativeSnippet = stub ? stub.declarative : generic!.declarative;
      const imperativeSnippet = stub ? stub.imperative : generic!.imperative;
      const label = stub ? stub.description : "site search";
      const evidence: Evidence[] = stub
        ? [{ source: "raw-html", summary: `Form available to declare as a tool: ${stub.formPath}`, path: stub.formPath }]
        : [{ source: "raw-html", summary: "No form on this page — the snippet below is a site-search starting point" }];

      findings.push({
        id: "webmcp.none",
        severity: "high",
        title: "No WebMCP tools — this is the biggest single upgrade available",
        detail:
          "WebMCP lets a page hand an agent a named, typed tool instead of a form it has to reverse-engineer. Browsers in the Chrome/Edge origin trial and agent clients such as ChatGPT Desktop already call these tools. The \"+N\" on this report is what declaring one is worth to your score. Note that we only read the served HTML: a tool registered from a JavaScript bundle would be invisible to us.",
        evidence,
        remediation: {
          summary: stub ? `Declare your "${label}" form as a tool` : "Declare a site-search tool",
          rationale:
            "The declarative attributes are the cheapest path: the browser synthesizes the JSON Schema from the controls you already have.",
          snippet: declarativeSnippet,
          language: "html",
          docsUrl: DOCS_DECLARATIVE_API,
        },
      });

      findings.push({
        id: "webmcp.stub.imperative",
        severity: "info",
        title: "Same tool, imperative API",
        detail:
          "If the form is rendered by JavaScript or the tool needs to do more than submit, register it imperatively. execute() resolves to a plain JSON-serializable value; the browser stringifies it.",
        evidence,
        remediation: {
          summary: "Register the tool with document.modelContext.registerTool.",
          rationale: `WebMCP is not on by default in any shipping browser yet, so include the polyfill: ${POLYFILL_SCRIPT_TAG}`,
          snippet: imperativeSnippet,
          language: "ts",
          docsUrl: DOCS_IMPERATIVE_API,
        },
      });
    }

    return {
      checkId: "webmcp-capability",
      category: "webmcp-capability",
      applicable: true,
      score,
      confidence: valid.length > 0 || policyDisabled ? "high" : "medium",
      findings,
      summary: summaryFor(score, policyDisabled),
    };
  },
};
