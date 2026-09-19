/**
 * §79: de vorm van een kamer, en het ene veld dat een artikel tot voorwerp maakt.
 *
 * Deliberately pure — the page, the panel and the service all read it, and a
 * unit test reads it without a database.
 *
 * **The shape is a ladder, and every rung exists from the first day.** A kamer
 * is seeded with all of these at once, most of them locked with a price on
 * them, because a room that shows only what you already own gives you nothing
 * to save up for. Tuning this list is the thing that decides how the whole
 * feature feels, and it is the file to come back to.
 *
 * Two rules for changing it, and the test enforces both:
 *
 *   1. **Only ever append.** `syncShape` adds plekken a kamer is missing and
 *      never touches one it has. Re-pricing rung four would silently change
 *      what somebody already paid, or — worse — what they are saving for.
 *   2. **Never renumber.** A plek is identified by its position in this list
 *      (`sort_order`), so inserting in the middle hands somebody else's shelf
 *      to a different rung.
 */

/** The kinds of plek. The *words* are in `lib/words.ts`; these are the keys. */
export const PLEK_KINDS = ['muur', 'plank', 'bureau', 'kist'] as const;
export type PlekKind = (typeof PLEK_KINDS)[number];

export function isPlekKind(value: unknown): value is PlekKind {
  return typeof value === 'string' && (PLEK_KINDS as readonly string[]).includes(value);
}

/**
 * §79: what makes an artikel a voorwerp.
 *
 * A **field**, not a soort. The obvious design — seed a soort called
 * *Voorwerpen* and check the type id — hard-codes one Dutch noun into the code
 * and then only ever allows that one. This asks the artikel a question instead:
 * does it carry a field with this key, and is the answer a kind of plek? An
 * artikel without it fits nowhere, which is what keeps somebody's onderzoeker
 * off a shelf.
 *
 * **One caveat, found by the browser and worth knowing before you rely on it.**
 * A soort's fields get their *keys* from the editor as `veld_1`, `veld_2`, …
 * and there is no box anywhere in Beheer for setting a key — so a Keeper cannot
 * today make a *second* voorwerp-soort that this file would recognise, however
 * they label the field. Migration `0027` therefore ships one soort with the
 * right key in it, and that is the road. The design above is still the right
 * one and costs nothing extra; what it is waiting for is a key box in
 * `components/admin/TypeEditor.tsx`, which is a small round of its own.
 */
export const VOORWERP_FIELD_KEY = 'plek';

export type SlotSeed = { kind: PlekKind; price: number };

/**
 * Twelve plekken: three to start with, and nine to want. The prices are a
 * first cut — Nick tunes them here, and nowhere else.
 */
export const ROOM_SHAPE: SlotSeed[] = [
  { kind: 'bureau', price: 0 },
  { kind: 'plank', price: 0 },
  { kind: 'muur', price: 0 },
  { kind: 'plank', price: 2 },
  { kind: 'muur', price: 3 },
  { kind: 'kist', price: 5 },
  { kind: 'plank', price: 8 },
  { kind: 'bureau', price: 12 },
  { kind: 'muur', price: 16 },
  { kind: 'kist', price: 20 },
  { kind: 'plank', price: 25 },
  { kind: 'muur', price: 30 },
];
