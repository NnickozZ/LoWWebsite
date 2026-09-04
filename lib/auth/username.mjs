/** §4: 2–32 chars, letters/numbers/space/hyphen/apostrophe. Displayed as typed. */
const USERNAME_RE = /^[\p{L}\p{N} \-']{2,32}$/u;

/**
 * @param {string} raw
 * @returns {string | null} a message to show, or null when the name is fine
 */
export function usernameProblem(raw) {
  const name = raw.trim();
  if (name.length < 2) return 'Names are at least 2 characters.';
  if (name.length > 32) return 'Names are at most 32 characters.';
  if (!USERNAME_RE.test(name)) return 'Letters, numbers, spaces, hyphens and apostrophes only.';
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
