/**
 * §21: the names things are known by on the wire.
 *
 * Everything live in the archive — a change signal, a place someone is
 * standing, a room of shared text — is addressed by a short string key. This
 * file is the one list of their shapes, shared by the server (which gates
 * them) and the browser (which asks for them), and it imports nothing, so a
 * client bundle can use it without dragging the database along.
 *
 *   entry:{id}      one artikel · case:{id} one dossier · board:{id} one
 *                   prikbord · map:{id} one landkaart · pin:{id} one speld ·
 *                   timeline:{id} one tijdlijn · event:{id} one gebeurtenis ·
 *                   family_tree:{id} one stamboom (§66) · ink:{id} the
 *                   tekenlaag on a prikbord, landkaart, tijdlijn or stamboom ·
 *                   room:{id} one kamer (§79)
 *   entries, cases, boards, maps, timelines, family_trees, types, words, site,
 *   users, characters, feed
 *                   "something in this collection changed" — a list page's key
 *   admin           Keeper-only: trash, proposals, audit
 *   page:/wiki      a fixed page as a *place* to stand, when it is about no
 *                   one record
 *
 * A key names a thing; it never carries the thing. A change signal says
 * "entry:abc moved" and the page that hears it asks for its own copy, through
 * the same visibility rules as always (README rule 1).
 */

export const ID = '[A-Za-z0-9_-]{1,64}';

const RECORD_KEY = new RegExp(
  `^(entry|case|board|map|pin|timeline|event|family_tree|overzicht|ink|room):(${ID})$`,
);
const ROOM_KEY = new RegExp(
  `^(?:entry:${ID}:(?:body|fields)|section:${ID}|case:${ID}:(?:notes|fields)|map:${ID}:fields|pin:${ID}:fields|event:${ID}:fields|keeper:(?:entry|case|board|map|timeline|family_tree):${ID}:notes)$`,
);

/** Keys any signed-in person may watch: a list moved, nothing about which row. */
export const COLLECTION_KEYS = [
  'entries',
  'cases',
  'boards',
  'maps',
  'timelines',
  // §66
  'family_trees',
  // §75
  'overzichten',
  'types',
  'words',
  'site',
  'users',
  'characters',
  'feed',
] as const;
export type CollectionKey = (typeof COLLECTION_KEYS)[number];

/** Keys only a Keeper may watch. */
export const KEEPER_KEYS = ['admin'] as const;

/** The fixed pages a person can stand on that are about no record. */
export const PAGE_PLACES = [
  '/',
  '/cases',
  '/wiki',
  // §75: the wiki's front door is the home overzicht, and `/wiki/alles` is the
  // list that used to be there.
  '/wiki/alles',
  '/boards',
  '/maps',
  '/timelines',
  // §66
  '/stambomen',
  '/search',
  '/you',
  // §81: the hall — every spelerspagina in one list. The pages themselves are
  // `/spelers/<slug>`, which `canWatch` matches with its own pattern.
  '/spelers',
  // §82: the shop window — everything that is for sale, in one place.
  '/winkel',
  /*
   * §76 found this one missing. `app/(app)/web/page.tsx` has stood on
   * `page:/web` since §21 and `canWatch` has refused it every time — the place
   * was silently never set, so nobody has ever been seen on the web, and the
   * roster would have shown them as nowhere at all. A place a page actually
   * stands on belongs in this list.
   */
  '/web',
  '/admin',
  /*
   * §83: de uitdeler. Hij staat hier zodat een Keeper die erop staat érgens
   * staat — maar `canWatch` heeft er een tak vóór deze lijst voor, net als
   * `/admin`: een speler hoort niet in het lijstje te lezen dat de Keeper
   * munten aan het uitdelen is.
   */
  '/uitdelen',
] as const;

export const entryKey = (id: string) => `entry:${id}`;
export const caseKey = (id: string) => `case:${id}`;
export const boardKey = (id: string) => `board:${id}`;
export const mapKey = (id: string) => `map:${id}`;
export const pinKey = (id: string) => `pin:${id}`;
export const timelineKey = (id: string) => `timeline:${id}`;
export const eventKey = (id: string) => `event:${id}`;
/** §66: one stamboom. */
export const familyTreeKey = (id: string) => `family_tree:${id}`;
/** §75: one overzicht. */
export const overzichtKey = (id: string) => `overzicht:${id}`;
/**
 * §44: the Keeper's notes about one thing, as shared text. Keeper-only at the
 * gate (`lib/live/rooms.ts`), and always addressed by the *pair's* side — two
 * faces of one thing resolve to one key, which is what makes typing on either
 * page typing on both.
 */
export const keeperNotesRoomKey = (kind: string, id: string) => `keeper:${kind}:${id}:notes`;

/** §33: the tekenlaag on the thing with this id (a prikbord, landkaart, tijdlijn or stamboom). */
export const inkKey = (id: string) => `ink:${id}`;
/** A wiki soort's list page, as a place. */
export const typePagePlace = (slug: string) => `page:/wiki/${slug}`;
/**
 * §75: one overzicht's page, as a place. Two segments where a soort has one,
 * which is why `canWatch` has a second pattern for it rather than a wider one:
 * `/wiki/overzicht/x` must not be readable as a soort called "overzicht".
 */
export const overzichtPagePlace = (slug: string) => `page:/wiki/overzicht/${slug}`;
export const pagePlace = (path: string) => `page:${path}`;
/**
 * §77: one person's spelerspagina, as a place.
 *
 * The segment is a *slug* of the account name, never the name itself: §4 lets a
 * username hold spaces, apostrophes and any unicode letter, and none of those
 * may be in a key (`isWellFormedKey`) or in a path segment without escaping.
 * `lib/spelers/service.ts` is the one place that turns a slug back into an
 * account.
 */
export const spelerPagePlace = (slug: string) => `page:/spelers/${slug}`;
/**
 * §79: one kamer. Gated by `canSeeRoom` — the onderzoeker's artikel must be
 * visible (§9) and then the kamer's own dial (§17).
 */
export const roomKey = (id: string) => `room:${id}`;

export type RecordKind =
  | 'entry'
  | 'case'
  | 'board'
  | 'map'
  | 'pin'
  | 'timeline'
  | 'event'
  // §66
  | 'family_tree'
  // §75
  | 'overzicht'
  | 'ink'
  // §79: one onderzoeker's kamer.
  | 'room';

export function parseRecordKey(key: string): { kind: RecordKind; id: string } | null {
  const match = RECORD_KEY.exec(key);
  return match ? { kind: match[1] as RecordKind, id: match[2] } : null;
}

export function isRoomKey(key: string): boolean {
  return ROOM_KEY.test(key);
}

/** Field rooms (§21): the short texts of a record, each a Y.Text under its own name. */
export const entryFieldsRoomKey = (entryId: string) => `entry:${entryId}:fields`;
export const caseFieldsRoomKey = (caseId: string) => `case:${caseId}:fields`;
export const mapFieldsRoomKey = (mapId: string) => `map:${mapId}:fields`;
export const pinFieldsRoomKey = (pinId: string) => `pin:${pinId}:fields`;
/** §32: the name and text of a note gebeurtenis on a tijdlijn. */
export const eventFieldsRoomKey = (eventId: string) => `event:${eventId}:fields`;

/** Which change keys a room's record answers to, so a page can watch both. */
export function keysOfRoom(room: string): string[] {
  const parts = room.split(':');
  if (parts.length >= 2 && ['entry', 'case', 'map', 'pin', 'event'].includes(parts[0])) return [`${parts[0]}:${parts[1]}`];
  return [];
}

/** A key is safe to put on the wire: short, and made of the characters above. */
export function isWellFormedKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= 140 && /^[A-Za-z0-9_:./-]+$/.test(key);
}
