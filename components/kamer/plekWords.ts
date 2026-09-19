import type { PlekKind } from '@/lib/kamers/shape';
import type { Words } from '@/lib/words';

/**
 * §79/§11: the four kinds of plek, as words and as shapes.
 *
 * `lib/kamers/shape.ts` holds the *keys* and says so; this is the one place
 * that turns a key into something a person reads. A component never writes
 * "muur", because the Keeper may call it something else in Beheer → Woorden,
 * and neither the database nor this page would notice.
 */
const WORD_KEY: Record<PlekKind, string> = {
  muur: 'plekMuur',
  plank: 'plekPlank',
  bureau: 'plekBureau',
  kist: 'plekKist',
};

/**
 * One icon per kind, from the archive's own set. Four shapes rather than four
 * colours: §45 has four colour schemes and a kamer must read in all of them.
 */
const ICON: Record<PlekKind, string> = {
  muur: 'pin',
  plank: 'book',
  bureau: 'note',
  kist: 'box',
};

export function plekWord(kind: PlekKind, words: Words): string {
  return words[WORD_KEY[kind]] ?? kind;
}

export function plekIcon(kind: PlekKind): string {
  return ICON[kind] ?? 'box';
}

/**
 * §79, rule 8: the munt has no name in the code. Every amount on this screen
 * goes through here, and the singular is only ever used for exactly one.
 */
export function munt(amount: number, words: Words): string {
  return `${amount} ${Math.abs(amount) === 1 ? words.currency : words.currencyPlural}`;
}
