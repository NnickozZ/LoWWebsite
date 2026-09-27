'use client';

import { useEffect, useId, useSyncExternalStore } from 'react';

/**
 * §100 (B14): één opslaan-woord, in de schil.
 *
 * Tot ronde 61 zei elke paginasoort zelf of hij had opgeslagen, en elk op een
 * andere plek: het artikel en het dossier in hun kop naast *Lezen*, het
 * prikbord en de stamboom in hun werkbalk, de tekenlaag naast de gum, het
 * Keeperpaneel onder zijn vak — en de LIVE-lijn in de hoek zei iets over de
 * verbinding. Wie van een artikel naar een prikbord ging, moest opnieuw zoeken
 * waar het woord stond.
 *
 * Nu melden de schrijvers hun toestand hier, en de schil tekent één woord naast
 * de live-stip (`SaveStatus`). Module-level om dezelfde reden als
 * `refreshHold.ts`: de schrijvers zijn kinderen van de pagina, de schil is hun
 * voorouder maar de pagina's leven in een server-boom waar een context niet
 * altijd bij kan, en er is één tabblad, dus één register.
 *
 * Een schrijver die verdwijnt (een andere pagina, Lezen in plaats van
 * Bewerken) haalt zijn melding weg; wat overblijft is wat er op déze pagina
 * onderweg is.
 */

/**
 * Wat een schrijver kan zeggen. `pending` is §6's voorstel dat naar de Keeper
 * ging; `offline` is §90's "nog niet binnen, de lijn is weg" (B15).
 */
export type SaveReport = 'idle' | 'saving' | 'saved' | 'pending' | 'offline' | 'error';

type Entry = { state: SaveReport; message?: string | null };

const reports = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot: Combined = { state: 'none', message: null, writers: 0 };

/**
 * Wat de schil tekent. `none` is "er schrijft hier niemand" — geen woord en
 * geen gereserveerde ruimte; `idle` is "er is een schrijver, maar er is niets
 * gebeurd", een lege plek die al zo breed is als hij straks wordt.
 */
export type Combined = { state: SaveReport | 'none'; message: string | null; writers: number };

/**
 * De luidste wint. Een fout is luider dan bezig (de archivaris zei *nee*, en
 * dat blijft staan tot hij iets anders zegt); niet binnen omdat de lijn weg is
 * is luider dan bezig (dat is waar, en "Opslaan…" zou liegen dat het lukt);
 * bezig is luider dan opgeslagen (één vak dat nog onderweg is, is niet
 * binnen). Puur, zodat de volgorde gelezen en getest kan worden.
 */
const RANK: Record<SaveReport, number> = {
  error: 6,
  offline: 5,
  saving: 4,
  pending: 3,
  saved: 2,
  idle: 1,
};

export function combineReports(entries: readonly Entry[]): Combined {
  if (!entries.length) return { state: 'none', message: null, writers: 0 };
  let best: Entry = entries[0];
  for (const entry of entries) if (RANK[entry.state] > RANK[best.state]) best = entry;
  return { state: best.state, message: best.state === 'error' ? best.message ?? null : null, writers: entries.length };
}

function recompute() {
  const next = combineReports([...reports.values()]);
  if (next.state === snapshot.state && next.message === snapshot.message && next.writers === snapshot.writers) return;
  snapshot = next;
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* een luisteraar mag de andere niet breken */
    }
  }
}

/** Een schrijver zegt waar hij staat. Dezelfde `id` vervangt zijn vorige melding. */
export function reportSave(id: string, state: SaveReport, message?: string | null) {
  const before = reports.get(id);
  if (before && before.state === state && (before.message ?? null) === (message ?? null)) return;
  reports.set(id, { state, message: message ?? null });
  recompute();
}

/** Een schrijver is weg. */
export function clearSave(id: string) {
  if (!reports.delete(id)) return;
  recompute();
}

export function readSave(): Combined {
  return snapshot;
}

export function onSaveChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Test seam. */
export function _resetSaves() {
  reports.clear();
  listeners.clear();
  snapshot = { state: 'none', message: null, writers: 0 };
}

const SERVER: Combined = { state: 'none', message: null, writers: 0 };

/** De schil leest het register. */
export function useSaveStatus(): Combined {
  return useSyncExternalStore(onSaveChange, readSave, () => SERVER);
}

/**
 * `useReportSave(state, message)` — deze component is een schrijver zolang
 * `state` niet `null` is. `null` is "ik schrijf nu niet" (Lezen): dan staat er
 * voor hem niets, ook geen lege plek. Weg bij unmount.
 */
export function useReportSave(state: SaveReport | null, message?: string | null) {
  const id = useId();
  useEffect(() => {
    if (state === null) {
      clearSave(id);
      return;
    }
    reportSave(id, state, message);
  }, [id, state, message]);
  useEffect(() => () => clearSave(id), [id]);
}
