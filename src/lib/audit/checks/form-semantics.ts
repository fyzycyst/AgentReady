/**
 * Form semantics (Act): if an agent finds the form, can it tell what each field wants?
 *
 * Points (100):
 *   Accessible name .............................. 40
 *   name attribute ............................... 15
 *   Specific input type .......................... 20
 *   autocomplete ................................. 15
 *   Submit affordance ............................ 10
 */
import type { AuditCheck, AuditContext, CheckResult, ElementView, Finding, HtmlQuery } from "../contract";

const EXCLUDED_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

const TYPE_RULES: readonly { pattern: RegExp; expected: string }[] = [
  { pattern: /e-?mail/i, expected: "email" },
  { pattern: /phone|tel\b|mobile/i, expected: "tel" },
  { pattern: /url|website|homepage/i, expected: "url" },
  { pattern: /\bdate\b|dob|birth/i, expected: "date" },
  { pattern: /qty|quantity|amount|count/i, expected: "number" },
  { pattern: /password|passwd/i, expected: "password" },
];

interface AutocompleteRule {
  pattern: RegExp;
  tokens: readonly string[];
  /** When true, skip if a higher-priority name rule already matched. */
  excludeFirstLast?: boolean;
}

const AUTOCOMPLETE_RULES: readonly AutocompleteRule[] = [
  { pattern: /first.?name|given/i, tokens: ["given-name"] },
  { pattern: /last.?name|surname|family/i, tokens: ["family-name"] },
  { pattern: /\bname\b/i, tokens: ["name"], excludeFirstLast: true },
  { pattern: /e-?mail/i, tokens: ["email"] },
  { pattern: /phone|tel\b|mobile/i, tokens: ["tel"] },
  { pattern: /street|address/i, tokens: ["street-address"] },
  { pattern: /zip|postal/i, tokens: ["postal-code"] },
  { pattern: /city|town/i, tokens: ["address-level2"] },
  { pattern: /country/i, tokens: ["country"] },
  { pattern: /username|login/i, tokens: ["username"] },
  { pattern: /password|passwd/i, tokens: ["current-password", "new-password"] },
];

function collectControls(dom: HtmlQuery): ElementView[] {
  const controls: ElementView[] = [];
  for (const input of dom.all("input")) {
    const type = (input.attr("type") ?? "text").toLowerCase();
    if (!EXCLUDED_INPUT_TYPES.has(type)) controls.push(input);
  }
  for (const el of dom.all("textarea, select")) controls.push(el);
  return controls;
}

function labelForControl(dom: HtmlQuery, control: ElementView): ElementView | undefined {
  const id = control.attr("id");
  if (id) {
    const byFor = dom.first(`label[for="${id}"]`);
    if (byFor) return byFor;
  }
  return dom.all("label").find((label) => label.all("input, textarea, select").some((c) => c.path === control.path));
}

function labelTextForMatching(dom: HtmlQuery, control: ElementView): string {
  return labelForControl(dom, control)?.text().trim() ?? "";
}

function accessibleName(dom: HtmlQuery, control: ElementView): string | null {
  const ariaLabel = control.attr("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  const labelledBy = control.attr("aria-labelledby")?.trim();
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((token) => dom.first(`#${token}`)?.text().trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }

  const label = labelTextForMatching(dom, control);
  if (label) return label;

  const title = control.attr("title")?.trim();
  if (title) return title;

  return null;
}

function hintText(dom: HtmlQuery, control: ElementView): string {
  return [control.attr("name"), control.attr("id"), control.attr("autocomplete"), labelTextForMatching(dom, control)]
    .filter(Boolean)
    .join(" ");
}

function expectedInputType(control: ElementView, dom: HtmlQuery): string | null {
  if (control.tag !== "input") return null;
  const haystack = hintText(dom, control);
  for (const rule of TYPE_RULES) {
    if (rule.pattern.test(haystack)) return rule.expected;
  }
  return null;
}

function expectedAutocomplete(control: ElementView, dom: HtmlQuery): readonly string[] | null {
  const haystack = hintText(dom, control);
  for (const rule of AUTOCOMPLETE_RULES) {
    if (!rule.pattern.test(haystack)) continue;
    if (rule.excludeFirstLast && (/first.?name|given/i.test(haystack) || /last.?name|surname|family/i.test(haystack))) {
      continue;
    }
    return rule.tokens;
  }
  return null;
}

function formHasSubmit(form: ElementView): boolean {
  for (const btn of form.all("button")) {
    const type = (btn.attr("type") ?? "submit").toLowerCase();
    if (type === "submit") return true;
  }
  for (const input of form.all('input[type="submit"], input[type="image"]')) {
    return true;
  }
  return false;
}

function remediationSnippet(control: ElementView, dom: HtmlQuery): string {
  const id = control.attr("id") ?? control.attr("name") ?? "field";
  const name = control.attr("name") ?? id;
  const type = control.tag === "input" ? (control.attr("type") ?? "text") : control.tag === "textarea" ? "textarea" : "select";
  const expectedType = expectedInputType(control, dom);
  const resolvedType = expectedType ?? (type === "textarea" || type === "select" ? type : "text");
  const expectedTokens = expectedAutocomplete(control, dom);
  const autocomplete = control.attr("autocomplete") ?? expectedTokens?.[0] ?? "";
  const label =
    labelTextForMatching(dom, control) ||
    control.attr("placeholder")?.trim() ||
    control.attr("aria-label")?.trim() ||
    id;
  const required = control.attr("required") !== undefined ? " required" : "";
  const autocompleteAttr = autocomplete && autocomplete !== "off" ? ` autocomplete="${autocomplete}"` : "";
  const tag =
    control.tag === "textarea"
      ? `<textarea id="${id}" name="${name}"${autocompleteAttr}${required}></textarea>`
      : control.tag === "select"
        ? `<select id="${id}" name="${name}"${autocompleteAttr}${required}></select>`
        : `<input id="${id}" name="${name}" type="${resolvedType}"${autocompleteAttr}${required}>`;
  return `<label for="${id}">${label}</label>\n${tag}`;
}

export const formSemanticsCheck: AuditCheck = {
  id: "form-semantics",
  version: 1,
  category: "form-semantics",
  run(ctx: AuditContext): CheckResult {
    const dom = ctx.page.raw.dom;
    const controls = collectControls(dom);
    const findings: Finding[] = [];

    if (controls.length === 0) {
      findings.push({
        id: "forms.none",
        severity: "info",
        title: "No form controls on this page",
        detail: "No forms on this page — nothing for an agent to fill in here",
        evidence: [{ source: "raw-html", summary: "No input, textarea, or select controls found" }],
      });
      return {
        checkId: "form-semantics",
        category: "form-semantics",
        applicable: false,
        score: null,
        confidence: "high",
        findings,
        summary: "No forms on this page.",
      };
    }

    let points = 0;

    // ---- Accessible name (40)
    const named = controls.filter((c) => accessibleName(dom, c) !== null);
    const unnamed = controls.filter((c) => accessibleName(dom, c) === null);
    const placeholderOnly = controls.filter((c) => {
      const ph = c.attr("placeholder")?.trim();
      return !!ph && accessibleName(dom, c) === null;
    });
    points += 40 * (named.length / controls.length);

    if (placeholderOnly.length > 0) {
      const sample = placeholderOnly[0];
      findings.push({
        id: "forms.label.placeholder-only",
        severity: "medium",
        title: "Placeholder used as the only label",
        detail: `${placeholderOnly.length} control${placeholderOnly.length > 1 ? "s rely" : " relies"} on placeholder text alone — agents and screen readers cannot see it once the field has a value.`,
        evidence: placeholderOnly.slice(0, 3).map((c) => ({ source: "raw-html" as const, summary: c.path, path: c.path })),
        remediation: {
          summary: "Add a visible <label> for each field.",
          rationale: "What helps screen readers helps agents.",
          snippet: remediationSnippet(sample, dom),
          language: "html",
        },
      });
    }

    if (unnamed.length > 0) {
      const sample = unnamed[0];
      findings.push({
        id: "forms.label.missing",
        severity: "high",
        title: "Unlabelled form controls",
        detail: `${unnamed.length} control${unnamed.length > 1 ? "s have" : " has"} no accessible name — an agent cannot tell what to enter.`,
        evidence: unnamed.slice(0, 3).map((c) => ({ source: "raw-html" as const, summary: c.path, path: c.path })),
        remediation: {
          summary: "Associate every control with a <label> or aria-label.",
          rationale: "Labels are the primary signal for what a field wants.",
          snippet: remediationSnippet(sample, dom),
          language: "html",
        },
      });
    } else {
      findings.push({
        id: "forms.label.ok",
        severity: "info",
        positive: true,
        title: "All controls are labelled",
        detail: `${controls.length} control${controls.length > 1 ? "s" : ""} with accessible names.`,
        evidence: [{ source: "raw-html", summary: `${named.length}/${controls.length} named` }],
      });
    }

    // ---- name attribute (15)
    const withName = controls.filter((c) => (c.attr("name")?.trim() ?? "") !== "");
    const withoutName = controls.filter((c) => (c.attr("name")?.trim() ?? "") === "");
    points += 15 * (withName.length / controls.length);

    if (withoutName.length > 0) {
      const sample = withoutName[0];
      findings.push({
        id: "forms.name.missing",
        severity: "medium",
        title: "Controls missing a name attribute",
        detail: `${withoutName.length} control${withoutName.length > 1 ? "s lack" : " lacks"} name — without a name the value cannot be submitted or described in a tool schema.`,
        evidence: withoutName.slice(0, 3).map((c) => ({ source: "raw-html" as const, summary: c.path, path: c.path })),
        remediation: {
          summary: "Add a name attribute to every control.",
          rationale: "Agents need stable field keys for submission and tool schemas.",
          snippet: remediationSnippet(sample, dom),
          language: "html",
        },
      });
    }

    // ---- Specific input type (20)
    const typeCandidates = controls.filter((c) => c.tag === "input" && expectedInputType(c, dom) !== null);
    const typeMismatches = typeCandidates.filter((c) => {
      const expected = expectedInputType(c, dom)!;
      const actual = (c.attr("type") ?? "text").toLowerCase();
      return actual !== expected;
    });
    if (typeCandidates.length === 0) {
      points += 20;
    } else {
      points += 20 * ((typeCandidates.length - typeMismatches.length) / typeCandidates.length);
    }

    if (typeMismatches.length > 0) {
      const sample = typeMismatches[0];
      const expected = expectedInputType(sample, dom)!;
      const actual = (sample.attr("type") ?? "text").toLowerCase();
      findings.push({
        id: "forms.type.generic",
        severity: "medium",
        title: "Generic input type where a specific one is expected",
        detail: `${typeMismatches.length} field${typeMismatches.length > 1 ? "s use" : " uses"} type="${actual}" but the label/name suggests type="${expected}".`,
        evidence: typeMismatches.slice(0, 3).map((c) => ({
          source: "raw-html" as const,
          summary: `${c.path}: expected type=${expectedInputType(c, dom)}, found ${(c.attr("type") ?? "text").toLowerCase()}`,
          path: c.path,
        })),
        remediation: {
          summary: `Use type="${expected}" for semantically typed fields.`,
          rationale: "Specific types help agents validate and format values correctly.",
          snippet: remediationSnippet(sample, dom),
          language: "html",
        },
      });
    } else if (typeCandidates.length > 0) {
      findings.push({
        id: "forms.type.ok",
        severity: "info",
        positive: true,
        title: "Input types match field semantics",
        detail: `${typeCandidates.length} typed field${typeCandidates.length > 1 ? "s" : ""} use the expected input type.`,
        evidence: [{ source: "raw-html", summary: `${typeCandidates.length} type candidates OK` }],
      });
    }

    // ---- autocomplete (15)
    const acCandidates = controls.filter((c) => expectedAutocomplete(c, dom) !== null);
    const acMissing = acCandidates.filter((c) => !(c.attr("autocomplete")?.trim()));
    const acOff = acCandidates.filter((c) => (c.attr("autocomplete")?.trim().toLowerCase() ?? "") === "off");
    const acOk = acCandidates.filter((c) => {
      const v = c.attr("autocomplete")?.trim().toLowerCase() ?? "";
      return v !== "" && v !== "off";
    });

    if (acCandidates.length === 0) {
      points += 15;
    } else {
      points += 15 * (acOk.length / acCandidates.length);
    }

    if (acMissing.length > 0) {
      const sample = acMissing[0];
      findings.push({
        id: "forms.autocomplete.missing",
        severity: "low",
        title: "Missing autocomplete hints",
        detail: `${acMissing.length} recognizable field${acMissing.length > 1 ? "s lack" : " lacks"} autocomplete — agents must infer field purpose from labels alone.`,
        evidence: acMissing.slice(0, 3).map((c) => ({ source: "raw-html" as const, summary: c.path, path: c.path })),
        remediation: {
          summary: "Add autocomplete tokens for common field types.",
          rationale: "autocomplete gives agents a standard vocabulary for common fields.",
          snippet: remediationSnippet(sample, dom),
          language: "html",
        },
      });
    }

    if (acOff.length > 0) {
      findings.push({
        id: "forms.autocomplete.off",
        severity: "low",
        title: "Autocomplete disabled on recognizable fields",
        detail: `${acOff.length} field${acOff.length > 1 ? "s have" : " has"} autocomplete="off" where a standard token would help agents.`,
        evidence: acOff.slice(0, 3).map((c) => ({ source: "raw-html" as const, summary: c.path, path: c.path })),
        remediation: {
          summary: "Use a standard autocomplete token instead of off.",
          rationale: "Standard tokens are more useful to agents than disabling autocomplete.",
          snippet: remediationSnippet(acOff[0], dom),
          language: "html",
        },
      });
    }

    if (acCandidates.length > 0 && acOk.length === acCandidates.length) {
      findings.push({
        id: "forms.autocomplete.ok",
        severity: "info",
        positive: true,
        title: "Autocomplete hints present",
        detail: `All ${acCandidates.length} recognizable field${acCandidates.length > 1 ? "s have" : " has"} autocomplete.`,
        evidence: [{ source: "raw-html", summary: `${acOk.length}/${acCandidates.length} with autocomplete` }],
      });
    }

    // ---- Submit affordance (10)
    const forms = dom.all("form");
    if (forms.length === 0) {
      findings.push({
        id: "forms.no-form-element",
        severity: "high",
        title: "Controls outside a <form>",
        detail: "inputs outside a <form> cannot be submitted by an agent without executing scripts",
        evidence: controls.slice(0, 3).map((c) => ({ source: "raw-html" as const, summary: c.path, path: c.path })),
        remediation: {
          summary: "Wrap controls in a <form> with an explicit submit control.",
          rationale: "Agents submit forms via standard HTML — not div onclick handlers.",
          snippet: `<form action="/submit" method="post">\n  …fields…\n  <button type="submit">Submit</button>\n</form>`,
          language: "html",
        },
      });
    } else {
      const withSubmit = forms.filter(formHasSubmit);
      points += 10 * (withSubmit.length / forms.length);
      if (withSubmit.length === forms.length) {
        findings.push({
          id: "forms.submit.ok",
          severity: "info",
          positive: true,
          title: "Forms have submit affordances",
          detail: `${forms.length} form${forms.length > 1 ? "s" : ""} with a submit button or input.`,
          evidence: [{ source: "raw-html", summary: `${withSubmit.length}/${forms.length} forms with submit` }],
        });
      }
    }

    // ---- Extra informational findings
    if (dom.first("form[toolname]")) {
      findings.push({
        id: "forms.webmcp.declarative",
        severity: "info",
        positive: true,
        title: "Declarative WebMCP form",
        detail: "This form already declares a WebMCP tool — agents can discover it without guessing.",
        evidence: [{ source: "raw-html", summary: "form[toolname] present" }],
      });
    }

    if (controls.some((c) => c.attr("required") !== undefined)) {
      findings.push({
        id: "forms.required.ok",
        severity: "info",
        positive: true,
        title: "Required fields marked",
        detail: "At least one control declares required — agents know which fields must be filled.",
        evidence: [{ source: "raw-html", summary: "required attribute found" }],
      });
    }

    const score = Math.max(0, Math.min(100, Math.round(points * 10) / 10));
    return {
      checkId: "form-semantics",
      category: "form-semantics",
      applicable: true,
      score,
      confidence: "high",
      findings,
      summary:
        score >= 75
          ? "Forms are labelled and typed — an agent can fill them."
          : score >= 40
            ? "Agents can guess most fields, but not all."
            : "Fields are unlabeled; an agent cannot tell what they want.",
    };
  },
};
