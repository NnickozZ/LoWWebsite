import type { ListParams } from '@/lib/listParams';

/**
 * §104 (ronde 67·herstel, #14): hoe ver je in een lijst van de wiki leest.
 *
 * `/wiki/alles` toonde de eerste 120 en zei "120 artikelen", terwijl de tab
 * erboven "Alles 209" zei — de rest was er niet en niets zei dat hij er was.
 * Nu zegt de lijst "120 van 209 artikelen" en staat er *Meer* onder. Hoe ver je
 * bent, staat in het adres (§12: sorteren en filteren zijn de URL, en dit is
 * dezelfde soort keuze): `?pagina=2` toont de eerste 240, zodat Terug en een
 * gedeelde link op dezelfde plek uitkomen. Geen bladzijden die elkaar
 * vervangen: *Meer* legt de volgende eronder, en je leest door.
 *
 * `?per=` zet de maat van één stap (10–120); dat is voor een test die niet
 * 121 artikelen wil maken, en het doet verder niemand kwaad.
 */

/** Zoveel per stap, tenzij `?per=` anders zegt. */
export const PAGE_SIZE = 120;
const PER_MIN = 10;
/** Hooguit zoveel stappen: een adres met `?pagina=100000` vraagt geen miljoen rijen. */
const PAGINA_MAX = 50;

const one = (params: ListParams, key: string): string | undefined => {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] : raw;
};

const whole = (value: string | undefined): number | null => {
  if (!value || !/^\d{1,6}$/.test(value)) return null;
  return Number(value);
};

export type Pagina = { per: number; pagina: number; shown: number };

/** Wat het adres vraagt: de maat van een stap, de hoeveelste, en hoeveel er dus staan. */
export function readPagina(params: ListParams, size = PAGE_SIZE): Pagina {
  const per = Math.min(size, Math.max(PER_MIN, whole(one(params, 'per')) ?? size));
  const pagina = Math.min(PAGINA_MAX, Math.max(1, whole(one(params, 'pagina')) ?? 1));
  return { per, pagina, shown: per * pagina };
}

/** Het adres van *Meer*: alles wat er stond, en één stap verder. */
export function moreHref(path: string, params: ListParams, current: Pagina): string {
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (key === 'pagina') continue;
    for (const value of Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]) next.append(key, value);
  }
  next.set('pagina', String(current.pagina + 1));
  return `${path}?${next.toString()}`;
}

/** Of er na deze stap nog iets komt, en hoeveel. */
export function remaining(total: number, current: Pagina): number {
  return current.pagina >= PAGINA_MAX ? 0 : Math.max(0, total - current.shown);
}
