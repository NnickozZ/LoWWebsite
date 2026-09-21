'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveSave, LiveStatus } from '@/components/editor/useLiveDoc';
import { DEFAULT_WORDS, type Words } from '@/lib/words';

/**
 * `offline` (§90): a save that never reached the archive — the request itself
 * failed, as opposed to the archive answering no (`error`). What was in it is
 * kept and goes out again when the browser says the line is back.
 */
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'pending' | 'error' | 'offline';

/** A bag of values, as opposed to a document or a list, which is one value. */
function isBag(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * What is waiting to be saved, once one more change has arrived. Pure, so the
 * rule can be read (and tested) without a component around it.
 *
 * Every key replaces what was waiting under it — the second answer is the
 * answer. The exception is a key named in `mergeKeys`, whose value is a *bag*
 * of independent answers rather than one: see the note on the option below.
 */
export function mergePatch<Patch extends Record<string, unknown>>(
  waiting: Partial<Patch>,
  arriving: Partial<Patch>,
  mergeKeys: readonly (keyof Patch & string)[] = [],
): Partial<Patch> {
  const merged = { ...waiting, ...arriving };
  for (const key of mergeKeys) {
    const before = waiting[key];
    const after = arriving[key];
    if (isBag(before) && isBag(after)) merged[key] = { ...before, ...after } as Patch[typeof key];
  }
  return merged;
}

/**
 * §6: no Save button. Changes are collected per field and flushed 800 ms after
 * typing stops, on blur, and before the page is closed. Only the fields that
 * actually changed are sent, so two people editing different fields of the same
 * entry do not overwrite each other.
 */
export function useAutosave<Patch extends Record<string, unknown>>(options: {
  save: (patch: Patch) => Promise<{ ok: boolean; pending?: boolean; error?: string }>;
  delayMs?: number;
  /**
   * §38: the keys whose value is a *bag of independent values* rather than one
   * value — `fields`, the infobox, and nothing else so far.
   *
   * Every other key is one thing: a name, a body, a cover. Two changes to it
   * inside one 800 ms window mean the second is the answer, so the plain
   * `{ ...pending, ...patch }` below is exactly right. A bag is not one thing.
   * Filling in a Getal and then ticking a Ja/nee sends `{ fields: { a } }` and
   * then `{ fields: { b } }`, and replacing the bag threw the first answer away
   * before it was ever sent — one PATCH went out, carrying only the last box
   * anybody touched. So a bag is merged a level deeper, per key, and the
   * promise above still holds: what goes out is only what changed.
   */
  mergeKeys?: readonly (keyof Patch & string)[];
}) {
  const { save, delayMs = 800, mergeKeys } = options;
  // A ref, so `set` does not have to be rebuilt when a caller passes a fresh
  // array literal on every render.
  const mergeKeysRef = useRef(mergeKeys);
  mergeKeysRef.current = mergeKeys;
  const [state, setState] = useState<SaveState>('idle');
  const pendingPatch = useRef<Partial<Patch>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) return;
    const patch = pendingPatch.current;
    if (!Object.keys(patch).length) return;

    pendingPatch.current = {};
    inFlight.current = true;
    setState('saving');
    let unreached = false;
    try {
      const result = await saveRef.current(patch as Patch);
      if (result.pending) setState('pending');
      else if (result.ok) setState('saved');
      else setState('error');
    } catch {
      /*
       * §90: the request never arrived — no network, not a refusal. The patch
       * goes back in the queue *under* anything typed since (the newer answer
       * wins, as it always does here) and waits for the `online` below or the
       * next keystroke, instead of being dropped while the screen said
       * "Opslaan…" for ever.
       */
      pendingPatch.current = mergePatch(patch, pendingPatch.current, mergeKeysRef.current ?? []);
      setState('offline');
      unreached = true;
    } finally {
      inFlight.current = false;
      // Anything typed while the request was in flight goes out immediately —
      // unless the line is down, when "immediately" would be a loop.
      if (!unreached && Object.keys(pendingPatch.current).length) void flush();
    }
  }, []);

  const set = useCallback(
    (patch: Partial<Patch>) => {
      pendingPatch.current = mergePatch(pendingPatch.current, patch, mergeKeysRef.current ?? []);
      setState('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [delayMs, flush],
  );

  // Don't lose the last keystrokes when the tab is closed or backgrounded.
  //
  // §60: both listeners come off again. The `visibilitychange` one used to be
  // added anonymously and never removed, so every artikel or dossier ever
  // opened in a tab left a live closure on `document` holding this hook's
  // refs — a leak that grew with every navigation and kept flushing patches
  // for components that were long gone.
  useEffect(() => {
    const onHide = () => {
      if (Object.keys(pendingPatch.current).length) void flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    // §90: the line is back — whatever waited goes now.
    window.addEventListener('online', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onHide);
    };
  }, [flush]);

  return { state, set, flush };
}

export function saveLabel(state: SaveState, words?: Words): string {
  switch (state) {
    case 'offline':
      return (words ?? DEFAULT_WORDS).saveOffline;
    case 'saving':
      return 'Opslaan…';
    case 'saved':
      return 'Opgeslagen';
    case 'pending':
      return 'Naar de Keeper gestuurd ter beoordeling';
    case 'error':
      return 'Niet opgeslagen — controleer je verbinding';
    default:
      return '';
  }
}

/* ------------------------------------------------ §90: the one save word */

/** Where one live room's keystrokes stand, as `useLiveDoc` reports it. */
export type RoomSave = { status: LiveStatus; save: LiveSave };

/** After this long with something on its way and no answer, the screen stops saying "Opslaan…". */
export const SAVE_STUCK_MS = 5000;

/**
 * §90: one word for everything on its way from this page — the autosave of the
 * record and each live room (the text, the short fields). Pure, so the order
 * is readable and tested.
 *
 * The order is the whole point. Until round 51 `saving` was asked first, so a
 * page whose line was down said "Opslaan…" for as long as anybody kept
 * typing, and never the sentence `saveLabel('error')` had for it. Now:
 *
 *   1. the archive said **no** — that is news, and it stays up;
 *   2. something is on its way **and** the line is down (the browser says so,
 *      a room says so, or nothing came back for `SAVE_STUCK_MS`) — "nog niet
 *      opgeslagen", which is true, and "wordt bewaard", which is also true:
 *      the rooms re-send (§60) and the autosave keeps its patch (above);
 *   3. something is on its way — "Opslaan…";
 *   4. a proposal went to the Keeper, or everything landed.
 */
export function combinedSave(input: {
  state: SaveState;
  rooms: readonly RoomSave[];
  online: boolean;
  stuck: boolean;
}): SaveState {
  const { state, rooms, online, stuck } = input;
  if (state === 'error') return 'error';
  const onItsWay = state === 'dirty' || state === 'saving' || state === 'offline' || rooms.some((room) => room.save === 'saving');
  if (onItsWay) {
    const lineDown = !online || stuck || state === 'offline' || rooms.some((room) => room.status === 'offline');
    return lineDown ? 'offline' : 'saving';
  }
  if (state === 'pending') return 'pending';
  if (state === 'saved' || rooms.some((room) => room.save === 'saved')) return 'saved';
  return 'idle';
}

/**
 * The hook around `combinedSave`: listens for the browser's own online/offline
 * and times how long something has been on its way without anything changing.
 * Returns the sentence for `.save-state`.
 */
export function useSaveWord(state: SaveState, rooms: readonly RoomSave[], words?: Words): string {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const read = () => setOnline(typeof navigator === 'undefined' || navigator.onLine !== false);
    read();
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    return () => {
      window.removeEventListener('online', read);
      window.removeEventListener('offline', read);
    };
  }, []);

  /*
   * What the clock watches is narrower than "on its way", on purpose. A live
   * room says `saving` until the archive has *persisted* the text, which it
   * does once the typing pauses — so somebody typing a long paragraph on a
   * perfectly good line is `saving` for as long as they type, and a clock on
   * that would call a healthy line dead. So the clock runs on the two things
   * that really are a question without an answer: an autosave request in
   * flight, and a room with keystrokes waiting while its line is not up.
   */
  const waiting = state === 'saving' || rooms.some((room) => room.save === 'saving' && room.status !== 'live');
  // Any movement at all restarts the clock: a new save state is an answer.
  const movement = `${state}|${rooms.map((room) => `${room.status}:${room.save}`).join(',')}`;
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    setStuck(false);
    if (!waiting) return;
    const timer = setTimeout(() => setStuck(true), SAVE_STUCK_MS);
    return () => clearTimeout(timer);
  }, [waiting, movement]);

  return saveLabel(combinedSave({ state, rooms, online, stuck }), words);
}
