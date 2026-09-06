'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveChanges, useLiveOptional } from '@/components/live/LiveProvider';
import { useMayType } from '@/components/you/AuthorProvider';
import { inkKey } from '@/lib/live/keys';
import {
  INK_BRUSHES,
  INK_ERASERS,
  type InkFrame,
  type InkKind,
  type InkLayerView,
  type InkMode,
  type InkStrokeView,
} from '@/lib/ink/types';

/**
 * §33: one tab's end of a tekenlaag.
 *
 * Three piles of strokes are kept apart, because they are true to different
 * degrees:
 *
 *   `layer`     what the server last said — the truth, pulled again whenever
 *               the `ink:{id}` key moves;
 *   `pending`   this tab's own finished strokes that the server has not yet
 *               confirmed. Drawn at once (a stroke that vanished for a round
 *               trip would look like a bug) and dropped the moment the layer
 *               that comes back contains them;
 *   `others`    strokes other people are drawing *right now*, built up from
 *               frames off the line, plus the ones they have just finished
 *               ("settling") until the pull brings the real thing — otherwise
 *               a stroke would blink out between their hand lifting and the
 *               signal arriving.
 *
 * Saves are serialised: one POST in flight, the next batch waits. That is
 * what lets undo of a stroke that is still on its way be a plain "lift it on
 * the next save" — the server sees the stroke land, then sees it lifted.
 */

export type DisplayStroke = Pick<InkStrokeView, 'id' | 'mode' | 'colour' | 'width' | 'points'>;

/** `brush` and `eraser` are indices into `INK_BRUSHES` and `INK_ERASERS`. */
export type InkTool = { mode: InkMode; colour: number; brush: number; eraser: number };

/** Own frames go out at most this often; the points in between are batched. */
const FRAME_MS = 60;
/** A finished stroke of somebody else's with no pull behind it for this long is let go. */
const SETTLE_TTL_MS = 20_000;
/** A stroke someone else is drawing whose frames stopped for this long is abandoned. */
const LIVE_TTL_MS = 10_000;
/** Points closer than this (in screen pixels) to the last one are not kept. */
export const MIN_STEP_PX = 1.5;

type Live = DisplayStroke & { at: number };

const newStrokeId = () => `s_${Math.random().toString(36).slice(2, 12)}`;

export function useInk({
  kind,
  id,
  initial,
  onError,
}: {
  kind: InkKind;
  id: string;
  initial: InkLayerView;
  /** A refusal from the server, in words for a toast. */
  onError?: (message: string) => void;
}) {
  const live = useLiveOptional();
  /*
   * §18b: rule 33 says drawing asks only whether you may *look* — the edit
   * dial does not reach the tekenlaag. It still asks who is drawing: a streek
   * is a write, `/api/ink` is behind `requireAuthor` like every other, and a
   * speler with no onderzoeker would draw a line the archive threw away. So
   * the pencil is not offered to them, which is a different question from the
   * Keeper's switch and is folded into the same `enabled` the toolbar reads.
   */
  const mayDraw = useMayType();
  const [layer, setLayer] = useState<InkLayerView>(initial);
  const [pending, setPending] = useState<DisplayStroke[]>([]);
  const [current, setCurrent] = useState<DisplayStroke | null>(null);
  const [others, setOthers] = useState<Map<string, Live>>(new Map());
  const [settling, setSettling] = useState<Map<string, Live>>(new Map());
  const [saving, setSaving] = useState(false);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  /* ------------------------------------------------------------- the pull */

  const pull = useCallback(async () => {
    const sentAt = Date.now();
    try {
      const response = await fetch(`/api/ink/${kind}/${id}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { layer?: InkLayerView };
      if (data.layer) {
        setLayer(data.layer);
        // Anything that finished settling before this pull was asked for is
        // now either in the layer or gone for good (lifted by undo, wiped by
        // a Keeper) — a finished stroke that the layer does not name must not
        // stay on screen until its TTL because two signals were coalesced.
        setSettling((map) => {
          const next = new Map([...map].filter(([, stroke]) => stroke.at > sentAt));
          return next.size === map.size ? map : next;
        });
      }
    } catch {
      /* the next signal tries again */
    }
  }, [kind, id]);

  useLiveChanges([inkKey(id)], () => void pull());

  // The page was rendered with the layer as it was *then*; a stroke saved in
  // the moment between that render and the line coming up would be missed,
  // because a signal is only fanned to a line that is open. One pull when the
  // line is up closes the gap — and a reconnect is a fresh pull too.
  const status = live?.status;
  useEffect(() => {
    if (status === 'live') void pull();
  }, [status, pull]);

  // Whatever the server now has, this tab need not remember on its own.
  useEffect(() => {
    const known = new Set(layer.strokes.map((stroke) => stroke.id));
    setPending((list) => (list.some((stroke) => known.has(stroke.id)) ? list.filter((stroke) => !known.has(stroke.id)) : list));
    setSettling((map) => {
      if (![...map.keys()].some((key) => known.has(key))) return map;
      const next = new Map(map);
      for (const key of known) next.delete(key);
      return next;
    });
  }, [layer]);

  /* ------------------------------------------------------------- saving */

  const toSend = useRef<DisplayStroke[]>([]);
  const toLift = useRef<string[]>([]);
  const inFlight = useRef(false);
  const again = useRef(false);

  const flush = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    const strokes = toSend.current;
    const undo = toLift.current;
    if (!strokes.length && !undo.length) return;
    toSend.current = [];
    toLift.current = [];
    inFlight.current = true;
    setSaving(true);
    try {
      const response = await fetch(`/api/ink/${kind}/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ strokes, undo }),
      });
      const data = (await response.json().catch(() => ({}))) as { layer?: InkLayerView; refused?: number; error?: string };
      if (!response.ok) {
        // Refused for good (the switch is off, the layer is full): the strokes
        // are not kept for a retry — the person is told, and they are gone.
        const sent = new Set(strokes.map((stroke) => stroke.id));
        setPending((list) => list.filter((stroke) => !sent.has(stroke.id)));
        onErrorRef.current?.(data.error ?? 'Tekenen is niet gelukt.');
        if (data.layer) setLayer(data.layer);
        return;
      }
      if (data.layer) setLayer(data.layer);
      if (data.refused) onErrorRef.current?.('De tekenlaag is vol. Vraag een Keeper hem te wissen.');
    } catch {
      // No answer at all: keep them for the next try.
      toSend.current = [...strokes, ...toSend.current];
      toLift.current = [...undo, ...toLift.current];
      onErrorRef.current?.('Geen verbinding — de streek is nog niet opgeslagen.');
    } finally {
      inFlight.current = false;
      setSaving(false);
      if (again.current) {
        again.current = false;
        void flush();
      }
    }
  }, [kind, id]);

  /* ---------------------------------------------------------- own frames */

  const frameBuffer = useRef<InkFrame | null>(null);
  const frameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportInk = live?.reportInk;

  const sendFrame = useCallback(() => {
    frameTimer.current = null;
    const frame = frameBuffer.current;
    frameBuffer.current = null;
    if (frame && reportInk) reportInk([frame]);
  }, [reportInk]);

  const queueFrame = useCallback(
    (stroke: DisplayStroke, points: number[], flag?: 'e' | 'a') => {
      const buffered = frameBuffer.current;
      if (buffered && buffered.id === stroke.id) {
        buffered.p.push(...points);
        if (flag) buffered[flag] = 1;
      } else {
        // A different stroke than the one buffered: send that one first.
        if (buffered) reportInk?.([buffered]);
        const frame: InkFrame = { id: stroke.id, m: stroke.mode, k: stroke.colour, w: stroke.width, p: [...points] };
        if (flag) frame[flag] = 1;
        frameBuffer.current = frame;
      }
      if (flag) {
        if (frameTimer.current) clearTimeout(frameTimer.current);
        sendFrame();
        return;
      }
      if (!frameTimer.current) frameTimer.current = setTimeout(sendFrame, FRAME_MS);
    },
    [reportInk, sendFrame],
  );

  /* ------------------------------------------------------------ drawing */

  const currentRef = useRef<DisplayStroke | null>(null);
  const undoStack = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  /**
   * Start a stroke. `width` is already in the place's own units — the caller
   * divides the brush's screen width by its zoom — and `x`/`y` likewise.
   */
  const mayDrawRef = useRef(mayDraw);
  mayDrawRef.current = mayDraw;

  const begin = useCallback(
    (tool: InkTool, x: number, y: number, pressure: number, widthScale: number) => {
      // §18b: belt and braces behind `enabled` — a hand already on the glass
      // when the answer changed must not start a streek nobody may sign.
      if (!mayDrawRef.current) return;
      const screenWidth =
        tool.mode === 'erase' ? INK_ERASERS[tool.eraser] ?? INK_ERASERS[1] : INK_BRUSHES[tool.brush] ?? INK_BRUSHES[1];
      const stroke: DisplayStroke = {
        id: newStrokeId(),
        mode: tool.mode,
        colour: tool.colour,
        width: screenWidth / (widthScale || 1),
        points: [x, y, pressure],
      };
      currentRef.current = stroke;
      setCurrent(stroke);
      queueFrame(stroke, stroke.points);
    },
    [queueFrame],
  );

  const extend = useCallback(
    (x: number, y: number, pressure: number) => {
      const stroke = currentRef.current;
      if (!stroke) return;
      stroke.points.push(x, y, pressure);
      setCurrent({ ...stroke, points: stroke.points });
      queueFrame(stroke, [x, y, pressure]);
    },
    [queueFrame],
  );

  const end = useCallback(() => {
    const stroke = currentRef.current;
    currentRef.current = null;
    setCurrent(null);
    if (!stroke) return;
    // A tap with no movement is a dot: make it a two-point stroke so it draws.
    if (stroke.points.length === 3) stroke.points.push(stroke.points[0] + 0.01, stroke.points[1], stroke.points[2]);
    queueFrame(stroke, [], 'e');
    setPending((list) => [...list, stroke]);
    undoStack.current.push(stroke.id);
    setCanUndo(true);
    toSend.current.push(stroke);
    void flush();
  }, [flush, queueFrame]);

  const abort = useCallback(() => {
    const stroke = currentRef.current;
    currentRef.current = null;
    setCurrent(null);
    if (stroke) queueFrame(stroke, [], 'a');
  }, [queueFrame]);

  /** Lift one's own last stroke of this tab-session. */
  const undo = useCallback(() => {
    const strokeId = undoStack.current.pop();
    setCanUndo(undoStack.current.length > 0);
    if (!strokeId) return;
    // Not sent yet: simply do not send it.
    const waiting = toSend.current.findIndex((stroke) => stroke.id === strokeId);
    if (waiting !== -1) {
      toSend.current.splice(waiting, 1);
      setPending((list) => list.filter((stroke) => stroke.id !== strokeId));
      return;
    }
    setPending((list) => list.filter((stroke) => stroke.id !== strokeId));
    setLayer((current) => ({ ...current, strokes: current.strokes.filter((stroke) => stroke.id !== strokeId) }));
    toLift.current.push(strokeId);
    void flush();
  }, [flush]);

  /* ------------------------------------------------------- other hands */

  const onInk = live?.onInk;
  const othersRef = useRef<Map<string, Live>>(new Map());
  useEffect(() => {
    if (!onInk) return;
    return onInk((clientId, frames) => {
      // Worked out on a ref, synchronously, and only then handed to state:
      // an updater function may run later (or twice), and a stroke that has
      // just finished must move to `settling` in the same breath.
      const now = Date.now();
      const map = new Map(othersRef.current);
      const finished: Live[] = [];
      for (const frame of frames) {
        const known = map.get(clientId);
        let stroke: Live;
        if (known && known.id === frame.id) {
          stroke = { ...known, points: [...known.points, ...frame.p], at: now };
        } else {
          // A new stroke from this hand: whatever it was drawing before is over.
          if (known && known.points.length >= 6) finished.push(known);
          stroke = { id: frame.id, mode: frame.m, colour: frame.k, width: frame.w, points: [...frame.p], at: now };
        }
        if (frame.a === 1) {
          map.delete(clientId);
          continue;
        }
        if (frame.e === 1) {
          map.delete(clientId);
          if (stroke.points.length >= 6) finished.push(stroke);
          continue;
        }
        map.set(clientId, stroke);
      }
      othersRef.current = map;
      setOthers(map);
      if (finished.length) {
        setSettling((current) => {
          const next = new Map(current);
          for (const stroke of finished) next.set(stroke.id, stroke);
          return next;
        });
      }
    });
  }, [onInk]);

  useEffect(() => {
    const sweep = setInterval(() => {
      const now = Date.now();
      const kept = new Map([...othersRef.current].filter(([, stroke]) => now - stroke.at < LIVE_TTL_MS));
      if (kept.size !== othersRef.current.size) {
        othersRef.current = kept;
        setOthers(kept);
      }
      setSettling((map) => {
        const next = new Map([...map].filter(([, stroke]) => now - stroke.at < SETTLE_TTL_MS));
        return next.size === map.size ? map : next;
      });
    }, 2000);
    return () => clearInterval(sweep);
  }, []);

  useEffect(() => {
    return () => {
      if (frameTimer.current) clearTimeout(frameTimer.current);
    };
  }, []);

  /* ---------------------------------------------------------- the switch */

  /** Keeper: flip the switch or wipe. Resolves to whether it took. */
  const keeper = useCallback(
    async (patch: { enabled?: boolean; clear?: boolean }): Promise<boolean> => {
      try {
        const response = await fetch(`/api/ink/${kind}/${id}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = (await response.json().catch(() => ({}))) as { layer?: InkLayerView; error?: string };
        if (!response.ok) {
          onErrorRef.current?.(data.error ?? 'Dat is niet gelukt.');
          return false;
        }
        if (data.layer) setLayer(data.layer);
        if (patch.clear) {
          setPending([]);
          setSettling(new Map());
          undoStack.current = [];
          setCanUndo(false);
        }
        return true;
      } catch {
        onErrorRef.current?.('Geen verbinding.');
        return false;
      }
    },
    [kind, id],
  );

  /* ------------------------------------------------------------ to draw */

  /**
   * Everything to put on the canvas, in the order it should be drawn: the
   * layer as the server has it, then what is settling, then this tab's own
   * unsaved strokes, then everybody's strokes in progress — ours last, so
   * the line under the pen is always on top.
   */
  const strokes = useMemo<DisplayStroke[]>(() => {
    const out: DisplayStroke[] = [...layer.strokes];
    for (const stroke of settling.values()) out.push(stroke);
    out.push(...pending);
    for (const stroke of others.values()) out.push(stroke);
    if (current) out.push(current);
    return out;
  }, [layer.strokes, settling, pending, others, current]);

  /** How many at the front of `strokes` are immutable — what `InkCanvas` may cache. */
  const stableCount = layer.strokes.length + settling.size + pending.length;

  return {
    layer,
    strokes,
    stableCount,
    enabled: layer.enabled && mayDraw,
    drawing: current !== null,
    saving,
    canUndo,
    begin,
    extend,
    end,
    abort,
    undo,
    keeper,
    pull,
  };
}

export type InkHandle = ReturnType<typeof useInk>;
