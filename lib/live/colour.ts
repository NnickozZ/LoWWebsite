/**
 * §8/§21: the ink a person is drawn in, everywhere they are shown live.
 *
 * Deliberately not random and not assigned in arrival order: the same player is
 * the same colour on every prikbord, every page and every session, for everyone
 * watching, so "the green one is Anneke" stays true. Six pigments that all read
 * on cork and all differ in a monochrome print.
 *
 * §60: it lives here rather than in `lib/boards/live.ts` because the site hub
 * needs it and `lib/boards/live.ts` now forwards *to* the site hub — two files
 * importing each other is a cycle waiting to bite. `lib/boards/live.ts`
 * re-exports it, so every existing caller is unchanged.
 */

const INKS = ['#1F4E79', '#2F6B4F', '#A8321E', '#5B3A78', '#8A6A24', '#7A4A2B'];

export function presenceColour(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return INKS[hash % INKS.length];
}
