/**
 * Two invariants that both come from `/report` being a server-rendered audit.
 *
 * 1. **No link to `/report` may prefetch.** Prefetching one would fetch and
 *    score a third-party site from an idle page — real outbound requests and
 *    real rate-limiter budget, with nobody having clicked anything.
 * 2. **Only `/` declares the WebMCP tool.** The same form is rendered in the
 *    `/report` header, where the page's subject is somebody else's site; a tool
 *    is scoped to the page that declares it.
 *
 * `next/link` is mocked to surface `prefetch` as a DOM attribute, since the
 * real component does not render it.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
  }: {
    href: string;
    prefetch?: boolean;
    children?: React.ReactNode;
  }) => (
    <a href={href} data-prefetch={String(prefetch)}>
      {children}
    </a>
  ),
}));

import { DemoAuditPanel } from "@/components/demo/demo-audit-panel";
import { SafeUrlChips } from "@/components/landing/safe-url-chips";
import { UrlAuditForm } from "@/components/landing/url-audit-form";
import { SAFE_URLS } from "@/lib/safe-urls";

/** Every `<a href="/report…">` in the markup, with the prefetch value it was given. */
function reportLinks(markup: string): { href: string; prefetch: string }[] {
  return [...markup.matchAll(/<a href="([^"]*)" data-prefetch="([^"]*)"/g)]
    .map(([, href, prefetch]) => ({ href, prefetch }))
    .filter((link) => link.href.startsWith("/report"));
}

describe("links to /report never prefetch", () => {
  it("covers the landing chips", () => {
    const links = reportLinks(renderToStaticMarkup(<SafeUrlChips />));
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => l.href.startsWith("/report?url="))).toBe(true);
    expect(links.map((l) => l.prefetch)).toEqual(links.map(() => "false"));
  });

  it("covers the demo page's 'Audit it' link", () => {
    const links = reportLinks(renderToStaticMarkup(<DemoAuditPanel />));
    expect(links.length).toBe(1);
    expect(links[0].prefetch).toBe("false");
  });
});

describe("safe-url chip labels", () => {
  it("describe the page and never quote a grade", () => {
    for (const entry of SAFE_URLS) {
      expect(entry.label).not.toMatch(/\((?:A|B|C|D|F)\)/);
    }
    expect(SAFE_URLS.map((e) => e.label)).toContain("Our demo");
    expect(SAFE_URLS.map((e) => e.label)).toContain("Beautiful but broken");
  });
});

describe("only the landing page declares audit_site on the form", () => {
  it("omits the WebMCP attributes by default — the /report header form", () => {
    const markup = renderToStaticMarkup(<UrlAuditForm initial="example.com" compact />);
    expect(markup).not.toContain("toolname");
    expect(markup).not.toContain("tooldescription");
    expect(markup).not.toContain("toolparamdescription");
    // The form is still a real, submittable GET — only the declaration is gone.
    expect(markup).toContain('action="/report"');
    expect(markup).toContain('method="get"');
    expect(markup).toContain('name="url"');
  });

  it("declares the tool when the owning page asks for it", () => {
    const markup = renderToStaticMarkup(<UrlAuditForm declareTool />);
    expect(markup).toContain('toolname="audit_site"');
    expect(markup).toContain("tooldescription=");
    expect(markup).toContain("toolparamdescription=");
  });
});
