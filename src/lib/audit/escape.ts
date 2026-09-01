/**
 * Escaping for page-derived strings that end up in remediation snippets.
 *
 * INVARIANTS.md ("Checks"): page content is hostile input. Anything taken from
 * the page and placed in a snippet is whitespace-collapsed, length-capped and
 * escaped for `& " < >` before it is emitted — in HTML attributes, in HTML
 * text, and in the string literals of generated TypeScript alike. The single
 * conservative escape is deliberate: one function, one rule, no per-context
 * reasoning about which sink a value reached.
 */

/** Default cap for a snippet attribute value. */
export const DEFAULT_ATTR_MAX = 60;

/**
 * Escape a page-derived value for insertion into a snippet.
 *
 * The cap is applied to the *source* text, before escaping, so a hostile input
 * cannot be used to blow the output up via entity expansion.
 */
export function escapeAttr(value: string, max: number = DEFAULT_ATTR_MAX): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
