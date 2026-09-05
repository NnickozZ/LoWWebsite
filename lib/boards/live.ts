/**
 * §8, live: who is on a board right now, and telling them when it moved.
 *
 * The corkboard already merges properly — `mergeBoardState` is pure, merges by
 * id, and applies deletions explicitly, which is the hard half of collaborative
 * editing and the half that was already done. What was missing was any reason
 * to *look*: a client only learned about someone else's card when it happened
 * to save its own. This is the missing half, and it is deliberately small.
 *
 * Two things travel over one connection per open board:
 *
 *   `change`    "the board moved, and not because of you" — a signal, never the
 *               document. The document is pulled by the client, because a
 *               board's cards are *resolved per viewer*: a card whose entry the
 *               viewer may not see comes back stamped MISSING (README rule 1).
 *               Broadcasting one merged state to every listener would hand a
 *               player the name of a Keeper-only fiche. So the wire carries the
 *               fact that something happened, and each client asks for its own
 *               version of it.
 *
 *   `presence`  who is on the wall and which cards they are holding — the
 *               coloured border Google Sheets puts round the cell someone else
 *               has selected. Entirely ephemeral: it lives in this process,
 *               never touches SQLite, and is gone when the last tab closes.
 *
 * One container, one process (see the README's deployment section), so an
 * in-memory hub is the whole of the infrastructure — no Redis, no broker, and
 * nothing fetched at runtime, which §13 forbids anyway. If this ever runs
 * behind more than one instance, this file is what has to grow a real bus, and
 * nothing else does.
 */

export type Presence = {
  /** One open tab. A person with the board open twice is here twice. */
  clientId: string;
  /**
   * Which open line put this entry here. A tab that reconnects opens a new
   * line before the old one's goodbye arrives; only the line that owns the
   * entry may clear it.
   */
  connection: string | null;
  /** Server-side only — see `PublicPresence`, which is what is sent. */
  userId: string;
  name: string;
  /** Their ink on this board, stable for as long as their account exists. */
  colour: string;
  /** Card ids they have selected or are dragging. */
  holding: string[];
  /** When this tab first said hello — the order of the strip, so it holds still. */
  joinedAt: number;
  /** Last heartbeat, for reaping a tab that died mid-flight. */
  seenAt: number;
};

/**
 * What a client is told about the other people on the board. Deliberately not
 * `Presence`: the account id is what the colour is derived from and has no use
 * in a browser, so it does not leave the server. Least privilege on a channel
 * every signed-in player can open.
 */
export type PublicPresence = Omit<Presence, 'userId' | 'joinedAt' | 'seenAt' | 'connection'>;

/**
 * One frame of somebody's hand: where their pointer is on the cork, and where
 * the cards they are dragging are *right now* — before any of it is saved.
 * Board coordinates, so every viewer draws it under their own pan and zoom.
 * `x`/`y` null means the pointer left the wall. `m` is card id → [x, y].
 */
export type PointerFrame = {
  c: string;
  x: number | null;
  y: number | null;
  m: Record<string, [number, number]>;
};

export type LiveEvent =
  | { event: 'change'; data: { at: number; by: string | null } }
  | { event: 'presence'; data: { people: PublicPresence[] } }
  | { event: 'pointer'; data: PointerFrame };

type Subscriber = {
  clientId: string;
  send: (event: LiveEvent) => void;
};

type Hub = {
  subscribers: Map<string, Set<Subscriber>>;
  presence: Map<string, Map<string, Presence>>;
};

/**
 * Kept on `globalThis` in every environment, not only development. In dev it
 * survives a hot reload for the same reason the database connection does; in
 * production it guards against the bundler handing the SSE route and the save
 * route each their own copy of this module — two hubs would leave every open
 * board listening to something nobody publishes to, silently.
 */
const globalForHub = globalThis as unknown as { __zcfBoardHub?: Hub };
const hub: Hub =
  globalForHub.__zcfBoardHub ?? { subscribers: new Map(), presence: new Map() };
globalForHub.__zcfBoardHub = hub;

/** A tab that has not said anything for this long is treated as gone. */
export const PRESENCE_TTL_MS = 30_000;

/**
 * The ink a person is drawn in. Deliberately not random and not assigned in
 * arrival order: the same player is the same colour on every board, every
 * session, for everyone watching, so "the green one is Anneke" stays true.
 * Six pigments that all read on cork and all differ in a monochrome print.
 */
const INKS = ['#1F4E79', '#2F6B4F', '#A8321E', '#5B3A78', '#8A6A24', '#7A4A2B'];

export function presenceColour(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return INKS[hash % INKS.length];
}

/* ------------------------------------------------------------ subscribers */

export function subscribe(boardId: string, subscriber: Subscriber): () => void {
  let set = hub.subscribers.get(boardId);
  if (!set) {
    set = new Set();
    hub.subscribers.set(boardId, set);
  }
  set.add(subscriber);

  return () => {
    const current = hub.subscribers.get(boardId);
    if (!current) return;
    current.delete(subscriber);
    if (!current.size) hub.subscribers.delete(boardId);
  };
}

export function subscriberCount(boardId: string): number {
  return hub.subscribers.get(boardId)?.size ?? 0;
}

/**
 * A send that throws — a socket closed between the check and the write — must
 * not stop the other listeners from being told.
 */
function fanOut(boardId: string, event: LiveEvent, exceptClientId?: string | null) {
  const set = hub.subscribers.get(boardId);
  if (!set) return;
  for (const subscriber of set) {
    if (exceptClientId && subscriber.clientId === exceptClientId) continue;
    try {
      subscriber.send(event);
    } catch {
      set.delete(subscriber);
    }
  }
}

/**
 * Tell everyone but the author that the board moved. Called after the merge has
 * been written, never before: a client that pulls on this signal must find the
 * new document, not the old one.
 */
export function publishChange(boardId: string, byClientId?: string | null) {
  fanOut(boardId, { event: 'change', data: { at: Date.now(), by: byClientId ?? null } }, byClientId);
}

/**
 * Somebody's hand moved. Fanned out to everyone else at once and remembered by
 * nobody: a pointer is only interesting *now*, and a late arrival sees it the
 * moment it next moves. Nothing here is a fact about the board — the positions
 * in `m` are where a card is being *held*, and the save that follows the drop
 * is what makes them true.
 */
export function publishPointer(boardId: string, frame: PointerFrame) {
  fanOut(boardId, { event: 'pointer', data: frame }, frame.c);
}

/**
 * Is this tab already on the wall as this account? A pointer frame arrives
 * twenty times a second while someone drags, and each one has already been
 * through the board's access check when the line was opened — so the frames
 * are let in on the strength of that, and refresh the tab's place in the
 * roster on the way. A tab the hub does not know is sent back to the front
 * door.
 */
export function touchPresence(boardId: string, clientId: string, userId: string): boolean {
  const entry = hub.presence.get(boardId)?.get(clientId);
  if (!entry || entry.userId !== userId) return false;
  entry.seenAt = Date.now();
  return true;
}

/* -------------------------------------------------------------- presence */

function reap(boardId: string): Map<string, Presence> {
  const people = hub.presence.get(boardId);
  if (!people) return new Map();
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  for (const [clientId, entry] of people) {
    if (entry.seenAt < cutoff) people.delete(clientId);
  }
  if (!people.size) hub.presence.delete(boardId);
  return people;
}

/** Everyone currently on this wall, oldest arrival first so the strip is stable. */
export function roster(boardId: string): Presence[] {
  return [...reap(boardId).values()].sort(
    (a, b) => a.joinedAt - b.joinedAt || a.clientId.localeCompare(b.clientId),
  );
}

/** The same list, with everything a browser has no business knowing removed. */
export function publicRoster(boardId: string): PublicPresence[] {
  return roster(boardId).map(({ clientId, name, colour, holding }) => ({
    clientId,
    name,
    colour,
    holding,
  }));
}

export function setPresence(
  boardId: string,
  input: { clientId: string; userId: string; name: string; holding?: unknown; connection?: string },
): { entry: Presence; changed: boolean } {
  let people = hub.presence.get(boardId);
  if (!people) {
    people = new Map();
    hub.presence.set(boardId, people);
  }

  const existing = people.get(input.clientId);
  const entry: Presence = {
    clientId: input.clientId,
    connection: input.connection ?? existing?.connection ?? null,
    userId: input.userId,
    name: input.name,
    colour: presenceColour(input.userId),
    holding: Array.isArray(input.holding)
      ? input.holding.filter((id): id is string => typeof id === 'string').slice(0, 60)
      : (existing?.holding ?? []),
    // Arrival order drives the strip, so a heartbeat must not reshuffle it:
    // only a tab that was not already here gets a new place in the queue.
    joinedAt: existing?.joinedAt ?? Date.now(),
    seenAt: Date.now(),
  };
  people.set(input.clientId, entry);

  // A heartbeat moves `seenAt` and nothing else. Broadcasting the roster for
  // that would have every open board sending everyone the same list every few
  // seconds, so callers are told whether there is anything to say.
  const changed =
    !existing ||
    existing.name !== entry.name ||
    existing.colour !== entry.colour ||
    existing.holding.length !== entry.holding.length ||
    existing.holding.some((id, i) => id !== entry.holding[i]);

  return { entry, changed };
}

export function clearPresence(boardId: string, clientId: string, connection?: string) {
  const people = hub.presence.get(boardId);
  if (!people) return;
  const entry = people.get(clientId);
  if (!entry) return;
  // A goodbye from a line that has since been replaced is not a goodbye.
  if (connection && entry.connection && entry.connection !== connection) return;
  people.delete(clientId);
  if (!people.size) hub.presence.delete(boardId);
}

/** Send the current roster to everyone on the board, the sender included. */
export function publishPresence(boardId: string) {
  fanOut(boardId, { event: 'presence', data: { people: publicRoster(boardId) } });
}

/** Test seam: forget every board. Never called by the app. */
export function resetHub() {
  hub.subscribers.clear();
  hub.presence.clear();
}
