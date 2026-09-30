/**
 * Golf M — één stap terug op een stamboom, en weer vooruit.
 *
 * Until golf M a stamboom's Ctrl+Z held only the tree's *own* state — who
 * stands in it, where a hand put them, the los kaartjes and the ties — and a
 * line read off a field on an artikel was, by §66's rule, out of its reach:
 * *Lijn verwijderen* was the one gesture on the glass that could not be taken
 * back. Golf M reverses that, for the stamboom alone.
 *
 * A step is therefore two things, either of which may be missing:
 *
 *  - `state`: the tree's own document as it was **before** the step, restored
 *    whole — exactly the snapshot every step used to be;
 *  - `relations`: the refs this step wrote on artikelen, each as it was sent
 *    (`add` true for a line drawn, false for one rubbed out). Undoing sends each
 *    one back **inverted**, last first, through the same road the canvas used
 *    (`POST /api/family-trees/{id}/relations` → `writeRelation` →
 *    `updateEntry`), so the §38 gate, the mirror, the revision and — for a hand
 *    that may not change the artikel — the voorstel all apply to the undo as
 *    they applied to the step.
 *
 * **Targeted, never a field.** A relation op names one ref in one field.
 * `writeRelation` reads the field as it is *now* and adds or removes only that
 * ref, so somebody else's later edit to the same field survives an undo; and
 * when the ref is already where the undo would put it (`unchanged` — somebody
 * redrew or rubbed out the line meanwhile), nothing is written and the canvas
 * says so. That is the whole of "never clobber a later edit": there is no
 * whole-field write anywhere on this road.
 *
 * Pure, and in `lib/` for the reason `layout.ts` is: a test can read it.
 */
import type { FamilyTreeState } from './types';

/** One ref in one koppelingsveld, as it was sent. */
export type RelationOp = {
  entryId: string;
  fieldKey: string;
  targetId: string;
  /** True: the line was drawn. False: it was rubbed out. */
  add: boolean;
};

/**
 * One step on the stack. `S` is the tree's document; generic only so a test
 * can use something smaller than a whole `FamilyTreeState`.
 */
export type TreeStep<S = FamilyTreeState> = {
  /** The document before the step, when the step touched it. */
  state?: S;
  /** The refs the step wrote on artikelen, in the order they were written. */
  relations: RelationOp[];
};

/**
 * Golf M (herstel): one gesture's step while it is being made. It is handed
 * **down the gesture's own calls**, never kept in one place for the canvas: a
 * `+` that waits on the network is still open when the hand drags another card,
 * and a shared "current gesture" folded that unrelated drag into the `+`'s step
 * — one Ctrl+Z then took both back.
 */
export type StepGroup<S = FamilyTreeState> = {
  /** The document as the gesture found it. */
  before: S;
  /** Whether any commit of the gesture changed the document. */
  touched: boolean;
  /** The refs the gesture wrote, in order. */
  relations: RelationOp[];
};

export function openGroup<S>(before: S): StepGroup<S> {
  return { before, touched: false, relations: [] };
}

/** The step a finished gesture leaves on the stack (maybe empty — see `isEmptyStep`). */
export function closeGroup<S>(group: StepGroup<S>): TreeStep<S> {
  return { ...(group.touched ? { state: group.before } : {}), relations: [...group.relations] };
}

/**
 * Golf M (herstel): where the undo side of a stack stood, to see afterwards
 * whether a new step was pushed meanwhile. An undo walks over the wire; a hand
 * that does something new before it lands has started another branch, and the
 * redo the walk would leave behind no longer belongs to anything.
 */
export type StackMark<T> = { top: T | undefined; size: number };

export function stackMark<T>(stack: { peek(): T | undefined; size(): number }): StackMark<T> {
  return { top: stack.peek(), size: stack.size() };
}

export function stackMoved<T>(mark: StackMark<T>, stack: { peek(): T | undefined; size(): number }): boolean {
  return stack.peek() !== mark.top || stack.size() !== mark.size;
}

/** How one op came back from the road. */
export type OpOutcome =
  /** Written. */
  | 'landed'
  /** Filed as a voorstel: nothing changed yet, the Keeper decides. */
  | 'proposed'
  /** The ref was already where it was sent (somebody got there first). */
  | 'unchanged'
  /** Refused, or no line to the archive. */
  | 'refused';

export function invertOp(op: RelationOp): RelationOp {
  return { ...op, add: !op.add };
}

/**
 * Golf M (herstel): the ops one landed write puts on a step. A `+` into a
 * one-box field (`entry_link`) that already held somebody **replaces** them,
 * and that is two changes, not one: the old ref went, then the new one came.
 * Recorded as such, an undo (inverted, last first) takes the new one out and
 * gives the box back its old ref (`replace: false`, so only into an empty
 * box), and a redo does the two again in order. `replaced` is what the road
 * answered (`writeRelation`'s `replaced`).
 */
export function landedOps(op: RelationOp, replaced?: string | null): RelationOp[] {
  if (!op.add || !replaced || replaced === op.targetId) return [op];
  return [{ entryId: op.entryId, fieldKey: op.fieldKey, targetId: replaced, add: false }, op];
}

/** What to send to undo a step: every op inverted, the last one first. */
export function undoOps(step: TreeStep<unknown>): RelationOp[] {
  return [...step.relations].reverse().map(invertOp);
}

/** What to send to redo a step: every op as it was, the first one first. */
export function redoOps(step: TreeStep<unknown>): RelationOp[] {
  return step.relations.map((op) => ({ ...op }));
}

/** A step that changes nothing is not worth a place on the stack. */
export function isEmptyStep(step: TreeStep<unknown>): boolean {
  return step.state === undefined && step.relations.length === 0;
}

/** The status `writeRelation` answered, read as an outcome. */
export function outcomeOf(status: string | undefined, ok: boolean): OpOutcome {
  if (!ok) return 'refused';
  if (status === 'pending') return 'proposed';
  if (status === 'unchanged') return 'unchanged';
  return 'landed';
}

/**
 * The step that walking `step` in one direction leaves for the other.
 *
 * `current` is the document as it is at the moment of the walk — what the
 * other direction must put back. `sent` are the ops that were sent (inverted
 * for an undo) and `outcomes` their answers, index for index. Only an op that
 * **landed** comes along: one that was proposed, found already in place, or
 * refused changed nothing, and replaying it later would write something the
 * hand never saw happen. The ops come back in the step's own direction (as the
 * step originally did them), so the same `undoOps`/`redoOps` read them.
 */
export function oppositeStep<S>(
  step: TreeStep<S>,
  current: S,
  sent: readonly RelationOp[],
  outcomes: readonly OpOutcome[],
  direction: 'undo' | 'redo',
): TreeStep<S> {
  const landed = sent.filter((_, index) => outcomes[index] === 'landed');
  // An undo sent them inverted and last-first; turn them back into the step's
  // own reading before they are stored.
  const relations = direction === 'undo' ? [...landed].reverse().map(invertOp) : landed.map((op) => ({ ...op }));
  return { ...(step.state !== undefined ? { state: current } : {}), relations };
}

/**
 * Which sentence, if any, the canvas owes the hand after a walk. The worst
 * news wins: a refusal is said before a proposal, a proposal before "somebody
 * got there first", and a walk where everything landed says nothing at all.
 */
export function walkNotice(outcomes: readonly OpOutcome[]): Exclude<OpOutcome, 'landed'> | null {
  if (outcomes.includes('refused')) return 'refused';
  if (outcomes.includes('proposed')) return 'proposed';
  if (outcomes.includes('unchanged')) return 'unchanged';
  return null;
}
