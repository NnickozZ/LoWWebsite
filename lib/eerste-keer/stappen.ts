/**
 * §106 (golf i2): de pure helft van *de eerste keer*. Geen database, geen
 * browser: de pagina's en de cliënt lezen dit, en de unit-test ook
 * (`tests/unit/golf-i2-eerste-keer.test.ts`).
 */

/** Wat een leeg archief al heeft, voor de route van de Keeper op Start. */
export type ArchiveFirsts = {
  /** Artikelen, beide kanten, zonder de prullenbak. */
  entries: number;
  /** Dossiers, beide kanten, zonder de prullenbak. */
  cases: number;
  /** Accounts die geen Keeper zijn. */
  players: number;
};

export type RouteStep = { key: 'entry' | 'case' | 'invite'; done: boolean };

/**
 * De drie stappen van een verse Keeper, in vaste volgorde: het eerste artikel,
 * een dossier, en spelers uitnodigen. Een stap is gedaan als het archief het
 * heeft — niet als iemand op een knop drukte — dus een Keeper die via Beheer of
 * een backup begon, ziet alleen wat er nog ontbreekt.
 */
export function routeSteps(firsts: ArchiveFirsts): RouteStep[] {
  return [
    { key: 'entry', done: firsts.entries > 0 },
    { key: 'case', done: firsts.cases > 0 },
    { key: 'invite', done: firsts.players > 0 },
  ];
}

/** De route staat er zolang er één stap open is, en daarna nooit meer. */
export function showsRoute(firsts: ArchiveFirsts): boolean {
  return routeSteps(firsts).some((step) => !step.done);
}

/**
 * Een uitnodigingscode zoals een mens hem typt of plakt: met spaties, een
 * streepje op een andere plek, een regeleinde uit een bericht, kleine letters.
 * Wat overblijft zijn de letters en cijfers, in hoofdletters.
 *
 * Het alfabet van de code (`CODE_ALPHABET` in `lib/db/seed.mjs`) heeft geen O/0
 * en geen I/1, dus die zetten we níét om: een O die iemand typt, is een fout,
 * en de server zegt dan netjes "klopt niet" in plaats van te raden.
 */
export function normaliseInvite(raw: string): string {
  return raw.replace(/[^0-9a-z]/gi, '').toUpperCase();
}

/**
 * Hoe het vak de code toont terwijl je typt: vijf, een streepje, vijf — zoals
 * `makeInviteCode` hem maakt. Langer dan tien tekens laten we staan zoals het
 * is (dan klopt hij toch niet, en het vak moet niet stil tekens weggooien).
 */
export function formatInvite(raw: string): string {
  const clean = normaliseInvite(raw);
  if (clean.length <= 5 || clean.length > 10) return clean;
  return `${clean.slice(0, 5)}-${clean.slice(5)}`;
}

/**
 * Het adres dat een Keeper naar de tafel stuurt. De code in de vorm waarin hij
 * hem ook ziet (vijf, streepje, vijf): een mens leest dat adres ook.
 */
export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/signup?code=${encodeURIComponent(formatInvite(code))}`;
}

/**
 * §106: de regel bij een eerste bezoek. Eén sleutel per plek in
 * `localStorage`, per browser. De sleutels staan hier, zodat een test ze kent.
 */
export const FIRST_VISIT_PLACES = ['kamer', 'winkel', 'wiki'] as const;
export type FirstVisitPlace = (typeof FIRST_VISIT_PLACES)[number];
export const firstVisitKey = (place: FirstVisitPlace) => `lw:eerste-bezoek:${place}`;

/**
 * §106: het koekje dat de server vertelt welke plekken deze browser al zag.
 *
 * De waarheid staat in `localStorage` (per browser, zoals de opdracht zegt);
 * dit koekje is alleen de spiegel ervan voor de server. Zonder spiegel komt de
 * regel pas na de hydratatie, en dan schuift de pagina er een regel onder weg
 * — net op het moment dat iemand op een tegel in de kamer tikt. Met spiegel
 * staat hij er bij een eerste bezoek meteen, en daarna nooit meer.
 */
export const FIRST_VISIT_COOKIE = 'lw-eerste-bezoek';

export function seenPlaces(raw: string | undefined | null): Set<FirstVisitPlace> {
  const seen = new Set<FirstVisitPlace>();
  for (const part of (raw ?? '').split('.')) {
    if ((FIRST_VISIT_PLACES as readonly string[]).includes(part)) seen.add(part as FirstVisitPlace);
  }
  return seen;
}

export function withSeen(raw: string | undefined | null, place: FirstVisitPlace): string {
  const seen = seenPlaces(raw);
  seen.add(place);
  return FIRST_VISIT_PLACES.filter((one) => seen.has(one)).join('.');
}

/**
 * §106 (na review 4, M9): de regel van een eerste bezoek is voor een nieuw
 * account, niet voor een nieuw toestel. Kees speelt al maanden; in een verse
 * browser kreeg hij *Dit is je kamer…* alsof hij net binnenkwam. Een account
 * is nieuw zolang het jonger is dan twee weken — lang genoeg voor de eerste
 * paar avonden aan tafel, kort genoeg dat niemand die al speelt het bij de
 * uitrol drie keer per toestel ziet. `createdAt` in seconden, zoals de tabel.
 */
export const FIRST_VISIT_DAYS = 14;

export function isNewAccount(createdAtSeconds: number | null | undefined, nowMs = Date.now()): boolean {
  if (!createdAtSeconds) return false;
  return nowMs - createdAtSeconds * 1000 < FIRST_VISIT_DAYS * 24 * 60 * 60 * 1000;
}
