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
