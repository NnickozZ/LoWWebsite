/**
 * One way to send a picture up, and one way to read what came back.
 *
 * Every upload used to do `await response.json()` and then look at
 * `response.ok`. That works as long as the answer comes from the archive —
 * which always answers JSON. It does not work when the answer comes from the
 * web server *in front of* the archive: nginx refuses a body over its
 * `client_max_body_size` (1 MB unless told otherwise) with a 413 and a
 * little HTML page, `json()` throws on the HTML, and the person is told
 * "Geen verbinding met het archief" — which is true of nothing (Nick and a
 * friend, 5 Sep 2026, uploading a map). So: read the body as text, parse it
 * if it is JSON, and say what a 413 without JSON actually means.
 *
 * Pure and client-safe — no database, no React.
 */

/* ------------------------------------------------------ the two ceilings */

/**
 * How much one upload may weigh. Two ceilings (Nick, 6 Sep 2026): 2 MB for a
 * player, 20 MB for a Keeper. The player's number is low on purpose — a phone
 * photograph out of the camera is three or four times that, and the archive
 * stores a 1600 px webp of it in the end anyway, so the megabytes a phone
 * sends up are megabytes nobody ever sees. Rather than refuse them, the
 * browser shrinks the picture to fit before it is sent (`fitUpload` in
 * `components/shrinkImage.ts`), so a player never meets the ceiling at all;
 * the Keeper's 20 MB is for the scan of a map, which goes up as it is.
 *
 * These live here, not in `lib/assets.ts`, because `lib/assets.ts` opens the
 * database and loads sharp: a client component cannot import from it, and the
 * shrinking happens in the browser. `lib/assets.ts` re-exports them, so the
 * API routes and the server keep reading them where they always did.
 *
 * The ceiling is enforced on the server and nowhere else — twice, on the size
 * the browser declared and again on the bytes that arrived. What the browser
 * does is courtesy. Two things sit outside the app entirely: a reverse proxy
 * in front of the server (nginx's `client_max_body_size` defaults to 1 MB and
 * must be raised to at least 25m), and sharp's own pixel ceiling
 * (`limitInputPixels`, ~268 MP), which is what stops a big scan from eating
 * the box's memory.
 */
export const PLAYER_UPLOAD_BYTES = 2 * 1024 * 1024;
export const KEEPER_UPLOAD_BYTES = 20 * 1024 * 1024;

export function uploadLimitFor(viewer: { isKeeper: boolean } | null | undefined): number {
  return viewer?.isKeeper ? KEEPER_UPLOAD_BYTES : PLAYER_UPLOAD_BYTES;
}

/** "2 MB" / "20 MB" — for the sentence under an upload button and the error. */
export function uploadLimitLabel(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function tooLargeMessage(limitBytes: number): string {
  return `Die afbeelding is groter dan de limiet van ${uploadLimitLabel(limitBytes)}.`;
}

/** Said once, gently, when the browser made the picture fit rather than refuse it. */
export const SHRUNK_NOTICE = 'De afbeelding was te groot en is verkleind.';

/** When even the smallest step is still over the ceiling. */
export function couldNotShrinkMessage(limitBytes: number): string {
  return `Die afbeelding is groter dan de limiet van ${uploadLimitLabel(limitBytes)} en werd ook verkleind niet klein genoeg.`;
}

/**
 * Which pictures may be re-encoded to fit. The server accepts JPEG, PNG,
 * WebP, GIF, AVIF and TIFF (`ACCEPTED` in `lib/assets.ts`); two of that list
 * are left alone here on purpose. A GIF may be animated, and a canvas knows
 * only the first frame — a silently flattened animation is worse than being
 * told the file is too big. An SVG is not a picture of pixels at all (and the
 * server does not take one anyway). Anything that is not on this list is not
 * touched either; the server's own words then say what is wrong with it.
 */
const REENCODABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff']);

export function mayReencodeType(mime: string): boolean {
  return REENCODABLE.has(mime.toLowerCase().split(';')[0]?.trim() ?? '');
}

/**
 * The ladder the shrinker climbs down: full size first (a re-encode to JPEG
 * at 0.82 alone often halves a phone's photograph without losing a pixel),
 * then progressively smaller, stopping at the first step that fits.
 */
export const SHRINK_SCALES = [1, 0.85, 0.7, 0.55, 0.42, 0.3] as const;

/**
 * The pixel sizes to try, in order, for a picture of this size. Pure, so it
 * can be tested without a canvas: the aspect ratio is kept, nothing is ever
 * enlarged, a step that rounds to the same size as the one before it is
 * dropped, and no edge is allowed to round down to nothing.
 */
export function shrinkSteps(width: number, height: number): Array<{ width: number; height: number }> {
  if (!(width > 0) || !(height > 0)) return [];
  const steps: Array<{ width: number; height: number }> = [];
  for (const scale of SHRINK_SCALES) {
    const next = {
      width: Math.max(1, Math.round(width * Math.min(scale, 1))),
      height: Math.max(1, Math.round(height * Math.min(scale, 1))),
    };
    const last = steps[steps.length - 1];
    if (last && last.width === next.width && last.height === next.height) continue;
    steps.push(next);
  }
  return steps;
}

/* --------------------------------------------------------- the answer */

export type UploadResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** What a refusal by the web server (not the archive) reads as. */
export const PROXY_TOO_LARGE =
  'Het bestand is groter dan de webserver toelaat. Dit is niet de limiet van het archief zelf maar van de ' +
  'webserver ervoor (bij nginx: client_max_body_size). De Keeper kan dit nakijken onder Beheer → Site → ' +
  'Uploadlimiet testen.';

export const NO_CONNECTION = 'Geen verbinding met het archief.';

/** Reads an upload's answer: JSON from the archive, or a plain word for anything else. */
export async function readUploadResponse<T>(response: Response): Promise<UploadResult<T>> {
  const text = await response.text().catch(() => '');
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const isJson = json !== null && typeof json === 'object';

  if (response.ok && isJson) return { ok: true, data: json as T };

  if (isJson && typeof (json as { error?: unknown }).error === 'string') {
    return { ok: false, error: (json as { error: string }).error, status: response.status };
  }
  if (response.status === 413) return { ok: false, error: PROXY_TOO_LARGE, status: 413 };
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return { ok: false, error: 'Het archief antwoordt even niet. Probeer het zo opnieuw.', status: response.status };
  }
  if (!response.ok) {
    return { ok: false, error: `De upload is geweigerd (${response.status}).`, status: response.status };
  }
  return { ok: false, error: 'Het archief gaf een onverwacht antwoord.', status: response.status };
}

/** POST (or PATCH) a form and read the answer; a dead line is an answer too. */
export async function uploadForm<T>(
  url: string,
  form: FormData,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<UploadResult<T>> {
  try {
    const response = await fetch(url, { method, body: form });
    return await readUploadResponse<T>(response);
  } catch {
    return { ok: false, error: NO_CONNECTION, status: 0 };
  }
}

/* ------------------------------------------------------------- the clipboard */

/**
 * §30: a picture that arrives on the clipboard.
 *
 * Every place in the archive that takes a picture takes one from a file
 * dialog, and one or two of them also took a paste — which meant the answer to
 * "can I just paste a screenshot in?" was "somewhere, yes". It is one function
 * because there is one right answer and it is not obvious: a browser puts an
 * image on the clipboard in two different shapes. Copying a file in Finder or
 * Explorer gives `clipboardData.files`; copying a picture *out of a web page*
 * or taking a screenshot with the system tool gives an `image/*` item under
 * `clipboardData.items` with no file behind it until you ask, and that one has
 * no name — Chrome calls it `image.png`, Firefox calls it nothing at all. So
 * anything that only reads `.files` silently ignores the most common paste
 * there is.
 *
 * The name matters more than it looks: the board names a photo card after the
 * file, and "image.png" on nine cards is nine cards called image. So a pasted
 * picture with no name of its own gets a dated one.
 *
 * The size ceiling is *not* applied here. The numbers live at the top of this
 * file, but weighing a picture against them belongs where the upload happens,
 * which already knows whose ceiling applies (`ui.uploadLimit`), shrinks the
 * picture if it has to (`fitUpload`), and is checked again on the server on
 * the bytes that actually arrived (§ `lib/assets.ts`). A paste is a file like
 * any other and goes through exactly the same gate.
 */
export function imageFromClipboard(event: ClipboardEvent): File | null {
  const data = event.clipboardData;
  if (!data) return null;

  const dropped = Array.from(data.files ?? []).find((file) => file.type.startsWith('image/'));
  if (dropped) return dropped;

  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (!file) continue;
    return namedPaste(file);
  }
  return null;
}

/** A pasted picture with no name of its own gets a dated one. */
function namedPaste(file: File): File {
  const plain = !file.name || file.name === 'image.png' || file.name === 'blob';
  if (!plain) return file;
  const stamp = new Date()
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ')
    .replace(':', '.');
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  return new File([file], `Geplakt ${stamp}.${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

/**
 * True when a paste should be left alone: the person is typing in a field, and
 * what they meant was the text on the clipboard. A picture pasted *into* prose
 * is the editor's own business (`RichEditor` handles it), and this is for
 * everything that is not prose — a board, a map, a cover.
 */
export function pasteIsForTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== 'function') return false;
  return Boolean(element.closest('input, textarea, [contenteditable="true"], .ProseMirror'));
}
