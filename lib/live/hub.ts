import { presenceColour } from '@/lib/boards/live';
import { setChangeDelivery } from './changes';
import type { RoomEvent } from './docs';

/**
 * §21: the site line — one open connection per tab, for everything live.
 *
 * Before this, each live thing opened its own line: a board its own, every
 * piece of shared text its own. That works for one editor and falls over at
 * an artikel with six sections, because a browser allows about six open
 * connections to one host. And it left every *other* page — the lists, the
 * dossier, the maps, Beheer — with no line at all, so nothing on them moved
 * until someone reloaded.
 *
 * Now a tab opens one line when the shell mounts and keeps it for the life of
 * the tab. Down it come four kinds of thing:
 *
 *   `changed`   "these keys moved" — a signal, never the document. The tab
 *               decides what to re-read, through its own visibility rules.
 *   `presence`  who is standing where this tab is standing (its *place*),
 *               with the cards or pins they are holding.
 *   `pointer`   somebody's hand at this place — coordinates, nothing else.
 *   `room`      a frame from a room of shared text this tab has joined,
 *               multiplexed: `{k: room key, e: event, d: data}`.
 *
 * Up go ordinary POSTs: what to watch, where the tab stands, a pointer frame,
 * a room to join or leave, a keystroke. Every key a tab asks to watch goes
 * through `canWatch` first; every room through `admit`. The hub itself knows
 * nothing about rights — it fans out to whoever was let in.
 *
 * Like the two hubs before it, this lives on `globalThis` so the bundler
 * cannot hand two routes two copies, and it is the one file that would have
 * to grow a real bus if the archive ever ran on more than one process.
 */

export type PublicPerson = { clientId: string; name: string; colour: string; holding: string[] };

/** A pointer frame at a place. `x`/`y` are in the place's own coordinates; `m` is what is being carried. */
export type SitePointer = { c: string; x: number | null; y: number | null; m: Record<string, [number, number]> };

export type SiteEvent =
  | { event: 'hello'; data: { connection: string } }
  | { event: 'changed'; data: { keys: string[]; at: number } }
  | { event: 'presence'; data: { place: string; people: PublicPerson[] } }
  | { event: 'pointer'; data: { place: string } & SitePointer }
  | { event: 'room'; data: { k: string; e: RoomEvent['event']; d: unknown } };

export type Connection = {
  /** This open line. A tab that reconnects is a new connection with the same clientId. */
  id: string;
  clientId: string;
  /** Server-side only; never on the wire. */
  userId: string;
  name: string;
  colour: string;
  send: (event: SiteEvent) => void;
  watches: Set<string>;
  place: string | null;
  holding: string[];
  joinedAt: number;
  seenAt: number;
  /** Rooms of shared text this line is in: key → how to leave. */
  rooms: Map<string, { leave: () => void; yClient: number | null }>;
};

type Hub = {
  connections: Map<string, Connection>;
  /** key → connections watching it. */
  watchers: Map<string, Set<Connection>>;
  /** place → connections standing there. */
  places: Map<string, Set<Connection>>;
  sweeper: ReturnType<typeof setInterval> | null;
};

const globalForHub = globalThis as unknown as { __zcfSiteHub?: Hub };
const hub: Hub = globalForHub.__zcfSiteHub ?? { connections: new Map(), watchers: new Map(), places: new Map(), sweeper: null };
globalForHub.__zcfSiteHub = hub;
// The change queue (`lib/live/changes.ts`) is fed by the database layer and
// empties into here. Wired from this side so that file need not know the hub.
setChangeDelivery((keys) => publishChanged(keys));

/** A line that has not been heard from for this long is treated as gone. */
export const CONNECTION_TTL_MS = 45_000;
/** How many keys one tab may watch at once. */
export const MAX_WATCHES = 64;

/** Arrival order for the strip: a counter, not a clock, so two tabs in one millisecond still have an order. */
let arrivals = 0;
const nextArrival = () => ++arrivals;

function addTo<T>(index: Map<string, Set<T>>, key: string, item: T) {
  let set = index.get(key);
  if (!set) {
    set = new Set();
    index.set(key, set);
  }
  set.add(item);
}

function removeFrom<T>(index: Map<string, Set<T>>, key: string, item: T) {
  const set = index.get(key);
  if (!set) return;
  set.delete(item);
  if (!set.size) index.delete(key);
}

function safeSend(connection: Connection, event: SiteEvent) {
  try {
    connection.send(event);
  } catch {
    // A socket that went away under us. The abort will follow; be tidy now.
    disconnect(connection.id);
  }
}

/* ------------------------------------------------------------ the doors */

export function connect(input: {
  id: string;
  clientId: string;
  userId: string;
  name: string;
  send: (event: SiteEvent) => void;
}): Connection {
  const connection: Connection = {
    ...input,
    colour: presenceColour(input.userId),
    watches: new Set(),
    place: null,
    holding: [],
    joinedAt: nextArrival(),
    seenAt: Date.now(),
    rooms: new Map(),
  };
  hub.connections.set(connection.id, connection);
  if (!hub.sweeper) {
    hub.sweeper = setInterval(sweep, 15_000);
    if (typeof hub.sweeper === 'object' && 'unref' in hub.sweeper) hub.sweeper.unref();
  }
  safeSend(connection, { event: 'hello', data: { connection: connection.id } });
  return connection;
}

export function disconnect(connectionId: string) {
  const connection = hub.connections.get(connectionId);
  if (!connection) return;
  hub.connections.delete(connectionId);
  for (const key of connection.watches) removeFrom(hub.watchers, key, connection);
  connection.watches.clear();
  for (const room of connection.rooms.values()) {
    try {
      room.leave();
    } catch {
      /* a room that is already gone */
    }
  }
  connection.rooms.clear();
  const place = connection.place;
  if (place) {
    removeFrom(hub.places, place, connection);
    connection.place = null;
    publishPresence(place);
  }
}

/** The line behind a POST. A connection the hub does not know sends the tab back to reconnect. */
export function connection(connectionId: string, clientId: string, userId: string): Connection | null {
  const found = hub.connections.get(connectionId);
  if (!found || found.clientId !== clientId || found.userId !== userId) return null;
  found.seenAt = Date.now();
  return found;
}

/* ------------------------------------------------------------- watching */

/** Replaces the tab's watch list with these (already gated) keys. */
export function setWatches(connection: Connection, keys: string[]) {
  const next = new Set(keys.slice(0, MAX_WATCHES));
  for (const key of connection.watches) {
    if (!next.has(key)) removeFrom(hub.watchers, key, connection);
  }
  for (const key of next) {
    if (!connection.watches.has(key)) addTo(hub.watchers, key, connection);
  }
  connection.watches = next;
}

/**
 * Tell every tab watching any of these keys that they moved — once per tab,
 * whatever the overlap. Called after the write, never before (a tab that
 * re-reads on this must find the new state).
 */
export function publishChanged(keys: string[]) {
  if (!keys.length) return;
  const told = new Map<Connection, string[]>();
  for (const key of keys) {
    const set = hub.watchers.get(key);
    if (!set) continue;
    for (const connection of set) {
      const list = told.get(connection);
      if (list) list.push(key);
      else told.set(connection, [key]);
    }
  }
  const at = Date.now();
  for (const [connection, hit] of told) safeSend(connection, { event: 'changed', data: { keys: hit, at } });
}

export function watcherCount(key: string): number {
  return hub.watchers.get(key)?.size ?? 0;
}

/* ------------------------------------------------------------- presence */

function roster(place: string): PublicPerson[] {
  const set = hub.places.get(place);
  if (!set) return [];
  return [...set]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(({ clientId, name, colour, holding }) => ({ clientId, name, colour, holding }));
}

export function publishPresence(place: string) {
  const set = hub.places.get(place);
  if (!set) return;
  const people = roster(place);
  for (const connection of set) safeSend(connection, { event: 'presence', data: { place, people } });
}

/** Where this tab stands, and what it holds. `null` leaves. Returns whether anyone need be told. */
export function setPlace(connection: Connection, place: string | null, holding?: unknown) {
  const nextHolding = Array.isArray(holding)
    ? holding.filter((id): id is string => typeof id === 'string').slice(0, 60)
    : connection.holding;
  const previous = connection.place;
  const sameHolding =
    nextHolding.length === connection.holding.length && nextHolding.every((id, i) => id === connection.holding[i]);
  if (previous === place && sameHolding) return;

  if (previous && previous !== place) {
    removeFrom(hub.places, previous, connection);
    connection.place = null;
    publishPresence(previous);
  }
  connection.holding = nextHolding;
  if (place) {
    if (connection.place !== place) {
      connection.place = place;
      // A tab that moves rooms arrives fresh; the strip's order is arrival order.
      connection.joinedAt = nextArrival();
      addTo(hub.places, place, connection);
    }
    publishPresence(place);
  }
}

export function peopleAt(place: string): PublicPerson[] {
  return roster(place);
}

/** Somebody's hand moved at their place: everyone else there sees it now, nobody remembers it. */
export function publishPointer(connection: Connection, frame: SitePointer) {
  const place = connection.place;
  if (!place) return;
  const set = hub.places.get(place);
  if (!set) return;
  for (const other of set) {
    if (other === connection || other.clientId === connection.clientId) continue;
    safeSend(other, { event: 'pointer', data: { place, ...frame } });
  }
}

/* ---------------------------------------------------------------- rooms */

/** A line's own doorway into a room: the room's frames come down this line, wrapped. */
export function roomSender(connection: Connection, key: string) {
  return (event: RoomEvent) => connection.send({ event: 'room', data: { k: key, e: event.event, d: event.data } });
}

export function rememberRoom(connection: Connection, key: string, leave: () => void, yClient: number | null) {
  const previous = connection.rooms.get(key);
  if (previous) previous.leave();
  connection.rooms.set(key, { leave, yClient });
}

export function forgetRoom(connection: Connection, key: string) {
  const room = connection.rooms.get(key);
  if (!room) return;
  connection.rooms.delete(key);
  room.leave();
}

/* ---------------------------------------------------------------- upkeep */

function sweep() {
  const cutoff = Date.now() - CONNECTION_TTL_MS;
  for (const connection of [...hub.connections.values()]) {
    if (connection.seenAt < cutoff) disconnect(connection.id);
  }
}

/** Test seams. Never called by the app. */
export function connectionCount(): number {
  return hub.connections.size;
}

export function resetSiteHub() {
  for (const connection of [...hub.connections.values()]) disconnect(connection.id);
  hub.watchers.clear();
  hub.places.clear();
}
