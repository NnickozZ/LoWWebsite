'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'pending' | 'error';

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
    try {
      const result = await saveRef.current(patch as Patch);
      if (result.pending) setState('pending');
      else if (result.ok) setState('saved');
      else setState('error');
    } catch {
      setState('error');
    } finally {
      inFlight.current = false;
      // Anything typed while the request was in flight goes out immediately.
      if (Object.keys(pendingPatch.current).length) void flush();
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
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush]);

  return { state, set, flush };
}

export function saveLabel(state: SaveState): string {
  switch (state) {
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
