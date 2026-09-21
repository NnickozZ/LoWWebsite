/**
 * §90: which soort the `+` on a phone starts on.
 *
 * The *Nieuw* button in the head of `/wiki/<soort>` has always opened the sheet
 * on that soort (`NewOfTypeButton`). The round button above the tab bar did
 * not: it opened on whatever soort was used last, so a speler standing on
 * `/wiki/investigator` who tapped it got *Personen* — and made one. Two roads
 * to one sheet, two answers.
 *
 * And one person above all needs the right soort: a speler with no karakter at
 * all. The only thing they can write is the artikel that becomes their first
 * one (§18b/§18c), so for them the `+` opens on the karakter-soort wherever
 * they stand.
 *
 * Pure: the shell asks, and a test asks the same thing.
 */

/** The soort a karakter is made of — the seed's `investigator` (Onderzoekers). */
export const CHARACTER_TYPE_SLUG = 'investigator';

/** The addresses under `/wiki/` that are pages of their own, not a soort. */
const NOT_A_SOORT = new Set(['alles', 'overzicht']);

export function fabTypeFor(input: {
  pathname: string;
  /** The soorten this person may start (a speler's list leaves the Keeper's out). */
  typeSlugs: readonly string[];
  /** A speler holding no karakter at all — a Keeper never counts. */
  needsCharacter: boolean;
}): string | undefined {
  const { pathname, typeSlugs, needsCharacter } = input;
  if (needsCharacter && typeSlugs.includes(CHARACTER_TYPE_SLUG)) return CHARACTER_TYPE_SLUG;
  const match = /^\/wiki\/([^/?#]+)\/?$/.exec(pathname);
  if (!match) return undefined;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]!);
  } catch {
    return undefined;
  }
  if (NOT_A_SOORT.has(slug)) return undefined;
  return typeSlugs.includes(slug) ? slug : undefined;
}
