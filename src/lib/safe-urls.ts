/**
 * One-click chips for the landing page (Triumvirate axis G). These must be
 * re-tested against the deployed fetcher before any demo — see
 * docs/RISK_REGISTER.md #1. Keep to sites that are known to serve raw HTML
 * to non-browser user agents without a challenge.
 */
export const SAFE_URLS: readonly { label: string; url: string }[] = [
  { label: "example.com", url: "https://example.com/" },
  { label: "MDN", url: "https://developer.mozilla.org/en-US/" },
  { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Web_browser" },
  { label: "GitHub", url: "https://github.com/webmachinelearning/webmcp" },
];
