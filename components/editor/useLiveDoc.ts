'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { useLive, type RoomHandle } from '@/components/live/LiveProvider';

/** The shared text as plain ProseMirror JSON — for a proposal, or a copy. */
export function liveBodyJSON(doc: Y.Doc): unknown {
  return yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('default'));
}

/**
 * §20: one tab's end of a room of shared text.
 *
 * Holds the Yjs document the editor binds to, keeps it in step with the room
 * over the tab's site line (§21 — one connection per tab, rooms multiplexed on
 * it), and carries everyone's cursor through Yjs awareness. The editor itself
 * never talks to the network: it edits the document, the document emits an
 * update, this sends it. That separation is what makes a dropped line
 * harmless — edits keep landing in the local document and go up in one batch
 * when the line is back, and Yjs merges them wherever they arrive.
 *
 * The same hook serves a `fields` room (a record's short texts as named
 * Y.Texts): nothing here cares what is inside the document.
 *
 * `initialState` lets the page hand the document over in the HTML, so the
 * text is there before the line is open and nothing flashes empty.
 */

export type LiveUser = { name: string; colour: string };
export type LiveStatus = 'connecting' | 'live' | 'offline';
export type LivePerson = { key: number; name: string; colour: string };
/** Where this tab's own keystrokes stand: nothing typed, on their way, or in the archive. */
export type LiveSave = 'idle' | 'saving' | 'saved';

/** Keystrokes settle this long before going up, so a word is one request, not five. */
const UPDATE_BATCH_MS = 80;
/** Cursors move constantly; this is the floor between awareness posts. */
const AWARENESS_THROTTLE_MS = 120;
/** Awareness states expire server-side after 30 s unless renewed. */
const AWARENESS_RENEW_MS = 12_000;

function fromBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function useLiveDoc({
  room,
  user,
  initialState,
  enabled = true,
}: {
  room: string;
  user: LiveUser;
  /** The document as the server had it when the page was made (base64 Yjs update). */
  initialState?: string | null;
  enabled?: boolean;
}) {
  const live = useLive();
  const clientId = live.clientId;
  const handleRef = useRef<RoomHandle | null>(null);

  const [doc] = useState(() => {
    const fresh = new Y.Doc();
    if (initialState) {
      try {
        Y.applyUpdate(fresh, fromBase64(initialState), 'remote');
      } catch {
        /* a bad snapshot is not fatal: the line brings the real one */
      }
    }
    return fresh;
  });
  const [awareness] = useState(() => new Awareness(doc));
  const [synced, setSynced] = useState(Boolean(initialState));
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const [people, setPeople] = useState<LivePerson[]>([]);
  const [savedAt, setSavedAt] = useState<{ at: number; by: string | null; keys: string[] } | null>(null);
  const [save, setSave] = useState<LiveSave>('idle');

  /** The provider shape Tiptap's cursor extension expects: something with an awareness. */
  const provider = useMemo(() => ({ awareness }), [awareness]);

  /* ------------------------------------------------------------ outbound */

  const pendingUpdates = useRef<Uint8Array[]>([]);
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awarenessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awarenessPending = useRef<Set<number>>(new Set());
  const lastAwarenessPost = useRef(0);
  const retryDelay = useRef(500);

  /**
   * Up the site line, to this room. `down` is a line that is not there (the
   * update is kept and retried); `refused` is a line that is there and said no
   * (look-only) — that update is dropped, because it will never be taken.
   */
  const post = useCallback(async (body: { update?: string; awareness?: string }): Promise<'ok' | 'down' | 'refused'> => {
    const handle = handleRef.current;
    if (!handle) return 'down';
    let result: 'ok' | 'down' | 'refused' = 'ok';
    if (body.update) result = await handle.sendUpdate(body.update);
    if (body.awareness) {
      const ok = await handle.sendAwareness(body.awareness);
      if (!ok && result === 'ok') result = 'down';
    }
    return result;
  }, []);

  const flushUpdates = useCallback(async () => {
    updateTimer.current = null;
    if (!pendingUpdates.current.length) return;
    const batch = pendingUpdates.current;
    pendingUpdates.current = [];
    const merged = batch.length === 1 ? batch[0] : Y.mergeUpdates(batch);
    let result: 'ok' | 'down' | 'refused' = 'down';
    try {
      result = await post({ update: toBase64(merged) });
    } catch {
      result = 'down';
    }
    if (result === 'ok') {
      retryDelay.current = 500;
      return;
    }
    if (result === 'refused') {
      // The server will not take this tab's keystrokes: the editor is put to
      // read-only and the batch is dropped rather than retried for ever.
      setCanEdit(false);
      setSave('idle');
      return;
    }
    // Put it back at the front and try again later: nothing typed is lost,
    // and Yjs will merge it whenever it finally arrives.
    pendingUpdates.current.unshift(merged);
    updateTimer.current = setTimeout(() => void flushUpdates(), retryDelay.current);
    retryDelay.current = Math.min(15_000, retryDelay.current * 2);
  }, [post]);

  const flushAwareness = useCallback(() => {
    awarenessTimer.current = null;
    const changed = [...awarenessPending.current];
    awarenessPending.current = new Set();
    if (!changed.length) return;
    lastAwarenessPost.current = Date.now();
    void post({ awareness: toBase64(encodeAwarenessUpdate(awareness, changed)) }).catch(() => undefined);
  }, [awareness, post]);

  /* -------------------------------------------------------- the document */

  useEffect(() => {
    if (!enabled) return;
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      setSave('saving');
      pendingUpdates.current.push(update);
      if (!updateTimer.current) updateTimer.current = setTimeout(() => void flushUpdates(), UPDATE_BATCH_MS);
    };
    doc.on('update', onUpdate);
    return () => {
      doc.off('update', onUpdate);
    };
  }, [doc, enabled, flushUpdates]);

  useEffect(() => {
    if (!enabled) return;
    const onAwareness = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      // Everyone in the room, for the strip at the top of the page.
      const states = awareness.getStates();
      const out: LivePerson[] = [];
      for (const [key, state] of states) {
        const person = (state as { user?: { name?: string; colour?: string; color?: string } }).user;
        if (!person?.name) continue;
        out.push({ key, name: person.name, colour: person.colour ?? person.color ?? 'var(--ink-muted)' });
      }
      out.sort((a, b) => a.key - b.key);
      setPeople(out);

      if (origin === 'remote') return;
      for (const key of [...added, ...updated, ...removed]) awarenessPending.current.add(key);
      if (awarenessTimer.current) return;
      const wait = Math.max(0, AWARENESS_THROTTLE_MS - (Date.now() - lastAwarenessPost.current));
      awarenessTimer.current = setTimeout(flushAwareness, wait);
    };
    awareness.on('update', onAwareness);
    // Our own name and ink, and a renewal so the server never times us out.
    // Set whole, not by field: `setLocalStateField` is a no-op once the local
    // state has been cleared, and a remount (development's double mount, a
    // fast refresh) clears it on the way out.
    const announce = () => {
      const current = (awareness.getLocalState() ?? {}) as Record<string, unknown>;
      awareness.setLocalState({ ...current, user: { name: user.name, colour: user.colour, color: user.colour } });
    };
    announce();
    const renew = setInterval(announce, AWARENESS_RENEW_MS);
    return () => {
      clearInterval(renew);
      awareness.off('update', onAwareness);
    };
  }, [awareness, enabled, flushAwareness, user.colour, user.name]);

  /* ------------------------------------------------------------- the line */

  useEffect(() => {
    if (!enabled) return;
    let joined = true;

    const onEvent = (event: string, raw: unknown) => {
      if (!joined) return;
      try {
        if (event === 'sync') {
          const data = raw as { state: string; sv: string; awareness: string; canEdit: boolean };
          Y.applyUpdate(doc, fromBase64(data.state), 'remote');
          if (data.awareness) applyAwarenessUpdate(awareness, fromBase64(data.awareness), 'remote');
          setCanEdit(data.canEdit);
          setSynced(true);
          // Whatever this tab did while the line was down — or before it was
          // ever up — goes over now, as the difference against what the server
          // has. Yjs makes that exact and idempotent.
          const diff = Y.encodeStateAsUpdate(doc, fromBase64(data.sv));
          if (diff.byteLength > 2) {
            pendingUpdates.current.push(diff);
            if (!updateTimer.current) updateTimer.current = setTimeout(() => void flushUpdates(), 0);
          }
          // And our name, so we appear on everyone's page at once.
          const current = (awareness.getLocalState() ?? {}) as Record<string, unknown>;
          awareness.setLocalState({ ...current, user: { name: user.name, colour: user.colour, color: user.colour } });
        } else if (event === 'update') {
          Y.applyUpdate(doc, fromBase64((raw as { u: string }).u), 'remote');
        } else if (event === 'awareness') {
          applyAwarenessUpdate(awareness, fromBase64((raw as { a: string }).a), 'remote');
        } else if (event === 'persisted') {
          // Nothing of ours is still on its way, so the archive has it all.
          if (!pendingUpdates.current.length) setSave((current) => (current === 'saving' ? 'saved' : current));
        } else if (event === 'saved') {
          const data = raw as { by: string | null; keys: string[] };
          setSavedAt({ at: Date.now(), by: data.by, keys: data.keys ?? [] });
        }
      } catch {
        /* a malformed frame is not worth leaving the room for */
      }
    };

    const handle = live.joinRoom(room, doc.clientID, { onEvent });
    handleRef.current = handle;

    return () => {
      joined = false;
      if (updateTimer.current) {
        clearTimeout(updateTimer.current);
        updateTimer.current = null;
      }
      if (awarenessTimer.current) {
        clearTimeout(awarenessTimer.current);
        awarenessTimer.current = null;
      }
      // Leave properly: our cursor goes, and the last keystrokes go with it.
      awareness.setLocalState(null);
      const left = [...awarenessPending.current];
      awarenessPending.current = new Set();
      if (pendingUpdates.current.length) {
        void handle.sendUpdate(toBase64(Y.mergeUpdates(pendingUpdates.current))).catch(() => undefined);
        pendingUpdates.current = [];
      }
      if (left.length) void handle.sendAwareness(toBase64(encodeAwarenessUpdate(awareness, left))).catch(() => undefined);
      handleRef.current = null;
      handle.leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awareness, doc, enabled, flushUpdates, live.joinRoom, room, user.colour, user.name]);

  // The word for the line is the site line's word: one connection, one truth.
  useEffect(() => {
    setStatus(live.status);
  }, [live.status]);

  // The awareness keeps a timer, so it has to be destroyed when the page goes
  // — but a moment late. React's development mode mounts, unmounts and mounts
  // again to find effects that cannot survive it, and destroying the
  // awareness on that first unmount would strip the editor's cursor plugin of
  // its listener for good. A remount cancels the pending destroy.
  const destroyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (destroyTimer.current) {
      clearTimeout(destroyTimer.current);
      destroyTimer.current = null;
    }
    return () => {
      destroyTimer.current = setTimeout(() => awareness.destroy(), 150);
    };
  }, [awareness]);

  /** Everyone but this tab. */
  const others = useMemo(() => people.filter((person) => person.key !== doc.clientID), [people, doc.clientID]);

  return { doc, awareness, provider, synced, status, canEdit, others, savedAt, save, clientId };
}
