import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let fields: Record<string, string> = {};

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    fields = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? "")]));
  } else {
    const form = await request.formData();
    fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  }

  return NextResponse.json({ ok: true, echoed: fields });
}
