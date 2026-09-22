'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * §95: what a handle in a short text means, in the browser.
 *
 * A short text holds `⟦h⟧` and nothing else about the artikel it names. The
 * name, the slug and the colour are looked up per reader on the server
 * (`resolveHandles`) and reach the browser two ways:
 *
 *   1. **with the page.** A page that prints short texts resolves their handles
 *      while it renders and hands the answer down in `<ShortChips map>` — so the
 *      first paint already has its chips, with no request and no flash;
 *   2. **on demand.** Anything the page did not know (a chip somebody else just
 *      typed into the room, a card in a list) is asked for in one batched
 *      `POST /api/mentions { handles }` per tick and kept in a cache that lives
 *      only in the browser.
 *
 * A handle the reader may not follow is simply not in either answer. It is
 * remembered as `null` — *nothing to draw* — which is also what a handle that
 * never existed and an artikel that was destroyed are. The three are the same
 * on purpose (rule 1).
 *
 * The cache is module state and is never touched on the server: a module on the
 * server is shared by every request, and one reader's chips in another reader's
 * page would be exactly the leak this whole round is about.
 */

export type ShortChip = {
  entryId: string;
  name: string;
  slug: string;
  icon: string | null;
  colour: string | null;
};

/** handle → chip, or `null`: nothing to draw (see `shortChipsFor` on the server). */
export type ShortChipMap = Record<string, ShortChip | null>;

const ChipsContext = createContext<ShortChipMap | null>(null);

/** Hands the chips a page resolved on the server to everything below it. Nests: the inner map wins. */
export function ShortChips({ map, children }: { map: ShortChipMap | null | undefined; children: ReactNode }) {
  const outer = useContext(ChipsContext);
  const merged = useMemo(() => (outer ? { ...outer, ...(map ?? {}) } : (map ?? {})), [outer, map]);
  return <ChipsContext.Provider value={merged}>{children}</ChipsContext.Provider>;
}

const browser = typeof window !== 'undefined';
const cache = new Map<string, ShortChip | null>();
const waiting = new Map<string, Set<() => void>>();
let queued = false;

/** The editor learns a chip the moment it mints one; nobody has to ask for it again. */
export function rememberChip(handle: string, chip: ShortChip | null) {
  if (!browser) return;
  cache.set(handle, chip);
}

function flush() {
  queued = false;
  const handles = [...waiting.keys()].slice(0, 300);
  if (!handles.length) return;
  const takers = handles.map((handle) => waiting.get(handle)!);
  for (const handle of handles) waiting.delete(handle);
  const settle = (answer: Record<string, ShortChip> | null) => {
    if (cache.size > 2000) cache.clear();
    handles.forEach((handle, i) => {
      // Offline: not remembered, so the next render asks again.
      if (answer) cache.set(handle, answer[handle] ?? null);
      for (const taker of takers[i]) taker();
    });
  };
  void fetch('/api/mentions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ handles }),
  })
    .then((r) => (r.ok ? (r.json() as Promise<{ handles?: Record<string, ShortChip> }>) : null))
    .then((data) => settle(data?.handles ?? (data ? {} : null)))
    .catch(() => settle(null));
  if (waiting.size && !queued) {
    queued = true;
    queueMicrotask(flush);
  }
}

/**
 * The chips of these handles for this reader. `undefined` for a handle still on
 * its way, `null` for one there is nothing to draw for, and the chip otherwise.
 */
export function useShortChips(handles: readonly string[]): Map<string, ShortChip | null | undefined> {
  const page = useContext(ChipsContext);
  const [, bump] = useState(0);
  const key = handles.join(' ');
  useEffect(() => {
    if (!browser) return;
    const unknown = handles.filter((handle) => !(page && handle in page) && !cache.has(handle));
    if (!unknown.length) return;
    let alive = true;
    const taker = () => {
      if (alive) bump((n) => n + 1);
    };
    for (const handle of unknown) {
      const set = waiting.get(handle) ?? new Set<() => void>();
      set.add(taker);
      waiting.set(handle, set);
    }
    if (!queued) {
      queued = true;
      queueMicrotask(flush);
    }
    return () => {
      alive = false;
      for (const handle of unknown) waiting.get(handle)?.delete(taker);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page]);
  const out = new Map<string, ShortChip | null | undefined>();
  for (const handle of handles) {
    if (page && handle in page) out.set(handle, page[handle] ?? null);
    else if (browser && cache.has(handle)) out.set(handle, cache.get(handle) ?? null);
    else out.set(handle, undefined);
  }
  return out;
}

/** The chips the page brought with it (or an empty map), for code that is not a render — the editor. */
export function usePageChips(): ShortChipMap {
  return useContext(ChipsContext) ?? EMPTY;
}
const EMPTY: ShortChipMap = {};

/** What is known about one handle right now: the page's answer first, then the browser's cache. */
export function knownChip(page: ShortChipMap, handle: string): ShortChip | null | undefined {
  if (handle in page) return page[handle] ?? null;
  if (browser && cache.has(handle)) return cache.get(handle) ?? null;
  return undefined;
}

/** Ask for these handles (batched with everything else this tick); resolves once they are known. */
export function requestChips(handles: readonly string[]): Promise<void> {
  const unknown = handles.filter((handle) => !cache.has(handle));
  if (!browser || !unknown.length) return Promise.resolve();
  return new Promise((resolve) => {
    let left = unknown.length;
    const done = () => {
      left -= 1;
      if (left <= 0) resolve();
    };
    for (const handle of unknown) {
      const set = waiting.get(handle) ?? new Set<() => void>();
      set.add(done);
      waiting.set(handle, set);
    }
    if (!queued) {
      queued = true;
      queueMicrotask(flush);
    }
  });
}
