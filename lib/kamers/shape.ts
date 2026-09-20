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
 * §83: de soorten plek waar één artikel op past — en de enige plek waar die
 * vraag gesteld wordt.
 *
 * Nick, ronde 44: *"Ik wil dat je sommige items op meerdere verschillende
 * plekken mag plaatsen, dus niet limiteren aan slechts 1 ding als muur, bureau,
 * plank etc"*. Het veld `plek` ging daarom van `select` naar `multiselect`, en
 * dat slaat een array op.
 *
 * **Een losse string wordt nog steeds gelezen**, en dat is geen slordigheid die
 * later weg mag. Migratie `0029` bouwt elke bestaande waarde om, maar een
 * archief dat om wat voor reden dan ook niet (of half) gemigreerd is, hoort niet
 * stilletjes elke kamer leeg te maken: een kamer die zegt dat er niets past is
 * een veel stillere ramp dan een foutmelding. De migratie is de bedoeling, dit
 * is het vangnet, en het kost één regel.
 *
 * Dubbelen eruit, en de volgorde van `PLEK_KINDS` aangehouden — dat is de
 * volgorde waarin een kamer gebouwd is, en dus de volgorde waarin een mens ze
 * leest.
 */
export function plekKinds(raw: unknown): PlekKind[] {
  const asked = Array.isArray(raw) ? raw : [raw];
  const found = new Set<PlekKind>();
  for (const value of asked) if (isPlekKind(value)) found.add(value);
  return PLEK_KINDS.filter((kind) => found.has(kind));
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
 * §79 shipped with a caveat here: a soort's fields got their *keys* minted as
 * `veld_1`, `veld_2`, …, and nothing in Beheer could set one — so the design
 * was true in principle and unreachable in practice, and migration `0027` had
 * to ship a soort with the right key already in it.
 *
 * **§80 closed that.** `components/admin/TypeEditor.tsx` has a key box for a
 * field that is new in that edit (an existing field's key is shown as text and
 * never editable — renaming it would orphan every value already stored under
 * it). So a Keeper can now make *Boeken* or *Relikwieën* that fit a kamer,
 * with a price and effect lines, without a migration and without asking
 * anybody. That is the difference between a feature that is theirs and one
 * that stays the developer's.
 */
export const VOORWERP_FIELD_KEY = 'plek';

/**
 * §80: what a stuk huisraad costs, and what it gives.
 *
 * Both are fields on the artikel, like `plek`, and for the same reason: the
 * kamer asks the *thing*, not its soort, so a Keeper who later makes a soort
 * *Boeken* with these three fields has books that fit a kamer and cost munten,
 * without a line of code changing.
 *
 * `effect` is a longtext with one effect per line, and it is text on purpose.
 * The moment it is a number, adding the numbers up is a matter of time — and
 * that is rule 78 over the line. The archief lists; the table decides.
 */
export const PRICE_FIELD_KEY = 'prijs';
export const EFFECT_FIELD_KEY = 'effect';

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
