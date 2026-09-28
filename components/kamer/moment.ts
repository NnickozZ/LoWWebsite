/**
 * §103 (K2/K5): wat deze hand net deed, zodat de kamer het één keer kan laten
 * zien — en daarna nooit meer.
 *
 * Het neerzetten van een ding speelt **precies één keer per plaatsing**: niet
 * bij een refresh, niet bij herladen, en niet als een ander iets verandert en
 * de pagina live bijwerkt. Een render weet dat niet uit zichzelf; een tegel die
 * vol is, is vol. Daarom laat de handeling zelf een briefje achter
 * (`markLanding`): de koopknop, *Neerzetten*, *Hierheen*. De tegel die als
 * eerste verschijnt met díé plek en díé ding, neemt het briefje mee
 * (`takeLanding`) en speelt. Een tweede render vindt geen briefje meer; een
 * herladen ook niet.
 *
 * Zo werkt het ook als je in de winkel koopt en pas later naar de kamer gaat:
 * het briefje staat in `sessionStorage` van dit tabblad, en de kamer vindt het
 * als je hem opent (binnen een kwartier; daarna is het geen "net" meer). Een
 * ander die iets in jouw kamer zet, schrijft in zíjn tabblad — bij jou landt
 * het stil, zoals elke live-update (K4 heeft zijn eigen melding voor munten).
 *
 * `sessionStorage` en geen state: de winkel en de kamer zijn twee pagina's, en
 * een briefje moet een navigatie overleven. Elke lees- en schrijfactie in een
 * `try` — in een privévenster kan de opslag gooien, en dan landt er niets, wat
 * precies is wat er zonder dit bestand gebeurde.
 *
 * De opslag is een argument, zodat de unit-test hem kan vervangen.
 */

export type LandingMark = {
  slotId: string;
  /** Welk ding er moet landen, of null als elk ding op die plek telt (verplaatsen). */
  entryId: string | null;
  /** K5: de eerste koop ooit in deze kamer — dan komt er *Ingericht* bij. */
  first: boolean;
  /** Wanneer, in ms. Een briefje van meer dan `MARK_TTL_MS` geleden telt niet. */
  at: number;
};

export type UnlockMark = { slotId: string; at: number };

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export const LANDING_KEY = 'low:neerzetten';
export const UNLOCK_KEY = 'low:ontsloten';
/** Een kwartier: wie in de winkel koopt en daarna nog even rondkijkt, ziet het nog landen. */
export const MARK_TTL_MS = 15 * 60 * 1000;

function session(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function read<T extends { at: number }>(store: Store | null, key: string, now: number): T[] {
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(key) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (mark): mark is T =>
        Boolean(mark) && typeof mark.slotId === 'string' && typeof mark.at === 'number' && now - mark.at < MARK_TTL_MS,
    );
  } catch {
    return [];
  }
}

function write(store: Store | null, key: string, marks: unknown[]) {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(marks));
  } catch {
    /* vol of verboden: dan landt het stil */
  }
}

/** Een briefje achterlaten: op déze plek landt dít ding, zo meteen. */
export function markLanding(
  mark: Omit<LandingMark, 'at'>,
  { store = session(), now = Date.now() }: { store?: Store | null; now?: number } = {},
) {
  // Eén briefje per plek: een nieuwere handeling op dezelfde plek vervangt de oude.
  const rest = read<LandingMark>(store, LANDING_KEY, now).filter((old) => old.slotId !== mark.slotId);
  write(store, LANDING_KEY, [...rest, { ...mark, at: now }]);
}

/**
 * Het briefje voor deze tegel meenemen, als het er is. Daarna is het weg: een
 * tweede render, een refresh of een herladen vindt niets meer.
 */
export function takeLanding(
  slotId: string,
  entryId: string,
  { store = session(), now = Date.now() }: { store?: Store | null; now?: number } = {},
): LandingMark | null {
  const marks = read<LandingMark>(store, LANDING_KEY, now);
  const found = marks.find((mark) => mark.slotId === slotId && (mark.entryId === null || mark.entryId === entryId));
  if (!found) return null;
  write(
    store,
    LANDING_KEY,
    marks.filter((mark) => mark !== found),
  );
  return found;
}

/** K5: een plek die deze hand net opende. */
export function markUnlock(
  slotId: string,
  { store = session(), now = Date.now() }: { store?: Store | null; now?: number } = {},
) {
  const rest = read<UnlockMark>(store, UNLOCK_KEY, now).filter((old) => old.slotId !== slotId);
  write(store, UNLOCK_KEY, [...rest, { slotId, at: now }]);
}

export function takeUnlock(
  slotId: string,
  { store = session(), now = Date.now() }: { store?: Store | null; now?: number } = {},
): boolean {
  const marks = read<UnlockMark>(store, UNLOCK_KEY, now);
  const found = marks.find((mark) => mark.slotId === slotId);
  if (!found) return false;
  write(
    store,
    UNLOCK_KEY,
    marks.filter((mark) => mark !== found),
  );
  return true;
}

/**
 * Een bewegingstoken van `:root` in milliseconden (§102: beweging alleen via
 * tokens, ook in een script). `--dur-5` is "400ms"; wat niet te lezen valt, is
 * de terugval.
 */
export function tokenMs(name: string, fallback: number): number {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const value = raw.endsWith('ms') ? Number.parseFloat(raw) : raw.endsWith('s') ? Number.parseFloat(raw) * 1000 : NaN;
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** Wie beweging uitzette, krijgt het getal meteen en de ring zonder beweging (§102 regel 8). */
export function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * K3: het getal tussen twee serverwaarden, op tijdstip `progress` (0–1) van de
 * rol. Een zachte uitloop (`1 - (1 - p)³`), afgerond op hele munten: het scherm
 * toont nooit een getal dat niet tussen de oude en de nieuwe waarde ligt, en
 * rekent zelf niets uit (§79) — het beweegt alleen van het ene antwoord van de
 * server naar het volgende.
 */
export function rollValue(from: number, to: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  const eased = 1 - (1 - p) ** 3;
  return Math.round(from + (to - from) * eased);
}

/** K3: de chip naast het getal — `+12` of `−2` (een echt minteken, geen streepje). */
export function deltaChip(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

/**
 * §103 herstel (#6): hoe lang de koopknop *Gekocht* laat staan voordat de rij
 * wisselt. De review mat ±150 ms tussen de stempel en de nieuwe rij — te kort
 * om hem te zien. Nu: eerst moet de stempel geland zijn (`landMs`, de
 * `--dur-4` van `kamer-koop-stempel`; 0 onder reduced motion), en daarna blijft
 * hij nog `seeMs` (`--dur-5`) liggen. Wat de server al antwoordde, wacht zo
 * lang; een trage server wacht niet nóg eens de hele landing.
 *
 * Alleen de *tekening* wacht: het antwoord van de server is er al, de melding
 * staat er al, en de nieuwe rij komt met `router.refresh()` — de waarheid
 * blijft van de server (§79).
 */
export function holdBeforeRefresh(clickedAt: number, now: number, landMs: number, seeMs: number): number {
  return Math.max(0, clickedAt + landMs - now) + seeMs;
}
