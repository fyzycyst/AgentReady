/**
 * WebMCP stub generator — the product's headline move.
 *
 * Takes the page's own first real form and emits two ready-to-paste snippets:
 * the declarative form tag (`toolname` / `tooldescription` /
 * `toolparamdescription`) and an imperative
 * `document.modelContext.registerTool({...})` call with a JSON Schema derived
 * from the form's controls.
 *
 * API shape and defaults come from the same-day verification in
 * epics/…/phase3/webmcp-facts:
 *   - `document.modelContext` is canonical; `navigator.modelContext` is a
 *     deprecated alias and is never used in generated code.
 *   - `execute()` resolves to a plain JSON-serializable value; the UA
 *     JSON-stringifies it. It is NOT an MCP `{ content: [...] }` envelope.
 *   - Tool `name`: 1–128 chars, `[A-Za-z0-9_.-]`. Our slug is a subset.
 *
 * INVARIANTS.md: page content is hostile input. Selectors used to *read* the
 * page are constant strings (references are resolved by iterating and
 * comparing attributes); every page-derived value that reaches a snippet goes
 * through `escapeAttr`. The `querySelector(...)` string in the generated code
 * is output text, escaped like any other — it is never executed here.
 */
import type { ElementView, HtmlQuery } from "../contract";
import { escapeAttr } from "../escape";

/** Verified 2026-09-01 (webmcp-facts §3). Pinned: the IIFE build is exact-version. */
export const POLYFILL_SCRIPT_TAG =
  '<script src="https://unpkg.com/@mcp-b/webmcp-polyfill@5.1.0/dist/index.iife.js"></script>';

export const POLYFILL_COMMENT = "// Until Chrome ships WebMCP by default, include the polyfill:";

/** webmcp-facts §8. */
export const DOCS_DECLARATIVE_API = "https://developer.chrome.com/docs/ai/webmcp/declarative-api";
export const DOCS_IMPERATIVE_API = "https://developer.chrome.com/docs/ai/webmcp/imperative-api";
export const DOCS_OVERVIEW = "https://developer.chrome.com/docs/ai/webmcp";

/** Reminder that `execute` returns a plain value, carried into generated code. */
const EXECUTE_RETURN_NOTE = "// plain JSON-serializable value — not an MCP { content } envelope";

export type StubParamType = "string" | "number" | "integer" | "boolean";

export interface StubParam {
  readonly name: string;
  readonly type: StubParamType;
  readonly description: string;
  readonly required: boolean;
}

export interface WebMcpStub {
  /** Evidence locator for the form the stub was generated from. */
  readonly formPath: string;
  readonly toolName: string;
  readonly description: string;
  /** The form's opening tag with tool attributes, one line per control. */
  readonly declarative: string;
  /** `document.modelContext.registerTool({...})` with inputSchema + execute. */
  readonly imperative: string;
  readonly params: readonly StubParam[];
}

/** Input types that are never a tool parameter. */
const EXCLUDED_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

const MAX_TOOL_NAME = 40;
const MAX_DESCRIPTION = 120;
const MAX_SELECTOR = 120;
const DEFAULT_LITERAL_MAX = MAX_DESCRIPTION;
const FALLBACK_TOOL_NAME = "submit_form";

/** Attribute names we are willing to echo back into a snippet. */
const SAFE_ATTR_NAME = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;

/**
 * Characters allowed in the generated `querySelector(...)` argument.
 * `ElementView.path` is built by the acquisition layer from tag names plus the
 * page's own `id`s, so only the id part is hostile. Anything outside this set
 * — quotes, backslashes, `<`, `&` — is dropped rather than escaped, which is
 * strictly safer: the result can break out of neither the JS string literal
 * nor the surrounding HTML, and stays a usable selector.
 */
const SAFE_SELECTOR_CHARS = /[^A-Za-z0-9_\-#.:()>[\]= ]/g;

function safeSelector(path: string): string {
  return path.replace(/\s+/g, " ").trim().slice(0, MAX_SELECTOR).replace(SAFE_SELECTOR_CHARS, "");
}

/**
 * A page-derived value that lands inside a generated JS string literal.
 * `escapeAttr` has already removed `"`; dropping backslashes removes the only
 * remaining way to escape past the closing quote of the literal we emit.
 */
function literal(value: string, max: number = DEFAULT_LITERAL_MAX): string {
  return escapeAttr(value, max).replace(/\\/g, "");
}

/** Tool attributes we re-emit ourselves, so they are dropped from the source tag. */
const TOOL_ATTRS = new Set(["toolname", "tooldescription"]);

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "")
    .slice(0, MAX_TOOL_NAME)
    .replace(/_+$/, "");
}

function isRealControl(control: ElementView): boolean {
  if (control.tag !== "input") return true;
  return !EXCLUDED_INPUT_TYPES.has((control.attr("type") ?? "text").toLowerCase());
}

/**
 * Controls of a form that could carry a `toolparamdescription`: everything
 * except hidden fields and the submit/button/reset/image affordances.
 */
export function toolParamControls(form: ElementView): readonly ElementView[] {
  return form.all("input, textarea, select").filter(isRealControl);
}

function isSearchOnly(controls: readonly ElementView[]): boolean {
  return controls.length === 1 && (controls[0].attr("type") ?? "").toLowerCase() === "search";
}

/** Submit affordance text: `<button>` label first, then `input[type=submit]`'s value. */
function submitText(form: ElementView): string {
  for (const button of form.all("button")) {
    const type = (button.attr("type") ?? "submit").toLowerCase();
    if (type !== "submit") continue;
    const text = button.text().trim();
    if (text) return text;
  }
  for (const input of form.all('input[type="submit"]')) {
    const value = input.attr("value")?.trim();
    if (value) return value;
  }
  return "";
}

/**
 * Nearest `h1`/`h2`/`h3` before this form. HtmlQuery has no tree walk, so we
 * take headings and forms together (a multi-selector returns document order)
 * and scan backwards from the form's position.
 */
function precedingHeading(dom: HtmlQuery, form: ElementView): string {
  const nodes = dom.all("h1, h2, h3, form");
  const index = nodes.findIndex((n) => n.tag === "form" && n.path === form.path);
  if (index < 0) return "";
  for (let i = index - 1; i >= 0; i--) {
    if (nodes[i].tag === "form") continue;
    const text = nodes[i].text().trim();
    if (text) return text;
  }
  return "";
}

/** Accessible label text: label[for] → wrapping label → aria-label → placeholder. */
function labelText(dom: HtmlQuery, control: ElementView): string {
  const id = control.attr("id");
  if (id) {
    const byFor = dom.all("label").find((label) => label.attr("for") === id);
    const text = byFor?.text().trim();
    if (text) return text;
  }
  const wrapping = dom
    .all("label")
    .find((label) => label.all("input, textarea, select").some((c) => c.path === control.path));
  const wrappingText = wrapping?.text().trim();
  if (wrappingText) return wrappingText;

  const ariaLabel = control.attr("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  return control.attr("placeholder")?.trim() ?? "";
}

function schemaType(control: ElementView): StubParamType {
  if (control.tag !== "input") return "string";
  const type = (control.attr("type") ?? "text").toLowerCase();
  if (type === "number" || type === "range") return "number";
  if (type === "checkbox") return "boolean";
  return "string";
}

/**
 * The first form worth turning into a tool: has at least one control that is
 * not hidden/submit/button/reset/image. A form whose only control is a
 * `type=search` box is skipped unless nothing else qualifies — site search is
 * a perfectly good tool, just not the interesting one when a real form exists.
 */
function pickForm(dom: HtmlQuery): { form: ElementView; controls: readonly ElementView[] } | null {
  const candidates = dom
    .all("form")
    .map((form) => ({ form, controls: toolParamControls(form) }))
    .filter((c) => c.controls.length > 0);
  if (candidates.length === 0) return null;
  return candidates.find((c) => !isSearchOnly(c.controls)) ?? candidates[0];
}

function openingTag(form: ElementView, toolName: string, description: string): string {
  const attrs = Object.entries(form.attrs())
    .filter(([name]) => SAFE_ATTR_NAME.test(name) && !TOOL_ATTRS.has(name.toLowerCase()))
    .map(([name, value]) => (value === "" ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`))
    .join("");
  return `<form${attrs} toolname="${toolName}" tooldescription="${description}">`;
}

function controlLine(control: ElementView, param: StubParam): string {
  const id = control.attr("id");
  const idAttr = id ? ` id="${escapeAttr(id)}"` : "";
  const nameAttr = ` name="${param.name}"`;
  const paramAttr = ` toolparamdescription="${param.description}"`;

  if (control.tag === "textarea") return `  <textarea${idAttr}${nameAttr}${paramAttr}></textarea>`;
  if (control.tag === "select") return `  <select${idAttr}${nameAttr}${paramAttr}>…</select>`;

  const typeAttr = ` type="${escapeAttr((control.attr("type") ?? "text").toLowerCase(), 20)}"`;
  return `  <input${idAttr}${nameAttr}${typeAttr}${paramAttr}>`;
}

/** Build the schema as data, then serialize — the output is JSON by construction. */
export function inputSchemaFor(params: readonly StubParam[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const p of params) properties[p.name] = { type: p.type, description: p.description };
  const required = params.filter((p) => p.required).map((p) => p.name);
  return required.length > 0
    ? { type: "object", properties, required }
    : { type: "object", properties };
}

/** JSON, re-indented to sit inside the registerTool object literal. */
function renderSchema(params: readonly StubParam[]): string {
  return JSON.stringify(inputSchemaFor(params), null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : "  " + line))
    .join("\n");
}

function renderImperative(args: {
  toolName: string;
  description: string;
  selector: string;
  params: readonly StubParam[];
  pageUrl: string;
}): string {
  const { toolName, description, selector, params, pageUrl } = args;
  return [
    POLYFILL_COMMENT,
    `// ${POLYFILL_SCRIPT_TAG}`,
    `// Generated from the form at ${literal(pageUrl, MAX_DESCRIPTION)}`,
    "document.modelContext.registerTool({",
    `  name: "${toolName}",`,
    `  description: "${description}",`,
    `  inputSchema: ${renderSchema(params)},`,
    "  async execute(input) {",
    `    const form = document.querySelector("${selector}");`,
    `    if (!form) throw new Error("${toolName}: form not found on this page");`,
    "    for (const [key, value] of Object.entries(input)) {",
    "      const field = form.elements.namedItem(key);",
    "      if (field) field.value = String(value);",
    "    }",
    "    form.requestSubmit();",
    `    return "Submitted ${toolName}";  ${EXECUTE_RETURN_NOTE}`,
    "  },",
    "});",
  ].join("\n");
}

/**
 * Tool name and description for a form: `id` → `name` → submit text →
 * nearest preceding heading, and legend → heading → submit text respectively.
 */
function deriveNames(dom: HtmlQuery, form: ElementView): { toolName: string; description: string } {
  const submit = submitText(form);
  const heading = precedingHeading(dom, form);
  const legend = form.first("legend")?.text().trim() ?? "";

  const rawName =
    form.attr("id")?.trim() || form.attr("name")?.trim() || submit || heading || FALLBACK_TOOL_NAME;
  const toolName = slug(rawName) || FALLBACK_TOOL_NAME;

  // The description is emitted both as an HTML attribute and inside a JS
  // string literal, so it takes the stricter of the two treatments.
  const rawDescription = legend || heading || submit || `Submit the ${toolName} form`;
  const description = literal(rawDescription, MAX_DESCRIPTION) || `Submit the ${toolName} form`;
  return { toolName, description };
}

/**
 * The form's opening tag with both required tool attributes present — the
 * remediation for a form that declares only one of them. An existing
 * `toolname` is kept when it satisfies the spec's name rules (webmcp-facts §1).
 */
export function correctedFormTag(dom: HtmlQuery, form: ElementView): string {
  const derived = deriveNames(dom, form);
  const existingName = form.attr("toolname")?.trim() ?? "";
  const toolName = /^[A-Za-z0-9_.-]{1,128}$/.test(existingName)
    ? existingName
    : slug(existingName) || derived.toolName;
  const existingDescription = literal(form.attr("tooldescription")?.trim() ?? "", MAX_DESCRIPTION);
  return openingTag(form, toolName, existingDescription || derived.description);
}

/** One control, rewritten with `toolparamdescription` — the params remediation. */
export function controlSnippetLine(dom: HtmlQuery, control: ElementView): string {
  const name = escapeAttr(control.attr("name")?.trim() ?? "");
  const label = labelText(dom, control);
  const param: StubParam = {
    name,
    type: schemaType(control),
    description: escapeAttr(label, MAX_DESCRIPTION) || name || "What this field expects",
    required: control.attr("required") !== undefined,
  };
  return controlLine(control, param).trimStart();
}

/**
 * Turn the page's first real form into a paste-ready WebMCP tool.
 *
 * Returns `null` when the page has no form with a usable control — callers
 * fall back to {@link genericStubSnippets}.
 */
export function generateWebMcpStub(dom: HtmlQuery, pageUrl: string): WebMcpStub | null {
  const picked = pickForm(dom);
  if (!picked) return null;
  const { form, controls } = picked;
  const { toolName, description } = deriveNames(dom, form);

  // Controls without a name cannot be submitted or keyed in a schema.
  const named = controls.filter((c) => (c.attr("name")?.trim() ?? "") !== "");
  const params: StubParam[] = named.map((control) => {
    const name = escapeAttr(control.attr("name")!.trim());
    const label = labelText(dom, control);
    return {
      name,
      type: schemaType(control),
      description: escapeAttr(label, MAX_DESCRIPTION) || name,
      required: control.attr("required") !== undefined,
    };
  });

  const declarative = [
    openingTag(form, toolName, description),
    ...named.map((control, i) => controlLine(control, params[i])),
    "  <!-- …your existing labels and submit button stay as they are… -->",
    "</form>",
  ].join("\n");

  const selector = safeSelector(form.path);

  return {
    formPath: form.path,
    toolName,
    description,
    declarative,
    imperative: renderImperative({ toolName, description, selector, params, pageUrl }),
    params,
  };
}

/**
 * Fallback for pages with no form at all: a site-search tool built from the
 * page's own origin, in both flavours.
 */
export function genericStubSnippets(pageUrl: string): { declarative: string; imperative: string } {
  let origin = pageUrl;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    // Keep the raw string; it is escaped below either way.
  }
  const safeOrigin = literal(origin, MAX_DESCRIPTION);
  const description = `Search ${safeOrigin}`;

  const declarative = [
    `<form action="/search" method="get" toolname="search_site" tooldescription="${description}">`,
    '  <input name="q" type="search" toolparamdescription="Search query" required>',
    '  <button type="submit">Search</button>',
    "</form>",
  ].join("\n");

  const imperative = [
    POLYFILL_COMMENT,
    `// ${POLYFILL_SCRIPT_TAG}`,
    "document.modelContext.registerTool({",
    '  name: "search_site",',
    `  description: "${description}",`,
    `  inputSchema: ${renderSchema([{ name: "q", type: "string", description: "Search query", required: true }])},`,
    "  async execute({ q }, { signal }) {",
    '    const res = await fetch("/api/search?q=" + encodeURIComponent(q), { signal });',
    `    return await res.json();  ${EXECUTE_RETURN_NOTE}`,
    "  },",
    "  annotations: { readOnlyHint: true },",
    "});",
  ].join("\n");

  return { declarative, imperative };
}
