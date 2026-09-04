/**
 * Card border treatments. Each entry type is seeded with one, so a Clue can be
 * told from a Location across a room of cork without reading the label; a free
 * note on a board picks its own, and any board card can override the one it
 * inherited.
 *
 * The keys are stable identifiers stored in the database; the *look* of each
 * lives in the `.brd-*` rules in app/globals.css and the label here says what
 * that look is. Plain JS so the seed script and the app share one list.
 */
export const BORDER_KEYS = [
  'plain',
  'solid',
  'heavy',
  'double',
  'dashed',
  'dotted',
  'frame',
  'tape',
  'corner',
  'inset',
];

/** What each one looks like, for the picker. */
export const BORDER_LABELS = {
  plain: 'Kaal',
  solid: 'Foto',
  heavy: 'Dikke lijn',
  double: 'Pasje',
  dashed: 'Kaartrand',
  dotted: 'Bewijslabel',
  frame: 'Gearceerd',
  tape: 'Geplakt',
  corner: 'Fotohoekjes',
  inset: 'Vergeeld',
};

/** For anything that does not know better — and the seeded default for people. */
export const DEFAULT_BORDER = 'solid';

/**
 * @param {unknown} value
 * @returns {string} a key that is definitely in the list
 */
export function normaliseBorder(value) {
  return typeof value === 'string' && BORDER_KEYS.includes(value) ? value : DEFAULT_BORDER;
}
