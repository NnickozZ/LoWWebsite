/**
 * §107 (golf i3): Beheer voor de Keeper — de pure helften.
 *
 * Alles wat de soort-editor, Woorden en de index van Beheer uitrekenen zonder
 * database en zonder React, zodat het gelezen en getest kan worden. Client
 * components importeren dit bestand, dus het opent nooit de database.
 */
import type { FieldDef } from '@/lib/db/schema';
import { DEFAULT_WORDS, WORD_DEFS, fill, type Words } from '@/lib/words';

/* ------------------------------------------------------------ pictogrammen */

/**
 * De pictogrammen die een soort kan dragen, met hun Nederlandse naam voor een
 * schermlezer. Dezelfde vorm als `FIELD_KINDS`: een lijst met de naam ernaast,
 * geen woord dat de Keeper hernoemt.
 *
 * Golf i3 voegde er acht toe (berg, edelsteen, geest, rol, anker, sleutel,
 * kaars, vuurtoren): D17 zei dat soorten hun icoon delen omdat er te weinig
 * waren om uit te kiezen.
 */
export const SOORT_ICONEN: { name: string; label: string }[] = [
  { name: 'person', label: 'Persoon' },
  { name: 'badge', label: 'Penning' },
  { name: 'mask', label: 'Masker' },
  { name: 'pin', label: 'Speld' },
  { name: 'map', label: 'Landkaart' },
  { name: 'mountain', label: 'Berg' },
  { name: 'tower', label: 'Vuurtoren' },
  { name: 'anchor', label: 'Anker' },
  // Golf L: het water en het land eromheen.
  { name: 'wave', label: 'Golf' },
  { name: 'ship', label: 'Schip' },
  { name: 'fish', label: 'Vis' },
  { name: 'church', label: 'Kerk' },
  { name: 'bell', label: 'Bel' },
  { name: 'home', label: 'Huis' },
  { name: 'box', label: 'Doos' },
  { name: 'chest', label: 'Kist' },
  { name: 'gem', label: 'Edelsteen' },
  { name: 'key', label: 'Sleutel' },
  { name: 'magnifier', label: 'Vergrootglas' },
  { name: 'eye', label: 'Oog' },
  { name: 'ghost', label: 'Geest' },
  // Golf L: wat boven, in en onder het eiland woont.
  { name: 'star', label: 'Ster' },
  { name: 'moon', label: 'Maan' },
  { name: 'leaf', label: 'Loof' },
  { name: 'tentacle', label: 'Tentakel' },
  { name: 'rune', label: 'Rune' },
  { name: 'chalice', label: 'Kelk' },
  { name: 'bottle', label: 'Fles' },
  { name: 'skull', label: 'Schedel' },
  { name: 'candle', label: 'Kaars' },
  { name: 'flag', label: 'Vlag' },
  { name: 'shield', label: 'Schild' },
  { name: 'crown', label: 'Kroon' },
  { name: 'sword', label: 'Zwaard' },
  { name: 'lock', label: 'Slot' },
  { name: 'calendar', label: 'Kalender' },
  { name: 'clock', label: 'Klok' },
  { name: 'book', label: 'Boek' },
  { name: 'scroll', label: 'Rol' },
  { name: 'quill', label: 'Ganzenveer' },
  { name: 'speech', label: 'Spraak' },
  { name: 'notebook', label: 'Schrift' },
  { name: 'note', label: 'Notitie' },
  { name: 'file', label: 'Blad' },
  { name: 'folder', label: 'Map' },
  { name: 'board', label: 'Prikbord' },
  { name: 'tree', label: 'Stamboom' },
  { name: 'web', label: 'Web' },
];

export type SoortLite = { slug: string; label: string; icon?: string; colour?: string };

/**
 * D17: welke pictogrammen meer dan één soort draagt. Een rapport, geen
 * weigering — de Keeper mag twee soorten hetzelfde teken geven, het archief
 * zegt alleen dat het zo is. Gesorteerd op pictogram, soorten in hun eigen
 * volgorde.
 */
export function iconClashes(types: readonly SoortLite[]): { icon: string; labels: string[] }[] {
  const by = new Map<string, string[]>();
  for (const type of types) {
    if (!type.icon) continue;
    const list = by.get(type.icon) ?? [];
    list.push(type.label);
    by.set(type.icon, list);
  }
  return [...by.entries()]
    .filter(([, labels]) => labels.length > 1)
    .map(([icon, labels]) => ({ icon, labels }))
    .sort((a, b) => a.icon.localeCompare(b.icon));
}

/** De andere soorten die dit pictogram al dragen (voor de zachte waarschuwing). */
/** Review 4, L5: de velden met keuzes die nog geen keuze hebben. */
export function choicelessFields(fields: readonly FieldDef[]): string[] {
  return fields
    .filter((field) => (field.kind === 'select' || field.kind === 'multiselect') && field.label.trim())
    .filter((field) => !(field.options ?? []).some((option) => option.trim()))
    .map((field) => field.label.trim());
}

/**
 * Review 4, M11: kortere namen voor de soort van een veld, zodat *Koppeling
 * naar één artikel* niet afgekapt wordt in een kolom van 12 rem. De lange
 * namen (`FIELD_KINDS`) blijven overal elders; dit is alleen de keuzelijst in
 * de soort-editor, onder een groep *Koppeling naar*.
 */
export const FIELD_KIND_SHORT: Record<string, string> = {
  entry_link: 'Eén artikel',
  entry_links: 'Artikelen',
  user_link: 'Een speler',
  case_link: 'Eén dossier',
  case_links: 'Dossiers',
  family_tree_link: 'Een stamboom',
  map_pin: 'Speld op de landkaart',
};

export function othersWithIcon(types: readonly SoortLite[], slug: string, icon: string): string[] {
  return types.filter((type) => type.slug !== slug && type.icon === icon).map((type) => type.label);
}

/**
 * De kleuren waaruit een soort kiest: de achttien van de seed, gedempt en in
 * de archiefstijl. Een eigen kleur blijft kan (het vakje erachter).
 */
export const SOORT_KLEUREN = [
  '#7A4A2B',
  '#A8321E',
  '#6B2F3A',
  '#8A6A24',
  '#6B4226',
  '#4F5B31',
  '#2F6B4F',
  '#4F6B57',
  '#2E4F4A',
  '#3F6E72',
  '#31556B',
  '#1F4E79',
  '#3B2E5A',
  '#5B3A78',
  '#6E4B7A',
  '#6B5B4A',
  '#5C544A',
  '#4A4A4A',
];

/* --------------------------------------------------------- de soort-editor */

export type SoortStaat = {
  label: string;
  slug: string;
  icon: string;
  colour: string;
  border: string;
  prefixDefault: boolean;
  keeperMade: boolean;
  oneOfAKind: boolean;
  fields: FieldDef[];
  blocks: unknown;
  pageText: unknown;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * §107: hoeveel dingen er in de editor anders zijn dan bij de laatste opslag.
 * Eén per eigenschap van de soort, één per veld dat erbij kwam, wegging of
 * veranderde (een veld herkend aan zijn plaats én sleutel: omhoog schuiven is
 * twee), één voor de hele pagina en één voor de woorden van de soort. Dat is
 * het getal in de voet — geen diff, een telling die klopt met wat een mens
 * deed.
 */
export function countTypeChanges(before: SoortStaat, after: SoortStaat): number {
  let n = 0;
  for (const key of ['label', 'icon', 'colour', 'border', 'prefixDefault', 'keeperMade', 'oneOfAKind'] as const) {
    if (before[key] !== after[key]) n += 1;
  }
  if (before.slug.trim() !== after.slug.trim()) n += 1;
  const longest = Math.max(before.fields.length, after.fields.length);
  for (let i = 0; i < longest; i += 1) {
    if (!same(before.fields[i], after.fields[i])) n += 1;
  }
  if (!same(before.blocks, after.blocks)) n += 1;
  if (!same(before.pageText, after.pageText)) n += 1;
  return n;
}

/**
 * Een veld zonder naam laat `cleanFields` stil vallen. De voet zegt het
 * vóór het opslaan in plaats van dat het veld na het opslaan weg is.
 */
export function namelessFields(fields: readonly FieldDef[]): number {
  return fields.filter((field) => !field.label.trim()).length;
}

/** Wat een veld nog vraagt behalve zijn naam en soort: keuzes, doel-soorten of een rol. */
export function fieldHasMore(kind: string): boolean {
  return kind === 'select' || kind === 'multiselect' || kind === 'entry_link' || kind === 'entry_links';
}

/* ----------------------------------------------------------------- woorden */

/**
 * Welk gat in een zin welk woord van het archief draagt. Alleen de gaten die
 * overal hetzelfde betekenen; `{naam}` en `{n}` vult elke zin met iets eigens.
 */
export const HOLE_WORD: Record<string, string> = {
  artikel: 'entry',
  artikelen: 'entryPlural',
  dossier: 'case',
  dossiers: 'casePlural',
  prikbord: 'board',
  prikborden: 'boardPlural',
  notitie: 'note',
  punaise: 'pin',
  draad: 'string',
  sectie: 'section',
  keeper: 'keeper',
  keeperkant: 'keeperSide',
  karakter: 'character',
  karakters: 'characterPlural',
  landkaart: 'map',
  kamer: 'room',
};

/** Voorbeelden voor de gaten die per zin iets anders zijn. */
const SAMPLE: Record<string, string> = {
  naam: 'Bram',
  n: '3',
  ding: 'de koperen lamp',
  plek: 'plank',
  bedrag: '12 munten',
  munten: 'munten',
  zoek: 'zoeken',
  reden: 'voor het verslag',
  soort: 'Personen',
  versie: 'de vorige versie',
  prijs: '5 munten',
  wanneer: 'gisteren',
};

/** De gaten `{x}` in een sjabloon, in volgorde en zonder dubbelen. */
export function holesOf(template: string): string[] {
  return [...new Set([...template.matchAll(/\{([a-zA-Zé]+)\}/g)].map((match) => match[1]))];
}

/**
 * §84: een gat weghalen mag. §107: het archief zegt het wel, zacht, want dan
 * staat er daarna geen naam of getal meer in de zin.
 */
export function droppedHoles(fallback: string, value: string): string[] {
  if (!value.trim()) return [];
  const kept = new Set(holesOf(value));
  return holesOf(fallback).filter((hole) => !kept.has(hole));
}

/** Een zin zoals hij op het scherm komt: gaten gevuld met de woorden van nu, of met een voorbeeld. */
export function renderSample(template: string, words: Words): string {
  const vars: Record<string, string> = { ...SAMPLE };
  for (const [hole, key] of Object.entries(HOLE_WORD)) vars[hole] = words[key] ?? DEFAULT_WORDS[key] ?? hole;
  return fill(template, vars);
}

export type WordContext = {
  /** De zin zelf, met voorbeelden ingevuld (voor een zin). */
  preview: string | null;
  /** Andere zinnen waarin dit woord staat, zo ingevuld (voor een zelfstandig naamwoord). */
  elsewhere: string[];
  /** Hoeveel zinnen het woord in totaal draagt. */
  total: number;
};

/**
 * §107: *waar het staat.* Voor een zin: de zin zelf, zoals een speler hem leest.
 * Voor een woord dat in andere zinnen een gat vult: een paar van die zinnen,
 * met het nieuwe woord erin. `values` zijn de vakjes zoals ze nu staan.
 */
export function wordContext(key: string, values: Words, max = 2): WordContext {
  const words: Words = { ...DEFAULT_WORDS };
  for (const [k, v] of Object.entries(values)) if (v.trim()) words[k] = v.trim();
  const own = words[key] ?? '';
  const holes = Object.entries(HOLE_WORD)
    .filter(([, wordKey]) => wordKey === key)
    .map(([hole]) => hole);
  const users = holes.length
    ? WORD_DEFS.filter((def) => def.key !== key && holes.some((hole) => (words[def.key] ?? def.fallback).includes(`{${hole}}`)))
    : [];
  return {
    preview: holesOf(own).length || own.includes(' ') ? renderSample(own, words) : null,
    elsewhere: users.slice(0, max).map((def) => renderSample(words[def.key] ?? def.fallback, words)),
    total: users.length,
  };
}

/**
 * Review 4, L2: geen §-nummers in wat de Keeper leest.
 *
 * Een paar notities en hints in `lib/words.ts` dragen de regel waar ze vandaan
 * komen, en soms de geschiedenis van het woord ("§85: heette …"). Voor de
 * code is dat nuttig, voor de Keeper is het ruis. Bij het tonen gaat eraf:
 * een verwijzing tussen haakjes of na "zie", het voorvoegsel "§nn:" (en een
 * zin die daarna alleen vertelt hoe het woord vroeger heette), en elk los
 * nummer dat overblijft. De bron in `lib/words.ts` blijft zoals hij is.
 */
const HISTORIE = /\b(heette|stond hier|las tot|las als|zei ["“]|tot ronde)\b/i;
const cap = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

export function zonderParagraaf(text: string): string {
  let out = text
    .replace(/\s*\((?:zie\s+)?§[^)]*\)/g, '')
    .replace(/\s*[—–-]\s*zie\s+§\d+/g, '');
  const parts = out.split(/(?=§\d+[^:.]{0,24}:)/);
  out = parts
    .map((part) => {
      const match = /^§\d+[^:.]{0,24}:\s*/.exec(part);
      if (!match) return part;
      const body = part.slice(match[0].length);
      return HISTORIE.test(body) ? '' : cap(body);
    })
    .join('');
  out = out.replace(/Sinds §\d+\s+(\S)/g, (_, first: string) => first.toUpperCase());
  out = out.replace(/\s*§\d+/g, '');
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').trim();
}

/* ------------------------------------------------------------------- index */

/** Waar de index van Beheer op de telefoon elk onderdeel mee uitlegt. */
export const ADMIN_WHAT_KEY: Record<string, string> = {
  users: 'beheerWatUsers',
  review: 'beheerWatReview',
  trash: 'beheerWatTrash',
  types: 'beheerWatTypes',
  words: 'beheerWatWords',
  colours: 'beheerWatColours',
  history: 'beheerWatHistory',
  site: 'beheerWatSite',
  export: 'beheerWatExport',
  audit: 'beheerWatAudit',
};

/* -------------------------------------------------------------- wachtwoord */

/** Geen letters die op elkaar lijken (l/1, O/0), want de Keeper leest het voor. */
const ALFABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * §107: een wachtwoord dat de Keeper kan voorlezen: drie blokjes van vier,
 * met streepjes. `random` is te vervangen in een test.
 */
export function makePassword(random: (n: number) => number = defaultRandom): string {
  const block = () => Array.from({ length: 4 }, () => ALFABET[random(ALFABET.length)]).join('');
  return `${block()}-${block()}-${block()}`;
}

function defaultRandom(n: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] % n;
}

/**
 * §107, aangevuld in golf J: welke panelen van Beheer gemount blijven — het
 * gekozen, en elk onderdeel waar nog iets niet is opgeslagen (verborgen), zodat
 * een wissel van onderdeel niets stil weggooit. In de volgorde van de index.
 */
export function mountedPanes(keys: readonly string[], current: string | undefined, open: ReadonlySet<string>): string[] {
  return keys.filter((key) => key === current || open.has(key));
}

/** Idem: de panelen met iets niet-bewaards, uit wat de formulieren melden (paneel → bron → aantal). */
export function openPanes(reports: ReadonlyMap<string, ReadonlyMap<string, number>>): Set<string> {
  const open = new Set<string>();
  for (const [paneel, bronnen] of reports) {
    for (const n of bronnen.values()) {
      if (n > 0) {
        open.add(paneel);
        break;
      }
    }
  }
  return open;
}
