/**
 * Golf M (samen): wat de hand van een ander vasthoudt, en hoe lang nog.
 *
 * Op alle vier de tekenvlakken (prikbord, landkaart, tijdlijn, stamboom) reist
 * een sleep mee op de site-lijn: elk frame van een hand zegt in `m` welke
 * dingen die hand nu draagt en waar (`{ id: [x, y] }`, §60). Tot golf M was
 * dat alleen *zicht*: een ander zag het kaartje reizen, en kon het intussen
 * gewoon zelf oppakken — twee handen aan één kaartje, en wie het laatst
 * losliet, won zonder dat iemand dat zag.
 *
 * Dit bestand is de afspraak die daarbovenop ligt, en hij is **beleefd, niet
 * streng**: een *zacht slot*. Wat in iemands `m` staat, is van die hand
 * zolang die hand het draagt. Een ander kan het niet oppakken (de tekening
 * zegt wie het heeft), maar wel openen en lezen. De server weet van niets:
 * er staat geen slot in een tabel, en een tab die het slot negeert, schrijft
 * gewoon zoals altijd — de merge (§8, §61) blijft de scheidsrechter.
 *
 * Drie klokken:
 *
 *  - `HAND_STALE_MS`: een hand zonder frame zo lang laat los. De afzender
 *    herhaalt zijn frame elke `CARRY_KEEPALIVE_MS` zolang hij iets draagt, dus
 *    een hand die stil ligt maar vasthoudt, houdt vast; een tab die bevroor of
 *    wegviel, niet.
 *  - `SETTLE_MS`: wat een hand losliet, blijft op het andere scherm staan waar
 *    die hand het neerzette tot de opslag binnen is (anders springt het terug
 *    en een ronde later weer vooruit, §8) — maar nooit langer dan dit. Een
 *    sleep die met Escape werd afgebroken, slaat niets op.
 *
 * Puur en zonder import: dezelfde regels in de browser en in een test.
 */

/** Een hand die zo lang niets zei, heeft losgelaten. */
export const HAND_STALE_MS = 3000;
/** Zo vaak herhaalt een hand die iets draagt zijn frame, ook als hij stil ligt. */
export const CARRY_KEEPALIVE_MS = 1000;
/** Wat losgelaten is, wacht hooguit zo lang op de opslag die het neerzet. */
export const SETTLE_MS = 4000;

/** Een hand zoals de site-lijn hem geeft (`LivePointer`), zover het hier telt. */
export type HandLike = {
  clientId: string;
  name: string;
  colour: string;
  m: Readonly<Record<string, readonly [number, number]>>;
};

/** Wie iets vasthoudt: genoeg om een ring en een naamstrookje te tekenen. */
export type Lock = { clientId: string; name: string; colour: string };

/**
 * Wie wint als twee handen hetzelfde ding in dezelfde tel oppakken.
 *
 * Beide kanten moeten hetzelfde antwoord krijgen zonder elkaar te spreken, en
 * de klokken van twee machines zijn het nooit eens — dus geen tijd maar het
 * client-id: de kleinste wint. Willekeurig, maar op elk scherm dezelfde
 * willekeur, en dat is wat telt.
 */
export function winsTie(a: string, b: string): boolean {
  return a < b;
}

/**
 * Van de handen naar "id → wie het nu draagt". Alleen wat in een `m` staat —
 * iets *gekozen* hebben is een ring, geen slot. De eigen tab telt niet mee.
 * Dragen twee handen hetzelfde, dan houdt de winnaar van `winsTie` het.
 */
export function heldLocks(hands: readonly HandLike[], self?: string | null): Map<string, Lock> {
  const locks = new Map<string, Lock>();
  for (const hand of hands) {
    if (self && hand.clientId === self) continue;
    for (const id of Object.keys(hand.m)) {
      const before = locks.get(id);
      if (before && !winsTie(hand.clientId, before.clientId)) continue;
      locks.set(id, { clientId: hand.clientId, name: hand.name, colour: hand.colour });
    }
  }
  return locks;
}

/**
 * Moet deze hand haar sleep opgeven? Ja, als een ander iets draagt wat deze
 * hand ook draagt, en die ander de gelijkspel-regel wint. Geeft het eerste
 * zo'n ding terug (met wie het heeft), of null.
 */
export function conflictFor(
  mine: Iterable<string>,
  hands: readonly HandLike[],
  self: string,
): { id: string; lock: Lock } | null {
  const carrying = new Set(mine);
  if (!carrying.size) return null;
  for (const hand of hands) {
    if (hand.clientId === self || !winsTie(hand.clientId, self)) continue;
    for (const id of Object.keys(hand.m)) {
      if (carrying.has(id)) return { id, lock: { clientId: hand.clientId, name: hand.name, colour: hand.colour } };
    }
  }
  return null;
}

/* ------------------------------------------------------------- de draag */

/**
 * Iets dat een ander draagt, of net neerzette.
 *
 * `released` is wanneer de hand het losliet (null: nog in de hand), en `doc`
 * waar het document het op dat moment had — zodra het document iets anders
 * zegt, is de opslag van de neerzetting binnen en mag de tekening terug naar
 * het document.
 */
export type Carry = {
  x: number;
  y: number;
  by: string;
  name: string;
  colour: string;
  released: number | null;
  doc: string | null;
};

/** Waar het document iets heeft, als sleutel; null als het er niet (meer) is. */
export type DocAt = (id: string) => readonly [number, number] | null;

const keyOf = (at: readonly [number, number] | null): string | null => (at ? `${at[0]},${at[1]}` : null);

/**
 * De frames erin. Wat een hand draagt, staat waar die hand het heeft; wat
 * uit haar `m` verdween (of wiens hand helemaal wegviel), is *losgelaten* en
 * blijft staan waar het was, tot `settleCarry` het opruimt. Geeft dezelfde
 * `Map` terug als er niets veranderde, zodat React niets hoeft te doen.
 */
export function takeHands(
  prev: ReadonlyMap<string, Carry>,
  hands: readonly HandLike[],
  options: { self?: string | null; now: number; docAt: DocAt },
): ReadonlyMap<string, Carry> {
  const { self, now, docAt } = options;
  let next: Map<string, Carry> | null = null;
  const edit = () => (next ??= new Map(prev));
  const byHand = new Map<string, HandLike>();
  for (const hand of hands) if (!self || hand.clientId !== self) byHand.set(hand.clientId, hand);

  for (const [id, item] of prev) {
    if (item.released !== null) continue;
    const hand = byHand.get(item.by);
    if (hand && hand.m[id]) continue;
    edit().set(id, { ...item, released: now, doc: keyOf(docAt(id)) });
  }
  for (const hand of byHand.values()) {
    for (const [id, at] of Object.entries(hand.m)) {
      const before = (next ?? prev).get(id);
      // Twee handen aan één ding: de winnaar tekent (zie `heldLocks`).
      if (before && before.released === null && before.by !== hand.clientId && !winsTie(hand.clientId, before.by)) continue;
      if (
        before &&
        before.released === null &&
        before.by === hand.clientId &&
        before.x === at[0] &&
        before.y === at[1] &&
        before.colour === hand.colour &&
        before.name === hand.name
      ) {
        continue;
      }
      edit().set(id, { x: at[0], y: at[1], by: hand.clientId, name: hand.name, colour: hand.colour, released: null, doc: null });
    }
  }
  return next ?? prev;
}

/**
 * Opruimen wat neergezet is. Weg gaat: wat het document niet meer heeft (een
 * ander haalde het weg), en van wat losgelaten is alles waar het document nu
 * staat waar de hand het neerzette, of iets anders zegt dan bij het loslaten
 * (de opslag is binnen, ook als die afrondde), of dat al `SETTLE_MS` wacht.
 */
export function settleCarry(
  prev: ReadonlyMap<string, Carry>,
  options: { now: number; docAt: DocAt; settleMs?: number },
): ReadonlyMap<string, Carry> {
  const { now, docAt } = options;
  const settleMs = options.settleMs ?? SETTLE_MS;
  let next: Map<string, Carry> | null = null;
  for (const [id, item] of prev) {
    const doc = docAt(id);
    let gone = doc === null;
    if (!gone && item.released !== null) {
      const here = keyOf(doc);
      gone = here === `${item.x},${item.y}` || here !== item.doc || now - item.released >= settleMs;
    }
    if (gone) {
      next ??= new Map(prev);
      next.delete(id);
    }
  }
  return next ?? prev;
}

/**
 * Een frame dat iets droeg, gevolgd door een dat niets draagt, mag niet in
 * één frame samenvallen: dan hoort de ander nooit wáár het neergezet werd.
 * De lijn verstuurt het dragende dan eerst, meteen (`LiveProvider`).
 */
export function carries(frame: { m?: Readonly<Record<string, unknown>> } | null | undefined): boolean {
  return Boolean(frame?.m && Object.keys(frame.m).length);
}
