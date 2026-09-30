/**
 * Golf M (A3/A4): *de plek op de plek* — waar iemand staat, preciezer dan de
 * pagina. Op een tekenvlak de camera (waar hij kijkt, hoe ver ingezoomd), op
 * een artikel of dossier de sectie die hij leest.
 *
 * Puur en zonder import, net als `rosterWire.ts`: de browser maakt een plek,
 * de server keurt hem en hangt hem aan een deur, en de browser aan de andere
 * kant leest hem weer uit het adres. Eén bestand, zodat die drie dezelfde
 * zin spreken.
 *
 * Twee vormen, en verder niets:
 *
 *   c.{soort}.{id}.{camera}   een tekenvlak. `soort` is een van de vier
 *                             (`board`, `map`, `timeline`, `family_tree`),
 *                             `id` het vlak zelf, `camera` de JSON van
 *                             `writeCamera` in base64url — alleen getallen.
 *   s.{sectie-id}             een sectie van een artikel, dossier of
 *                             overzicht.
 *
 * **Een plek zegt niets.** Een camera is een handvol getallen; een sectie-id
 * is een opaak id. De server hangt een plek alleen aan een rij (`rosterFor`)
 * of een uitnodiging (`nudge`) als de kijker die plek mag zien — een camera
 * alleen als het vlak de plaats zelf is (`spotFitsPlace`), een sectie alleen
 * als de kijker die sectie mag lezen. Wat daar niet door komt, is er niet:
 * geen plek, niet een lege.
 */

export type SpotCanvas = 'board' | 'map' | 'timeline' | 'family_tree';

/** De parameter in het adres die een plek draagt. */
export const SPOT_PARAM = 'waar';

/**
 * Hoe lang de hand stil moet liggen voor een plek de lijn op gaat. Pannen is
 * zestig camera's per seconde; niemand heeft er één daarvan nodig, alleen de
 * laatste.
 */
export const SPOT_SETTLE_MS = 700;

/** Een plek is kort. Een langere is geen camera maar een verzonnen verhaal. */
export const SPOT_MAX = 400;

const CANVASES: readonly SpotCanvas[] = ['board', 'map', 'timeline', 'family_tree'];
const SPOT_RE =
  /^(?:c\.(board|map|timeline|family_tree)\.([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{1,380})|s\.([A-Za-z0-9_-]{1,64}))$/;

export type ParsedSpot =
  | { kind: 'camera'; canvas: SpotCanvas; id: string; view: unknown }
  | { kind: 'section'; id: string };

/** Getallen op tien cijfers: kort genoeg voor een adres, precies genoeg voor een tijdlijn in seconden. */
function roundDeep(value: unknown, depth = 0): unknown {
  if (depth > 3) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toPrecision(10)) : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 8).map((one) => roundDeep(one, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, one] of Object.entries(value as Record<string, unknown>).slice(0, 12)) {
      if (!/^[A-Za-z0-9_]{1,24}$/.test(key)) continue;
      const rounded = roundDeep(one, depth + 1);
      if (rounded !== undefined) out[key] = rounded;
    }
    return out;
  }
  // Geen tekst in een camera: dan kan er ook geen naam in staan.
  return undefined;
}

function toBase64Url(text: string): string {
  const b64 = typeof btoa === 'function' ? btoa(text) : Buffer.from(text, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string | null {
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
  } catch {
    return null;
  }
}

/** De plek van een camera op een tekenvlak, of `null` als hij niet te zeggen is. */
export function cameraSpot(canvas: SpotCanvas, id: string, view: unknown): string | null {
  if (!CANVASES.includes(canvas) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const rounded = roundDeep(view);
  if (!rounded || typeof rounded !== 'object') return null;
  const spot = `c.${canvas}.${id}.${toBase64Url(JSON.stringify(rounded))}`;
  return isWellFormedSpot(spot) ? spot : null;
}

/** De plek van een sectie. */
export function sectionSpot(sectionId: string): string | null {
  const spot = `s.${sectionId}`;
  return isWellFormedSpot(spot) ? spot : null;
}

export function isWellFormedSpot(value: unknown): value is string {
  return typeof value === 'string' && value.length <= SPOT_MAX && SPOT_RE.test(value);
}

export function parseSpot(value: unknown): ParsedSpot | null {
  if (!isWellFormedSpot(value)) return null;
  const match = SPOT_RE.exec(value)!;
  if (match[4]) return { kind: 'section', id: match[4] };
  const json = fromBase64Url(match[3]);
  if (!json) return null;
  try {
    const view: unknown = JSON.parse(json);
    if (!view || typeof view !== 'object') return null;
    return { kind: 'camera', canvas: match[1] as SpotCanvas, id: match[2], view };
  } catch {
    return null;
  }
}

/**
 * Hoort deze plek bij deze plaats? Een camera alleen bij het vlak zelf
 * (`board:{id}` voor `c.board.{id}…`): een tijdlijn in een dossier zou anders
 * haar id meegeven aan wie alleen het dossier mag zien. Een sectie hoort bij
 * elke plaats die secties heeft; of de kijker hem mag lezen, vraagt de server
 * apart.
 */
export function spotFitsPlace(place: string | null, spot: unknown): boolean {
  if (!place) return false;
  const parsed = parseSpot(spot);
  if (!parsed) return false;
  if (parsed.kind === 'camera') return place === `${parsed.canvas}:${parsed.id}`;
  return /^(entry|case|overzicht):/.test(place);
}

/** Het adres met deze plek erin (of eruit, bij `null`). Laat al het andere staan. */
export function withSpot(href: string, spot: string | null): string {
  const url = new URL(href, 'http://x');
  if (spot) url.searchParams.set(SPOT_PARAM, spot);
  else url.searchParams.delete(SPOT_PARAM);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
}

/** De plek die een adres draagt, of `null`. */
export function spotOfHref(href: string): string | null {
  try {
    const value = new URL(href, 'http://x').searchParams.get(SPOT_PARAM);
    return isWellFormedSpot(value) ? value : null;
  } catch {
    return null;
  }
}
