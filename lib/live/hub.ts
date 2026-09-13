import { presenceColour } from './colour';
import { setChangeDelivery } from './changes';
import type { RoomEvent } from './docs';
import type { InkFrame } from '@/lib/ink/types';

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
 *   `ink`       somebody's pen at this place (§33): the points a stroke in
 *               progress gained since the last frame, so the others watch
 *               it being drawn. Sight, not state — never stored.
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

/**
 * A pointer frame at a place. `x`/`y` are in the place's own coordinates; `m`
 * is what is being carried (card id → position, capped at forty); `s` is the
 * selection box a hand is dragging open on a prikbord, `[x0, y0, x1, y1]`, or
 * null when there is none. Sight, never state: nothing here is stored.
 */
export type SitePointer = {
  c: string;
  x: number | null;
  y: number | null;
  m: Record<string, [number, number]>;
  s?: [number, number, number, number] | null;
};

export type SiteEvent =
  | { event: 'hello'; data: { connection: string } }
  /**
   * §60: `by` is the clientId of the tab whose write this was, where anything
   * knew it. The ORM logger cannot — a statement has no tab — so most `changed`
   * frames have no `by` at all, and a frame that has one is never sent to that
   * tab: it is holding the answer already.
   */
  | { event: 'changed'; data: { keys: string[]; at: number; by?: string | null } }
  | { event: 'presence'; data: { place: string; people: PublicPerson[] } }
  | { event: 'pointer'; data: { place: string } & SitePointer }
  | { event: 'ink'; data: { place: string; c: string; f: InkFrame[] } }
  | { event: 'room'; data: { k: string; e: RoomEvent['event']; d: unknown } }
  /**
   * §60: a frame for a *carried* tab — one that keeps its own clientId and
   * posts its own watches, but whose stream rides the leader tab's socket.
   * `to` is the carried tab's clientId; the leader's provider demultiplexes
   * and passes it on over a `BroadcastChannel`.
   */
  | { event: 'via'; data: { to: string; e: SiteEvent['event']; d: unknown } };

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
  /**
   * §60: the connection whose socket carries this one's frames, when this tab
   * has no socket of its own (a follower tab under a leader). Null for a tab
   * that opened its own `EventSource`.
   */
  carriedBy: string | null;
  /** The other way round: carried connections riding this one's socket. */
  carrying: Set<string>;
  /**
   * §60: another name this tab answers to.
   *
   * A prikbord's canvas has a tab id of its own, minted before the site line
   * exists and quoted in every save it makes (`publishChange(id, {by})`). The
   * hub needs to know that "that saver" and "this line" are one tab, or the
   * author would be told about their own save and — worse — every *other* tab
   * would file the `by` under a name that matches nothing in the pointer
   * frames, so a dropped card would snap back for the length of a round trip.
   */
  alias: string | null;
};

type Hub = {
  connections: Map<string, Connection>;
  /** key → connections watching it. */
  watchers: Map<string, Set<Connection>>;
  /** place → connections standing there. */
  places: Map<string, Set<Connection>>;
  /** §60: alias → the line that answers to it. */
  aliases: Map<string, Connection>;
  sweeper: ReturnType<typeof setInterval> | null;
};

const globalForHub = globalThis as unknown as { __zcfSiteHub?: Hub };
const hub: Hub = globalForHub.__zcfSiteHub ?? {
  connections: new Map(),
  watchers: new Map(),
  places: new Map(),
  aliases: new Map(),
  sweeper: null,
};
// A hub kept from before this round (a hot reload in development) has no alias
// index; give it one rather than throwing on the first save.
hub.aliases ??= new Map();
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
    carriedBy: null,
    carrying: new Set(),
    alias: null,
  };
  hub.connections.set(connection.id, connection);
  if (!hub.sweeper) {
    hub.sweeper = setInterval(sweep, 15_000);
    if (typeof hub.sweeper === 'object' && 'unref' in hub.sweeper) hub.sweeper.unref();
  }
  safeSend(connection, { event: 'hello', data: { connection: connection.id } });
  return connection;
}

/**
 * §60: a tab with no socket of its own.
 *
 * One browser, eight tabs, eight sockets — and over HTTP/1.1 that is more than
 * a browser will open to one host, so the ninth navigation waits for ever. A
 * *carried* tab is the cure: it still has its own clientId, its own watch list,
 * its own place and its own name, so the hub sees exactly as many people as
 * there are tabs; what it does not have is a socket. Its frames are wrapped in
 * a `via` and written down the leader's stream, and the leader's provider hands
 * them on over a `BroadcastChannel`.
 *
 * Created lazily, by the follower's first POST. It lives and dies with the
 * leader: `disconnect` on a leader drops everything it carries, which is what
 * makes a closed leader tab safe — the next tab takes the lock and says
 * everything again.
 */
export function carry(input: {
  leader: Connection;
  clientId: string;
  userId: string;
  /**
   * How this tab is named on the strip. A function, not a string: a follower
   * heartbeats every twenty seconds and the name costs a words lookup and a
   * character resolution, neither of which is worth doing for a line that is
   * already standing there under the same name.
   */
  name: string | (() => string);
}): Connection | null {
  // Never across accounts, and never a leader carrying itself.
  if (input.leader.userId !== input.userId) return null;
  if (input.leader.clientId === input.clientId) return null;
  const id = `${input.leader.id}~${input.clientId}`;
  const existing = hub.connections.get(id);
  if (existing) {
    existing.seenAt = Date.now();
    return existing;
  }
  const leaderId = input.leader.id;
  const connection: Connection = {
    id,
    clientId: input.clientId,
    userId: input.userId,
    name: typeof input.name === 'function' ? input.name() : input.name,
    colour: presenceColour(input.userId),
    send: (event) => {
      const leader = hub.connections.get(leaderId);
      if (!leader) return;
      leader.send({ event: 'via', data: { to: input.clientId, e: event.event, d: event.data } });
    },
    watches: new Set(),
    place: null,
    holding: [],
    joinedAt: nextArrival(),
    seenAt: Date.now(),
    rooms: new Map(),
    carriedBy: leaderId,
    carrying: new Set(),
    alias: null,
  };
  hub.connections.set(id, connection);
  input.leader.carrying.add(id);
  return connection;
}

export function disconnect(connectionId: string) {
  const connection = hub.connections.get(connectionId);
  if (!connection) return;
  hub.connections.delete(connectionId);
  // §60: a leader takes everything it carried with it. The frames had nowhere
  // to go the moment its socket closed, so leaving the carried lines on the
  // roster would show people who cannot hear anything.
  if (connection.carrying.size) {
    const carried = [...connection.carrying];
    connection.carrying.clear();
    for (const id of carried) disconnect(id);
  }
  if (connection.carriedBy) {
    hub.connections.get(connection.carriedBy)?.carrying.delete(connectionId);
    connection.carriedBy = null;
  }
  if (connection.alias) {
    if (hub.aliases.get(connection.alias) === connection) hub.aliases.delete(connection.alias);
    connection.alias = null;
  }
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
  // A carried line is only alive while the socket under it is.
  if (found.carriedBy) {
    const leader = hub.connections.get(found.carriedBy);
    if (!leader) {
      disconnect(found.id);
      return null;
    }
    leader.seenAt = found.seenAt;
  }
  return found;
}

/** The leader behind a carried POST, by its own connection id and clientId. */
export function leaderConnection(connectionId: string, leaderClientId: string, userId: string): Connection | null {
  const found = hub.connections.get(connectionId);
  if (!found || found.clientId !== leaderClientId || found.userId !== userId) return null;
  if (found.carriedBy) return null;
  found.seenAt = Date.now();
  return found;
}

/** Test seam: how many lines this one carries. */
export function carriedCount(connectionId: string): number {
  return hub.connections.get(connectionId)?.carrying.size ?? 0;
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
/**
 * §60: this line also answers to `alias`.
 *
 * Said by the tab on every POST that needs it, and again after a reconnection,
 * because a line that came back is a new connection. One alias per line; a
 * second one replaces the first.
 *
 * **And never somebody else's name.** An alias is a suppression: the hub keeps
 * a `changed` away from the tab whose write it was. So a client that aliased
 * itself to another tab's clientId stole that suppression — the victim heard
 * about its own board save and snapped the card it had just dropped back to
 * where it started, and the thief's own wall stopped updating. A name already
 * held by a different tab, or equal to another live connection's own clientId,
 * is therefore refused. Returns whether it was taken; the route says nothing
 * about a refusal, because to the caller there is nothing to say.
 */
export function setAlias(connection: Connection, alias: string | null): boolean {
  if (connection.alias === alias) return true;
  if (alias) {
    const held = hub.aliases.get(alias);
    // Somebody else's alias. A second connection of the *same tab* (a reconnect
    // whose old line has not been reaped yet) is the one case that is allowed.
    if (held && held !== connection && (held.clientId !== connection.clientId || held.userId !== connection.userId)) {
      return false;
    }
    // And never a live tab's own name, which no alias index would catch.
    for (const other of hub.connections.values()) {
      if (other !== connection && other.clientId === alias) return false;
    }
  }
  if (connection.alias && hub.aliases.get(connection.alias) === connection) hub.aliases.delete(connection.alias);
  connection.alias = alias;
  if (alias) hub.aliases.set(alias, connection);
  return true;
}

/** The clientId a `by` really names: an alias resolves to its line's own id. */
export function resolveClientId(by: string): string {
  return hub.aliases.get(by)?.clientId ?? by;
}

export function publishChanged(keys: string[], options?: { by?: string | null }) {
  if (!keys.length) return;
  const by = options?.by ? resolveClientId(options.by) : null;
  const told = new Map<Connection, string[]>();
  for (const key of keys) {
    const set = hub.watchers.get(key);
    if (!set) continue;
    for (const connection of set) {
      // §60, and rule 2 of live-boards: the tab that wrote this is holding the
      // answer the save handed back. Telling it would only make it ask again —
      // and on a prikbord that round trip is what snapped a dropped card back
      // to where it started.
      if (by && connection.clientId === by) continue;
      const list = told.get(connection);
      if (list) list.push(key);
      else told.set(connection, [key]);
    }
  }
  const at = Date.now();
  for (const [connection, hit] of told) safeSend(connection, { event: 'changed', data: { keys: hit, at, by } });
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

/** §33: somebody's pen moved at their place. Fanned out like a pointer frame, and remembered by nobody. */
export function publishInk(connection: Connection, frames: InkFrame[]) {
  const place = connection.place;
  if (!place || !frames.length) return;
  const set = hub.places.get(place);
  if (!set) return;
  for (const other of set) {
    if (other === connection || other.clientId === connection.clientId) continue;
    safeSend(other, { event: 'ink', data: { place, c: connection.clientId, f: frames } });
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
  hub.aliases.clear();
}
