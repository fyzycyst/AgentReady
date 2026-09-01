import { describe, expect, it } from "vitest";
import { classifyAddress, expandV6, validateUrl } from "@/lib/acquisition/net-policy";

describe("validateUrl (invariant 1)", () => {
  it.each([
    "https://example.com",
    "http://example.com/path?q=1",
    "https://sub.example.co.uk:443/x",
    "http://example.com:80/",
    "https://93.184.216.34/",
    "https://[2606:2800:220:1:248:1893:25c8:1946]/",
  ])("accepts %s", (u) => {
    expect(validateUrl(u).ok).toBe(true);
  });

  it.each([
    ["ftp://example.com", "scheme"],
    ["file:///etc/passwd", "scheme"],
    ["javascript:alert(1)", "scheme"],
    ["gopher://example.com", "scheme"],
    ["https://user:pass@example.com", "userinfo"],
    ["https://user@example.com", "userinfo"],
    ["https://example.com:8080", "port"],
    ["https://example.com:22", "port"],
    ["http://example.com:443", "port"], // http on 443 is allowed by policy? No: port list is 80/443 → allowed. see below
    ["not a url", "invalid-url"],
    ["example.com", "invalid-url"],
    ["https://localhost", "blocked-host"],
    ["https://foo.localhost", "blocked-host"],
    ["https://metadata.google.internal/computeMetadata/v1/", "blocked-host"],
    ["https://something.internal", "blocked-host"],
    ["https://printer.local", "blocked-host"],
    ["https://127.0.0.1", "blocked-host"],
    ["https://127.1", "blocked-host"], // URL normalises to 127.0.0.1
    ["https://0x7f000001", "blocked-host"], // hex → 127.0.0.1
    ["https://2130706433", "blocked-host"], // decimal → 127.0.0.1
    ["https://0177.0.0.1", "blocked-host"], // octal
    ["https://169.254.169.254/latest/meta-data/", "blocked-host"],
    ["https://169.254.100.1:80/", "blocked-host"],
    ["https://[::1]/", "blocked-host"],
    ["https://[::ffff:127.0.0.1]/", "blocked-host"],
    ["https://[::ffff:169.254.169.254]/", "blocked-host"],
    ["https://[fd00:ec2::254]/", "blocked-host"],
    ["https://[fe80::1]/", "blocked-host"],
    ["https://[64:ff9b::7f00:1]/", "blocked-host"], // NAT64 → 127.0.0.1
    ["https://[2002:7f00:1::]/", "blocked-host"], // 6to4 → 127.0.0.1
    ["https://10.0.0.1", "blocked-host"],
    ["https://192.168.1.1", "blocked-host"],
    ["https://172.16.0.1", "blocked-host"],
    ["https://100.64.0.1", "blocked-host"],
    ["https://0.0.0.0", "blocked-host"],
    ["https://nohost", "blocked-host"],
  ])("rejects %s (%s)", (u, reason) => {
    const r = validateUrl(u);
    // http://example.com:443 is a legitimate edge: allowed ports are 80/443 for either scheme.
    if (u === "http://example.com:443") {
      expect(r.ok).toBe(true);
      return;
    }
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });

  it("strips fragments", () => {
    const r = validateUrl("https://example.com/a#frag");
    expect(r.ok && r.url.toString()).toBe("https://example.com/a");
  });
});

describe("classifyAddress (invariant 2)", () => {
  it.each([
    "8.8.8.8",
    "93.184.216.34",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "2a00:1450:4001:80b::200e",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
  ])("global: %s", (ip) => expect(classifyAddress(ip)).toBe("global"));

  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.1.2.3",
    "172.31.255.255",
    "192.168.0.1",
    "169.254.169.254",
    "169.254.100.1",
    "100.64.1.1",
    "100.127.255.255",
    "0.0.0.0",
    "0.1.2.3",
    "192.0.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.9",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:7f00:1", // hex-form mapped loopback
    "::127.0.0.1", // IPv4-compatible
    "64:ff9b::7f00:1",
    "64:ff9b::a9fe:a9fe",
    "2002:7f00:1::",
    "2002:a9fe:a9fe::",
    "2001:0:7f00:1::1", // Teredo w/ loopback server
    "fd00:ec2::254",
    "fc00::1",
    "fe80::1",
    "fe80::1%eth0",
    "ff02::1",
    "2001:db8::1",
    "100::1",
    "not-an-ip",
    "",
  ])("blocked: %s", (ip) => expect(classifyAddress(ip)).toBe("blocked"));
});

describe("expandV6", () => {
  it("expands compressed forms", () => {
    expect(expandV6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandV6("::ffff:1.2.3.4")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
    expect(expandV6("2001:db8::8a2e:370:7334")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0x8a2e, 0x370, 0x7334]);
  });
  it("rejects malformed", () => {
    expect(expandV6("1::2::3")).toBeNull();
    expect(expandV6("1:2:3:4:5:6:7:8:9")).toBeNull();
  });
});
