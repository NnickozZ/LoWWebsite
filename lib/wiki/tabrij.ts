/**
 * §104 (golf H, D6): which soorten stand in the wiki's one row of tabs.
 *
 * Pure, so the rule is tested without a page. The row is *Start · Alles · the
 * soorten with the most artikelen · Meer soorten ▾*. Each soort in the row gets
 * a rang:
 *
 *  - **0** for the soort you are on. It is always in the row, wherever its
 *    count puts it: the tab that says where you are may never be in a menu.
 *  - **1 to `IN_RIJ`** for the largest of the rest, by count, ties in the
 *    Keeper's order. How many of these fit is the stylesheet's business
 *    (`data-rang` in app/leeskamer.css, a number per breakpoint), so the server
 *    renders the right row and nothing moves after it wakes up.
 *  - everything else — and every soort with nothing in it on this side — is in
 *    the menu only (`MENU_RANG`).
 *
 * The row keeps the Keeper's order; the rang only chooses.
 */

/** The most soorten the row holds beside Start and Alles (on the widest screens). */
export const IN_RIJ = 7;
/** The rang of a soort that is only ever in the menu. */
export const MENU_RANG = 99;

export type TabSoort = { slug: string; count: number };

export function rangSoorten(
  types: readonly TabSoort[],
  active: string | null,
): {
  /** slug → rang, for the soorten in the row. A slug that is not here is in the menu only. */
  rang: Map<string, number>;
  /**
   * The menu is empty on a screen that fits this many ranked soorten — null
   * when something is in the menu at every width. The stylesheet hides the
   * button there (`data-nodig-tot`).
   */
  nodigTot: number | null;
} {
  const rang = new Map<string, number>();
  const isActive = (slug: string) => active !== null && slug === active;
  if (types.some((type) => isActive(type.slug))) rang.set(active as string, 0);

  const kandidaten = types
    .map((type, index) => ({ ...type, index }))
    .filter((type) => !isActive(type.slug) && type.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, IN_RIJ);
  kandidaten.forEach((type, i) => rang.set(type.slug, i + 1));

  const alleenMenu = types.some((type) => !rang.has(type.slug));
  return { rang, nodigTot: alleenMenu ? null : kandidaten.length };
}
