/**
 * §18b: the archive answering "who is writing?" back at the browser.
 *
 * A write attempted without an onderzoeker comes back as a 400 carrying
 * `needsAuthor` (`lib/api.ts`). That is a *question*, not a failure, and every
 * call site in the app already has its own way of showing a failure — a toast,
 * an inline note, a silent retry. Rather than teach all of them the
 * difference, the one place that already sees every request (the `fetch` patch
 * in `components/live/LiveProvider.tsx`) sniffs the answer and rings this bell;
 * the shell's `AuthorProvider` is listening, and opens the sheet.
 *
 * A tiny module of its own so the live line does not have to import the shell,
 * and so both halves can be tested without a browser.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Be told when the archive asks the question. Returns the way to stop listening. */
export function onAuthorNeeded(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ring the bell. A copy of the set is walked: a listener may remove itself. */
export function announceAuthorNeeded(): void {
  for (const listener of [...listeners]) listener();
}

/** Is this answer the question, rather than an ordinary refusal? */
export function isAuthorRefusal(status: number, body: unknown): boolean {
  if (status !== 400 || !body || typeof body !== 'object') return false;
  return (body as { needsAuthor?: unknown }).needsAuthor === true;
}
