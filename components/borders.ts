import { BORDER_KEYS, BORDER_LABELS, normaliseBorder } from '@/lib/borders.mjs';

/**
 * The class pair that draws a card's border treatment (see lib/borders.mjs and
 * the `.brd-*` rules in globals.css). One helper so a card in a case, in the
 * wiki grid and on a board all agree about what a 'taped' card looks like.
 */
export function borderClass(border: string | null | undefined): string {
  return `brd brd-${normaliseBorder(border ?? undefined)}`;
}

const LABELS = BORDER_LABELS as Record<string, string>;

/** The picker's options, in the order they are declared. */
export const BORDER_OPTIONS: { key: string; label: string }[] = (BORDER_KEYS as string[]).map(
  (key) => ({ key, label: LABELS[key] ?? key }),
);

export function borderLabel(border: string | null | undefined): string {
  const key = normaliseBorder(border ?? undefined) as string;
  return LABELS[key] ?? key;
}
