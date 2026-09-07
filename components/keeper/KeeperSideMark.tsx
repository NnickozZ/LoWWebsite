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
 * `flipTo` is where the toggle should go from *this* page — the twin, when
 * there is one, else the list this kind of thing lives in on the other side.
 * The toggle (`SideToggle`) reads it off the DOM; nothing else does.
 *
 * Rendered only by a page that has already established, on the server, which
 * side the record is on. It is a paint instruction, never a permission:
 * nothing anywhere reads this attribute to decide what to show.
 */
export function KeeperSideMark({ side = 'keeper', flipTo }: { side?: Side; flipTo?: string }) {
  return <div data-side={side} data-flip-to={flipTo} hidden aria-hidden="true" />;
}
