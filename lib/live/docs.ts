import { and, eq } from 'drizzle-orm';
import { Node as PmNode } from '@tiptap/pm/model';
import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { prosemirrorJSONToYXmlFragment, updateYFragment, yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import { db, schema } from '@/lib/db';
import { documentSchema } from './schema';

/**
 * §20: shared text.
 *
 * A piece of prose that several people type in at once is a *room*: one Yjs
 * document held in this process, every open tab subscribed to it, and each
 * keystroke an update that goes up from one tab and out to the rest. Yjs is
 * the part that makes this safe — a CRDT merges concurrent edits without a
 * server deciding who wins — and this file is only the plumbing around it.
 *
 * What is deliberately *not* here: the rules about who may join a room and who
 * may write to it. Those are in `lib/live/rooms.ts`, per kind of room, and are
 * checked before anything reaches this file. A room never sees a viewer who
 * failed the gate, which is how README rule 1 survives a channel that fans one
 * document out to everyone in it: the gate decides who "everyone" is.
 *
 * Two things are persisted, on a debounce:
 *   - the Yjs state itself (`live_docs`), so a tab that comes back from a
 *     tunnel merges its edits instead of clobbering, and a server restart does
 *     not throw away everyone's clocks;
 *   - the plain document, through the room's own `persist` — `updateEntry`,
 *     `updateSection` — so revisions, links, the search index and the feed
 *     all see the text exactly as they always have.
 *
 * `entries.body` stays what every reader uses. If it is changed *around* the
 * room (a restored revision, an approved proposal), `resetRoom` rewrites the
 * shared document to match, and connected tabs see that as one more update.
 */

/** The Yjs field Tiptap's Collaboration extension reads. */
export const FIELD = 'default';

export type RoomEvent =
  | { event: 'sync'; data: { state: string; sv: string; awareness: string; canEdit: boolean } }
  | { event: 'update'; data: { u: string } }
  | { event: 'awareness'; data: { a: string } }
  /** The room wrote itself to the archive: what "Opgeslagen" means for shared text. */
  | { event: 'persisted'; data: { at: number } }
  | { event: 'saved'; data: { by: string | null; keys: string[] } };

export type RoomSpec = {
  key: string;
  /** The stored ProseMirror JSON to seed from when no Yjs state exists yet. */
  seed: () => unknown;
  /** Writes the shared document back into the archive, as this person. */
  persist: (json: unknown, actor: { id: string; isKeeper: boolean }) => void;
};

type Subscriber = {
  clientId: string;
  userId: string;
  /** The tab's Yjs client id: what its awareness state is filed under. */
  yClient: number | null;
  send: (event: RoomEvent) => void;
};

type Room = {
  key: string;
  spec: RoomSpec;
  doc: Y.Doc;
  awareness: Awareness;
  subscribers: Map<string, Subscriber>;
  dirty: boolean;
  persistTimer: ReturnType<typeof setTimeout> | null;
  /** The last person whose keystrokes reached this room: who the save is by. */
  lastActor: { id: string; isKeeper: boolean } | null;
  idleSince: number;
};

type Hub = { rooms: Map<string, Room>; sweeper: ReturnType<typeof setInterval> | null };

/** On `globalThis` for the same reason `lib/boards/live.ts` is: one hub, whatever the bundler does. */
const globalForHub = globalThis as unknown as { __zcfDocHub?: Hub; __zcfShutdownHooks?: (() => void)[] };
const hub: Hub = globalForHub.__zcfDocHub ?? { rooms: new Map(), sweeper: null };
if (!globalForHub.__zcfDocHub) {
  globalForHub.__zcfDocHub = hub;
  // Written out before the process goes (see `lib/diagnostics.ts`). Registered
  // by hand on the shared list rather than imported, so the diagnostics bundle
  // never pulls Yjs in a second time.
  (globalForHub.__zcfShutdownHooks ??= []).push(() => persistAll());
}

/** Keystrokes settle for this long before the archive is written. */
const PERSIST_DEBOUNCE_MS = 1500;
/** …but never longer than this while someone keeps typing. */
const PERSIST_MAX_WAIT_MS = 6000;
/** A room nobody has open, with nothing unsaved, is let go of after this. */
const ROOM_IDLE_MS = 10 * 60_000;

const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const decode = (text: string) => new Uint8Array(Buffer.from(text, 'base64'));

/* ------------------------------------------------------------ the store */

function loadState(key: string): Uint8Array | null {
  const row = db.select({ state: schema.liveDocs.state }).from(schema.liveDocs).where(eq(schema.liveDocs.room, key)).get();
  return row ? new Uint8Array(row.state) : null;
}

function storeState(key: string, doc: Y.Doc) {
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  db.insert(schema.liveDocs)
    .values({ room: key, state, updatedAt: Math.floor(Date.now() / 1000) })
    .onConflictDoUpdate({
      target: schema.liveDocs.room,
      set: { state, updatedAt: Math.floor(Date.now() / 1000) },
    })
    .run();
}

/** Drops the stored state. Used when the plain document was rewritten around the room. */
export function forgetStoredState(key: string) {
  db.delete(schema.liveDocs).where(and(eq(schema.liveDocs.room, key))).run();
}

/* -------------------------------------------------------------- the room */

function seedFragment(doc: Y.Doc, json: unknown) {
  const content = json && typeof json === 'object' ? json : { type: 'doc', content: [{ type: 'paragraph' }] };
  doc.transact(() => {
    try {
      prosemirrorJSONToYXmlFragment(documentSchema(), content, doc.getXmlFragment(FIELD));
    } catch {
      // A document the schema cannot read (a hand-edited export, a node from a
      // later version) still needs a room to type in: start it empty rather
      // than refuse the page. The stored JSON is untouched until someone types.
      prosemirrorJSONToYXmlFragment(documentSchema(), { type: 'doc', content: [{ type: 'paragraph' }] }, doc.getXmlFragment(FIELD));
    }
  }, 'seed');
}

function fanOut(room: Room, event: RoomEvent, exceptClientId?: string | null) {
  for (const subscriber of room.subscribers.values()) {
    if (exceptClientId && subscriber.clientId === exceptClientId) continue;
    try {
      subscriber.send(event);
    } catch {
      room.subscribers.delete(subscriber.clientId);
    }
  }
}

/** The document, as the archive stores it. */
export function roomJSON(room: Room): unknown {
  return yXmlFragmentToProsemirrorJSON(room.doc.getXmlFragment(FIELD));
}

function persistRoom(room: Room) {
  if (!room.dirty) return;
  room.dirty = false;
  try {
    storeState(room.key, room.doc);
    if (room.lastActor) room.spec.persist(roomJSON(room), room.lastActor);
    fanOut(room, { event: 'persisted', data: { at: Date.now() } });
  } catch (err) {
    // Left dirty: the next keystroke, or the sweeper, tries again. A write that
    // fails must not take the room down with it — people are still typing.
    room.dirty = true;
    console.error(`[live] persist failed for ${room.key}:`, err);
  }
}

function openRoom(spec: RoomSpec): Room {
  const existing = hub.rooms.get(spec.key);
  if (existing) {
    existing.spec = spec;
    return existing;
  }

  const doc = new Y.Doc({ gc: true });
  const stored = loadState(spec.key);
  if (stored) Y.applyUpdate(doc, stored, 'load');
  else seedFragment(doc, spec.seed());

  const awareness = new Awareness(doc);
  // The server is nobody in the room: no state of its own on the wire.
  awareness.setLocalState(null);

  const room: Room = {
    key: spec.key,
    spec,
    doc,
    awareness,
    subscribers: new Map(),
    dirty: false,
    persistTimer: null,
    lastActor: null,
    idleSince: Date.now(),
  };

  let lastPersistAt = Date.now();
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'load' || origin === 'seed') return;
    const from = typeof origin === 'string' ? origin : null;
    fanOut(room, { event: 'update', data: { u: encode(update) } }, from);
    if (origin === 'reset') return;
    room.dirty = true;
    // Debounce, with a ceiling: someone typing a whole page still lands in the
    // archive every few seconds, not only when they stop.
    if (room.persistTimer && Date.now() - lastPersistAt < PERSIST_MAX_WAIT_MS) {
      clearTimeout(room.persistTimer);
      room.persistTimer = null;
    }
    if (!room.persistTimer) {
      room.persistTimer = setTimeout(() => {
        room.persistTimer = null;
        lastPersistAt = Date.now();
        persistRoom(room);
      }, PERSIST_DEBOUNCE_MS);
    }
  });

  awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    const changed = [...added, ...updated, ...removed];
    if (!changed.length) return;
    const from = typeof origin === 'string' ? origin : null;
    fanOut(room, { event: 'awareness', data: { a: encode(encodeAwarenessUpdate(awareness, changed)) } }, from);
  });

  hub.rooms.set(spec.key, room);
  if (!hub.sweeper) {
    hub.sweeper = setInterval(sweep, 60_000);
    // Never keep the process alive on our account.
    if (typeof hub.sweeper === 'object' && 'unref' in hub.sweeper) hub.sweeper.unref();
  }
  return room;
}

/** Rooms nobody is in are written out and let go of; dirty ones are retried. */
function sweep() {
  const cutoff = Date.now() - ROOM_IDLE_MS;
  for (const room of hub.rooms.values()) {
    if (room.dirty && !room.persistTimer) persistRoom(room);
    if (!room.subscribers.size && !room.dirty && room.idleSince < cutoff) {
      room.awareness.destroy();
      room.doc.destroy();
      hub.rooms.delete(room.key);
    }
  }
}

/* ------------------------------------------------------------ the doors */

/** Opens a room without joining it: the server restarted under a typing tab. */
export function warm(spec: RoomSpec) {
  openRoom(spec);
}

/**
 * The document as it stands, for a page to hand to the browser so the editor
 * has its text before the line is even open — no flash of an empty page, and
 * the room is warm by the time the first keystroke arrives.
 */
export function snapshot(spec: RoomSpec): { state: string; sv: string } {
  const room = openRoom(spec);
  return { state: encode(Y.encodeStateAsUpdate(room.doc)), sv: encode(Y.encodeStateVector(room.doc)) };
}

export function join(
  spec: RoomSpec,
  subscriber: Omit<Subscriber, 'yClient'> & { yClient: number | null },
  canEdit: boolean,
): () => void {
  const room = openRoom(spec);
  room.subscribers.set(subscriber.clientId, subscriber);
  room.idleSince = Date.now();

  const everyone = [...room.awareness.getStates().keys()];
  subscriber.send({
    event: 'sync',
    data: {
      state: encode(Y.encodeStateAsUpdate(room.doc)),
      sv: encode(Y.encodeStateVector(room.doc)),
      awareness: everyone.length ? encode(encodeAwarenessUpdate(room.awareness, everyone)) : '',
      canEdit,
    },
  });

  return () => {
    const current = hub.rooms.get(spec.key);
    if (!current) return;
    // Only this connection's own entry. A tab that reconnected has already
    // replaced it, and the old line's late goodbye must not throw the new one
    // out of the room — that was a real bug, found by React's development
    // double-mount, which opens a line twice in quick succession.
    if (current.subscribers.get(subscriber.clientId) !== subscriber) return;
    current.subscribers.delete(subscriber.clientId);
    // Their cursor leaves with them, for everyone still in the room.
    if (subscriber.yClient !== null) removeAwarenessStates(current.awareness, [subscriber.yClient], 'leave');
    if (!current.subscribers.size) current.idleSince = Date.now();
  };
}

/** A tab's keystrokes. Applied to the room; the doc's own listener fans them out. */
export function applyClientUpdate(key: string, clientId: string, update: string, actor: { id: string; isKeeper: boolean }) {
  const room = hub.rooms.get(key);
  if (!room) return false;
  room.lastActor = actor;
  Y.applyUpdate(room.doc, decode(update), clientId);
  return true;
}

/** A tab's cursor and name. Never stored past the room's life. */
export function applyClientAwareness(key: string, clientId: string, update: string) {
  const room = hub.rooms.get(key);
  if (!room) return false;
  applyAwarenessUpdate(room.awareness, decode(update), clientId);
  return true;
}

export function isOpen(key: string): boolean {
  return hub.rooms.has(key);
}

/**
 * The plain document was rewritten around the room — a revision put back, a
 * proposal approved, a Keeper's import. The shared document is made to match
 * as one update (so open tabs simply see the text change), the stale stored
 * state is dropped, and nothing is written back: the archive is already right.
 */
export function resetRoom(key: string, json: unknown) {
  forgetStoredState(key);
  const room = hub.rooms.get(key);
  if (!room) return;
  const content = json && typeof json === 'object' ? json : { type: 'doc', content: [{ type: 'paragraph' }] };
  try {
    const node = PmNode.fromJSON(documentSchema(), content);
    room.doc.transact(() => {
      updateYFragment(room.doc, room.doc.getXmlFragment(FIELD), node, { mapping: new Map(), isOMark: new Map() });
    }, 'reset');
  } catch (err) {
    console.error(`[live] reset failed for ${key}:`, err);
  }
  room.dirty = false;
  if (room.persistTimer) {
    clearTimeout(room.persistTimer);
    room.persistTimer = null;
  }
  storeState(key, room.doc);
}

/** Tell everyone in a room that the rest of the record changed (name, tags…). */
export function publishSaved(key: string, by: string | null, keys: string[]) {
  const room = hub.rooms.get(key);
  if (!room) return;
  fanOut(room, { event: 'saved', data: { by, keys } });
}

/** Everyone in a room, for tests and for the page's "who is here". */
export function subscriberIds(key: string): string[] {
  return [...(hub.rooms.get(key)?.subscribers.keys() ?? [])];
}

/** Write every dirty room now — on shutdown, and in tests. */
export function persistAll() {
  for (const room of hub.rooms.values()) {
    if (room.persistTimer) {
      clearTimeout(room.persistTimer);
      room.persistTimer = null;
    }
    persistRoom(room);
  }
}

/** Test seam: forget every room. Never called by the app. */
export function resetDocHub() {
  for (const room of hub.rooms.values()) {
    if (room.persistTimer) clearTimeout(room.persistTimer);
    room.awareness.destroy();
    room.doc.destroy();
  }
  hub.rooms.clear();
}
