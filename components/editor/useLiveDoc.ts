'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';

/** The shared text as plain ProseMirror JSON — for a proposal, or a copy. */
export function liveBodyJSON(doc: Y.Doc): unknown {
  return yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('default'));
}

/**
 * §20: one tab's end of a room of shared text.
 *
 * Holds the Yjs document the editor binds to, keeps it in step with the room
 * over the same kind of line a board uses (server-sent events down, POSTs
 * up), and carries everyone's cursor through Yjs awareness. The editor itself
 * never talks to the network: it edits the document, the document emits an
 * update, this sends it. That separation is what makes a dropped line
 * harmless — edits keep landing in the local document and go up in one batch
 * when the line is back, and Yjs merges them wherever they arrive.
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
  const clientIdRef = useRef('');
  if (!clientIdRef.current) clientIdRef.current = `t_${Math.random().toString(36).slice(2, 12)}`;
  const clientId = clientIdRef.current;

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

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch(`/api/live/${encodeURIComponent(room)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, ...body }),
        keepalive: true,
      });
      if (response.status === 403) setCanEdit(false);
      return response.ok;
    },
    [room, clientId],
  );

  const flushUpdates = useCallback(async () => {
    updateTimer.current = null;
    if (!pendingUpdates.current.length) return;
    const batch = pendingUpdates.current;
    pendingUpdates.current = [];
    const merged = batch.length === 1 ? batch[0] : Y.mergeUpdates(batch);
    try {
      const ok = await post({ update: toBase64(merged) });
      if (!ok) throw new Error('refused');
      retryDelay.current = 500;
    } catch {
      // Put it back at the front and try again later: nothing typed is lost,
      // and Yjs will merge it whenever it finally arrives.
      pendingUpdates.current.unshift(merged);
      setStatus('offline');
      updateTimer.current = setTimeout(() => void flushUpdates(), retryDelay.current);
      retryDelay.current = Math.min(15_000, retryDelay.current * 2);
    }
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
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let failures = 0;

    const open = () => {
      if (stopped) return;
      source = new EventSource(`/api/live/${encodeURIComponent(room)}?c=${encodeURIComponent(clientId)}&y=${doc.clientID}`);

      source.addEventListener('sync', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as {
            state: string;
            sv: string;
            awareness: string;
            canEdit: boolean;
          };
          Y.applyUpdate(doc, fromBase64(data.state), 'remote');
          if (data.awareness) applyAwarenessUpdate(awareness, fromBase64(data.awareness), 'remote');
          setCanEdit(data.canEdit);
          setSynced(true);
          setStatus('live');
          failures = 0;
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
        } catch {
          /* a malformed frame is not worth tearing the line down for */
        }
      });

      source.addEventListener('update', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { u: string };
          Y.applyUpdate(doc, fromBase64(data.u), 'remote');
        } catch {
          /* ignore */
        }
      });

      source.addEventListener('awareness', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { a: string };
          applyAwarenessUpdate(awareness, fromBase64(data.a), 'remote');
        } catch {
          /* ignore */
        }
      });

      source.addEventListener('persisted', () => {
        // Nothing of ours is still on its way, so the archive has it all.
        if (!pendingUpdates.current.length) setSave((current) => (current === 'saving' ? 'saved' : current));
      });

      source.addEventListener('saved', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { by: string | null; keys: string[] };
          setSavedAt({ at: Date.now(), by: data.by, keys: data.keys ?? [] });
        } catch {
          /* ignore */
        }
      });

      source.onerror = () => {
        source?.close();
        source = null;
        failures += 1;
        setStatus('offline');
        if (stopped) return;
        retry = setTimeout(open, Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)));
      };
    };

    open();

    return () => {
      stopped = true;
      source?.close();
      if (retry) clearTimeout(retry);
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
      const body: Record<string, unknown> = {};
      if (pendingUpdates.current.length) {
        body.update = toBase64(Y.mergeUpdates(pendingUpdates.current));
        pendingUpdates.current = [];
      }
      if (left.length) body.awareness = toBase64(encodeAwarenessUpdate(awareness, left));
      if (Object.keys(body).length) void post(body).catch(() => undefined);
    };
  }, [awareness, clientId, doc, enabled, flushUpdates, post, room, user.colour, user.name]);

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
