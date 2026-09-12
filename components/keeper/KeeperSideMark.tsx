import type { Side } from '@/lib/keeper/kinds';

/**
 * §44/§45/§46: "this page is on *this* side".
 *
 * An empty, hidden marker rather than a wrapper round the page, on purpose: a
 * `<div>` round a page's content joins its grid or its flex row and quietly
 * changes the layout of five different screens. `:root:has([data-side=…])`
 * in `lib/theme/schemes.ts` does not care where in the document the marker is,
 * only that it is there — so an element that renders nothing is the whole job.
 *
 * Since §46 a record's page says which side it is on **either way**: 'keeper'
 * paints it in the Keeper's colours, and 'player' overrides the layout's own
 * `data-side="keeper"` (the browser's side) so a player-facing artikel reached
 * from the Keeper's side is painted as what it is. The selectors read the two
 * together — Keeper-coloured when something says keeper and nothing says
 * player — which is the whole of "the site turns over with you".
 *
 * `flipTo` is where the toggle should go from *this* page: the tweeling, when
 * there is one. `flipList` is the list this kind of thing lives in, for when
 * there is not. The toggle (`SideToggle`) reads them off the DOM; nothing else
 * does.
 *
 * §57: the two used to be one prop — every page wrote `twinOf(…)?.href ?? '/wiki'`
 * — and the toggle could not tell the tweeling from the fallback. It still
 * goes to the same place either way; the difference is only what the landing
 * says, and a page that arrives on a list without a word about why is the
 * whole of what read as broken. So the fallback keeps its own attribute:
 * `data-flip-to` is where to go, `data-flip-none` says it is the list.
 *
 * Rendered only by a page that has already established, on the server, which
 * side the record is on. It is a paint instruction, never a permission:
 * nothing anywhere reads this attribute to decide what to show.
 */
export function KeeperSideMark({
  side = 'keeper',
  flipTo,
  flipList,
}: {
  side?: Side;
  flipTo?: string;
  flipList?: string;
}) {
  return (
    <div
      data-side={side}
      data-flip-to={flipTo || flipList}
      /* §57: present exactly when the address above is the fallback list. */
      data-flip-none={!flipTo && flipList ? '1' : undefined}
      hidden
      aria-hidden="true"
    />
  );
}
