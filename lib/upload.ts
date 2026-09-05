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
 * The size ceiling is *not* here. It belongs where the upload happens, which
 * already knows whose ceiling applies (`uploadLimitFor`) — and it is checked
 * again on the server on the bytes that actually arrived (§ `lib/assets.ts`).
 * A paste is a file like any other and goes through exactly the same gate.
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
