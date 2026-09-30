'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  conflictFor,
  heldLocks,
  settleCarry,
  takeHands,
  type Carry,
  type DocAt,
  type HandLike,
  type Lock,
} from '@/lib/live/hands';
import { fill } from '@/lib/words';

/**
 * Golf M (samen): het zachte slot en de draag, als haakjes — dezelfde op alle
 * vier de vlakken. De regels zelf staan in `lib/live/hands.ts`; hier staat
 * alleen wanneer ze gevraagd worden.
 */

const NO_CARRY: ReadonlyMap<string, Carry> = new Map();

/**
 * Wat anderen dragen of net neerzetten, per id. Bijgewerkt bij elk frame
 * (`takeHands`), bij elk nieuw document (`settleCarry` — `docAt` hoort
 * dus een nieuwe functie te zijn als het document veranderde), en elke
 * seconde zolang er iets ligt te wachten op een opslag die niet komt.
 */
export function useCarried({
  hands,
  self,
  docAt,
}: {
  hands: readonly HandLike[];
  self?: string | null;
  docAt: DocAt;
}): ReadonlyMap<string, Carry> {
  const [carried, setCarried] = useState<ReadonlyMap<string, Carry>>(NO_CARRY);
  const docRef = useRef(docAt);
  docRef.current = docAt;

  useEffect(() => {
    setCarried((current) => takeHands(current, hands, { self, now: Date.now(), docAt: docRef.current }));
  }, [hands, self]);

  useEffect(() => {
    setCarried((current) => (current.size ? settleCarry(current, { now: Date.now(), docAt }) : current));
  }, [docAt]);

  const waiting = carried.size > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      setCarried((current) => (current.size ? settleCarry(current, { now: Date.now(), docAt: docRef.current }) : current));
    }, 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  return carried;
}

/** Wat een ander nu sleept: id → wie. Alleen `m`, nooit een keuze. */
export function useLocks(hands: readonly HandLike[], self?: string | null): ReadonlyMap<string, Lock> {
  return useMemo(() => heldLocks(hands, self), [hands, self]);
}

/**
 * De melding bij een druk op iets dat een ander vasthoudt: "Anna heeft dit
 * vast". Eén keer per ding per anderhalve seconde — een hand die blijft
 * drukken, krijgt niet tien meldingen.
 */
export function useLockHint(toast: (message: string) => void, template: string): (lock: Lock, id: string) => void {
  const last = useRef<{ id: string; at: number } | null>(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;
  return useCallback(
    (lock: Lock, id: string) => {
      const now = Date.now();
      if (last.current && last.current.id === id && now - last.current.at < 1500) return;
      last.current = { id, at: now };
      toastRef.current(fill(template, { naam: lock.name || 'Iemand' }));
    },
    [template],
  );
}

/**
 * Twee handen pakten hetzelfde in dezelfde tel. Bij elk frame kijkt dit of
 * een ander iets draagt wat deze hand ook draagt, en die ander het gelijkspel
 * wint (`winsTie`); dan krijgt `onLose` het te horen, één keer per sleep.
 * `mine` leest wat deze hand nu draagt — leeg als ze niets sleept.
 */
export function useDragConflict({
  hands,
  self,
  mine,
  onLose,
}: {
  hands: readonly HandLike[];
  self: string;
  mine: () => Iterable<string>;
  onLose: (conflict: { id: string; lock: Lock }) => void;
}): void {
  const mineRef = useRef(mine);
  mineRef.current = mine;
  const onLoseRef = useRef(onLose);
  onLoseRef.current = onLose;
  useEffect(() => {
    if (!hands.length || !self) return;
    const conflict = conflictFor(mineRef.current(), hands, self);
    if (conflict) onLoseRef.current(conflict);
  }, [hands, self]);
}
