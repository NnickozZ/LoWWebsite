'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardCard, BoardState, BoardString, Viewport } from '@/lib/boards/merge';
import type { BoardEntryFacts } from '@/lib/boards/service';

export type SyncState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * §8: autosave shortly after the last change — and at once when a hand comes
 * off a card, because everyone else is watching that card move and should not
 * wait for a debounce to see it land. The client sends what it knows plus the
 * ids it has deleted; the server merges and returns the merged document, which
 * is applied here — that is how a card someone else added thirty seconds ago
 * appears without a reload.
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
  onMerged: (state: BoardState, entries: Record<string, BoardEntryFacts>) => void;
  /** True while a drag or a text edit is in flight — do not yank the DOM. */
  paused: boolean;
}) {
  const [state, setState] = useState<SyncState>('idle');
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

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    const sentVersion = version.current;
    setState('saving');

    const deletedCardIds = [...deletedCards.current];
    const deletedStringIds = [...deletedStrings.current];
    const restoredCardIds = [...restoredCards.current];
    const restoredStringIds = [...restoredStrings.current];
    deletedCards.current = new Set();
    deletedStrings.current = new Set();
    restoredCards.current = new Set();
    restoredStrings.current = new Set();

    try {
      const response = await fetch(`/api/boards/${boardId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          cards: latest.current.cards,
          strings: latest.current.strings,
          viewport: latest.current.viewport,
          deletedCardIds,
          deletedStringIds,
          restoredCardIds,
          restoredStringIds,
        }),
      });
      if (!response.ok) throw new Error('save failed');
      const data = (await response.json()) as {
        state: BoardState;
        entries: Record<string, BoardEntryFacts>;
      };
      setState('saved');
      // Applying the merge mid-drag, or on top of newer local edits, would
      // fight the pointer — so it only lands when the client is quiet and the
      // response still describes what we sent.
      if (!latest.current.paused && version.current === sentVersion) {
        onMergedRef.current(data.state, data.entries);
      }
    } catch {
      // Put them back so they are retried rather than lost.
      for (const id of deletedCardIds) deletedCards.current.add(id);
      for (const id of deletedStringIds) deletedStrings.current.add(id);
      for (const id of restoredCardIds) restoredCards.current.add(id);
      for (const id of restoredStringIds) restoredStrings.current.add(id);
      setState('error');
    } finally {
      inFlight.current = false;
      if (again.current) {
        again.current = false;
        void flush();
      }
    }
  }, [boardId, clientId]);

  /** A local change that does not itself need saving yet (a drag in progress). */
  const touch = useCallback(() => {
    version.current += 1;
  }, []);

  const markDirty = useCallback(() => {
    version.current += 1;
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [flush]);

  /**
   * A change that everyone else is already watching — a drop, a new card, a
   * deletion — goes out now, not after the debounce. `flush` runs on the next
   * tick so the state update that made the change has rendered into
   * `latest.current` first.
   */
  const saveNow = useCallback(() => {
    version.current += 1;
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 0);
  }, [flush]);

  const noteDeletedCard = useCallback((id: string) => {
    deletedCards.current.add(id);
  }, []);

  /**
   * Undo brings something back. Two things have to happen for that to survive a
   * round trip: the queued deletion must not still be sitting in this save, and
   * any tombstone the server already wrote has to be lifted. The caller passes
   * what the restored board contains, and every one of those ids is asserted as
   * present — which is what undo means.
   */
  const noteRestored = useCallback((cardIds: string[], stringIds: string[]) => {
    deletedCards.current = new Set();
    deletedStrings.current = new Set();
    for (const id of cardIds) restoredCards.current.add(id);
    for (const id of stringIds) restoredStrings.current.add(id);
  }, []);

  const noteDeletedString = useCallback((id: string) => {
    deletedStrings.current.add(id);
  }, []);

  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  return {
    state,
    markDirty,
    saveNow,
    touch,
    flush,
    noteDeletedCard,
    noteDeletedString,
    noteRestored,
  };
}

export function syncLabel(state: SyncState): string {
  switch (state) {
    case 'saving':
      return 'Opslaan…';
    case 'saved':
      return 'Opgeslagen';
    case 'error':
      return 'Niet opgeslagen — controleer je verbinding';
    default:
      return '';
  }
}
