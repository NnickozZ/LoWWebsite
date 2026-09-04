'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'pending' | 'error';

/**
 * §6: no Save button. Changes are collected per field and flushed 800 ms after
 * typing stops, on blur, and before the page is closed. Only the fields that
 * actually changed are sent, so two people editing different fields of the same
 * entry do not overwrite each other.
 */
export function useAutosave<Patch extends Record<string, unknown>>(options: {
  save: (patch: Patch) => Promise<{ ok: boolean; pending?: boolean; error?: string }>;
  delayMs?: number;
}) {
  const { save, delayMs = 800 } = options;
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
      pendingPatch.current = { ...pendingPatch.current, ...patch };
      setState('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [delayMs, flush],
  );

  // Don't lose the last keystrokes when the tab is closed or backgrounded.
  useEffect(() => {
    const onHide = () => {
      if (Object.keys(pendingPatch.current).length) void flush();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
    });
    return () => {
      window.removeEventListener('pagehide', onHide);
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
