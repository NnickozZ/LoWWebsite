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

/**
 * §89: a bucket may have its own size and window — the per-name login bucket
 * is stricter than the per-address one, and the site-wide brake is looser.
 * Without options it is §4's 10 per 15 minutes, as it always was.
 */
export type RateLimitOptions = { max?: number; windowMs?: number };

/** Would this key be refused right now? Asks without counting a hit. */
export function isLimited(key: string, options: RateLimitOptions = {}): RateLimitResult {
  const max = options.max ?? MAX_HITS;
  const windowMs = options.windowMs ?? WINDOW_MS;
  const now = Date.now();
  const hits = (buckets.get(key)?.hits ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    return { ok: false, retryAfterSeconds: Math.ceil((windowMs - (now - hits[0]!)) / 1000) };
  }
  return { ok: true };
}

export function rateLimit(key: string, options: RateLimitOptions = {}): RateLimitResult {
  const max = options.max ?? MAX_HITS;
  const windowMs = options.windowMs ?? WINDOW_MS;
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= max) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0];
    return { ok: false, retryAfterSeconds: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      // The longest window any caller uses is an hour; anything older is dead.
      if (v.hits.every((t) => now - t >= Math.max(WINDOW_MS, 60 * 60 * 1000))) buckets.delete(k);
    }
  }
  return { ok: true };
}

/** Called after a successful login so a legitimate user is not held back. */
export function clearRateLimit(key: string) {
  buckets.delete(key);
}

/**
 * §89: who is knocking, for a rate limit.
 *
 * A header is only as honest as whoever wrote it. `X-Forwarded-For` arrives
 * from the browser as well as from a proxy, and nginx's usual
 * `$proxy_add_x_forwarded_for` *appends* the real address — so the **first**
 * element, which this used to read, is the one the attacker typed, and a new
 * one per attempt made every limit here a suggestion.
 *
 * So: headers are believed only when `TRUST_PROXY` says a proxy we run stands
 * in front (`TRUST_PROXY=1` — exactly one hop), and then only the **last**
 * element, the one that proxy wrote. Without it, every request counts against
 * one shared key; the per-name bucket in `loginAction` does the finer work.
 * The README's nginx block sets `X-Forwarded-For $remote_addr` (overwrite, not
 * append) and binds the app to 127.0.0.1, so nobody reaches it around nginx.
 */
export function clientIp(headers: Headers): string {
  if (!process.env.TRUST_PROXY) return 'direct';
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  return headers.get('x-real-ip')?.trim() || 'direct';
}
