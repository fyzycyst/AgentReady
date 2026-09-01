/**
 * HtmlQuery adapter over cheerio. This is the only file that imports a parser.
 * Checks receive the read-only HtmlQuery seam (contract.ts) so the parser can
 * be swapped (linkedom is the recorded second choice) without touching checks.
 */
import * as cheerio from "cheerio";
import { isTag, type AnyNode, type Element } from "domhandler";
import type { ElementView, HtmlQuery, HtmlSnapshot } from "@/lib/audit/contract";

type CheerioRoot = ReturnType<typeof cheerio.load>;

function pathOf(el: Element): string {
  const parts: string[] = [];
  let node: AnyNode | null = el;
  let depth = 0;
  while (node && isTag(node) && depth < 6 && node.name !== "body" && node.name !== "html") {
    const e: Element = node;
    let seg = e.name;
    const id = e.attribs?.id;
    if (id) {
      parts.unshift(`${seg}#${id}`);
      break;
    }
    const parent = e.parent;
    if (parent && isTag(parent)) {
      const siblings = (parent.children ?? []).filter((c) => isTag(c) && c.name === e.name);
      if (siblings.length > 1) seg += `:nth-of-type(${siblings.indexOf(e) + 1})`;
    }
    parts.unshift(seg);
    node = parent && isTag(parent) ? parent : null;
    depth++;
  }
  return parts.join(" > ");
}

function view($: CheerioRoot, el: Element): ElementView {
  const $el = $(el);
  return {
    path: pathOf(el),
    tag: el.name.toLowerCase(),
    attr: (name) => el.attribs?.[name],
    attrs: () => ({ ...(el.attribs ?? {}) }),
    text: () => $el.text().replace(/\s+/g, " ").trim(),
    outerHtml: () => $.html(el),
    all: (selector) => $el.find(selector).toArray().filter(isTag).map((n) => view($, n)),
    first: (selector) => {
      const n = $el.find(selector).toArray().find(isTag);
      return n ? view($, n) : undefined;
    },
  };
}

export function createHtmlQuery(html: string): HtmlQuery {
  const $ = cheerio.load(html);
  let cachedBodyText: string | null = null;
  return {
    all: (selector) => $(selector).toArray().filter(isTag).map((n) => view($, n)),
    first: (selector) => {
      const n = $(selector).toArray().find(isTag);
      return n ? view($, n) : undefined;
    },
    bodyText: () => {
      if (cachedBodyText !== null) return cachedBodyText;
      const $body = $("body").clone();
      $body.find("script, style, noscript, template, svg").remove();
      cachedBodyText = $body.text().replace(/\s+/g, " ").trim();
      return cachedBodyText;
    },
  };
}

export function createHtmlSnapshot(html: string): HtmlSnapshot {
  return { html, dom: createHtmlQuery(html) };
}
