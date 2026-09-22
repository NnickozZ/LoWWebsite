/**
 * §79: one road from a button in the kamer to `app/api/kamers/**`.
 *
 * Every refusal in `lib/kamers/service.ts` is a Dutch sentence somebody is
 * meant to read ("Daar heb je nog niet genoeg voor."), and every route hands it
 * back as `{ error }` with a 400. So the client half of this round has exactly
 * one thing to do with a failure: show it. This returns the sentence, or null
 * when it worked, and each button decides what to do next — which is always
 * `router.refresh()`, because the page is server-rendered and the balance, the
 * grid and the grootboek all move together.
 */
export async function kamerPost(url: string, body?: unknown): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (response.ok) return null;
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return data.error ?? 'Er is iets misgegaan.';
  } catch {
    return 'Er is iets misgegaan.';
  }
}

/**
 * §93: dezelfde weg, voor een knop die ook het antwoord nodig heeft — *Ongedaan
 * maken* zegt hoeveel er terugkwam, en dat getal is dat van de server (K2).
 */
export async function kamerPostFor<T>(url: string, body?: unknown): Promise<{ error: string | null; data: T | null }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (response.ok) return { error: null, data };
    return { error: data.error ?? 'Er is iets misgegaan.', data: null };
  } catch {
    return { error: 'Er is iets misgegaan.', data: null };
  }
}
