/**
 * Machine-readable structure (Understand): can an agent interpret the page
 * without guessing?
 *
 * Points (100):
 *   JSON-LD present & valid (with @type) ............. 30
 *   <title> + meta description ....................... 10
 *   OpenGraph title+description (social, low weight) . 10
 *   Landmarks: <main> 10, <nav> 5, header/footer 5 ... 20
 *   Headings: exactly one h1 10, no skipped levels 10  20
 *   lang attribute 5, canonical 5 .................... 10
 */
import type { AuditCheck, AuditContext, CheckResult, Finding } from "../contract";
import { excerpt } from "../contract";

const DOCS = {
  jsonld: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
  landmarks: "https://developer.mozilla.org/docs/Web/HTML/Element/main",
  headings: "https://developer.mozilla.org/docs/Web/HTML/Element/Heading_Elements",
};

interface JsonLdParse {
  blocks: number;
  /** Parses as JSON with an object/array root. */
  valid: number;
  /** Valid AND declares a schema.org @context (or @graph under one). */
  schemaOrg: number;
  types: string[];
}

function hasSchemaContext(ctxVal: unknown): boolean {
  if (typeof ctxVal === "string") return /schema\.org/i.test(ctxVal);
  if (Array.isArray(ctxVal)) return ctxVal.some(hasSchemaContext);
  if (ctxVal && typeof ctxVal === "object") return Object.values(ctxVal as Record<string, unknown>).some(hasSchemaContext);
  return false;
}

/** Bounded JSON-LD validation (review N2): syntax, root shape, schema.org context, non-empty @type. */
function parseJsonLd(ctx: AuditContext): JsonLdParse {
  const blocks = ctx.page.raw.dom.all('script[type="application/ld+json"]');
  const types: string[] = [];
  let valid = 0;
  let schemaOrg = 0;
  for (const b of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(b.text()) as unknown;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    valid++;
    const roots = Array.isArray(parsed) ? parsed : [parsed];
    let blockHasContext = false;
    const collect = (node: unknown, inherited: boolean) => {
      if (Array.isArray(node)) return node.forEach((n) => collect(n, inherited));
      if (node && typeof node === "object") {
        const o = node as Record<string, unknown>;
        const hasCtx = inherited || hasSchemaContext(o["@context"]);
        if (hasCtx) blockHasContext = true;
        const t = o["@type"];
        if (hasCtx) {
          if (typeof t === "string" && t.trim()) types.push(t.trim());
          else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && x.trim() && types.push(x.trim()));
        }
        if (Array.isArray(o["@graph"])) collect(o["@graph"], hasCtx);
      }
    };
    roots.forEach((r) => collect(r, false));
    if (blockHasContext) schemaOrg++;
  }
  return { blocks: blocks.length, valid, schemaOrg, types: [...new Set(types)] };
}

export const machineReadableStructureCheck: AuditCheck = {
  id: "machine-readable-structure",
  version: 1,
  category: "machine-readable-structure",
  run(ctx: AuditContext): CheckResult {
    const dom = ctx.page.raw.dom;
    const findings: Finding[] = [];
    let points = 0;
    const url = new URL(ctx.page.finalUrl);

    // ---- JSON-LD (30)
    const ld = parseJsonLd(ctx);
    if (ld.schemaOrg > 0 && ld.types.length > 0) {
      points += 30;
      findings.push({
        id: "structure.jsonld.present",
        severity: "info",
        positive: true,
        title: `Structured data: ${ld.types.slice(0, 4).join(", ")}`,
        detail: `${ld.valid} valid JSON-LD block${ld.valid > 1 ? "s" : ""}. Agents can read entities and their properties directly.`,
        evidence: [{ source: "raw-html", summary: `script[type="application/ld+json"] × ${ld.blocks}` }],
      });
    } else if (ld.blocks > 0) {
      points += 10;
      findings.push({
        id: "structure.jsonld.invalid",
        severity: "medium",
        title: "JSON-LD present but unusable",
        detail:
          ld.valid === 0
            ? "The JSON-LD block does not parse as a JSON object."
            : ld.schemaOrg === 0
              ? "JSON-LD parses but has no schema.org @context, so agents cannot interpret its vocabulary."
              : "JSON-LD parses but declares no @type.",
        evidence: [{ source: "raw-html", summary: "script[type=application/ld+json]", excerpt: excerpt(dom.first('script[type="application/ld+json"]')?.text() ?? "", 200) }],
        remediation: {
          summary: "Fix the JSON and declare @context and @type.",
          rationale: "Agents and search engines silently ignore invalid blocks.",
          snippet: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "WebSite",\n  "name": "${url.hostname}",\n  "url": "${url.origin}/"\n}\n</script>`,
          language: "html",
          docsUrl: DOCS.jsonld,
        },
      });
    } else {
      findings.push({
        id: "structure.jsonld.missing",
        severity: "high",
        title: "No structured data (JSON-LD)",
        detail: "Without schema.org markup an agent must infer what this page is — a product, an article, an organisation — from prose. That inference is where agents make mistakes.",
        evidence: [{ source: "raw-html", summary: "No script[type=application/ld+json] found" }],
        remediation: {
          summary: "Add a JSON-LD block describing the page's primary entity.",
          rationale: "One script tag turns guesswork into facts. Start with WebSite/Organization, then the page type (Product, Article, FAQPage…).",
          snippet: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "WebSite",\n  "name": "${url.hostname}",\n  "url": "${url.origin}/",\n  "potentialAction": {\n    "@type": "SearchAction",\n    "target": "${url.origin}/search?q={query}",\n    "query-input": "required name=query"\n  }\n}\n</script>`,
          language: "html",
          docsUrl: DOCS.jsonld,
        },
      });
    }

    // ---- title + description (10)
    const title = dom.first("head > title, title")?.text() ?? "";
    const desc = dom.first('meta[name="description"]')?.attr("content")?.trim() ?? "";
    if (title && desc) {
      points += 10;
    } else {
      points += title ? 5 : 0;
      findings.push({
        id: "structure.meta.incomplete",
        severity: title ? "low" : "medium",
        title: title ? "Missing meta description" : "Missing <title>",
        detail: "Title and description are the first summary an agent reads when deciding whether this page is relevant.",
        evidence: [{ source: "raw-html", summary: `title: ${title ? `"${excerpt(title, 60)}"` : "none"}; description: ${desc ? "present" : "none"}` }],
        remediation: {
          summary: "Add a specific <title> and meta description.",
          rationale: "Cheap, universal, and used by every agent and crawler.",
          snippet: `<title>What this page is — ${url.hostname}</title>\n<meta name="description" content="One sentence saying what a visitor (or agent) can do here.">`,
          language: "html",
        },
      });
    }

    // ---- OpenGraph (10)
    const ogTitle = dom.first('meta[property="og:title"]')?.attr("content");
    const ogDesc = dom.first('meta[property="og:description"]')?.attr("content");
    if (ogTitle && ogDesc) points += 10;
    else if (ogTitle || ogDesc) points += 5;
    else {
      findings.push({
        id: "structure.og.missing",
        severity: "low",
        title: "No OpenGraph metadata",
        detail: "Social metadata is a minor signal for agents, but many crawlers read og:* as a fallback summary.",
        evidence: [{ source: "raw-html", summary: "No meta[property^=og:]" }],
        remediation: {
          summary: "Add og:title, og:description and og:image.",
          rationale: "Low effort; improves link previews and gives agents a second summary source.",
          snippet: `<meta property="og:title" content="${excerpt(title || url.hostname, 60)}">\n<meta property="og:description" content="…">\n<meta property="og:image" content="${url.origin}/og.png">`,
          language: "html",
        },
      });
    }

    // ---- landmarks (20)
    const hasMain = !!dom.first('main, [role="main"]');
    const hasNav = !!dom.first('nav, [role="navigation"]');
    const hasHeaderFooter = !!dom.first('header, [role="banner"]') || !!dom.first('footer, [role="contentinfo"]');
    points += (hasMain ? 10 : 0) + (hasNav ? 5 : 0) + (hasHeaderFooter ? 5 : 0);
    if (!hasMain) {
      findings.push({
        id: "structure.landmarks.no-main",
        severity: "medium",
        title: "No <main> landmark",
        detail: `Landmarks tell an agent where the content is and what is chrome. Found: ${[hasNav && "nav", hasHeaderFooter && "header/footer"].filter(Boolean).join(", ") || "none"}.`,
        evidence: [{ source: "raw-html", summary: "No <main> or [role=main]" }],
        remediation: {
          summary: "Wrap the primary content in <main>; use <nav>, <header>, <footer>.",
          rationale: "Semantic landmarks are free structure — screen readers and agents both use them to skip chrome.",
          snippet: "<header>…site header…</header>\n<nav aria-label=\"Primary\">…</nav>\n<main>\n  …the content agents should read…\n</main>\n<footer>…</footer>",
          language: "html",
          docsUrl: DOCS.landmarks,
        },
      });
    } else {
      findings.push({
        id: "structure.landmarks.present",
        severity: "info",
        positive: true,
        title: "Semantic landmarks present",
        detail: `main${hasNav ? ", nav" : ""}${hasHeaderFooter ? ", header/footer" : ""}`,
        evidence: [{ source: "raw-html", summary: "Landmark elements found" }],
      });
    }

    // ---- headings (20)
    const headings = dom.all("h1, h2, h3, h4, h5, h6");
    const h1s = headings.filter((h) => h.tag === "h1");
    if (h1s.length === 1) points += 10;
    else if (h1s.length > 1) points += 5;
    let skipped = 0;
    let prev = 0;
    for (const h of headings) {
      const level = Number(h.tag[1]);
      if (prev && level > prev + 1) skipped++;
      prev = level;
    }
    if (headings.length > 0 && skipped === 0) points += 10;
    else if (headings.length > 0) points += 5;
    if (h1s.length !== 1 || skipped > 0) {
      findings.push({
        id: "structure.headings.hierarchy",
        severity: h1s.length === 0 ? "medium" : "low",
        title:
          h1s.length === 0 ? "No <h1> on the page" : h1s.length > 1 ? `${h1s.length} <h1> elements` : `Heading levels skipped ${skipped}×`,
        detail: "Agents build an outline from headings to decide what a page is about and where sections start.",
        evidence: [{ source: "raw-html", summary: `h1×${h1s.length}, total headings ${headings.length}, skipped levels ${skipped}` }],
        remediation: {
          summary: "One <h1> per page; do not skip levels (h2 → h4).",
          rationale: "A clean outline is the cheapest map of your page an agent can get.",
          language: "html",
          docsUrl: DOCS.headings,
        },
      });
    } else {
      findings.push({
        id: "structure.headings.ok",
        severity: "info",
        positive: true,
        title: "Clean heading outline",
        detail: `One h1, ${headings.length} headings, no skipped levels.`,
        evidence: [{ source: "raw-html", summary: excerpt(h1s[0].text(), 80) }],
      });
    }

    // ---- lang + canonical (10)
    const lang = dom.first("html")?.attr("lang");
    const canonical = dom.first('link[rel="canonical"]')?.attr("href");
    points += (lang ? 5 : 0) + (canonical ? 5 : 0);
    if (!lang || !canonical) {
      findings.push({
        id: "structure.document.meta",
        severity: "low",
        title: !lang && !canonical ? "No lang attribute or canonical URL" : !lang ? "No lang attribute on <html>" : "No canonical URL",
        detail: "Language and canonical URL help agents choose the right version of a page and parse its text correctly.",
        evidence: [{ source: "raw-html", summary: `lang=${lang ?? "none"}; canonical=${canonical ?? "none"}` }],
        remediation: {
          summary: "Declare lang and a canonical link.",
          rationale: "Two attributes; prevents duplicate-URL confusion and wrong-language parsing.",
          snippet: `<html lang="en">\n<head>\n  <link rel="canonical" href="${url.origin}${url.pathname}">`,
          language: "html",
        },
      });
    }

    const score = Math.max(0, Math.min(100, points));
    return {
      checkId: "machine-readable-structure",
      category: "machine-readable-structure",
      applicable: true,
      score,
      confidence: "high",
      findings,
      summary:
        score >= 75
          ? "The page describes itself well to machines."
          : ld.valid > 0
            ? "Structured data present; page structure needs work."
            : "Agents must infer what this page is from prose alone.",
    };
  },
};
