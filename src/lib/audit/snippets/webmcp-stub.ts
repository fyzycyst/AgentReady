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
 * comparing attributes).
 *
 * Page values are kept RAW as data and encoded once per sink, because the two
 * sinks disagree about what "safe" means (review W2):
 *   - HTML attribute values and human-readable prose → `escapeAttr`.
 *   - JavaScript/JSON strings, above all field names → `jsonString`, which is
 *     `JSON.stringify` plus Unicode escapes for `< > &` so the output cannot
 *     close an inline `<script>` in the page it is pasted into.
 * Escaping a field name for HTML would silently rename it (`a&b` → `a&amp;b`)
 * and the generated code would then miss the real control.
 *
 * The generated code locates its form by index into `document.forms` rather
 * than by a selector built from page text: an id like `billing:email` is valid
 * HTML but an invalid CSS selector, and sanitizing the selector can silently
 * point it at a different element (review W3).
 */
import type { ElementView, HtmlQuery } from "../contract";
import { escapeAttr } from "../escape";

/**
 * Verified 2026-09-01 (webmcp-facts §3). Pinned: the IIFE build is
 * exact-version, and the Subresource Integrity hash pins the bytes — we are
 * telling sites to load third-party code from a CDN, so it carries `integrity`
 * and `crossorigin`. sha384 computed over the 24 379-byte 5.1.0 IIFE build,
 * independently three times (coordinator, Composer seat, this seat).
 * Bumping the version REQUIRES recomputing the hash.
 */
export const POLYFILL_SCRIPT_TAG =
  '<script src="https://unpkg.com/@mcp-b/webmcp-polyfill@5.1.0/dist/index.iife.js" ' +
  'integrity="sha384-ZLqD1afbu2b2LJVDDqBf95wR/DGWh5FT1bx6E2S+4uMPdMOc8QGIIfw2gBWLKIB2" ' +
  'crossorigin="anonymous"></script>';

export const POLYFILL_COMMENT = "// Until Chrome ships WebMCP by default, include the polyfill:";

/**
 * The polyfill tag as it appears inside a generated JavaScript comment.
 *
 * The closing tag is written `<\/script>` because the imperative snippet is
 * meant to be pasted into an inline `<script>`, and an HTML parser ends that
 * element at the first literal `</script>` — comment or not. Same reason
 * `jsonString` Unicode-escapes `<`; this is our own constant rather than page
 * content, so it gets the readable idiom instead.
 */
const POLYFILL_TAG_IN_COMMENT = `// ${POLYFILL_SCRIPT_TAG.replace("</script>", "<\\/script>")}`;

/** webmcp-facts §8. */
export const DOCS_DECLARATIVE_API = "https://developer.chrome.com/docs/ai/webmcp/declarative-api";
export const DOCS_IMPERATIVE_API = "https://developer.chrome.com/docs/ai/webmcp/imperative-api";
export const DOCS_OVERVIEW = "https://developer.chrome.com/docs/ai/webmcp";

/** Reminder that `execute` returns a plain value, carried into generated code. */
const EXECUTE_RETURN_NOTE = "// plain JSON-serializable value — not an MCP { content } envelope";

export type StubParamType = "string" | "number" | "integer" | "boolean";

export interface StubParam {
  /** RAW control name, never truncated — this is an identity, not display text. */
  readonly name: string;
  readonly type: StubParamType;
  /** RAW label text, whitespace-collapsed and capped; encoded per sink. */
  readonly description: string;
  readonly required: boolean;
}

export interface WebMcpStub {
  /** Evidence locator for the form the stub was generated from. */
  readonly formPath: string;
  /** Position among `document.forms`; how the generated code finds the form. */
  readonly formIndex: number;
  readonly toolName: string;
  /** RAW description, whitespace-collapsed and capped; encoded per sink. */
  readonly description: string;
  /** The form's opening tag with tool attributes, one line per control. */
  readonly declarative: string;
  /** `document.modelContext.registerTool({...})` with inputSchema + execute. */
  readonly imperative: string;
  readonly params: readonly StubParam[];
}

/** Input types that are never a tool parameter. */
const EXCLUDED_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

/**
 * File inputs are excluded from the schema on top of that: their value cannot
 * be set programmatically (assigning `.value` throws), so declaring one as a
 * parameter promises something the generated executor cannot deliver (W4).
 */
const UNSETTABLE_INPUT_TYPES = new Set(["file"]);

const MAX_TOOL_NAME = 40;
const MAX_DESCRIPTION = 120;
/** Field names carry identity, so they are escaped but never shortened. */
const UNCAPPED = Infinity;
const FALLBACK_TOOL_NAME = "submit_form";

/** Attribute names we are willing to echo back into a snippet. */
const SAFE_ATTR_NAME = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;

/**
 * Property names that are never emitted as tool parameters.
 *
 * `__proto__` on an object literal invokes the prototype setter instead of
 * creating an own property, so a control named `__proto__` yields a schema
 * whose `properties` and `required` disagree; `constructor` and `prototype`
 * are the same class of trap for anything that later reflects over the schema.
 * They cannot be populated through `form.elements.namedItem()` safely either,
 * so they are dropped from the params, the schema and the HTML alike rather
 * than half-supported.
 */
const RESERVED_PARAM_NAMES = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Characters that are structurally meaningless to JSON but dangerous in HTML,
 * plus the two line terminators that are legal in JSON strings and illegal in
 * JS ones. Applying this to serialized JSON is safe because `<`, `>` and `&`
 * can only occur inside string literals there.
 */
const HTML_UNSAFE_IN_JS: readonly (readonly [RegExp, string])[] = [
  [/</g, "\\u003c"],
  [/>/g, "\\u003e"],
  [/&/g, "\\u0026"],
  [/\u2028/g, "\\u2028"],
  [/\u2029/g, "\\u2029"],
];

function escapeForScript(serialized: string): string {
  return HTML_UNSAFE_IN_JS.reduce((s, [pattern, replacement]) => s.replace(pattern, replacement), serialized);
}

/**
 * Encode a raw page-derived value as a JavaScript string literal, quotes
 * included. `JSON.stringify` handles quotes, backslashes and control
 * characters; the extra Unicode escapes mean the result cannot close an inline
 * `<script>` in the page the snippet is pasted into.
 *
 * This is the *only* encoder used for values that must keep their exact
 * identity — field names above all. `escapeAttr` mangles them (`&` becomes
 * `&amp;`), which is correct for an HTML attribute and wrong for a lookup key.
 */
function jsonString(value: string): string {
  return escapeForScript(JSON.stringify(value));
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
function pickForm(
  dom: HtmlQuery,
): { form: ElementView; formIndex: number; controls: readonly ElementView[] } | null {
  // The index is the position among ALL forms in document order, which is what
  // `document.forms` exposes at runtime — so it must be taken before filtering.
  const candidates = dom
    .all("form")
    .map((form, formIndex) => ({ form, formIndex, controls: toolParamControls(form) }))
    .filter((c) => c.controls.length > 0);
  if (candidates.length === 0) return null;
  return candidates.find((c) => !isSearchOnly(c.controls)) ?? candidates[0];
}

/** HTML sink. `toolName` is slug-constrained; `description` is raw here. */
function openingTag(form: ElementView, toolName: string, description: string): string {
  const attrs = Object.entries(form.attrs())
    .filter(([name]) => SAFE_ATTR_NAME.test(name) && !TOOL_ATTRS.has(name.toLowerCase()))
    .map(([name, value]) => (value === "" ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`))
    .join("");
  return `<form${attrs} toolname="${toolName}" tooldescription="${escapeAttr(description, MAX_DESCRIPTION)}">`;
}

/** HTML sink: every value here goes through the HTML escaper. */
function controlLine(control: ElementView, param: StubParam): string {
  const id = control.attr("id");
  const idAttr = id ? ` id="${escapeAttr(id)}"` : "";
  // Never capped: a truncated name is a different field (W2).
  const nameAttr = ` name="${escapeAttr(param.name, UNCAPPED)}"`;
  const paramAttr = ` toolparamdescription="${escapeAttr(param.description, MAX_DESCRIPTION)}"`;

  if (control.tag === "textarea") return `  <textarea${idAttr}${nameAttr}${paramAttr}></textarea>`;
  if (control.tag === "select") return `  <select${idAttr}${nameAttr}${paramAttr}>…</select>`;

  const typeAttr = ` type="${escapeAttr((control.attr("type") ?? "text").toLowerCase(), 20)}"`;
  return `  <input${idAttr}${nameAttr}${typeAttr}${paramAttr}>`;
}

/**
 * Build the schema as data, then serialize — the output is JSON by
 * construction. `properties` has a null prototype so that a page-supplied
 * `__proto__` key would create an own property rather than invoking the
 * prototype setter (W1); reserved names are filtered out anyway, and this is
 * the belt to that suspenders.
 */
export function inputSchemaFor(params: readonly StubParam[]): Record<string, unknown> {
  const properties: Record<string, unknown> = Object.create(null);
  const required: string[] = [];
  for (const p of params) {
    if (RESERVED_PARAM_NAMES.has(p.name)) continue;
    properties[p.name] = { type: p.type, description: p.description };
    if (p.required) required.push(p.name);
  }
  return required.length > 0
    ? { type: "object", properties, required }
    : { type: "object", properties };
}

/** JSON, re-indented to sit inside the registerTool object literal. */
function renderSchema(params: readonly StubParam[]): string {
  return escapeForScript(JSON.stringify(inputSchemaFor(params), null, 2))
    .split("\n")
    .map((line, i) => (i === 0 ? line : "  " + line))
    .join("\n");
}

/**
 * The body that populates and submits the form. Assignment is type-aware:
 * a checkbox declared `boolean` in the schema has to end up `checked`, not
 * carrying the string "true" (W4). The `instanceof` chain both selects the
 * right assignment and narrows `namedItem`'s `RadioNodeList | Element | null`
 * so the emitted TypeScript compiles as written (WN2).
 */
function executeBody(toolName: string, formIndex: number, formLabel: string): readonly string[] {
  return [
    "  async execute(input) {",
    `    const form = document.forms[${formIndex}];  // ${formIndex}: the ${jsonString(formLabel)} form`,
    `    if (!(form instanceof HTMLFormElement)) throw new Error(${jsonString(`${toolName}: form not found on this page`)});`,
    "    for (const [key, value] of Object.entries(input)) {",
    "      const field = form.elements.namedItem(key);",
    '      if (field instanceof HTMLInputElement && field.type === "checkbox") {',
    "        field.checked = Boolean(value);",
    "      } else if (",
    "        field instanceof HTMLInputElement ||",
    "        field instanceof HTMLTextAreaElement ||",
    "        field instanceof HTMLSelectElement ||",
    "        field instanceof RadioNodeList",
    "      ) {",
    "        field.value = String(value);",
    "      }",
    "    }",
    "    form.requestSubmit();",
    `    return ${jsonString(`Submitted ${toolName}`)};  ${EXECUTE_RETURN_NOTE}`,
    "  },",
  ];
}

function renderImperative(args: {
  toolName: string;
  description: string;
  formIndex: number;
  formLabel: string;
  params: readonly StubParam[];
  pageUrl: string;
}): string {
  const { toolName, description, formIndex, formLabel, params, pageUrl } = args;
  return [
    POLYFILL_COMMENT,
    POLYFILL_TAG_IN_COMMENT,
    `// Generated from the form at ${escapeAttr(pageUrl, MAX_DESCRIPTION)}`,
    "document.modelContext.registerTool({",
    `  name: ${jsonString(toolName)},`,
    `  description: ${jsonString(description)},`,
    `  inputSchema: ${renderSchema(params)},`,
    ...executeBody(toolName, formIndex, formLabel),
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

  // Kept raw (collapsed and capped only); each sink encodes it for itself.
  const rawDescription = (legend || heading || submit || "").replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION);
  return { toolName, description: rawDescription || `Submit the ${toolName} form` };
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
  const existingDescription = (form.attr("tooldescription")?.trim() ?? "").slice(0, MAX_DESCRIPTION);
  return openingTag(form, toolName, existingDescription || derived.description);
}

/**
 * One control, rewritten with `toolparamdescription` — the params remediation.
 * A control with no `name` gets a suggested one from its id or label, since a
 * nameless control cannot become a schema property at all (W5).
 */
export function controlSnippetLine(dom: HtmlQuery, control: ElementView): string {
  const label = labelText(dom, control);
  const name =
    control.attr("name")?.trim() || slug(control.attr("id") ?? "") || slug(label) || "field";
  const param: StubParam = {
    name,
    type: schemaType(control),
    description: label.slice(0, MAX_DESCRIPTION) || name || "What this field expects",
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
  const { form, formIndex, controls } = picked;
  const { toolName, description } = deriveNames(dom, form);

  // Keep only controls that can actually become a schema property AND be
  // populated by the generated executor. Names are raw: they are the key the
  // agent sends and the key `namedItem` looks up, so they must match the page
  // byte for byte.
  const seen = new Set<string>();
  const usable: { control: ElementView; param: StubParam }[] = [];
  for (const control of controls) {
    const name = control.attr("name")?.trim() ?? "";
    if (!name) continue; // cannot be submitted or keyed in a schema
    if (RESERVED_PARAM_NAMES.has(name)) continue; // W1
    if (control.tag === "input" && UNSETTABLE_INPUT_TYPES.has((control.attr("type") ?? "").toLowerCase())) {
      continue; // W4: a file input's value cannot be set
    }
    if (seen.has(name)) continue; // a duplicate would overwrite its twin in the schema
    seen.add(name);
    usable.push({
      control,
      param: {
        name,
        type: schemaType(control),
        description: labelText(dom, control).slice(0, MAX_DESCRIPTION) || name,
        required: control.attr("required") !== undefined,
      },
    });
  }
  const params = usable.map((u) => u.param);

  const declarative = [
    openingTag(form, toolName, description),
    ...usable.map((u) => controlLine(u.control, u.param)),
    "  <!-- …your existing labels and submit button stay as they are… -->",
    "</form>",
  ].join("\n");

  return {
    formPath: form.path,
    formIndex,
    toolName,
    description,
    declarative,
    imperative: renderImperative({
      toolName,
      description,
      formIndex,
      formLabel: form.attr("id")?.trim() || description,
      params,
      pageUrl,
    }),
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
  const description = `Search ${origin.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION)}`;

  const declarative = [
    `<form action="/search" method="get" toolname="search_site" tooldescription="${escapeAttr(description, MAX_DESCRIPTION)}">`,
    '  <input name="q" type="search" toolparamdescription="Search query" required>',
    '  <button type="submit">Search</button>',
    "</form>",
  ].join("\n");

  const imperative = [
    POLYFILL_COMMENT,
    POLYFILL_TAG_IN_COMMENT,
    "document.modelContext.registerTool({",
    '  name: "search_site",',
    `  description: ${jsonString(description)},`,
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
