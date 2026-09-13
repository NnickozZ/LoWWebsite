import { FRAME_KINDS, type FrameKind } from './types';

/**
 * §66 — how a node is drawn, decided by the soort it is.
 *
 * A stamboom holds more than people: a god begat an aardse god, an abnormaliteit
 * was made rather than born, and a Familie-artikel can stand in the tree as the
 * head of its branch. The frame is the one visual thing that says which, and it
 * is derived from the soort's slug rather than stored, so a Keeper who renames a
 * soort's *label* changes nothing here and an archive that gains a soort gets a
 * sterveling's index card until somebody decides otherwise.
 *
 * Pure: no database, no React. The canvas imports it.
 */

/** The four pantheon soorten seeded by §58 — a round frame with a double ring. */
const DIVINE_TYPES = new Set([
  'kosmische-goden',
  'aardse-goden',
  'eldritch-entiteiten',
  'bovennatuurlijke-wezens',
]);

/** Personen and onderzoekers — the index card with a portrait. */
const MORTAL_TYPES = new Set(['character', 'investigator']);

export function isFrameKind(value: unknown): value is FrameKind {
  return typeof value === 'string' && (FRAME_KINDS as readonly string[]).includes(value);
}

/**
 * The frame a soort wears.
 *
 * Anything unrecognised is a `mortal`, not an `unknown`: an artikel that stands
 * in a tree exists and has a page, and `unknown` is reserved for the one thing
 * whose existence nobody has confirmed — a los kaartje. A soort nobody thought
 * of gets the plain index card, which is the safe wrong answer.
 */
export function frameForType(typeSlug: string): FrameKind {
  const slug = (typeSlug ?? '').trim().toLowerCase();
  if (DIVINE_TYPES.has(slug)) return 'divine';
  if (slug === 'family') return 'house';
  if (slug === 'abnormality') return 'creature';
  if (MORTAL_TYPES.has(slug)) return 'mortal';
  return 'mortal';
}

/** What each frame is called, for the los-kaartje sheet's picker. */
export const FRAME_LABELS: Record<FrameKind, string> = {
  mortal: 'Sterveling',
  divine: 'Godheid',
  house: 'Huis',
  creature: 'Wezen',
  unknown: 'Onbekend',
};
