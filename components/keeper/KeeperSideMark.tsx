/**
 * §44/§45: "this page is the Keeper's side".
 *
 * An empty, hidden marker rather than a wrapper round the page, on purpose: a
 * `<div>` round a page's content joins its grid or its flex row and quietly
 * changes the layout of five different screens. `:root:has([data-side='keeper'])`
 * in `lib/theme/schemes.ts` does not care where in the document the marker is,
 * only that it is there — so an element that renders nothing is the whole job.
 *
 * Rendered only by a page that has already established, on the server, that the
 * record it is showing is keeper-only. It is a paint instruction, never a
 * permission: nothing anywhere reads this attribute to decide what to show.
 */
export function KeeperSideMark({ on = true }: { on?: boolean }) {
  if (!on) return null;
  return <div data-side="keeper" hidden aria-hidden="true" />;
}
