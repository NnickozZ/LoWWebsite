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
 *                   prikbord · map:{id} one landkaart · pin:{id} one speld
 *   entries, cases, boards, maps, types, words, site, users, characters, feed
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

const RECORD_KEY = new RegExp(`^(entry|case|board|map|pin):(${ID})$`);
const ROOM_KEY = new RegExp(`^(?:entry:${ID}:(?:body|fields)|section:${ID}|case:${ID}:(?:notes|fields)|map:${ID}:fields|pin:${ID}:fields)$`);

/** Keys any signed-in person may watch: a list moved, nothing about which row. */
export const COLLECTION_KEYS = [
  'entries',
  'cases',
  'boards',
  'maps',
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
export const PAGE_PLACES = ['/', '/cases', '/wiki', '/boards', '/maps', '/search', '/you', '/admin'] as const;

export const entryKey = (id: string) => `entry:${id}`;
export const caseKey = (id: string) => `case:${id}`;
export const boardKey = (id: string) => `board:${id}`;
export const mapKey = (id: string) => `map:${id}`;
export const pinKey = (id: string) => `pin:${id}`;
/** A wiki soort's list page, as a place. */
export const typePagePlace = (slug: string) => `page:/wiki/${slug}`;
export const pagePlace = (path: string) => `page:${path}`;

export type RecordKind = 'entry' | 'case' | 'board' | 'map' | 'pin';

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

/** Which change keys a room's record answers to, so a page can watch both. */
export function keysOfRoom(room: string): string[] {
  const parts = room.split(':');
  if (parts.length >= 2 && ['entry', 'case', 'map', 'pin'].includes(parts[0])) return [`${parts[0]}:${parts[1]}`];
  return [];
}

/** A key is safe to put on the wire: short, and made of the characters above. */
export function isWellFormedKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= 140 && /^[A-Za-z0-9_:./-]+$/.test(key);
}
