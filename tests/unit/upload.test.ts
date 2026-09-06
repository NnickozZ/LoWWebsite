import { describe, expect, it } from 'vitest';
import {
  KEEPER_UPLOAD_BYTES,
  NO_CONNECTION,
  PLAYER_UPLOAD_BYTES,
  PROXY_TOO_LARGE,
  SHRINK_SCALES,
  couldNotShrinkMessage,
  mayReencodeType,
  readUploadResponse,
  shrinkSteps,
  tooLargeMessage,
  uploadForm,
  uploadLimitFor,
  uploadLimitLabel,
} from '@/lib/upload';
import { fitUpload, jpgName } from '@/components/shrinkImage';

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
      new Response(JSON.stringify({ error: 'Die afbeelding is groter dan de limiet van 2 MB.' }), { status: 413 }),
    );
    expect(result).toEqual({ ok: false, error: 'Die afbeelding is groter dan de limiet van 2 MB.', status: 413 });
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

/**
 * The two ceilings and the size maths live in this file because they are pure
 * and the browser needs them: an oversized picture is shrunk to fit before it
 * is sent (`components/shrinkImage.ts`), and `lib/assets.ts` — which opens the
 * database and loads sharp — re-exports them for the server.
 */
describe('the two ceilings', () => {
  it('gives a player 2 MB and a Keeper 20 MB', () => {
    expect(PLAYER_UPLOAD_BYTES).toBe(2 * 1024 * 1024);
    expect(KEEPER_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
    expect(uploadLimitFor({ isKeeper: true })).toBe(KEEPER_UPLOAD_BYTES);
    expect(uploadLimitFor({ isKeeper: false })).toBe(PLAYER_UPLOAD_BYTES);
    // Nobody at all is treated as a player: the smaller of the two is the safe one.
    expect(uploadLimitFor(null)).toBe(PLAYER_UPLOAD_BYTES);
    expect(uploadLimitFor(undefined)).toBe(PLAYER_UPLOAD_BYTES);
  });

  it('names the ceiling that was hit, in the archive’s own words', () => {
    expect(uploadLimitLabel(PLAYER_UPLOAD_BYTES)).toBe('2 MB');
    expect(uploadLimitLabel(KEEPER_UPLOAD_BYTES)).toBe('20 MB');
    expect(tooLargeMessage(PLAYER_UPLOAD_BYTES)).toBe('Die afbeelding is groter dan de limiet van 2 MB.');
    expect(tooLargeMessage(KEEPER_UPLOAD_BYTES)).toBe('Die afbeelding is groter dan de limiet van 20 MB.');
    expect(couldNotShrinkMessage(PLAYER_UPLOAD_BYTES)).toMatch(/2 MB/);
    expect(couldNotShrinkMessage(PLAYER_UPLOAD_BYTES)).toMatch(/verkleind/);
  });

  it('lets a picture exactly at the ceiling through, and refuses the byte after it', () => {
    // The rule the whole ladder hangs on: `size <= limit` passes untouched.
    const atTheLine = PLAYER_UPLOAD_BYTES;
    const oneOver = PLAYER_UPLOAD_BYTES + 1;
    expect(atTheLine <= uploadLimitFor({ isKeeper: false })).toBe(true);
    expect(oneOver <= uploadLimitFor({ isKeeper: false })).toBe(false);
    // And one byte over a player's ceiling is still nothing to a Keeper.
    expect(oneOver <= uploadLimitFor({ isKeeper: true })).toBe(true);
    expect(tooLargeMessage(uploadLimitFor({ isKeeper: false }))).toContain('2 MB');
    expect(tooLargeMessage(uploadLimitFor({ isKeeper: true }))).toContain('20 MB');
  });
});

describe('what may be shrunk, and how far', () => {
  it('re-encodes the pictures sharp accepts, and leaves an animation or a drawing alone', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff']) {
      expect(mayReencodeType(mime)).toBe(true);
    }
    // A canvas knows only a GIF's first frame, and an SVG has no pixels.
    expect(mayReencodeType('image/gif')).toBe(false);
    expect(mayReencodeType('image/svg+xml')).toBe(false);
    // Not a picture at all, and not the shrinker's business.
    expect(mayReencodeType('application/pdf')).toBe(false);
    expect(mayReencodeType('')).toBe(false);
    // A type may arrive with a parameter on it.
    expect(mayReencodeType('IMAGE/JPEG; charset=binary')).toBe(true);
  });

  it('climbs down from full size, keeps the shape and never enlarges', () => {
    const steps = shrinkSteps(4000, 3000);
    expect(steps[0]).toEqual({ width: 4000, height: 3000 });
    expect(steps).toHaveLength(SHRINK_SCALES.length);
    // Every rung is smaller than the one above it, and none is bigger than the picture.
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i].width).toBeLessThan(steps[i - 1].width);
      expect(steps[i].width).toBeLessThanOrEqual(4000);
    }
    // The aspect ratio survives every rung.
    for (const step of steps) {
      expect(step.width / step.height).toBeCloseTo(4000 / 3000, 2);
    }
    expect(steps[steps.length - 1]).toEqual({ width: 1200, height: 900 });
  });

  it('never rounds an edge down to nothing, and drops a rung that changes nothing', () => {
    const tiny = shrinkSteps(3, 1);
    for (const step of tiny) {
      expect(step.width).toBeGreaterThanOrEqual(1);
      expect(step.height).toBeGreaterThanOrEqual(1);
    }
    // 1x1 has one rung: every scale rounds to the same pixel.
    expect(shrinkSteps(1, 1)).toEqual([{ width: 1, height: 1 }]);
    // A picture with no size is not a picture.
    expect(shrinkSteps(0, 500)).toEqual([]);
    expect(shrinkSteps(Number.NaN, Number.NaN)).toEqual([]);
  });
});

/**
 * The shrinker itself needs a canvas and this suite has no DOM (see
 * `vitest.config.ts`: the environment is node). What can be checked here is
 * everything around the drawing — the name the result carries, the picture
 * that is small enough to be left alone, and the two kinds that are refused
 * rather than silently flattened.
 */
describe('fitUpload, as far as a room without a canvas can see', () => {
  it('renames a re-encoded picture to .jpg, whatever it was called', () => {
    expect(jpgName('vakantie.png')).toBe('vakantie.jpg');
    expect(jpgName('scan.van.de.kaart.tiff')).toBe('scan.van.de.kaart.jpg');
    expect(jpgName('zonder-achtervoegsel')).toBe('zonder-achtervoegsel.jpg');
    expect(jpgName('')).toBe('afbeelding.jpg');
  });

  it('hands back a picture under the ceiling untouched, and says it was not shrunk', async () => {
    const small = new File([new Uint8Array(1024)], 'klein.png', { type: 'image/png' });
    const result = await fitUpload(small, PLAYER_UPLOAD_BYTES);
    expect(result).toEqual({ file: small, shrunk: false });
  });

  it('refuses an oversized animation or drawing rather than flattening it', async () => {
    const gif = new File([new Uint8Array(PLAYER_UPLOAD_BYTES + 1)], 'dansje.gif', { type: 'image/gif' });
    const svg = new File([new Uint8Array(PLAYER_UPLOAD_BYTES + 1)], 'plattegrond.svg', { type: 'image/svg+xml' });
    expect(await fitUpload(gif, PLAYER_UPLOAD_BYTES)).toEqual({ error: tooLargeMessage(PLAYER_UPLOAD_BYTES) });
    expect(await fitUpload(svg, PLAYER_UPLOAD_BYTES)).toEqual({ error: tooLargeMessage(PLAYER_UPLOAD_BYTES) });
  });
});
