/**
 * §63: the two rules the front door has, split out so the *browser* can ask
 * them too.
 *
 * `lib/auth/password.mjs` is where a password is hashed and encrypted, which
 * means it imports `@node-rs/argon2` and `node:crypto` — a client component may
 * not go near it. But the signup form wants to answer "that is too short"
 * without a round trip, and a round trip is exactly what used to empty every
 * other box on the page (see `app/(auth)/AuthForm.tsx`). So the *rules* live
 * here, in a module with no imports at all: the server action, the CLI scripts
 * and the form in the browser all read the same sentence out of the same file.
 *
 * `password.mjs` re-exports both names, so every existing caller keeps working
 * and there is still exactly one definition of "long enough".
 *
 * The sentences are Dutch because every sentence a person reads in this archive
 * is (`GLOSSARY-NL.md`). They were English here until round 30 — the one corner
 * of the app that still answered in the wrong language, and it answered there
 * on the very first screen a new speler ever sees.
 */

export const MIN_PASSWORD_LENGTH = 8;

/**
 * @param {string} plain
 * @returns {string | null} a Dutch sentence to show, or null when it is fine
 */
export function passwordProblem(plain) {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return `Een wachtwoord is minstens ${MIN_PASSWORD_LENGTH} tekens lang.`;
  }
  return null;
}
