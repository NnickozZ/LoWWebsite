/**
 * §89: the one answer to "may we send the browser back to this address?".
 *
 * `/api/keeper/flip` and `/api/keeper/as-player` both take a `to=` and used to
 * vet it with two copies of "starts with `/` and not with `//`". That misses
 * the backslash: browsers read `\` in a URL as `/` (the WHATWG URL rules), so
 * `/\evil.example` became `//evil.example` — a protocol-relative address, and
 * an open redirect from this archive's own domain to anybody's.
 *
 * So the value is parsed against a throwaway origin, the result must still be
 * on that origin, and what comes back is the *parsed* path, query and fragment
 * — never the raw string. Pure, so it is tested without a server.
 */
const THROWAWAY = 'http://archief.invalid';

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  // Control characters (a tab or newline in the middle of `//`) are stripped by
  // the URL parser, which is exactly how `/\t/evil` would turn into `//evil`.
  if (/[\u0000-\u001f\u007f]/.test(value)) return '/';
  let parsed: URL;
  try {
    parsed = new URL(value, THROWAWAY);
  } catch {
    return '/';
  }
  if (parsed.origin !== THROWAWAY) return '/';
  return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
}
