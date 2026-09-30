/**
 * §66 — Ctrl+Z on a stamboom, which since §67 is Ctrl+Z on any canvas.
 *
 * The stack itself moved to `components/canvas/undoStack.ts` when the prikbord
 * — whose `undoStack` this was copied from — adopted it. Nothing about it was
 * ever particular to a stamboom, and what it will and will not hold is written
 * down there. (Golf M: on a stamboom a step may now also carry the one ref a
 * `+` or *Lijn verwijderen* wrote on an artikel — `lib/families/undoSteps.ts`.)
 *
 * This file stays as the tree's door to it, so the canvas and the test that
 * already stand on this path did not have to move to follow it.
 */

export { UNDO_LIMIT, createUndoStack } from '@/components/canvas/undoStack';
export type { UndoStack } from '@/components/canvas/undoStack';

/*
 * Golf M: what one step on a stamboom's stack *is*. The pure half lives in
 * `lib/families/undoSteps.ts` (a test can read it); this is only its door.
 */
export type { RelationOp, TreeStep } from '@/lib/families/undoSteps';
