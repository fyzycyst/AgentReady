/**
 * robots.txt evaluation per RFC 9309:
 *  - groups are selected by PRODUCT TOKEN (case-insensitive, exact), and
 *    ALL groups matching the token are combined (§2.2.1) — review B3;
 *  - `*` groups apply only when no token-specific group matches;
 *  - longest-match Allow/Disallow with `*` and `$` wildcards; Allow wins ties.
 * Pure; the caller supplies the file body.
 */

export interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; pattern: string }[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export function parseRobots(body: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(normaliseToken(value));
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if ((key === "allow" || key === "disallow") && current) {
      current.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  return { groups, sitemaps };
}

/** "GPTBot/1.2 (+url)" → "gptbot". RFC 9309 product tokens are compared exactly, case-insensitively. */
function normaliseToken(agentLine: string): string {
  return agentLine.trim().toLowerCase().split(/[\s/]/)[0] ?? "";
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const anchored = escaped.endsWith("\\$") ? escaped.slice(0, -2) + "$" : escaped;
  return new RegExp("^" + anchored);
}

/** Rules that apply to `token`: union of all matching groups, else union of all `*` groups. */
export function rulesFor(robots: ParsedRobots, token: string): { allow: boolean; pattern: string }[] | null {
  const t = normaliseToken(token);
  const specific = robots.groups.filter((g) => g.agents.includes(t));
  const chosen = specific.length > 0 ? specific : robots.groups.filter((g) => g.agents.includes("*"));
  if (chosen.length === 0) return null;
  return chosen.flatMap((g) => g.rules);
}

/**
 * Is `path` (with query) allowed for the product `token`? No matching group
 * (and no `*` group) means allowed. An empty Disallow means allow-all.
 */
export function isAllowed(robots: ParsedRobots, token: string, path: string): boolean {
  const rules = rulesFor(robots, token);
  if (!rules) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const rule of rules) {
    if (rule.pattern === "") continue; // "Disallow:" (empty) = no restriction
    if (patternToRegex(rule.pattern).test(path)) {
      const len = rule.pattern.length;
      if (!best || len > best.len || (len === best.len && rule.allow && !best.allow)) {
        best = { allow: rule.allow, len };
      }
    }
  }
  return best ? best.allow : true;
}

/** Well-known AI crawler product tokens, for the discovery check's "who is blocked" finding. */
export const AI_AGENT_TOKENS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "anthropic-ai",
  "Google-Extended",
  "PerplexityBot",
  "Bingbot",
  "CCBot",
  "Applebot-Extended",
  "Bytespider",
] as const;
