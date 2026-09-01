/** Public site origin when deployed; null → use root-relative URLs in metadata. */
export function publicSiteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function absoluteSiteUrl(path: string): string {
  const origin = publicSiteOrigin();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return origin ? `${origin}${normalized}` : normalized;
}
