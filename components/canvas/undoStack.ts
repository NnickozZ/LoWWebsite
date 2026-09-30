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
 *
 * *Golf M reverses that for the stamboom alone*: its steps may also carry the
 * relation a `+` or *Lijn verwijderen* wrote, and undoing one sends exactly
 * that one ref back through the same road (`writeRelation`), never a whole
 * field. The stack itself did not change for it — what a step *is* stays the
 * canvas's business — it only learnt the other direction (`pushRedo`,
 * `popRedo`, `pushFromRedo`) and `peek`, all additive.
 */

export type UndoStack<T> = {
  /**
   * Remember this state. The oldest is dropped once the stack is full.
   *
   * Golf M: a new step also forgets everything that could be *redone* — a
   * hand that does something new after an undo has started another branch, and
   * redoing the old one on top of it would replay a step against a document it
   * was never taken from. A canvas that never asks for a redo sees no change.
   */
  push: (item: T) => void;
  /** The last state pushed, or `undefined` when there is nothing to go back to. */
  pop: () => T | undefined;
  size: () => number;
  /** Forgets both directions. */
  clear: () => void;
  /** Golf M: the step `pop` would hand back, left where it is. */
  peek: () => T | undefined;
  /**
   * Golf M — the other direction, and only for a canvas that wants it (the
   * stamboom, today). After an undo the canvas pushes here what it needs to
   * *redo* that step; `popRedo` hands it back.
   */
  pushRedo: (item: T) => void;
  popRedo: () => T | undefined;
  redoSize: () => number;
  /**
   * Golf M: an undo step that came *from* a redo. It goes on the undo side
   * like `push`, but it does not forget what is still redoable — that is the
   * rest of the same branch being walked forward again.
   */
  pushFromRedo: (item: T) => void;
};

/** The prikbord's number, for the prikbord's reason: deep enough to be forgiving. */
export const UNDO_LIMIT = 50;

export function createUndoStack<T>(limit: number = UNDO_LIMIT): UndoStack<T> {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : UNDO_LIMIT;
  let items: T[] = [];
  let redo: T[] = [];
  const keep = (list: T[]) => (list.length > cap ? list.slice(list.length - cap) : list);
  return {
    push(item: T) {
      items.push(item);
      items = keep(items);
      redo = [];
    },
    pop() {
      return items.pop();
    },
    size() {
      return items.length;
    },
    clear() {
      items = [];
      redo = [];
    },
    peek() {
      return items[items.length - 1];
    },
    pushRedo(item: T) {
      redo.push(item);
      redo = keep(redo);
    },
    popRedo() {
      return redo.pop();
    },
    redoSize() {
      return redo.length;
    },
    pushFromRedo(item: T) {
      items.push(item);
      items = keep(items);
    },
  };
}
