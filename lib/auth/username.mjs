/** §4: 2–32 chars, letters/numbers/space/hyphen/apostrophe. Displayed as typed. */
const USERNAME_RE = /^[\p{L}\p{N} \-']{2,32}$/u;

/**
 * §63: Dutch, like every other sentence a person reads here
 * (`GLOSSARY-NL.md`). These three answered in English until round 30, on the
 * very first screen a new speler ever sees. This module imports nothing, so the
 * signup form in the browser asks it directly and a name that is two letters
 * short never costs a round trip — and a round trip is what used to empty the
 * rest of the form.
 *
 * @param {string} raw
 * @returns {string | null} a message to show, or null when the name is fine
 */
export function usernameProblem(raw) {
  const name = raw.trim();
  if (name.length < 2) return 'Een naam is minstens 2 tekens lang.';
  if (name.length > 32) return 'Een naam is hoogstens 32 tekens lang.';
  if (!USERNAME_RE.test(name)) {
    return 'Alleen letters, cijfers, spaties, streepjes en apostrofs.';
  }
  return null;
}

/**
 * Case-insensitive uniqueness key. Collapses runs of whitespace too.
 * @param {string} raw
 * @returns {string}
 */
export function usernameKey(raw) {
  return raw.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
