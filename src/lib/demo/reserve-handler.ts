import { NextResponse } from "next/server";

export const RESERVE_MAX_BODY_BYTES = 8192;
export const RESERVE_MAX_VALUE_CHARS = 200;

export const RESERVE_ALLOWED_FIELDS = [
  "name",
  "email",
  "phone",
  "date",
  "time",
  "party_size",
  "notes",
] as const;

export type ReserveField = (typeof RESERVE_ALLOWED_FIELDS)[number];

export async function readRequestBodyWithLimit(request: Request, maxBytes: number): Promise<{ ok: true; body: string } | { ok: false }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) return { ok: false };
  }

  if (!request.body) return { ok: true, body: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, body: new TextDecoder().decode(merged) };
}

export function filterReservationFields(raw: Record<string, unknown>): Record<string, string> {
  const allowed = new Set<string>(RESERVE_ALLOWED_FIELDS);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key)) continue;
    out[key] = String(value ?? "").slice(0, RESERVE_MAX_VALUE_CHARS);
  }
  return out;
}

export function parseReservationBody(contentType: string, body: string): Record<string, unknown> | null {
  if (contentType.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(body);
    const out: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) out[key] = value;
    return out;
  }

  if (contentType.includes("multipart/form-data")) {
    return null;
  }

  return null;
}

export async function handleDemoReserve(request: Request): Promise<Response> {
  const read = await readRequestBodyWithLimit(request, RESERVE_MAX_BODY_BYTES);
  if (!read.ok) {
    return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const parsed = parseReservationBody(contentType, read.body);
  if (parsed === null) {
    return NextResponse.json({ ok: false, error: "unsupported or invalid body" }, { status: 400 });
  }

  const fields = filterReservationFields(parsed);
  return NextResponse.json({ ok: true, echoed: fields });
}
