'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardCard, BoardState, BoardString, Viewport } from '@/lib/boards/merge';
import type { BoardRefs } from '@/lib/boards/service';
import {
  buildPatch,
  emptyDirty,
  mergeDirty,
  noteChange,
  retainUnfindable,
  type Change,
  type Dirty,
} from '@/lib/boards/dirty';
import { classifySaveFailure, retryDelay, SAVE_TIMEOUT_MS } from '@/lib/boards/retry';

export type SyncState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * §8: autosave shortly after the last change — and at once when a hand comes
 * off a card, because everyone else is watching that card move and should not
 * wait for a debounce to see it land. The client sends what it changed plus the
 * ids it has deleted; the server merges and returns the merged document, which
 * is applied here — that is how a card someone else added thirty seconds ago
 * appears without a reload.
 *
 * §61 — een muur die nooit opgeeft. Three things were wrong with the paragraph
 * above, and all three read to the person at the wall as "het heeft kuurtjes":
 *
 * 1. **A save that never answered stopped the wall for good.** The in-flight
 *    latch had no timeout and no abort, so one hung POST meant every later
 *    change set `again` and returned — for the life of the tab, with the strip
 *    still saying *Opgeslagen*. Every save now carries an `AbortController` and
 *    ten seconds; the latch is cleared in `finally`, whatever happened.
 * 2. **A failure was terminal.** `!response.ok` threw without reading the body
 *    and armed nothing. Now the answer is read: a refused card (§50) leaves the
 *    document and the rest of the wall saves; a dead line backs off and comes
 *    back (1 s, 2 s, 4 s … 15 s, jittered); a reason that will not change by
 *    waiting says so in the archive's own words.
 * 3. **It sent the whole document.** See `lib/boards/dirty.ts`: a save now
 *    carries the ids this hand touched and nothing else, so a client whose pull
 *    was deferred can no longer revert the cards somebody else moved.
 */

/** Typing in a note card saves this long after the last keystroke. */
const DEBOUNCE_MS = 300;
export function useBoardSync({
  boardId,
  clientId,
  cards,
  strings,
  viewport,
  onMerged,
  paused,
  onRefusedCards,
  onNotice,
  snapshot,
}: {
  boardId: string;
  /**
   * §8, live: rides along with the save so the server can tell everyone *else*
   * the board moved. The author already holds the merged document that comes
   * back in the response, so telling them too would only make them ask for it
   * again.
   */
  clientId: string;
  cards: BoardCard[];
  strings: BoardString[];
  viewport: Viewport;
  onMerged: (state: BoardState, refs: BoardRefs) => void;
  /** True while a drag or a text edit is in flight — do not yank the DOM. */
  paused: boolean;
  /**
   * §61: the archive refused these cards by name — their reference is on the
   * other side (§50). The wall takes them down; keeping them would mean posting
   * them again with every save and never saving anything else.
   */
  onRefusedCards?: (cardIds: string[]) => void;
  /**
   * §61: the document as it is at *this instant*, rather than as the last
   * render left it. `cards` above is a render's copy, and a save can be
   * scheduled from a callback whose render has not landed yet — an upload that
   * finished, a sheet that answered. The old full-document send survived that
   * by accident, because the next save carried everything anyway; a patch that
   * names ids cannot. The wall keeps a ref beside its state for exactly this.
   */
  snapshot?: () => { cards: BoardCard[]; strings: BoardString[] };
  /**
   * §61: something the person should be told once rather than read off the
   * strip — the sentence the archive sent back with a refusal. The strip has
   * room for a state, not for a reason.
   */
  onNotice?: (message: string) => void;
}) {
  const [state, setState] = useState<SyncState>('idle');
  /** The sentence behind an `error` state, when there is one worth printing. */
  const [error, setError] = useState<string | null>(null);
  const deletedCards = useRef<Set<string>>(new Set());
  const deletedStrings = useRef<Set<string>>(new Set());
  /**
   * Ids undo has deliberately put back. A deletion that reached the server left
   * a tombstone there; only an explicit restore lifts it, so without this an
   * undone card would reappear on screen and be swept away again on the next
   * save — which looks exactly like undo not working.
   */
  const restoredCards = useRef<Set<string>>(new Set());
  const restoredStrings = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** §61: the backoff's own timer, kept apart from the debounce's. */
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** How many times in a row the archive has not taken this save. */
  const attempts = useRef(0);
  /**
   * §61: a reason that waiting will not mend — signed out, not allowed, the
   * wall is gone. Nothing is retried on a timer; the next deliberate change
   * tries once more, because a person pressing a key is a better trigger than a
   * clock, and a wall that has quietly given up is the thing this round is for.
   */
  const halted = useRef(false);
  /** §61: what this hand changed since its last accepted save. */
  const dirty = useRef<Dirty>(emptyDirty());
  /**
   * §61: and what the save currently in flight is carrying. Together with the
   * set above, that is everything this hand has done that the archive has not
   * confirmed — which is exactly what an incoming document may not overwrite.
   */
  const inFlightDirty = useRef<Dirty>(emptyDirty());
  const inFlightDeletedCards = useRef<Set<string>>(new Set());
  const inFlightDeletedStrings = useRef<Set<string>>(new Set());
  /** §61: and the restores, for the same reason — see `pending()`. */
  const inFlightRestoredCards = useRef<Set<string>>(new Set());
  const inFlightRestoredStrings = useRef<Set<string>>(new Set());
  /**
   * §61: how often a dirty id was missing from the document a save was built
   * from. Twice and it is let go — see `retainUnfindable` in `lib/boards/dirty.ts`.
   */
  const missedCards = useRef<Map<string, number>>(new Map());
  const missedStrings = useRef<Map<string, number>>(new Map());
  const inFlight = useRef(false);
  const again = useRef(false);
  /**
   * Bumped by every local change, including the ones during a drag that do not
   * schedule a save. A response whose version is stale is thrown away: it was
   * computed from a document older than what is on screen, and applying it
   * would snap the card the user just moved back to where it started.
   */
  const version = useRef(0);
  const latest = useRef({ cards, strings, viewport, paused });
  latest.current = { cards, strings, viewport, paused };
  const onMergedRef = useRef(onMerged);
  onMergedRef.current = onMerged;
  const onRefusedRef = useRef(onRefusedCards);
  onRefusedRef.current = onRefusedCards;
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    const sentVersion = version.current;
    setState('saving');

    const sending = dirty.current;
    dirty.current = emptyDirty();
    inFlightDirty.current = sending;
    const deletedCardIds = [...deletedCards.current];
    const deletedStringIds = [...deletedStrings.current];
    inFlightDeletedCards.current = new Set(deletedCardIds);
    inFlightDeletedStrings.current = new Set(deletedStringIds);
    const restoredCardIds = [...restoredCards.current];
    const restoredStringIds = [...restoredStrings.current];
    inFlightRestoredCards.current = new Set(restoredCardIds);
    inFlightRestoredStrings.current = new Set(restoredStringIds);
    deletedCards.current = new Set();
    deletedStrings.current = new Set();
    restoredCards.current = new Set();
    restoredStrings.current = new Set();

    /**
     * §61: whatever this save was carrying goes back on the pile, so the next
     * attempt says everything this one meant to. `except` is the refused cards,
     * which are *not* handed back — that is the whole point of dropping them.
     */
    const giveBack = (except?: Set<string>) => {
      mergeDirty(dirty.current, {
        ...sending,
        cards: except ? new Set([...sending.cards].filter((id) => !except.has(id))) : sending.cards,
      });
      for (const id of deletedCardIds) deletedCards.current.add(id);
      for (const id of deletedStringIds) deletedStrings.current.add(id);
      for (const id of restoredCardIds) restoredCards.current.add(id);
      for (const id of restoredStringIds) restoredStrings.current.add(id);
    };

    // §61: a POST that never settles used to hold the latch for the life of the
    // tab. Ten seconds, then the request is abandoned and the backoff takes over.
    const controller = new AbortController();
    const bell = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    let settled = false;
    let status: number | null = null;
    let body: unknown = null;

    // §61: the freshest document there is — see `snapshot` above.
    const held = snapshotRef.current?.() ?? {
      cards: latest.current.cards,
      strings: latest.current.strings,
    };
    const patch = buildPatch({
      dirty: sending,
      cards: held.cards,
      strings: held.strings,
      viewport: latest.current.viewport,
      deletedCardIds,
      deletedStringIds,
      restoredCardIds,
      restoredStringIds,
    });
    /*
     * §61: an id the document does not hold yet stays dirty.
     *
     * `latest.current` is written during a render, and a save can be scheduled
     * from a callback whose render has not landed. The old full-document send
     * survived that by accident — the *next* save carried everything anyway —
     * but a patch that names ids cannot: clearing an id that was never in the
     * body would lose that change for good. So anything the patch could not
     * find goes straight back on the pile.
     *
     * §61, second half: and it does not stay there for ever. An id that could
     * not be found twice running is not a render that has not landed — it is a
     * card somebody took off the wall between the save being scheduled and the
     * patch being built, and leaving it dirty made `pending()` shield a card
     * that does not exist from every incoming document until the tab was
     * reloaded. See `retainUnfindable`.
     */
    const sentCards = new Set(patch.cards?.map((card) => card.id));
    for (const id of retainUnfindable({ wanted: sending.cards, sent: sentCards, misses: missedCards.current })) {
      dirty.current.cards.add(id);
    }
    const sentStrings = new Set(patch.strings?.map((line) => line.id));
    for (const id of retainUnfindable({ wanted: sending.strings, sent: sentStrings, misses: missedStrings.current })) {
      dirty.current.strings.add(id);
    }

    try {
      const response = await fetch(`/api/boards/${boardId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ clientId, ...patch }),
      });
      status = response.status;
      body = await response.json().catch(() => null);
      if (!response.ok) throw new Error('save refused');

      const data = body as {
        state: BoardState;
        entries: BoardRefs['entries'];
        maps: BoardRefs['maps'];
        cases: BoardRefs['cases'];
        timelines?: BoardRefs['timelines'];
        // §52: absent from an older server, which is what the `?? {}` below is for.
        boards?: BoardRefs['boards'];
      };
      settled = true;
      attempts.current = 0;
      halted.current = false;
      setError(null);
      setState('saved');
      /*
       * §61: confirmed *before* the merge is applied, not in `finally`.
       *
       * `onMerged` asks `pending()` what may not be overwritten, and until this
       * round the answer still named every id this very response had just
       * accepted — the `finally` that clears the latch runs after the callback.
       * So the wall pushed the cards it had only just saved back over the
       * archive's own copy of them, and a card somebody else had deleted in the
       * meantime came back as a ghost.
       */
      inFlightDirty.current = emptyDirty();
      inFlightDeletedCards.current = new Set();
      inFlightDeletedStrings.current = new Set();
      inFlightRestoredCards.current = new Set();
      inFlightRestoredStrings.current = new Set();
      // Applying the merge mid-drag, or on top of newer local edits, would
      // fight the pointer — so it only lands when the client is quiet and the
      // response still describes what we sent.
      if (!latest.current.paused && version.current === sentVersion) {
        onMergedRef.current(data.state, { entries: data.entries, maps: data.maps, cases: data.cases, timelines: data.timelines ?? {}, boards: data.boards ?? {} });
      }
    } catch {
      const failure = classifySaveFailure({ status, body });
      if (failure.kind === 'cards') {
        /*
         * §50, read by §61: these cards may not hang here. They come off the
         * wall, they are not handed back to the dirty set, and the person is
         * told in the archive's own sentence — then everything else is saved,
         * at once, because the wall was never the problem.
         */
        const refused = new Set(failure.cardIds);
        giveBack(refused);
        onRefusedRef.current?.(failure.cardIds);
        onNoticeRef.current?.(failure.message);
        attempts.current = 0;
        setError(null);
        setState('dirty');
        retryTimer.current = setTimeout(() => void flush(), 0);
      } else if (failure.retry) {
        giveBack();
        attempts.current += 1;
        setError(failure.message);
        setState('error');
        retryTimer.current = setTimeout(() => void flush(), retryDelay(attempts.current));
      } else {
        giveBack();
        halted.current = true;
        setError(failure.message);
        setState('error');
      }
    } finally {
      clearTimeout(bell);
      inFlight.current = false;
      // Whatever happened, this bundle is no longer in flight: it was either
      // confirmed by the archive or handed back to the dirty set above.
      inFlightDirty.current = emptyDirty();
      inFlightDeletedCards.current = new Set();
      inFlightDeletedStrings.current = new Set();
      inFlightRestoredCards.current = new Set();
      inFlightRestoredStrings.current = new Set();
      // A change that arrived mid-flight goes out now — unless this attempt
      // failed, in which case the backoff above already owns the next one and
      // firing immediately would be a hot loop against a server that is down.
      const waiting = again.current;
      again.current = false;
      if (waiting && settled) void flush();
    }
  }, [boardId, clientId]);

  /**
   * §61: a deliberate change after the wall gave up tries once more. A person
   * pressing a key is the best signal there is that it is worth asking again.
   */
  const wake = useCallback(() => {
    if (!halted.current) return;
    halted.current = false;
    attempts.current = 0;
  }, []);

  /**
   * A local change that does not itself need saving yet (a drag in progress).
   * §61: `change` names the ids this hand touched — see `lib/boards/dirty.ts`.
   * Left out, it means "I do not know", and the whole document goes.
   */
  const touch = useCallback((change?: Change) => {
    version.current += 1;
    noteChange(dirty.current, change);
  }, []);

  const markDirty = useCallback(
    (change?: Change) => {
      version.current += 1;
      noteChange(dirty.current, change);
      wake();
      setState('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [flush, wake],
  );

  /**
   * A change that everyone else is already watching — a drop, a new card, a
   * deletion — goes out now, not after the debounce. `flush` runs on the next
   * tick so the state update that made the change has rendered into
   * `latest.current` first.
   */
  const saveNow = useCallback(
    (change?: Change) => {
      version.current += 1;
      noteChange(dirty.current, change);
      wake();
      setState('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 0);
    },
    [flush, wake],
  );

  const noteDeletedCard = useCallback((id: string) => {
    deletedCards.current.add(id);
    // It is gone: nothing about it needs sending any more.
    dirty.current.cards.delete(id);
  }, []);

  /**
   * Undo brings something back. Two things have to happen for that to survive a
   * round trip: the queued deletion must not still be sitting in this save, and
   * any tombstone the server already wrote has to be lifted.
   *
   * §61: only the ids undo *actually* brings back. It used to be handed every
   * id in the restored snapshot and to clear the pending-deletion queue whole,
   * so one Ctrl+Z lifted the tombstones of cards other people had deleted in
   * the meantime and dropped deletions of this client's own that had not been
   * saved yet. The caller passes the diff (`restoredIds`), and only those ids
   * leave the queue.
   */
  const noteRestored = useCallback((cardIds: string[], stringIds: string[]) => {
    for (const id of cardIds) {
      deletedCards.current.delete(id);
      restoredCards.current.add(id);
      // Lifting the tombstone is half of it; the card itself has to be sent.
      dirty.current.cards.add(id);
    }
    for (const id of stringIds) {
      deletedStrings.current.delete(id);
      restoredStrings.current.add(id);
      dirty.current.strings.add(id);
    }
  }, []);

  const noteDeletedString = useCallback((id: string) => {
    deletedStrings.current.add(id);
    dirty.current.strings.delete(id);
  }, []);

  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  // §61: a timer that outlives the wall would fire a save into a dead page.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  /**
   * §61: everything this hand has done that the archive has not confirmed.
   *
   * A merge — from a save, or from the line when somebody else moved something
   * — is the archive's version of the wall, and it is older than any change
   * that has not reached it yet. Applying it whole therefore reverts the card
   * still sitting in the dirty set, and the *next* save posts that revert to
   * everyone. So the wall asks what is still outstanding and keeps its own copy
   * of those ids. This is the same rule the server merge follows, one side
   * along: a document never silently undoes a change nobody has confirmed.
   */
  const pending = useCallback(
    () => ({
      cards: new Set([...dirty.current.cards, ...inFlightDirty.current.cards]),
      strings: new Set([...dirty.current.strings, ...inFlightDirty.current.strings]),
      deletedCards: new Set([...deletedCards.current, ...inFlightDeletedCards.current]),
      deletedStrings: new Set([...deletedStrings.current, ...inFlightDeletedStrings.current]),
      /*
       * §61: and what undo has brought back and the archive has not been told
       * about. Until that save lands the incoming document still carries the
       * tombstone, and a pull in that window would take the restored card off
       * the screen the person is looking at.
       */
      restoredCards: new Set([...restoredCards.current, ...inFlightRestoredCards.current]),
      restoredStrings: new Set([...restoredStrings.current, ...inFlightRestoredStrings.current]),
      all: dirty.current.all || inFlightDirty.current.all,
    }),
    [],
  );

  return {
    state,
    /** §61: the sentence behind an error, when the archive gave one. */
    error,
    pending,
    markDirty,
    saveNow,
    touch,
    flush,
    noteDeletedCard,
    noteDeletedString,
    noteRestored,
  };
}

export function syncLabel(state: SyncState, message?: string | null): string {
  switch (state) {
    case 'saving':
      return 'Opslaan…';
    case 'saved':
      return 'Opgeslagen';
    case 'error':
      // §61: the archive's own reason when it gave one; the connection is only
      // blamed when nothing answered at all.
      return message || 'Niet opgeslagen — controleer je verbinding';
    default:
      return '';
  }
}
