/**
 * Normalise and validate the user-supplied URL before it reaches safe-fetch.
 * Forgiving on input ("example.com" → "https://example.com/"), strict after.
 */
import { validateUrl } from "@/lib/acquisition/net-policy";

export const MAX_URL_LENGTH = 2048;

export type AuditRequestResult = { ok: true; url: string } | { ok: false; message: string };

export function normaliseAuditUrl(input: unknown): AuditRequestResult {
  if (typeof input !== "string") return { ok: false, message: "Provide a URL." };
  let s = input.trim();
  if (s.length === 0) return { ok: false, message: "Provide a URL." };
  if (s.length > MAX_URL_LENGTH) return { ok: false, message: "URL is too long." };
  if (/\s/.test(s)) return { ok: false, message: "URLs cannot contain spaces." };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  const v = validateUrl(s);
  if (!v.ok) return { ok: false, message: v.message };
  return { ok: true, url: v.url.toString() };
}
