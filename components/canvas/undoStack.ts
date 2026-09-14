/**
 * §67 — Ctrl+Z op een canvas.
 *
 * A ring of snapshots, fifty deep. Written for the stamboom in §66
 * (`components/families/treeUndo.ts`, which now re-exports this file) and moved
 * here in §67 when the prikbord — whose `undoStack` it was copied from in the
 * first place — took it too. Pulled out of both canvases for the reason the web's
 * geometry is: the interesting part is the *bookkeeping* (a limit that drops the
 * oldest rather than refusing the newest, a pop that is safe on an empty stack)
 * and none of it needs a browser to be pinned down.
 *
 * **What it does not hold.** Only the canvas's *own* state goes on this stack:
 * who stands on it, where a hand put them, and the lines between them. A
 * kinship written through a role field lives on the *artikel* and is undone
 * there — the `+` handle writes "Ouders: X" on somebody's page, and a Ctrl+Z on
 * a stamboom that quietly unwrote a field on an artikel somebody else is
 * reading would be a much larger promise than this is. The same reasoning as
 * §29's on the prikbord: undo is for what this screen owns.
 */

export type UndoStack<T> = {
  /** Remember this state. The oldest is dropped once the stack is full. */
  push: (item: T) => void;
  /** The last state pushed, or `undefined` when there is nothing to go back to. */
  pop: () => T | undefined;
  size: () => number;
  clear: () => void;
};

/** The prikbord's number, for the prikbord's reason: deep enough to be forgiving. */
export const UNDO_LIMIT = 50;

export function createUndoStack<T>(limit: number = UNDO_LIMIT): UndoStack<T> {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : UNDO_LIMIT;
  let items: T[] = [];
  return {
    push(item: T) {
      items.push(item);
      if (items.length > cap) items = items.slice(items.length - cap);
    },
    pop() {
      return items.pop();
    },
    size() {
      return items.length;
    },
    clear() {
      items = [];
    },
  };
}
