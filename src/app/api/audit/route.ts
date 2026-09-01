import { NextResponse, type NextRequest } from "next/server";
import { runAudit } from "@/lib/audit/orchestrator";
import { normaliseAuditUrl } from "@/lib/validation/audit-request";
import { rateLimit } from "@/lib/validation/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "cache-control": "no-store" };

async function handle(rawUrl: unknown, req: NextRequest): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const limit = rateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, code: "rate-limited", title: "Slow down", message: "Too many audits from this address. Try again in a minute." },
      { status: 429, headers: { ...NO_STORE, "retry-after": String(limit.retryAfterSec) } },
    );
  }
  const v = normaliseAuditUrl(rawUrl);
  if (!v.ok) {
    return NextResponse.json(
      { ok: false, code: "invalid-url", title: "That doesn't look like a public web address", message: v.message },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const report = await runAudit(v.url);
    return NextResponse.json(report, { status: 200, headers: NO_STORE });
  } catch (err) {
    // Redacted envelope (invariant 8); details stay server-side.
    console.error("audit failed", err instanceof Error ? err.name : "unknown");
    return NextResponse.json(
      { ok: false, code: "internal", title: "The audit couldn't be completed", message: "Something went wrong on our side. Try again in a moment." },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-url", title: "Bad request", message: 'Send JSON: { "url": "https://…" }' },
      { status: 400, headers: NO_STORE },
    );
  }
  const url = body && typeof body === "object" ? (body as { url?: unknown }).url : undefined;
  return handle(url, req);
}

export async function GET(req: NextRequest) {
  return handle(req.nextUrl.searchParams.get("url"), req);
}
