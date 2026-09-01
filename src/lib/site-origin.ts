/** Documented dev default when no deployment env is present (local `next dev`). */
export const DEV_SITE_ORIGIN = "http://localhost:3000";

/** Optional public origin for in-page metadata and chips; null → root-relative URLs. */
export function publicSiteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/**
 * Always-absolute origin for robots.txt `Sitemap:` and sitemap.xml `<loc>` entries.
 * Priority: NEXT_PUBLIC_SITE_URL → https://VERCEL_URL → DEV_SITE_ORIGIN.
 */
export function discoverySiteOrigin(): string {
  const fromPublic = publicSiteOrigin();
  if (fromPublic) return fromPublic;

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/\/$/, "");
    return host.startsWith("http://") || host.startsWith("https://") ? host : `https://${host}`;
  }

  return DEV_SITE_ORIGIN;
}

/** In-page canonicals and JSON-LD: absolute when configured, else root-relative. */
export function absoluteSiteUrl(path: string): string {
  const origin = publicSiteOrigin();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return origin ? `${origin}${normalized}` : normalized;
}

/** Discovery metadata routes: always absolute per robots/sitemap specs. */
export function discoverySiteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${discoverySiteOrigin()}${normalized}`;
}
