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
