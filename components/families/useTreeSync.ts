'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FamilyGraph, FamilyTreePatch, FamilyTreeState } from '@/lib/families/types';

/**
 * §66 — the stamboom's save and its pull, in one hook.
 *
 * The prikbord's shape (`useBoardSync` + `useBoardLive`), narrowed to what a
 * stamboom actually needs, and with §61's one rule kept whole: **a save says
 * only what this hand did.** The canvas hands over the ids it touched; the
 * patch carries those items and the explicit deletions and nothing else, so a
 * client whose pull was deferred can never revert the person somebody else just
 * dragged. Absence is not a deletion on the server and never was — a tombstone
 * is (`mergeTreeState`).
 *
 * The half the prikbord keeps in a second file is here too, because on a
 * stamboom the two answers are the same answer: a save and a pull both come
 * back as `{ state, graph }`, and both must be applied *around* whatever this
 * hand has not saved yet. `pending()` is that list and `onApply` is handed it.
 *
 * Three rules on the pull, all the prikbord's:
 *
 *  1. **Not while a hand is busy.** A drag, an open sheet, a stroke of ink — a
 *     document that lands mid-gesture is *remembered* (`owed`) and applied the
 *     moment the hand comes off.
 *  2. **One at a time, latest wins.** A second signal queues behind the first.
 *  3. **Never for ever.** Ten seconds and the request is abandoned; the next
 *     signal tries again.
 */

export type SyncState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Which ids one change touched. Nothing given means "I do not know" — send it all. */
export type TreeChangeIds = {
  members?: readonly string[];
  loose?: readonly string[];
  ties?: readonly string[];
};

/** Everything this hand has done that the archive has not confirmed. */
export type PendingIds = {
  members: Set<string>;
  loose: Set<string>;
  ties: Set<string>;
  deletedMembers: Set<string>;
  deletedLoose: Set<string>;
  deletedTies: Set<string>;
  /** The whole document is outstanding — nothing incoming may be taken as it comes. */
  all: boolean;
};

type Dirty = { members: Set<string>; loose: Set<string>; ties: Set<string>; all: boolean };

const emptyDirty = (): Dirty => ({ members: new Set(), loose: new Set(), ties: new Set(), all: false });

/** Typing a name into a los kaartje saves this long after the last keystroke. */
const DEBOUNCE_MS = 300;
const SAVE_TIMEOUT_MS = 10_000;
const PULL_TIMEOUT_MS = 10_000;

export function useTreeSync({
  treeId,
  clientId,
  snapshot,
  paused,
  onApply,
  onRefusedMembers,
  onNotice,
}: {
  treeId: string;
  /** §8, live: rides along so the archive can tell everybody *else* the tree moved. */
  clientId: string;
  /** The document as it is at *this instant*, not as the last render left it (§61). */
  snapshot: () => FamilyTreeState;
  /** True while a drag, a sheet or a stroke is in flight — do not yank the DOM. */
  paused: boolean;
  onApply: (state: FamilyTreeState, graph: FamilyGraph, pending: PendingIds) => void;
  /**
   * §50: the archive refused these members — their artikel is on the other side.
   * They come off the tree; keeping them would mean posting the same refusal for
   * ever and never saving anything else.
   */
  onRefusedMembers?: (ids: string[]) => void;
  /** A sentence worth a toast: the archive's own words for a refusal. */
  onNotice?: (message: string) => void;
}) {
  const [state, setState] = useState<SyncState>('idle');
  const [error, setError] = useState<string | null>(null);

  const dirty = useRef<Dirty>(emptyDirty());
  const inFlightDirty = useRef<Dirty>(emptyDirty());
  const deleted = useRef({ members: new Set<string>(), loose: new Set<string>(), ties: new Set<string>() });
  const inFlightDeleted = useRef({ members: new Set<string>(), loose: new Set<string>(), ties: new Set<string>() });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);

  const pulling = useRef(false);
  const pullAgain = useRef(false);
  const owed = useRef(false);
  /** True while this hand is on something a landing document would yank away. */
  const handOn = useRef(paused);
  handOn.current = paused;

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const onRefusedRef = useRef(onRefusedMembers);
  onRefusedRef.current = onRefusedMembers;
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  /**
   * §61: what may not be overwritten by an incoming document. Both the pile
   * waiting to go out *and* whatever the save in flight is carrying — until the
   * archive has confirmed it, it is still this hand's newer truth.
   */
  const pending = useCallback(
    (): PendingIds => ({
      members: new Set([...dirty.current.members, ...inFlightDirty.current.members]),
      loose: new Set([...dirty.current.loose, ...inFlightDirty.current.loose]),
      ties: new Set([...dirty.current.ties, ...inFlightDirty.current.ties]),
      deletedMembers: new Set([...deleted.current.members, ...inFlightDeleted.current.members]),
      deletedLoose: new Set([...deleted.current.loose, ...inFlightDeleted.current.loose]),
      deletedTies: new Set([...deleted.current.ties, ...inFlightDeleted.current.ties]),
      all: dirty.current.all || inFlightDirty.current.all,
    }),
    [],
  );

  const apply = useCallback((next: FamilyTreeState, graph: FamilyGraph) => {
    onApplyRef.current(next, graph, pending());
  }, [pending]);

  /* ------------------------------------------------------------- the save */

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) {
      again.current = true;
      return;
    }
    const sending = dirty.current;
    const sendingDeleted = {
      members: [...deleted.current.members],
      loose: [...deleted.current.loose],
      ties: [...deleted.current.ties],
    };
    const anything =
      sending.all ||
      sending.members.size ||
      sending.loose.size ||
      sending.ties.size ||
      sendingDeleted.members.length ||
      sendingDeleted.loose.length ||
      sendingDeleted.ties.length;
    if (!anything) return;

    inFlight.current = true;
    dirty.current = emptyDirty();
    inFlightDirty.current = sending;
    deleted.current = { members: new Set(), loose: new Set(), ties: new Set() };
    inFlightDeleted.current = {
      members: new Set(sendingDeleted.members),
      loose: new Set(sendingDeleted.loose),
      ties: new Set(sendingDeleted.ties),
    };
    setState('saving');

    /** Whatever this save was carrying goes back on the pile if it did not land. */
    const giveBack = (exceptMembers?: Set<string>) => {
      for (const id of sending.members) if (!exceptMembers?.has(id)) dirty.current.members.add(id);
      for (const id of sending.loose) dirty.current.loose.add(id);
      for (const id of sending.ties) dirty.current.ties.add(id);
      dirty.current.all = dirty.current.all || sending.all;
      for (const id of sendingDeleted.members) deleted.current.members.add(id);
      for (const id of sendingDeleted.loose) deleted.current.loose.add(id);
      for (const id of sendingDeleted.ties) deleted.current.ties.add(id);
    };

    const held = snapshotRef.current();
    const now = Date.now();
    const patch: FamilyTreePatch = { clientId };
    const stamp = <T extends { updatedAt: number }>(item: T): T => ({ ...item, updatedAt: now });
    if (sending.all) {
      patch.members = held.members.map(stamp);
      patch.loose = held.loose.map(stamp);
      patch.ties = held.ties.map(stamp);
    } else {
      const members = held.members.filter((item) => sending.members.has(item.id)).map(stamp);
      const loose = held.loose.filter((item) => sending.loose.has(item.id)).map(stamp);
      const ties = held.ties.filter((item) => sending.ties.has(item.id)).map(stamp);
      if (members.length) patch.members = members;
      if (loose.length) patch.loose = loose;
      if (ties.length) patch.ties = ties;
    }
    if (sendingDeleted.members.length) patch.deletedMembers = sendingDeleted.members;
    if (sendingDeleted.loose.length) patch.deletedLoose = sendingDeleted.loose;
    if (sendingDeleted.ties.length) patch.deletedTies = sendingDeleted.ties;

    const controller = new AbortController();
    const bell = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    let settled = false;
    try {
      const response = await fetch(`/api/family-trees/${treeId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(patch),
      });
      const body = (await response.json().catch(() => null)) as
        | { state?: FamilyTreeState; graph?: FamilyGraph; error?: string; code?: string; memberIds?: string[] }
        | null;
      if (!response.ok) {
        /*
         * §50: a person whose artikel is on the other side of the archive may
         * not stand in this stamboom. The archive says so by name; those members
         * are dropped rather than handed back, or the same refusal would be
         * posted for ever and nothing else on this tree would ever save.
         */
        if (body?.code === 'OTHER_SIDE' && Array.isArray(body.memberIds) && body.memberIds.length) {
          const refused = new Set(body.memberIds);
          giveBack(refused);
          onRefusedRef.current?.(body.memberIds);
          if (body.error) onNoticeRef.current?.(body.error);
          setError(null);
          setState('dirty');
          // Everything else this hand did was never the problem, so it goes
          // again at once rather than waiting for the next keystroke.
          settled = true;
          again.current = true;
          return;
        }
        giveBack();
        setError(body?.error ?? 'Opslaan is niet gelukt.');
        setState('error');
        return;
      }
      settled = true;
      /*
       * §61: confirmed *before* the merge is applied. `pending()` is asked by
       * `apply`, and it must no longer name the ids this very answer accepted —
       * otherwise the tree pushes what it has only just saved back over the
       * archive's own copy of it.
       */
      inFlightDirty.current = emptyDirty();
      inFlightDeleted.current = { members: new Set(), loose: new Set(), ties: new Set() };
      setError(null);
      setState('saved');
      if (body?.state && body.graph && !handOn.current) apply(body.state, body.graph);
    } catch {
      giveBack();
      setError('Niet opgeslagen — controleer je verbinding.');
      setState('error');
    } finally {
      clearTimeout(bell);
      inFlight.current = false;
      inFlightDirty.current = emptyDirty();
      inFlightDeleted.current = { members: new Set(), loose: new Set(), ties: new Set() };
      const waiting = again.current;
      again.current = false;
      // A failed attempt does not fire straight away: that would be a hot loop
      // against an archive that is down. The next deliberate change tries again.
      if (waiting && settled) void flush();
    }
  }, [treeId, clientId, apply]);

  const markDirty = useCallback(
    (change?: TreeChangeIds, options: { now?: boolean } = {}) => {
      if (!change) dirty.current.all = true;
      for (const id of change?.members ?? []) dirty.current.members.add(id);
      for (const id of change?.loose ?? []) dirty.current.loose.add(id);
      for (const id of change?.ties ?? []) dirty.current.ties.add(id);
      setState('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), options.now ? 0 : DEBOUNCE_MS);
    },
    [flush],
  );

  /** A change everybody else is already watching — a drop, a new person — goes now. */
  const saveNow = useCallback((change?: TreeChangeIds) => markDirty(change, { now: true }), [markDirty]);

  const noteDeleted = useCallback((kind: 'members' | 'loose' | 'ties', ids: readonly string[]) => {
    for (const id of ids) {
      deleted.current[kind].add(id);
      // It is gone: nothing about it needs sending any more.
      dirty.current[kind].delete(id);
    }
  }, []);

  /* ------------------------------------------------------------- the pull */

  const pull = useCallback(async () => {
    if (handOn.current) {
      owed.current = true;
      return;
    }
    if (pulling.current) {
      pullAgain.current = true;
      return;
    }
    pulling.current = true;
    const controller = new AbortController();
    const bell = setTimeout(() => controller.abort(), PULL_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/family-trees/${treeId}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const data = (await response.json()) as { tree?: { state?: FamilyTreeState }; graph?: FamilyGraph };
      if (!data.tree?.state || !data.graph) return;
      // The hand may have picked something up between the ask and the answer.
      if (handOn.current) {
        owed.current = true;
        return;
      }
      owed.current = false;
      apply(data.tree.state, data.graph);
    } catch {
      /* the next signal tries again */
    } finally {
      clearTimeout(bell);
      pulling.current = false;
      if (pullAgain.current) {
        pullAgain.current = false;
        void pull();
      }
    }
  }, [treeId, apply]);

  /** Whatever landed while the hand was down lands the moment it comes off. */
  useEffect(() => {
    if (!paused && owed.current) void pull();
  }, [paused, pull]);

  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  // A timer that outlives the canvas would fire a save into a dead page.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { state, error, pending, markDirty, saveNow, noteDeleted, flush, pull };
}

export function syncLabel(state: SyncState, message?: string | null): string {
  switch (state) {
    case 'saving':
      return 'Opslaan…';
    case 'saved':
      return 'Opgeslagen';
    case 'error':
      return message || 'Niet opgeslagen — controleer je verbinding';
    default:
      return '';
  }
}
