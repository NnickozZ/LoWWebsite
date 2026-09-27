/**
 * §100: *Onlangs* — wat je laatst opende, per kijker, in deze browser.
 *
 * Geen servertabel: het is een gemak van één browser, zoals een onthouden
 * tabblad (README, "Browser storage"). Er staan alleen **adressen** in —
 * `/e/<slug>`, `/c/<slug>`, `/b/<id>` … — nooit een naam, zodat er in de
 * browser niets blijft staan wat de lezer morgen niet meer mag zien. De namen
 * komen bij het tonen van de server (`resolveRecent`), met de ogen van wie dan
 * kijkt. Puur en zonder DOM, zodat het in een test te lezen is; de twee
 * functies die `localStorage` aanraken vangen alles af.
 */

export const RECENT_MAX = 8;

/**
 * De adressen die een *ding* zijn, en dus iets om naar terug te gaan. Een
 * lijst, Start of Beheer is geen ding: daar staat al een deur naar in de
 * zijbalk.
 */
const THING = /^\/(e|c|b|maps|timelines|stambomen|spelers)\/([^/?#]+)$|^\/wiki\/overzicht\/([^/?#]+)$/;

/** Het adres zoals *Onlangs* het bewaart, of null als dit geen ding is. */
export function recentPath(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > 300) return null;
  let path = raw.split(/[?#]/)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return THING.test(path) ? path : null;
}

/** Het nieuwe bovenaan, geen dubbelen, hooguit `RECENT_MAX`. */
export function pushRecent(list: readonly string[], raw: string): string[] {
  const path = recentPath(raw);
  if (!path) return [...list];
  return [path, ...list.filter((p) => p !== path)].slice(0, RECENT_MAX);
}

function storageKey(userId: string) {
  return `low.onlangs.${userId}`;
}

export function readRecent(userId: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => (typeof p === 'string' ? recentPath(p) : null))
      .filter((p): p is string => Boolean(p))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function rememberRecent(userId: string, path: string) {
  try {
    const next = pushRecent(readRecent(userId), path);
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    /* een privévenster, een volle opslag: dan is er geen Onlangs, en verder niets */
  }
}
