/**
 * Golf M (samen, herstel): wat deze hand zelf weghaalt, is niet "door iemand
 * anders weggehaald".
 *
 * Een landkaart en een tijdlijn halen een speld of gebeurtenis pas uit hun
 * eigen lijst als de `DELETE` terug is. Maar de live-lijn meldt ook de eigen
 * schrijf (`useLiveChanges` kent geen afzender), en de pull die daarop volgt
 * kan eerder binnen zijn dan het antwoord op de `DELETE` — of tussen twee
 * `DELETE`s van één veeg in vallen. Dan staat het ding nog in de lijst, niet
 * meer in het archief, en zei het vlak *"… is door iemand anders weggehaald"*
 * over wat je zelf net weghaalde.
 *
 * Dus: wat deze hand weghaalt, staat hier vóór de `fetch` (`begin`), en blijft
 * staan tot het antwoord er is plus `OWN_DELETE_GRACE_MS` (`settle`) — de tijd
 * die een pull nodig heeft om de render met de korte lijst in te halen. Een
 * `DELETE` die mislukt, laat meteen los (`drop`). Puur en zonder import.
 */

/** Zo lang na het antwoord telt een eigen weghaling nog als de eigen. */
export const OWN_DELETE_GRACE_MS = 3000;

export type OwnDeletes = {
  /** Vóór de `fetch`: deze ids gaat deze hand weghalen. */
  begin(ids: Iterable<string>): void;
  /** Het antwoord is er: nog `OWN_DELETE_GRACE_MS`, dan vergeten. */
  settle(ids: Iterable<string>): void;
  /** Het is niet gelukt: meteen vergeten. */
  drop(ids: Iterable<string>): void;
  /** Haalt deze hand dit ding nu weg, of deed ze dat net? */
  has(id: string): boolean;
};

export function createOwnDeletes(now: () => number = () => Date.now()): OwnDeletes {
  /** id → tot wanneer; `Infinity` zolang de `DELETE` onderweg is. */
  const until = new Map<string, number>();
  return {
    begin(ids) {
      for (const id of ids) until.set(id, Infinity);
    },
    settle(ids) {
      const at = now() + OWN_DELETE_GRACE_MS;
      for (const id of ids) if (until.has(id)) until.set(id, at);
    },
    drop(ids) {
      for (const id of ids) until.delete(id);
    },
    has(id) {
      const at = until.get(id);
      if (at === undefined) return false;
      if (at <= now()) {
        until.delete(id);
        return false;
      }
      return true;
    },
  };
}

/**
 * Wat een ander weghaalde: wat hier stond, niet meer in het archief staat,
 * ertoe doet (`watched`: gekozen, of zijn venster open) en niet door deze hand
 * zelf werd weggehaald.
 */
export function lostByOthers<T extends { id: string }>(
  local: readonly T[],
  there: ReadonlySet<string>,
  watched: (id: string) => boolean,
  own: Pick<OwnDeletes, 'has'>,
): T[] {
  return local.filter((item) => !there.has(item.id) && watched(item.id) && !own.has(item.id));
}
