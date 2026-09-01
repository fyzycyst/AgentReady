/**
 * Pure network policy: URL validation and IP-address classification.
 * No I/O here — this is the unit-testable heart of safe-fetch.
 * See docs/INVARIANTS.md (safe-fetch invariants 1–2, 4).
 */
import { isIPv4, isIPv6 } from "node:net";

export type UrlRejection =
  | "invalid-url"
  | "scheme"
  | "userinfo"
  | "port"
  | "empty-host"
  | "blocked-host";

export type UrlCheck =
  | { ok: true; url: URL; hostIsIpLiteral: boolean }
  | { ok: false; reason: UrlRejection; message: string };

const ALLOWED_PORTS = new Set(["", "80", "443"]);

/** Hostnames that must never be fetched regardless of DNS. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "instance-data.ec2.internal",
]);

const BLOCKED_HOST_SUFFIXES = [".localhost", ".internal", ".local", ".arpa"];

/**
 * Validate a user-supplied (or Location-header) URL against invariant 1.
 * Fragments are stripped; everything else must be exact.
 */
export function validateUrl(input: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: "invalid-url", message: "Not an absolute URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "scheme", message: "Only http and https URLs are audited." };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "userinfo", message: "Credentials in URLs are not allowed." };
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    return { ok: false, reason: "port", message: "Only ports 80 and 443 are allowed." };
  }
  url.hash = "";
  const host = url.hostname.toLowerCase();
  if (host === "") {
    return { ok: false, reason: "empty-host", message: "URL has no host." };
  }
  // WHATWG URL wraps IPv6 literals in brackets.
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const isLiteral = isIPv4(bare) || isIPv6(bare);
  if (isLiteral) {
    if (classifyAddress(bare) !== "global") {
      return { ok: false, reason: "blocked-host", message: "Address is not publicly routable." };
    }
    return { ok: true, url, hostIsIpLiteral: true };
  }
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "blocked-host", message: "Host is reserved or internal." };
  }
  // Hostnames must be plausible DNS names (letters, digits, hyphen, dot; IDNA is punycoded by URL).
  if (!/^[a-z0-9.-]+$/.test(host) || host.includes("..") || !host.includes(".")) {
    return { ok: false, reason: "blocked-host", message: "Host is not a public DNS name." };
  }
  return { ok: true, url, hostIsIpLiteral: false };
}

export type AddressClass = "global" | "blocked";

/**
 * Classify an IP literal (v4 or v6). Anything not clearly global is blocked:
 * loopback, RFC1918, CGNAT, link-local (incl. cloud metadata 169.254.0.0/16 and
 * fd00:ec2::254), multicast, reserved, documentation ranges, unspecified,
 * and IPv6 forms that embed an IPv4 (mapped, NAT64, 6to4, Teredo) — which are
 * classified by their embedded IPv4.
 */
export function classifyAddress(ip: string): AddressClass {
  if (isIPv4(ip)) return classifyV4(ip);
  if (isIPv6(ip)) return classifyV6(ip);
  return "blocked";
}

function classifyV4(ip: string): AddressClass {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0) return "blocked"; // 0.0.0.0/8 "this network"
  if (a === 10) return "blocked"; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return "blocked"; // CGNAT 100.64/10
  if (a === 127) return "blocked"; // loopback
  if (a === 169 && b === 254) return "blocked"; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return "blocked"; // RFC1918
  if (a === 192 && b === 0) return "blocked"; // 192.0.0/24 IETF, 192.0.2/24 TEST-NET-1
  if (a === 192 && b === 168) return "blocked"; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return "blocked"; // benchmarking
  if (a === 198 && b === 51) return "blocked"; // TEST-NET-2 (198.51.100/24)
  if (a === 203 && b === 0) return "blocked"; // TEST-NET-3 (203.0.113/24)
  if (a >= 224) return "blocked"; // multicast + reserved + broadcast
  return "global";
}

/** Expand an IPv6 string into 8 16-bit groups. Handles embedded dotted IPv4. */
export function expandV6(ip: string): number[] | null {
  let s = ip;
  // Zone id (fe80::1%eth0) – strip, it is link-local anyway.
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  // Embedded IPv4 tail.
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!isIPv4(tail)) return null;
    const [a, b, c, d] = tail.split(".").map(Number);
    s = s.slice(0, lastColon + 1) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array(missing).fill("0"), ...rest].map((g) => parseInt(g || "0", 16));
  if (groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return null;
  return groups;
}

function classifyV6(ip: string): AddressClass {
  const g = expandV6(ip);
  if (!g) return "blocked";
  const embeddedV4 = (hi: number, lo: number) =>
    `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;

  const allZeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0);
  // :: and ::1
  if (allZeroPrefix(7) && (g[7] === 0 || g[7] === 1)) return "blocked";
  // ::ffff:a.b.c.d  IPv4-mapped
  if (allZeroPrefix(5) && g[5] === 0xffff) return classifyV4(embeddedV4(g[6], g[7]));
  // ::a.b.c.d IPv4-compatible (deprecated)
  if (allZeroPrefix(6)) return classifyV4(embeddedV4(g[6], g[7]));
  // 64:ff9b::/96 NAT64
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return classifyV4(embeddedV4(g[6], g[7]));
  }
  // 2002::/16 6to4 — embedded v4 in groups 1-2
  if (g[0] === 0x2002) return classifyV4(embeddedV4(g[1], g[2]));
  // 2001::/32 Teredo — embeds a server v4 (groups 2-3) and an obfuscated client v4
  // (groups 6-7, bitwise NOT). Both could be prohibited; blocking the whole /32 is
  // the safe v1 call (review B5). Nobody hosts a public website on Teredo.
  if (g[0] === 0x2001 && g[1] === 0) return "blocked";
  const top = g[0];
  if ((top & 0xfe00) === 0xfc00) return "blocked"; // fc00::/7 ULA (covers fd00:ec2::254)
  if ((top & 0xffc0) === 0xfe80) return "blocked"; // fe80::/10 link-local
  if ((top & 0xff00) === 0xff00) return "blocked"; // ff00::/8 multicast
  if (top === 0x2001 && g[1] === 0x0db8) return "blocked"; // documentation
  if (top === 0x0100 && g[1] === 0) return "blocked"; // 100::/64 discard
  // Only 2000::/3 is global unicast.
  if ((top & 0xe000) !== 0x2000) return "blocked";
  return "global";
}

/** True iff every resolved address is global. Empty list is blocked. */
export function allAddressesGlobal(addresses: readonly string[]): boolean {
  return addresses.length > 0 && addresses.every((a) => classifyAddress(a) === "global");
}

/** Redirect policy (invariant 4): no https→http downgrade. */
export function isDowngrade(from: URL, to: URL): boolean {
  return from.protocol === "https:" && to.protocol === "http:";
}
