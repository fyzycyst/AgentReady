/**
 * Best-effort per-instance rate limit (invariant 9). On serverless this is
 * per warm instance, so it bounds abuse per container rather than globally;
 * a KV-backed limiter is the upgrade path before public launch.
 *
 * Trusted client IP: the route reads the first `x-forwarded-for` entry, which
 * Vercel overwrites on direct deployments. Behind another proxy, adjust.
 *
 * Bounded memory: at most MAX_KEYS entries; the oldest-touched key is evicted
 * in O(1) via Map insertion order (review N4).
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const MAX_KEYS = 2_000;
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  const cutoff = now - WINDOW_MS;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  buckets.delete(key); // re-insert below so the Map's order is LRU by last touch
  if (hits.length >= MAX_PER_WINDOW) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + WINDOW_MS - now) / 1000)) };
  }
  hits.push(now);
  buckets.set(key, hits);
  while (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
  return { ok: true };
}
