/**
 * §18b: which sheet is on top.
 *
 * A `Sheet` is a portal onto `<body>` with a document-level key handler, and
 * for most of the app's life exactly one was ever on screen. That stopped being
 * true the moment a sheet could put a *question* in front of another one — the
 * archive answering `needsAuthor` while "Nieuw artikel" is open — and it turns
 * out it was never quite true anyway: `ui.confirm()` is called from inside a
 * speld-sheet and a gebeurtenis-sheet today.
 *
 * Two sheets both listening on `document` is not a small mistake. `Escape` is
 * dispatched at one node, and `stopPropagation` on a capture listener does not
 * stop the *other* listener on that same node — only `stopImmediatePropagation`
 * would, and that would be a race over who registered first. So one press shut
 * every open sheet at once, which on the blocking "Met wie ben je nu aan het
 * schrijven?" meant it closed the sheet underneath it and stayed standing.
 *
 * The fix is that a sheet only listens while it is the top of this pile. The
 * pile is module state rather than context because the sheets do not share a
 * parent — they are portals, opened from providers at different heights — and
 * because the handlers read it at *event* time, where a render-time value would
 * already be stale.
 *
 * No DOM in here on purpose: the ordering is the part worth testing, and it is
 * testable in a plain node.
 */

/** The sheets on screen, oldest first. The last one is the one on top. */
let stack: number[] = [];
let nextId = 1;

/** The lowest `z-index` a sheet paints at — `.sheet-backdrop` in `globals.css`. */
export const SHEET_BASE_Z = 60;

/** A sheet has appeared. Returns the token it must hand back when it goes. */
export function openSheet(): number {
  const id = nextId++;
  stack = [...stack, id];
  return id;
}

/** A sheet has gone. Unknown or already-closed tokens are ignored. */
export function closeSheet(id: number): void {
  stack = stack.filter((open) => open !== id);
}

/**
 * Is this the sheet a person is actually looking at? Escape, Tab and a tap on
 * the backdrop belong to it alone; everything under it plays dead.
 */
export function isTopSheet(id: number): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

/**
 * How deep this sheet sits — 0 for the first one open. Read once, when the
 * sheet appears, and turned into a `z-index`: a sheet that opens over another
 * has to paint over it, and two portals with the same `z-index` are ordered by
 * the accident of which mounted first.
 */
export function sheetDepth(id: number): number {
  const index = stack.indexOf(id);
  return index < 0 ? 0 : index;
}

/** How many are open. The first and the last are what the scroll lock cares about. */
export function openSheetCount(): number {
  return stack.length;
}

/** Tests only: an empty screen. */
export function resetSheetStack(): void {
  stack = [];
  nextId = 1;
}
