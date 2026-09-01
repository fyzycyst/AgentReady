/**
 * Access & renderability (Understand): can an agent fetch and read this page
 * without a browser?
 *
 * Points (100):
 *   Response status .............................. 10
 *   x-robots-tag header .......................... 10
 *   Bot-management headers ....................... 10
 *   CAPTCHA / challenge markup ................... 20
 *   JavaScript dependence (heuristic) ............ 35
 *   Pagination for long lists .................... 15
 */
import type { AuditCheck, AuditContext, CheckResult, Confidence, ElementView, Finding } from "../contract";
import { excerpt } from "../contract";

const CAPTCHA_SRC = /recaptcha|hcaptcha|turnstile|challenges\.cloudflare\.com/i;
const CAPTCHA_MARKER = /g-recaptcha|h-captcha|cf-turnstile/i;
const NOSCRIPT_JS = /enable javascript|requires javascript|javascript is (required|disabled)/i;
const MOUNT_SELECTORS = ["#root", "#app", "#__next", "#__nuxt", "[data-reactroot]"];
const PAGINATION_MARKER = /pagination|pager/i;

const JS_HEURISTIC_DETAIL =
  "The rendered DOM was not tested; this assessment is heuristic based on the raw HTML only.";

const JS_CAP_DETAIL = {
  likely: " Overall score is capped at 60 when two JS-dependence heuristics fire.",
  required: " Overall score is capped at 35 when three or more JS-dependence heuristics fire.",
} as const;

function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function headerEntries(headers: Readonly<Record<string, string>>): [string, string][] {
  return Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v] as const);
}

function scoreStatus(status: number): number {
  return status >= 200 && status < 300 ? 10 : 0;
}

function scoreRobotsTag(
  headers: Readonly<Record<string, string>>,
  findings: Finding[],
): number {
  const tag = headerEntries(headers).find(([k]) => k === "x-robots-tag")?.[1] ?? "";
  if (!tag) return 10;
  const lower = tag.toLowerCase();
  if (/\bnoai\b|\bnoimageai\b/.test(lower)) {
    findings.push({
      id: "access.headers.noai",
      severity: "medium",
      title: "x-robots-tag declares content off-limits to AI",
      detail: `Header value "${excerpt(tag, 120)}" tells AI crawlers not to use this content.`,
      evidence: [{ source: "response-header", summary: `x-robots-tag: ${excerpt(tag, 120)}` }],
      remediation: {
        summary: "Remove noai/noimageai unless you intend to block AI agents.",
        rationale:
          "Training bots and user-agent fetchers read different signals. noai blocks agent-style consumption; use robots.txt or terms for training policy instead.",
        snippet: "x-robots-tag: index, follow",
        language: "text",
      },
    });
    return 0;
  }
  if (/\bnoindex\b|\bnone\b/.test(lower)) {
    findings.push({
      id: "access.headers.noindex",
      severity: "medium",
      title: "x-robots-tag blocks indexing",
      detail: `Header value "${excerpt(tag, 120)}" tells crawlers not to index this page.`,
      evidence: [{ source: "response-header", summary: `x-robots-tag: ${excerpt(tag, 120)}` }],
      remediation: {
        summary: "Allow indexing if agents should read this page.",
        rationale: "noindex/none prevents discovery and archival; agents may never see the content.",
        snippet: "x-robots-tag: index, follow",
        language: "text",
      },
    });
    return 0;
  }
  return 10;
}

function scoreBotManagement(
  headers: Readonly<Record<string, string>>,
  findings: Finding[],
): { points: number; present: boolean } {
  const hits: string[] = [];
  for (const [name] of headerEntries(headers)) {
    if (name === "cf-mitigated") hits.push(name);
    else if (name.startsWith("x-datadome")) hits.push(name);
    else if (name.startsWith("x-akamai-")) hits.push(name);
    else if (name.startsWith("x-px")) hits.push(name);
  }
  if (hits.length === 0) return { points: 10, present: false };
  findings.push({
    id: "access.headers.bot-management",
    severity: "low",
    title: "Bot management in front of this page",
    detail: "Bot management in front of this page; agents may be challenged on other requests.",
    evidence: hits.map((h) => ({ source: "response-header" as const, summary: h })),
  });
  return { points: 0, present: true };
}

function captchaElements(dom: AuditContext["page"]["raw"]["dom"]): ElementView[] {
  const hits: ElementView[] = [];
  const seen = new Set<ElementView>();
  const add = (el: ElementView) => {
    if (!seen.has(el)) {
      seen.add(el);
      hits.push(el);
    }
  };

  for (const el of dom.all("script[src], iframe[src]")) {
    const src = el.attr("src") ?? "";
    if (CAPTCHA_SRC.test(src)) add(el);
  }

  for (const el of dom.all("[class], [id]")) {
    const cls = el.attr("class") ?? "";
    const id = el.attr("id") ?? "";
    if (CAPTCHA_MARKER.test(cls) || CAPTCHA_MARKER.test(id)) add(el);
  }

  return hits;
}

function elementInsideForm(dom: AuditContext["page"]["raw"]["dom"], el: ElementView): boolean {
  const outer = el.outerHtml();
  return dom.all("form").some((form) => form.outerHtml().includes(outer));
}

function scoreCaptcha(dom: AuditContext["page"]["raw"]["dom"], findings: Finding[]): number {
  const markers = captchaElements(dom);
  if (markers.length === 0) {
    findings.push({
      id: "access.captcha.none",
      severity: "info",
      positive: true,
      title: "No CAPTCHA markup detected",
      detail: "No reCAPTCHA, hCaptcha, or Turnstile widgets found in the raw HTML.",
      evidence: [{ source: "raw-html", summary: "No CAPTCHA script or widget markers" }],
    });
    return 20;
  }

  const onForm = markers.some((m) => elementInsideForm(dom, m));
  if (onForm) {
    findings.push({
      id: "access.captcha.on-form",
      severity: "high",
      title: "CAPTCHA blocks form submission for agents",
      detail: "An agent cannot complete this form because a CAPTCHA challenge is embedded in it.",
      evidence: markers.slice(0, 3).map((m) => ({
        source: "raw-html" as const,
        summary: m.path || m.tag,
        excerpt: excerpt(m.outerHtml(), 120),
      })),
      remediation: {
        summary: "Use invisible/managed Turnstile or move the challenge after the agent step.",
        rationale: "Agents cannot solve interactive CAPTCHAs; keep the HTML form submittable or defer verification.",
        snippet:
          '<!-- Cloudflare Turnstile managed mode -->\n<div class="cf-turnstile" data-sitekey="..." data-size="invisible"></div>',
        language: "html",
      },
    });
    return 0;
  }

  findings.push({
    id: "access.captcha.present",
    severity: "medium",
    title: "CAPTCHA markup present on the page",
    detail: "Challenge widgets are present but not tied to a form in the raw HTML.",
    evidence: markers.slice(0, 3).map((m) => ({
      source: "raw-html" as const,
      summary: m.path || m.tag,
      excerpt: excerpt(m.outerHtml(), 120),
    })),
  });
  return 10;
}

function jsHeuristics(ctx: AuditContext): boolean[] {
  const dom = ctx.page.raw.dom;
  const html = ctx.page.raw.html;
  const fired: boolean[] = [];

  const bodyWords = wordCount(dom.bodyText());
  const hasScriptSrc = dom.all('script[src]').length > 0;
  const h1 = bodyWords < 50 && hasScriptSrc;
  fired.push(h1);

  const emptyMount = MOUNT_SELECTORS.some((sel) => {
    const el = dom.first(sel);
    return el !== undefined && el.text().trim() === "";
  });
  fired.push(emptyMount);

  const noscriptMatch = dom.all("noscript").some((n) => NOSCRIPT_JS.test(n.text()));
  fired.push(noscriptMatch);

  const noLinksOrForms = dom.all("a[href]").length === 0 && dom.all("form").length === 0;
  fired.push(noLinksOrForms);

  const frameworkMarker =
    h1 && (html.includes("__NEXT_DATA__") || /window\.__NUXT__/.test(html));
  fired.push(frameworkMarker);

  return fired;
}

function scoreJsDependence(
  ctx: AuditContext,
  findings: Finding[],
): { points: number; count: number } {
  const fired = jsHeuristics(ctx);
  const count = fired.filter(Boolean).length;

  if (count === 0) {
    findings.push({
      id: "access.js.static",
      severity: "info",
      positive: true,
      title: "Content is readable without JavaScript",
      detail: "Primary content appears in the raw HTML; no JS-dependence heuristics fired.",
      evidence: [{ source: "raw-html", summary: `${wordCount(ctx.page.raw.dom.bodyText())} words in body text` }],
    });
    return { points: 35, count: 0 };
  }

  if (count === 1) {
    findings.push({
      id: "access.js.possible",
      severity: "low",
      title: "Page may depend on JavaScript",
      detail: JS_HEURISTIC_DETAIL,
      evidence: [{ source: "raw-html", summary: "1 JS-dependence heuristic fired" }],
    });
    return { points: 25, count: 1 };
  }

  if (count === 2) {
    findings.push({
      id: "access.js.likely",
      severity: "medium",
      title: "Page likely depends on JavaScript",
      detail: JS_HEURISTIC_DETAIL + JS_CAP_DETAIL.likely,
      evidence: [{ source: "raw-html", summary: "2 JS-dependence heuristics fired" }],
      remediation: {
        summary: "Pre-render primary content in HTML for agent and no-JS clients.",
        rationale: "Agents fetch raw HTML; SPAs that mount into empty divs hide their content.",
        snippet:
          '<!-- Next.js: prefer server components / static rendering -->\nexport const dynamic = "force-static";',
        language: "ts",
      },
    });
    return { points: 12, count: 2 };
  }

  findings.push({
    id: "access.js.required",
    severity: "high",
    title: "Content appears to require JavaScript",
    detail: JS_HEURISTIC_DETAIL + JS_CAP_DETAIL.required,
    evidence: [{ source: "raw-html", summary: `${count} JS-dependence heuristics fired` }],
    remediation: {
      summary: "Emit primary content in HTML or pre-render this route.",
      rationale: "Multiple empty-shell signals mean agents see little or no usable text.",
      snippet:
        '<!-- Generic SPA: server-render the route or hydrate from inline JSON -->\n<main><h1>Page title</h1><p>Primary content belongs here in HTML.</p></main>',
      language: "html",
    },
  });
  return { points: 0, count };
}

function longListWithoutPagination(dom: AuditContext["page"]["raw"]["dom"]): boolean {
  let maxListItems = 0;
  for (const list of dom.all("ul, ol")) {
    maxListItems = Math.max(maxListItems, list.all(":scope > li").length);
  }
  const articles = dom.all("article").length;
  const hasLongList = maxListItems >= 20 || articles >= 20;
  if (!hasLongList) return false;

  const hasNextRel = dom.all('a[rel~="next"], link[rel="next"], link[rel~=next]').length > 0;
  const hasPageParam = dom.all('a[href*="page="]').length > 0;
  const hasPagerUi = dom.all("[class], [id]").some((el) => {
    const cls = el.attr("class") ?? "";
    const id = el.attr("id") ?? "";
    return PAGINATION_MARKER.test(cls) || PAGINATION_MARKER.test(id);
  });

  return !hasNextRel && !hasPageParam && !hasPagerUi;
}

function scorePagination(dom: AuditContext["page"]["raw"]["dom"], findings: Finding[]): number {
  if (!longListWithoutPagination(dom)) return 15;
  findings.push({
    id: "access.scroll.no-pagination",
    severity: "medium",
    title: "Long list without paginated fallback",
    detail: "Infinite scroll without a paginated fallback leaves agents with only the first screen.",
    evidence: [{ source: "raw-html", summary: "≥20 list items or articles, no rel=next or page= links" }],
    remediation: {
      summary: "Add rel=next links or page= URLs for long feeds.",
      rationale: "Agents cannot scroll; pagination gives them the rest of the list.",
      snippet: '<nav aria-label="Pagination"><a rel="next" href="?page=2">Next page</a></nav>',
      language: "html",
    },
  });
  return 0;
}

function confidence(jsCount: number, botManagement: boolean): Confidence {
  if (jsCount >= 2) return "low";
  if (jsCount === 1 || botManagement) return "medium";
  return "high";
}

function summaryFor(score: number): string {
  if (score >= 75) return "Agents can read this page without a browser.";
  if (score >= 40) return "Readable, with some friction for agents.";
  return "Content is walled or hidden behind JavaScript.";
}

export const accessRenderabilityCheck: AuditCheck = {
  id: "access-renderability",
  version: 1,
  category: "access-renderability",
  run(ctx: AuditContext): CheckResult {
    const dom = ctx.page.raw.dom;
    const findings: Finding[] = [];
    let points = 0;

    points += scoreStatus(ctx.page.status);

    const robotsPoints = scoreRobotsTag(ctx.page.headers, findings);
    points += robotsPoints;

    const bot = scoreBotManagement(ctx.page.headers, findings);
    points += bot.points;

    if (robotsPoints === 10 && bot.points === 10) {
      findings.push({
        id: "access.headers.ok",
        severity: "info",
        positive: true,
        title: "Response headers allow agent access",
        detail: "No noindex/noai directives or bot-management headers detected.",
        evidence: [{ source: "response-header", summary: "x-robots-tag and bot-management clear" }],
      });
    }

    points += scoreCaptcha(dom, findings);

    const js = scoreJsDependence(ctx, findings);
    points += js.points;

    points += scorePagination(dom, findings);

    let score = Math.max(0, Math.min(100, points));
    if (js.count >= 3) score = Math.min(score, 35);
    else if (js.count === 2) score = Math.min(score, 60);

    return {
      checkId: "access-renderability",
      category: "access-renderability",
      applicable: true,
      score,
      confidence: confidence(js.count, bot.present),
      findings,
      summary: summaryFor(score),
    };
  },
};
