import { describe, expect, it } from 'vitest';
import { NO_CONNECTION, PROXY_TOO_LARGE, readUploadResponse, uploadForm } from '@/lib/upload';

/**
 * The answer to an upload is read for what it is. The one that mattered:
 * nginx's 413 — an HTML page, not JSON — used to surface as "Geen verbinding
 * met het archief" (5 Sep 2026).
 */
const NGINX_413 =
  '<html>\r\n<head><title>413 Request Entity Too Large</title></head>\r\n<body>\r\n<center><h1>413 Request Entity Too Large</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>\r\n';

describe('readUploadResponse', () => {
  it('hands back the archive’s JSON on success', async () => {
    const result = await readUploadResponse<{ asset: { id: string } }>(
      new Response(JSON.stringify({ asset: { id: 'a1' } }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    expect(result).toEqual({ ok: true, data: { asset: { id: 'a1' } } });
  });

  it('passes the archive’s own message through, whatever the status', async () => {
    const result = await readUploadResponse(
      new Response(JSON.stringify({ error: 'Die afbeelding is groter dan de limiet van 10 MB.' }), { status: 413 }),
    );
    expect(result).toEqual({ ok: false, error: 'Die afbeelding is groter dan de limiet van 10 MB.', status: 413 });
  });

  it('names the web server when a 413 comes without JSON', async () => {
    const result = await readUploadResponse(new Response(NGINX_413, { status: 413, headers: { 'content-type': 'text/html' } }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.error).toBe(PROXY_TOO_LARGE);
      expect(result.error).toMatch(/client_max_body_size/);
    }
  });

  it('says the archive is away on a gateway error, and numbers anything else', async () => {
    const gone = await readUploadResponse(new Response('<h1>502 Bad Gateway</h1>', { status: 502 }));
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error).toMatch(/antwoordt even niet/);
    const odd = await readUploadResponse(new Response('nope', { status: 418 }));
    expect(odd.ok).toBe(false);
    if (!odd.ok) expect(odd.error).toMatch(/418/);
  });

  it('a dead line is an answer too', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
    try {
      const result = await uploadForm('/api/assets', new FormData());
      expect(result).toEqual({ ok: false, error: NO_CONNECTION, status: 0 });
    } finally {
      globalThis.fetch = original;
    }
  });
});
