import { DEFAULT_WORDS, type Words } from '@/lib/words';

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
 *
 * §101: and when the server gave no sentence of its own, the one it falls back
 * on is the Keeper's (`words.somethingWrong`), handed in by the button.
 */
export async function kamerPost(url: string, body?: unknown, words: Words = DEFAULT_WORDS): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (response.ok) return null;
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return data.error ?? words.somethingWrong;
  } catch {
    return words.somethingWrong;
  }
}

/**
 * §93: dezelfde weg, voor een knop die ook het antwoord nodig heeft — *Ongedaan
 * maken* zegt hoeveel er terugkwam, en dat getal is dat van de server (K2).
 */
export async function kamerPostFor<T>(
  url: string,
  body?: unknown,
  words: Words = DEFAULT_WORDS,
): Promise<{ error: string | null; data: T | null }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (response.ok) return { error: null, data };
    return { error: data.error ?? words.somethingWrong, data: null };
  } catch {
    return { error: words.somethingWrong, data: null };
  }
}
