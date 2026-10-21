/**
 * The studio's privacy policy (https://ftlenterprises.us/privacy) has an
 * AgentReady section; the landing page and the docs link to it from their
 * footers, so the policy is one click from wherever an audit starts.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Same stand-ins as the dogfood test: the landing form needs a router, and
// fonts load through the Next compiler. Neither affects the footer markup.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "--font-test", className: "font-test", style: { fontFamily: "test" } });
  return { Bricolage_Grotesque: font, Geist: font, Geist_Mono: font };
});

import Home from "@/app/page";
import Docs from "@/app/docs/page";

const POLICY = "https://ftlenterprises.us/privacy#agentready";

function footerOf(html: string): string {
  const match = html.match(/<footer[\s\S]*?<\/footer>/);
  expect(match, "page has a footer").not.toBeNull();
  return match![0];
}

describe("privacy link", () => {
  it.each([
    ["landing page", Home],
    ["docs", Docs],
  ])("the %s footer links to AgentReady's section of the studio policy", async (_name, Page) => {
    const element = await (Page as () => Promise<React.ReactElement> | React.ReactElement)();
    const footer = footerOf(renderToStaticMarkup(element));
    expect(footer).toMatch(new RegExp(`<a[^>]*href="${POLICY.replace(/[.?#]/g, "\\$&")}"[^>]*>Privacy</a>`));
  });
});
