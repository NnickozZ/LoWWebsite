import type { BoardCard, BoardPatch, BoardString, Viewport } from './merge';

/**
 * §61: what this client changed, and nothing else.
 *
 * Until this round every autosave sent the browser's whole card array. The
 * merge upserts by id, so that array is an assertion about *every* card on the
 * wall — including the forty this person never touched. A client whose pull was
 * deferred (a hand on a card defers the merge, on purpose: §8) therefore posted
 * a document from before somebody else's drag, and last-writer-wins quietly
 * reverted every card the other person had moved in the meantime. On a busy
 * wall that is not a rare race; it is what "het heeft allemaal kuurtjes" means.
 *
 * So a save says only what this hand did: the cards and strings whose ids are
 * in the dirty set, the explicit deletions and restores the merge already
 * understands, and the viewport only when it moved (it is shared state in the
 * document — one person panning would otherwise drag everybody's view about).
 * Absence is not deletion on the server and never was — a tombstone is — so a
 * partial patch is a well-formed patch.
 *
 * Pure, so `tests/unit/board-sync-dirty.test.ts` can pin the wire shape down
 * without a browser.
 */

/** Ids this hand touched since its last accepted save. */
export type Dirty = {
  cards: Set<string>;
  strings: Set<string>;
  /** The viewport is one shared value; it goes only when this hand moved it. */
  viewport: boolean;
  /**
   * "I do not know what I changed" — the whole document goes. The first save of
   * a brand-new wall rides this, and so does any caller that has no id list to
   * give; better a full send than a lost card.
   */
  all: boolean;
};

/** What a change reports about itself. Nothing given means the whole document. */
export type Change = {
  cards?: readonly string[];
  strings?: readonly string[];
  viewport?: boolean;
};

export function emptyDirty(): Dirty {
  return { cards: new Set(), strings: new Set(), viewport: false, all: false };
}

/** Folds one change into the set. Mutates — it is a ref's worth of bookkeeping. */
export function noteChange(dirty: Dirty, change?: Change): Dirty {
  if (!change) {
    dirty.all = true;
    return dirty;
  }
  for (const id of change.cards ?? []) dirty.cards.add(id);
  for (const id of change.strings ?? []) dirty.strings.add(id);
  if (change.viewport) dirty.viewport = true;
  return dirty;
}

/** Everything in `b` folded into `a` — how a failed save hands its ids back. */
export function mergeDirty(a: Dirty, b: Dirty): Dirty {
  for (const id of b.cards) a.cards.add(id);
  for (const id of b.strings) a.strings.add(id);
  a.viewport = a.viewport || b.viewport;
  a.all = a.all || b.all;
  return a;
}

export function isDirty(dirty: Dirty): boolean {
  return dirty.all || dirty.viewport || dirty.cards.size > 0 || dirty.strings.size > 0;
}

/**
 * Which of these changed. Identity, not a deep compare: every write on this
 * wall builds a new object for the card it touches (`{ ...card, ...patch }`),
 * so a card that is still the very same object is a card nobody moved. Anything
 * present here and unknown to `prev` is new and therefore dirty.
 */
export function changedIds<T extends { id: string }>(prev: readonly T[], next: readonly T[]): string[] {
  const before = new Map<string, T>();
  for (const item of prev) before.set(item.id, item);
  const out: string[] = [];
  for (const item of next) if (before.get(item.id) !== item) out.push(item.id);
  return out;
}

/**
 * Which ids a step brings *back* — in `prev` (the snapshot undo is restoring)
 * and gone from `next` (what is on the wall now).
 *
 * Undo used to assert every id of its snapshot as restored, which lifted the
 * tombstones of cards *other people* had deleted in the meantime — their
 * deletion undone by a stranger's Ctrl+Z — and cleared this client's whole
 * pending-deletion queue along with it. Only what actually reappears is
 * restored.
 */
export function restoredIds<T extends { id: string }>(
  prev: readonly T[],
  next: readonly T[],
): string[] {
  const now = new Set<string>();
  for (const item of next) now.add(item.id);
  return prev.filter((item) => !now.has(item.id)).map((item) => item.id);
}

/**
 * The body of a save. `cards` and `strings` carry the dirty ones only, unless
 * the set says it does not know what changed.
 */
export function buildPatch(input: {
  dirty: Dirty;
  cards: readonly BoardCard[];
  strings: readonly BoardString[];
  viewport: Viewport;
  deletedCardIds: readonly string[];
  deletedStringIds: readonly string[];
  restoredCardIds: readonly string[];
  restoredStringIds: readonly string[];
}): BoardPatch {
  const { dirty } = input;
  const cards = dirty.all
    ? [...input.cards]
    : input.cards.filter((card) => dirty.cards.has(card.id));
  /*
   * A string is only ever sent whole — it is four small fields — but the same
   * rule applies: a line this hand never touched is not this hand's to assert.
   * A restored id counts as touched, or undo would put a string back on screen
   * and never tell the server.
   */
  const strings = dirty.all
    ? [...input.strings]
    : input.strings.filter(
        (line) => dirty.strings.has(line.id) || input.restoredStringIds.includes(line.id),
      );

  const patch: BoardPatch = {
    cards,
    strings,
    deletedCardIds: [...input.deletedCardIds],
    deletedStringIds: [...input.deletedStringIds],
    restoredCardIds: [...input.restoredCardIds],
    restoredStringIds: [...input.restoredStringIds],
  };
  // Shared state: sent when this hand moved it, and left alone otherwise, so a
  // pan here does not shove everybody else's view sideways on their next pull.
  if (dirty.all || dirty.viewport) patch.viewport = input.viewport;
  return patch;
}

/**
 * §61: how often an id may be missing from the document before it is let go.
 *
 * A save carries the ids in the dirty set, and an id the document does not hold
 * yet goes straight back on the pile — a render that has not landed must not
 * lose a change. But nothing ever took one *off* again: a card that was deleted
 * between the save being scheduled and the patch being built could never be
 * found, so its id sat in the dirty set for the life of the tab, and `pending()`
 * shielded it from every incoming document for ever. Twice is the whole of the
 * story the first rule is about (one save scheduled from a callback whose render
 * had not landed); a third miss is an id that is not coming back.
 */
export const UNFINDABLE_TRIES = 2;

/**
 * Which of the ids a save meant to carry go back on the dirty pile.
 *
 * `misses` is the caller's own tally, one per kind, and it is mutated: an id the
 * patch did find is forgiven, an id it missed for the `UNFINDABLE_TRIES`th time
 * is dropped from both the tally and the answer.
 */
export function retainUnfindable(input: {
  wanted: Iterable<string>;
  sent: ReadonlySet<string>;
  misses: Map<string, number>;
}): string[] {
  const back: string[] = [];
  for (const id of input.wanted) {
    if (input.sent.has(id)) {
      input.misses.delete(id);
      continue;
    }
    const times = (input.misses.get(id) ?? 0) + 1;
    if (times >= UNFINDABLE_TRIES) {
      input.misses.delete(id);
      continue;
    }
    input.misses.set(id, times);
    back.push(id);
  }
  return back;
}

/**
 * §61: may a thing this hand is still holding be put back into a document that
 * does not contain it?
 *
 * An incoming document is the archive's version of the wall, and a card this
 * hand made a second ago is simply not in it yet — so it is pushed back in, or
 * it would blink out between the save and the pull. But "not in the document"
 * has a second meaning: **somebody else deleted it**. A deletion leaves a
 * tombstone (`state.deleted`), and a card whose id is tombstoned is not missing,
 * it is gone — pushing it back left a ghost card on this screen until something
 * unrelated moved, and the next save posted the ghost to everybody.
 *
 * So three questions, in this order: is it still this hand's to assert, did this
 * hand take it off the wall itself, and does the archive say it is gone.
 */
export function shouldReadd(
  id: string,
  input: {
    dirty: ReadonlySet<string>;
    /** What this hand has deleted and not had confirmed yet. */
    deletedHere: ReadonlySet<string>;
    /**
     * And what undo has deliberately brought back and the archive has not been
     * told about yet. A restore lifts a tombstone (`restoredCardIds`), so until
     * that save lands the document still says "gone" about something the person
     * is looking at — which is the one case where a tombstone is not the truth.
     */
    restoredHere?: ReadonlySet<string>;
    /** The incoming document's tombstones for this kind of thing. */
    tombstones?: Record<string, number>;
  },
): boolean {
  if (!input.dirty.has(id)) return false;
  if (input.deletedHere.has(id)) return false;
  if (input.restoredHere?.has(id)) return true;
  if (input.tombstones && Object.prototype.hasOwnProperty.call(input.tombstones, id)) return false;
  return true;
}

/**
 * A card the server refused (§50: its reference is on the other side of the
 * archive) leaves the local document with the strings tied to it — otherwise
 * the client posts the same refused card for ever and nothing on this wall is
 * ever saved again.
 */
export function dropCards(
  cards: readonly BoardCard[],
  strings: readonly BoardString[],
  ids: readonly string[],
): { cards: BoardCard[]; strings: BoardString[] } {
  const doomed = new Set(ids);
  const touches = (end: BoardString['from']) =>
    typeof (end as { card?: unknown }).card === 'string' &&
    doomed.has((end as { card: string }).card);
  return {
    cards: cards.filter((card) => !doomed.has(card.id)),
    strings: strings.filter((line) => !touches(line.from) && !touches(line.to)),
  };
}
