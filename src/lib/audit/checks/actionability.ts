/**
 * Actionability (Act): can a person or agent invoke the page's actions through
 * native HTML controls, rather than implementation-specific click handlers?
 */
import type { AuditCheck, AuditContext, CheckResult, ElementView, Finding } from "../contract";
import { excerpt } from "../contract";

const NATIVE_TAGS = new Set(["a", "button", "input", "select", "textarea", "summary", "form", "label"]);
const ROLE_ONLY_TAGS = new Set(["div", "span", "li", "p", "img", "svg", "i"]);
const PRIMARY_ACTION = /sign ?up|get started|buy|add to cart|checkout|book|reserve|subscribe|download|contact|start/i;

function isUsableHref(href: string | undefined): boolean {
  const value = href?.trim();
  return !!value && value !== "#" && !/^javascript:/i.test(value);
}

function isNativeAction(el: ElementView): boolean {
  if (el.tag === "a") return isUsableHref(el.attr("href"));
  if (el.tag === "button" || el.tag === "form" || el.tag === "select" || el.tag === "summary") return true;
  if (el.tag !== "input") return false;
  return ["submit", "button", "reset", "image", "checkbox", "radio", "range", "file"].includes((el.attr("type") ?? "").toLowerCase());
}

function soupKind(el: ElementView): "handlers" | "role-only" | "dead-links" | "focusable" | undefined {
  if (el.attr("onclick") !== undefined && !NATIVE_TAGS.has(el.tag)) return "handlers";
  if (
    ROLE_ONLY_TAGS.has(el.tag) &&
    ["button", "link", "menuitem", "tab"].includes((el.attr("role") ?? "").toLowerCase())
  ) {
    return "role-only";
  }
  if (el.tag === "a" && el.attr("href") === undefined && el.attr("onclick") === undefined && !el.attr("role") && !el.text().trim()) {
    return undefined;
  }
  if (el.tag === "a" && !isUsableHref(el.attr("href"))) return "dead-links";
  if ((el.tag === "div" || el.tag === "span") && el.attr("tabindex") !== undefined && !el.attr("role")) return "focusable";
  return undefined;
}

function isNamedButton(el: ElementView): boolean {
  if (el.text().trim()) return true;
  if (["aria-label", "aria-labelledby", "title"].some((name) => !!el.attr(name)?.trim())) return true;
  return el.all("img[alt]").some((image) => !!image.attr("alt")?.trim());
}

function primaryLabel(el: ElementView): string {
  return excerpt(el.text() || el.tag, 80);
}

function soupSnippet(kind: "handlers" | "role-only" | "dead-links" | "focusable"): string {
  if (kind === "handlers") {
    return "<!-- before -->\n<div class=\"btn\" onclick=\"openCart()\">Cart</div>\n<!-- after -->\n<button type=\"button\" class=\"btn\" onclick=\"openCart()\">Cart</button>";
  }
  if (kind === "dead-links") {
    return "<!-- Use a button for an in-page action -->\n<button type=\"button\">Open cart</button>\n<!-- Or give navigation a real destination -->\n<a href=\"/cart\">View cart</a>";
  }
  if (kind === "focusable") {
    return "<!-- before -->\n<div tabindex=\"0\">Details</div>\n<!-- after -->\n<button type=\"button\">Details</button>\n<!-- Or add role=\"button\" with keyboard handling -->";
  }
  return "<!-- before -->\n<span role=\"button\">Checkout</span>\n<!-- after -->\n<button type=\"button\">Checkout</button>";
}

export const actionabilityCheck: AuditCheck = {
  id: "actionability",
  version: 1,
  category: "actionability",
  run(ctx: AuditContext): CheckResult {
    const dom = ctx.page.raw.dom;
    const all = dom.all("*");
    const nativeActions = all.filter(isNativeAction);
    const soup = all.flatMap((el) => {
      const kind = soupKind(el);
      return kind ? [{ el, kind }] : [];
    });
    const findings: Finding[] = [];
    const confidence = soup.length > 0 || dom.all("script[src]").length === 0 ? "high" : "medium";

    if (nativeActions.length + soup.length === 0) {
      return {
        checkId: "actionability",
        category: "actionability",
        applicable: false,
        score: null,
        confidence,
        findings: [{ id: "actions.none", severity: "info", title: "No interactive elements found", detail: "No interactive elements found in the HTML", evidence: [{ source: "raw-html", summary: "No native actions or click-handler soup found" }] }],
        summary: "Nothing to do on this page (in the HTML).",
      };
    }

    let score = Math.round((70 * nativeActions.length) / (nativeActions.length + soup.length));
    const buttons = dom.all('button, [role="button"]');
    const unnamedButtons = buttons.filter((button) => !isNamedButton(button));
    score += buttons.length === 0 ? 15 : Math.round((15 * (buttons.length - unnamedButtons.length)) / buttons.length);

    if (unnamedButtons.length > 0) {
      findings.push({
        id: "actions.button.unnamed",
        severity: "medium",
        title: `${unnamedButtons.length} button${unnamedButtons.length === 1 ? "" : "s"} have no accessible name`,
        detail: "Agents and assistive technology cannot tell what these controls do.",
        evidence: unnamedButtons.slice(0, 3).map((button) => ({ source: "raw-html", summary: button.path })),
        remediation: {
          summary: "Give every button visible text or an accessible name.",
          rationale: "A control's label tells agents and people what action it invokes.",
          snippet: '<button type="button" aria-label="Open cart"><svg aria-hidden="true">…</svg></button>',
          language: "html",
        },
      });
    }

    const nativePrimary = dom.all("form")[0] ?? dom.all("a, button").find((el) => isNativeAction(el) && PRIMARY_ACTION.test(el.text()));
    const soupPrimary = soup.find(({ el }) => PRIMARY_ACTION.test(el.text()));
    if (nativePrimary) {
      score += 15;
      findings.push({
        id: "actions.primary.native",
        severity: "info",
        positive: true,
        title: `Primary action '${primaryLabel(nativePrimary)}' is a real <${nativePrimary.tag}>`,
        detail: "The page's primary action is directly invokable from its raw HTML.",
        evidence: [{ source: "raw-html", summary: nativePrimary.path, excerpt: excerpt(nativePrimary.outerHtml(), 160) }],
      });
    } else if (soupPrimary) {
      findings.push({
        id: "actions.primary.soup",
        severity: "critical",
        title: "Primary action is click-handler soup",
        detail: "The main thing a visitor does here is not reachable by an agent",
        evidence: [{ source: "raw-html", summary: soupPrimary.el.path, excerpt: excerpt(soupPrimary.el.outerHtml(), 160) }],
        remediation: {
          summary: "Use a native link, button, or form for the primary action.",
          rationale: "Native controls are directly targetable by agents and keyboard-operable for people.",
          snippet: soupSnippet(soupPrimary.kind),
          language: "html",
        },
      });
    } else {
      score += 15;
    }

    const handlers = soup.filter((item) => item.kind === "handlers");
    const deadLinks = soup.filter((item) => item.kind === "dead-links");
    const roleOnly = soup.filter((item) => item.kind === "role-only");
    const focusable = soup.filter((item) => item.kind === "focusable");
    const addSoupFinding = (kind: "handlers" | "dead-links" | "role-only" | "focusable", items: typeof soup, severity: "high" | "medium" | "low", title: string, detail: string) => {
      if (items.length === 0) return;
      findings.push({
        id: `actions.soup.${kind}`,
        severity,
        title,
        detail,
        evidence: items.slice(0, 5).map(({ el }) => ({ source: "raw-html", summary: el.path, excerpt: excerpt(el.outerHtml(), 160) })),
        remediation: {
          summary: "Replace the non-native control with the matching native HTML element.",
          rationale: "Native controls are keyboard-operable, appear in the accessibility tree, and are what agents (and WebMCP) can target.",
          snippet: soupSnippet(kind),
          language: "html",
        },
      });
    };
    addSoupFinding("handlers", handlers, handlers.length >= 3 ? "high" : "medium", `${handlers.length} clickable elements are not links or buttons`, "Click handlers alone are not reliable action targets for agents.");
    addSoupFinding("dead-links", deadLinks, "medium", `${deadLinks.length} links have no destination`, "These anchors do not expose a usable navigation target.");
    addSoupFinding("role-only", roleOnly, "low", `${roleOnly.length} controls use roles without native elements`, "Roles describe intent but do not provide the behavior of native controls.");
    addSoupFinding("focusable", focusable, "low", `${focusable.length} focusable elements have no role`, "A tabindex without a role tells agents something is interactive but not what it is.");

    if (soup.length === 0) {
      findings.push({
        id: "actions.native.ok",
        severity: "info",
        positive: true,
        title: "All actions use native HTML",
        detail: `All ${nativeActions.length} actions are real links, buttons or forms.${confidence === "medium" ? " Script bundles may still attach invisible event listeners that raw HTML cannot show." : ""}`,
        evidence: [{ source: "raw-html", summary: `${nativeActions.length} native actions; no soup` }],
      });
    }

    // Native controls are the prerequisite: bonuses cannot rescue a page where
    // every actionable element is click-handler soup.
    if (nativeActions.length === 0) score = 0;
    score = Math.max(0, Math.min(100, Math.round(score)));
    return {
      checkId: "actionability",
      category: "actionability",
      applicable: true,
      score,
      confidence,
      findings,
      summary:
        score >= 75
          ? "Actions are real links, buttons and forms."
          : score >= 40
            ? "Some actions are hidden in click handlers."
            : "Most actions are click-handler soup — agents can't act here.",
    };
  },
};
