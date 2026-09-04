/**
 * §4: 10 attempts / 15 min / IP on login and signup. No CAPTCHA.
 * In-memory is right here: one container, one process, ~40 players.
 */
type Bucket = { hits: number[]; };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_HITS = 10;

const globalForLimit = globalThis as unknown as { __zcfLimits?: Map<string, Bucket> };
const buckets = (globalForLimit.__zcfLimits ??= new Map<string, Bucket>());

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function rateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < WINDOW_MS);

  if (bucket.hits.length >= MAX_HITS) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0];
    return { ok: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - oldest)) / 1000) };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.hits.every((t) => now - t >= WINDOW_MS)) buckets.delete(k);
    }
  }
  return { ok: true };
}

/** Called after a successful login so a legitimate user is not held back. */
export function clearRateLimit(key: string) {
  buckets.delete(key);
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'local';
}
