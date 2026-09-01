import { describe, expect, it } from "vitest";
import { createHtmlQuery } from "@/lib/acquisition/html-query";
import { discoverLinkedSidecars } from "@/lib/acquisition/sidecars";
import { fixture } from "../helpers/context";

describe("HtmlQuery adapter", () => {
  const q = createHtmlQuery(fixture("agent-ready.html"));

  it("queries, reads attributes and text", () => {
    const form = q.first("form");
    expect(form?.attr("toolname")).toBe("book_repair");
    expect(form?.all("input")).toHaveLength(3);
    expect(q.first("h1")?.text()).toBe("Bike repairs, rentals and parts");
  });

  it("produces stable evidence paths", () => {
    expect(q.first("#email")?.path).toBe("input#email");
    expect(q.first("nav a")?.path).toMatch(/^header > nav > a:nth-of-type\(1\)$/);
  });

  it("bodyText strips scripts and collapses whitespace", () => {
    const t = createHtmlQuery("<body><script>var x=1</script><p>a\n\n  b</p><style>p{}</style></body>").bodyText();
    expect(t).toBe("a b");
  });

  it("does not execute anything and tolerates hostile markup", () => {
    const q2 = createHtmlQuery("<img src=x onerror=alert(1)><script>while(true){}</script><div><div><div>deep");
    expect(q2.first("img")?.attr("onerror")).toBe("alert(1)");
    expect(q2.bodyText()).toBe("deep");
  });
});

describe("discoverLinkedSidecars", () => {
  it("finds same-origin feed and OpenAPI links, ignores cross-origin", () => {
    const q = createHtmlQuery(
      `<link rel="alternate" type="application/rss+xml" href="/feed.xml">
       <link rel="alternate" type="application/atom+xml" href="https://other.example/atom">
       <a href="/docs/openapi.yaml">API</a>
       <a href="https://evil.example/swagger.json">x</a>`,
    );
    const found = discoverLinkedSidecars(q, "https://site.example");
    expect(found).toEqual([
      { key: "linked-feed", url: "https://site.example/feed.xml" },
      { key: "linked-openapi", url: "https://site.example/docs/openapi.yaml" },
    ]);
  });
});
