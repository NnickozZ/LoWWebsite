'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { MentionText } from '@/components/ui/MentionPopover';
import { useLiveChanges } from '@/components/live/LiveProvider';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { useAuthorGate, useMayType } from '@/components/you/AuthorProvider';
import { useIsPhone } from '@/components/useIsPhone';
import { fitUpload } from '@/components/shrinkImage';
import { imageFromClipboard, pasteIsForTyping, uploadForm, SHRUNK_NOTICE } from '@/lib/upload';
import type { LiveUser } from '@/components/editor/useLiveDoc';
import type { AccessSettings } from '@/lib/access';
import { timelineKey } from '@/lib/live/keys';
import type { TimelineEvent, TimelineSummary } from '@/lib/timelines/service';
import { InkCanvas, type Project } from '@/components/ink/InkCanvas';
import { InkCapture, InkKeeperControls, InkToolbar, useInkTool } from '@/components/ink/InkTools';
import { useInk } from '@/components/ink/useInk';
import type { InkFormat, InkLayerView } from '@/lib/ink/types';
import { TIMELINE_INK_FORMAT, inkFromScreen, inkWidthScale, projectInk } from '@/lib/timelines/inkSpace';
import {
  anchorSpan,
  applyAnchor,
  clampPrecision,
  clampToAnchor,
  fitView,
  formatWhen,
  maxPxPerSecond,
  MIN_PX_PER_SECOND,
  parseDutchDate,
  placeTags,
  snapTo,
  ticksBetween,
  type AnchorUnit,
  type Precision,
  type Scale,
  type Side,
} from '@/lib/timelines/time';
import {
  EditEventSheet,
  NewEventSheet,
  NOTE_COLOUR,
  TimelineSettingsSheet,
  type EventPatchInput,
  type NewEventInput,
} from './EventSheets';

/**
 * §32: the tijdlijn itself.
 *
 * A ruled axis across the middle of a stage; drag to move along it, scroll or
 * pinch to zoom, and every gebeurtenis hangs off it on a stem — above, below,
 * above, below, in time order (Nick: "up, down, up, down"), stepping out a
 * lane when two on the same side would collide. A gebeurtenis is a mark on
 * the axis and a tag with its name; click either and a small window folds
 * out with the picture, the moment, and what this tijdlijn has to say about
 * it. An artikel gebeurtenis wears the icon and the colour of its soort and a
 * larger mark, because an artikel is the archive saying this mattered; a note
 * is a plain dot in ink.
 *
 * Everything drawn here is in stage pixels from one view — an origin (the
 * moment at the left edge) and a scale (pixels per second). Nothing is inside
 * a transformed layer, so a tag is as crisp at a thousand years as at a
 * minute (rule 15).
 *
 * The folded-out windows are *not* state: which ones are open lives in this
 * tab alone. They start closed — a tijdlijn of forty gebeurtenissen with
 * every window open is a wall of paper — and "Alles tonen" opens them all.
 */

/**
 * §34: the stage has no height of its own. `.timeline-stage` is `flex: 1` in a
 * column that is as tall as the screen, and this component *measures* what it
 * was given — width and height both — with one ResizeObserver. Everything that
 * used to be reckoned from a constant is reckoned from `stageH` now: the axis
 * across the middle, the ink layer's `project` (which hangs a stroke off that
 * axis), the lanes the tags step out into, and where a folded-out window
 * opens. The number below is only what to draw with in the one frame before
 * the first measurement; the floor is `.timeline-stage`'s own `min-height`.
 */
const UNMEASURED_STAGE_H = 420;
/** Distance from the axis to the nearest lane of tags, and between lanes. */
const LANE_0 = 46;
const LANE_STEP = 34;
const TAG_H = 24;
const POPOUT_W = 250;

type View = { origin: number; pxPerSecond: number };

type Placed = {
  event: TimelineEvent;
  x: number;
  side: Side;
  lane: number;
};

function tagWidth(name: string): number {
  return Math.max(64, Math.min(170, name.length * 6.6 + 30));
}

export function TimelineCanvas({
  timeline,
  initialEvents,
  canEdit: allowed,
  viewerId,
  isKeeper,
  peopleNames,
  liveUser,
  access,
  placing,
  focusEventId,
  initialInk,
}: {
  timeline: TimelineSummary;
  initialEvents: TimelineEvent[];
  /** §33: the tekenlaag, as this viewer may see it. */
  initialInk: InkLayerView;
  canEdit: boolean;
  viewerId: string;
  isKeeper: boolean;
  peopleNames: Record<string, string>;
  liveUser: LiveUser;
  access: { settings: AccessSettings; canManage: boolean };
  /** An artikel carried here from its own page: open the date form for it. */
  placing: { entryId: string; name: string } | null;
  /** `?event=`: open this one and bring it into view. */
  focusEventId: string | null;
}) {
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  /*
   * §18b: every gebeurtenis on this axis is signed. Without an onderzoeker to
   * sign with there is nothing to add, move or open a blad for — the same
   * `canEdit` the rest of this file already asks answers that too.
   */
  const mayType = useMayType();
  const gate = useAuthorGate();
  const canEdit = allowed && mayType;
  const isPhone = useIsPhone();

  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  /**
   * The archive's own list, taken as it comes — from the page's props, or from
   * a pull — with one exception: a tag a hand is carrying right now stays
   * where the hand has it. The hand is the newer truth until it lets go, and
   * the drop is what tells everybody else (§35).
   */
  const takeEvents = useCallback((next: TimelineEvent[]) => {
    setEvents((current) => {
      const drag = eventDrag.current;
      const held = drag?.moved ? current.find((e) => e.id === drag.id) : undefined;
      const merged = held
        ? next.map((e) => (e.id === held.id ? { ...e, at: held.at } : e)).sort((a, b) => a.at - b.at)
        : next;
      return JSON.stringify(merged) === JSON.stringify(current) ? current : merged;
    });
  }, []);
  useEffect(() => takeEvents(initialEvents), [initialEvents, takeEvents]);
  /**
   * §35: and the page is asked for again after every write.
   *
   * This page is a server component, so what the browser's own Back button
   * lands on is the payload Next kept in its router cache — the one from the
   * moment this tijdlijn was opened. A gebeurtenis set, moved or taken off
   * since then is not in it, so somebody who put a gebeurtenis down, read the
   * artikel behind it and pressed Back would find the tijdlijn as empty as
   * they first found it. `refresh` fills that cache with what the archive says
   * now; every write below ends with it, exactly as the settings sheet does.
   */
  const refreshArchive = useCallback(() => router.refresh(), [router]);

  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () =>
      setSize((current) =>
        current.w === el.clientWidth && current.h === el.clientHeight ? current : { w: el.clientWidth, h: el.clientHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const width = size.w;
  /* The measured height exactly — the ink layer is drawn at these very pixels,
     so a clamp here and not in the CSS would put the drawing out of step with
     the stage under it. The floor lives in `.timeline-stage`. */
  const stageH = size.h || UNMEASURED_STAGE_H;
  const axisY = stageH / 2;
  /**
   * How many lanes of tags the stage has room for on each side of the axis: as
   * many as fit between the first lane and the edge, and never fewer than the
   * three a short stage always had. A taller stage really uses its height.
   */
  const lanes = Math.max(3, Math.floor((stageH / 2 - LANE_0) / LANE_STEP));

  /* --------------------------------------------------------- the anchor */

  /**
   * §35: "deze tijdlijn speelt op 3 oktober 1931". Two things follow from it,
   * and they are both here: every moment this stage produces — a drag, a
   * double-click, a placed artikel — is pushed onto the anchor's day
   * (`onAxis`), and the view itself is fenced inside it, so 4 October cannot
   * be panned or zoomed into sight.
   */
  const anchorAt = timeline.anchorAt;
  const anchorUnit = timeline.anchorUnit;
  const span = useMemo(
    () => (anchorAt !== null && anchorUnit !== null ? anchorSpan(anchorAt, anchorUnit) : null),
    [anchorAt, anchorUnit],
  );
  /** A moment as this axis will have it: snapped to `unit`, anchored, fenced. */
  const onAxis = useCallback(
    (at: number, unit: Scale) => clampToAnchor(applyAnchor(snapTo(at, unit), anchorAt, anchorUnit), unit, anchorAt, anchorUnit),
    [anchorAt, anchorUnit],
  );

  const [view, setView] = useState<View | null>(null);
  /**
   * The fence, applied to every view this component ever sets. An anchored
   * tijdlijn can never be wider than its own span (that is the zoom floor) and
   * never starts before it or ends after it. Zoomed all the way out it *is*
   * its day, and then there is nothing left to pan.
   *
   * The span and the stage's width are read out of a ref rather than closed
   * over, so this callback — and `moveView` with it — never changes identity.
   * That is not a micro-optimisation, it is the whole fence: the buttons and
   * the wheel zoom through `zoomAt`, and a gebeurtenis brings itself into view
   * through `addEvent`, and both of those are `useCallback`s made long before
   * a tijdlijn is given its day. Rebuilding the fence on every anchor left
   * them holding the one from the first render, when there was no span and no
   * measured stage — which is to say no fence at all, which is exactly how the
   * axis could be zoomed and panned into 4 October.
   */
  const fenceRef = useRef<{ span: { from: number; to: number } | null; width: number }>({ span, width });
  fenceRef.current = { span, width };
  const fence = useCallback((value: View | null): View | null => {
    const { span: bounds, width: stageWidth } = fenceRef.current;
    if (!value || !bounds || !stageWidth) return value;
    const seconds = bounds.to - bounds.from;
    const pxPerSecond = Math.max(value.pxPerSecond, stageWidth / seconds);
    const shown = stageWidth / pxPerSecond;
    const origin = Math.min(Math.max(value.origin, bounds.from), bounds.to - shown);
    return origin === value.origin && pxPerSecond === value.pxPerSecond ? value : { origin, pxPerSecond };
  }, []);
  const moveView = useCallback(
    (next: View | null | ((current: View | null) => View | null)) =>
      setView((current) => fence(typeof next === 'function' ? next(current) : next)),
    [fence],
  );
  const fit = useCallback(
    (list: TimelineEvent[], w: number) =>
      moveView(fitView(list.map((e) => e.at), w || 900, timeline.scale, span ? (span.from + span.to) / 2 : undefined)),
    [timeline.scale, span, moveView],
  );
  // The first view: everything on the tijdlijn, once the stage has a width.
  useEffect(() => {
    if (view === null && width > 0) fit(events, width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);
  // A stage that changed shape, or a tijdlijn that has just been anchored,
  // re-fences what is already on screen. `moveView` is stable now, so the
  // things the fence is made of have to be the deps.
  useEffect(() => {
    moveView((current) => current);
  }, [span, width, moveView]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(focusEventId ? [focusEventId] : []));
  /*
   * §35: `?place=` no longer opens the date form on sight. The moment is
   * looked for first — in the artikel's own infobox, or in the tijdlijn's
   * anchor — and when there is one the gebeurtenis is simply put down and
   * folded open, ready to be dragged. The form is the fallback, not the road.
   */
  const [sheet, setSheet] = useState<
    | null
    | { mode: 'add'; at: number | null; entry: { entryId: string; name: string } | null }
    | { mode: 'edit'; eventId: string }
    | { mode: 'settings' }
  >(null);
  const [busy, setBusy] = useState(false);
  /**
   * A picture on the axis, looked at properly. A folded-out window is 250 px
   * wide, which is a thumbnail — and the commonest thing anybody pastes onto a
   * tijdlijn is a screenshot of something with writing on it, which at that
   * size is a grey smudge. So the picture in a window is a button, and it
   * opens the full file over the whole screen, exactly as a card on a prikbord
   * does (§30). Same gesture, same escape, same styling.
   */
  const [lightbox, setLightbox] = useState<{ assetId: string; name: string } | null>(null);

  /* ----------------------------------------------------------------- live */

  const pull = useCallback(async () => {
    try {
      const response = await fetch(`/api/timelines/${timeline.id}/events`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { events?: TimelineEvent[] };
      if (!Array.isArray(data.events)) return;
      // §35: a pull that lands while a hand is carrying a tag must not put it
      // back; `takeEvents` is the one place that rule lives.
      takeEvents(data.events);
    } catch {
      /* the next signal tries again */
    }
  }, [timeline.id, takeEvents]);
  useLiveChanges([timelineKey(timeline.id)], () => void pull());

  /* ------------------------------------------------------------- geometry */

  const xOf = useCallback((at: number) => (view ? (at - view.origin) * view.pxPerSecond : 0), [view]);

  /* ----------------------------------------------------------------- ink */

  /*
   * §33: the tekenlaag. A stroke lives in one similarity space, and the maths
   * — both formats of it — is in `lib/timelines/inkSpace.ts`, where it can be
   * tested without a browser. What matters here:
   *
   *   x  is a *moment* in seconds, like a gebeurtenis, so a circle round 1887
   *      stays round 1887 however the axis is shifted;
   *   y  is seconds from the axis, and the width is seconds too, so both axes
   *      and the thickness are scaled by the one `pxPerSecond` — the drawing
   *      grows and shrinks with the tijdlijn, a circle stays a circle at every
   *      zoom, and the gum stays exactly over the ink it took away.
   *
   * That is v1. Strokes drawn before it have no `v` and are still drawn by the
   * old rule (y a fraction of the stage, width in screen pixels); they are
   * never rewritten. `project` and `widthScale` are handed each stroke's own
   * space, so one layer can carry both.
   */
  const ink = useInk({
    kind: 'timeline',
    id: timeline.id,
    initial: initialInk,
    format: TIMELINE_INK_FORMAT,
    onError: (message) => ui.toast(message),
  });
  const inkTool = useInkTool();
  const inkActive = inkTool.active && ink.enabled;
  const viewRef = useRef(view);
  viewRef.current = view;
  const stageHRef = useRef(stageH);
  stageHRef.current = stageH;
  const inkProject = useCallback<Project>(
    (at, f, v) => projectInk(view, stageH, v, at, f),
    [view, stageH],
  );
  const inkToContent = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    return inkFromScreen(
      viewRef.current,
      stageHRef.current,
      TIMELINE_INK_FORMAT,
      clientX - (rect?.left ?? 0),
      clientY - (rect?.top ?? 0),
    );
  }, []);
  /** For a stroke already on the layer: v1 scales with the zoom, v0 does not. */
  const inkWidthOf = useCallback((v?: InkFormat) => inkWidthScale(view?.pxPerSecond ?? 0, v), [view]);
  /** For the stroke about to be drawn — the hook divides the brush's pixels by it. */
  const inkWidthNow = inkWidthScale(view?.pxPerSecond ?? 0, TIMELINE_INK_FORMAT);
  useEffect(() => {
    if (!ink.enabled && inkTool.active) inkTool.setActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink.enabled]);
  useEffect(() => {
    if (!inkTool.active) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (event.key === 'Escape') inkTool.setActive(false);
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        ink.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inkTool, ink]);

  const placed = useMemo<Placed[]>(() => {
    if (!view) return [];
    const items = events.map((event) => ({ id: event.id, x: xOf(event.at), width: tagWidth(event.name) }));
    const spots = placeTags(items, lanes);
    return events.map((event) => {
      const spot = spots.get(event.id) ?? { side: 'up' as Side, lane: 0 };
      return { event, x: xOf(event.at), side: spot.side, lane: spot.lane };
    });
  }, [events, view, xOf, lanes]);

  const ticks = useMemo(() => {
    if (!view || !width) return [];
    return ticksBetween(view.origin, view.origin + width / view.pxPerSecond, timeline.scale, view.pxPerSecond, isPhone ? 70 : 90);
  }, [view, width, timeline.scale, isPhone]);

  // `?event=`: bring the one asked for into the middle, once.
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || !view || !focusEventId || !width) return;
    const target = events.find((e) => e.id === focusEventId);
    if (!target) return;
    focused.current = true;
    moveView((current) => (current ? { ...current, origin: target.at - width / 2 / current.pxPerSecond } : current));
  }, [view, focusEventId, events, width]);

  /* ---------------------------------------------------------------- zoom */

  const zoomAt = useCallback(
    (factor: number, stageX: number) => {
      moveView((current) => {
        if (!current) return current;
        const next = Math.min(maxPxPerSecond(timeline.scale), Math.max(MIN_PX_PER_SECOND, current.pxPerSecond * factor));
        const moment = current.origin + stageX / current.pxPerSecond;
        return { origin: moment - stageX / next, pxPerSecond: next };
      });
    },
    [timeline.scale, moveView],
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left);
      } else {
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        moveView((current) => (current ? { ...current, origin: current.origin + delta / current.pxPerSecond } : current));
      }
    };
    // Not passive: the page must not scroll under the axis.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /* --------------------------------------------------------------- drag */

  /**
   * §35: a gebeurtenis is dragged along the axis with a mouse or a finger and
   * snaps to *its own* precision — an artikel known only as "1931" steps a
   * year at a time however finely the axis is ruled, because a drag must never
   * invent a precision nobody has. The tag, its stem, its folded-out window
   * and the lane it sits in all follow the hand, because the moment in
   * `events` is what everything is drawn from; the drop is one PATCH.
   *
   * A press on the tag is not `preventDefault`ed — the corkboard's reasoning
   * (a card is dragged and double-clicked, and cancelling the press takes the
   * double-click away); `.timeline-event` carries `user-select: none` and
   * `touch-action: none` instead, so nothing is swept and nothing scrolls.
   */
  type EventDrag = {
    id: string;
    pointerId: number;
    startClientX: number;
    startAt: number;
    unit: Scale;
    moved: boolean;
  };
  const eventDrag = useRef<EventDrag | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const moveOne = useCallback(
    (id: string, at: number) =>
      setEvents((current) => {
        const found = current.find((e) => e.id === id);
        if (!found || found.at === at) return current;
        return current.map((e) => (e.id === id ? { ...e, at } : e)).sort((a, b) => a.at - b.at);
      }),
    [],
  );

  /** Put it back where it was picked up: a cancelled pointer, or a second finger. */
  const abortEventDrag = useCallback(() => {
    const drag = eventDrag.current;
    if (!drag) return;
    eventDrag.current = null;
    setDraggingId(null);
    if (drag.moved) moveOne(drag.id, drag.startAt);
  }, [moveOne]);

  function onEventPointerDown(event: React.PointerEvent, item: TimelineEvent) {
    if (event.button !== 0 || !view) return;
    // Not while the potlood is out: the tekenlaag's sheet has the pointer then.
    if (inkActive) return;
    if (eventDrag.current) {
      abortEventDrag();
      return;
    }
    // A viewer who may not edit still presses a tag to fold its window out, so
    // the press is followed either way; only the moving is the editor's.
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    eventDrag.current = {
      id: item.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startAt: item.at,
      unit: item.precision,
      moved: false,
    };
  }

  function onEventPointerMove(event: React.PointerEvent) {
    const drag = eventDrag.current;
    if (!drag || drag.pointerId !== event.pointerId || !view || !canEdit) return;
    const dx = event.clientX - drag.startClientX;
    if (!drag.moved && Math.abs(dx) <= 3) return;
    if (!drag.moved) {
      drag.moved = true;
      setDraggingId(drag.id);
    }
    moveOne(drag.id, onAxis(drag.startAt + dx / view.pxPerSecond, drag.unit));
  }

  function onEventPointerUp(event: React.PointerEvent) {
    const drag = eventDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    eventDrag.current = null;
    setDraggingId(null);
    // Not a drag at all: the press was a click, and a click folds the window
    // out — exactly what it did before there was any dragging.
    if (!drag.moved) {
      toggle(drag.id);
      return;
    }
    const dropped = events.find((e) => e.id === drag.id);
    if (!dropped || dropped.at === drag.startAt) return;
    void patchEvent(drag.id, { at: dropped.at }).then((ok) => {
      if (!ok) moveOne(drag.id, drag.startAt);
    });
  }

  /* ---------------------------------------------------------------- pan */

  type Pointer = { id: number; x: number; y: number };
  type Gesture = {
    pointers: Map<number, Pointer>;
    startOrigin: number;
    startX: number;
    moved: boolean;
    pinchDist?: number;
    pinchMid?: number;
  };
  const gesture = useRef<Gesture | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  /** The moment the hand was last over, or null before it has been anywhere. */
  const pointerAt = useRef<number | null>(null);

  function onPointerDown(event: React.PointerEvent) {
    if (!view) return;
    // A press that begins on a tag is that gebeurtenis's, never a pan (§35);
    // the stage has always looked the other way here, which is what lets a
    // finger drag a tag on a phone without the axis sliding away under it.
    if ((event.target as HTMLElement).closest('.timeline-event, .timeline-popout')) return;
    // A second finger on the stage during a drag abandons it, exactly as a
    // pinch abandons a stroke of ink (§33).
    abortEventDrag();
    const el = stageRef.current;
    if (!el) return;
    el.setPointerCapture(event.pointerId);
    const rect = el.getBoundingClientRect();
    const p = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
    const g: Gesture = gesture.current ?? { pointers: new Map<number, Pointer>(), startOrigin: view.origin, startX: p.x, moved: false };
    g.pointers.set(p.id, p);
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      g.pinchMid = (a.x + b.x) / 2;
    }
    gesture.current = g;
    setGrabbing(true);
  }

  function onPointerMove(event: React.PointerEvent) {
    const el = stageRef.current;
    // Where the hand last was on the axis, in seconds. §30's paste has no
    // coordinates of its own, so this is what tells it *when* the picture goes;
    // recorded before the gesture is looked at, because most of the time there
    // is no gesture — the hand is simply over the stage.
    if (el && view) {
      pointerAt.current = view.origin + (event.clientX - el.getBoundingClientRect().left) / view.pxPerSecond;
    }
    const g = gesture.current;
    if (!g || !el || !g.pointers.has(event.pointerId)) return;
    const rect = el.getBoundingClientRect();
    const p = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
    g.pointers.set(p.id, p);
    if (g.pointers.size >= 2 && g.pinchDist) {
      const [a, b] = [...g.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = (a.x + b.x) / 2;
      if (dist > 0) zoomAt(dist / g.pinchDist, mid);
      g.pinchDist = dist;
      g.pinchMid = mid;
      g.moved = true;
      return;
    }
    const dx = p.x - g.startX;
    if (Math.abs(dx) > 3) g.moved = true;
    moveView((current) => (current ? { ...current, origin: g.startOrigin - dx / current.pxPerSecond } : current));
  }

  function onPointerUp(event: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    g.pointers.delete(event.pointerId);
    if (g.pointers.size === 0) {
      // A click on bare stage (no drag) closes the folded-out windows.
      if (!g.moved) setExpanded(new Set());
      gesture.current = null;
      setGrabbing(false);
    } else {
      // One finger left after a pinch: continue as a pan from here.
      const [rest] = [...g.pointers.values()];
      g.startX = rest.x;
      g.startOrigin = view?.origin ?? g.startOrigin;
      g.pinchDist = undefined;
    }
  }

  function onDoubleClick(event: React.MouseEvent) {
    if (!canEdit || !view) return;
    // §33: two quick dots with the potlood are two dots, not a new gebeurtenis.
    if ((event.target as HTMLElement).closest('.timeline-event, .timeline-popout, .ink-capture, .ink-toolbar')) return;
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // §35: the moment under the finger, snapped to the finest the tijdlijn
    // measures and pushed onto its anchor's day — so the sheet opens with the
    // date already made and nothing to fill in.
    const moment = onAxis(view.origin + (event.clientX - rect.left) / view.pxPerSecond, timeline.scale);
    setSheet({ mode: 'add', at: moment, entry: null });
  }

  /* -------------------------------------------------------------- writes */

  /**
   * The one road onto the axis. It hands the gebeurtenis back rather than a
   * yes/no, because a pasted picture needs the thing it just made in order to
   * put the picture on it; `addEvent` below is the same road for every caller
   * that only wants to know whether it worked.
   */
  const createEvent = useCallback(
    async (input: NewEventInput): Promise<TimelineEvent | null> => {
      setBusy(true);
      try {
        const response = await fetch(`/api/timelines/${timeline.id}/events`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = (await response.json()) as { event?: TimelineEvent; error?: string };
        if (!response.ok || !data.event) {
          ui.toast(data.error ?? `De ${words.event} is niet gezet.`);
          return null;
        }
        const created = data.event;
        setEvents((current) => [...current.filter((e) => e.id !== created.id), created].sort((a, b) => a.at - b.at));
        setExpanded(new Set([created.id]));
        setSheet(null);
        // If it landed out of view, bring it in.
        moveView((current) => {
          if (!current || !width) return current;
          const x = (created.at - current.origin) * current.pxPerSecond;
          if (x >= 40 && x <= width - 40) return current;
          return { ...current, origin: created.at - width / 2 / current.pxPerSecond };
        });
        if (placing) router.replace(`/timelines/${timeline.slug}`);
        refreshArchive();
        return created;
      } catch {
        ui.toast('Geen verbinding.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [timeline.id, timeline.slug, ui, words.event, width, placing, router, refreshArchive, moveView],
  );

  const addEvent = useCallback(
    async (input: NewEventInput): Promise<boolean> => Boolean(await createEvent(input)),
    [createEvent],
  );

  /**
   * §35: an artikel carried here from its own page ("Zet op deze tijdlijn").
   * If its infobox says when it was, or the tijdlijn is *of* a day, the
   * moment is known already and the gebeurtenis goes down without a form —
   * open, and ready to be dragged if the moment needs a nudge. Only an
   * artikel with no date on a tijdlijn of no particular day still asks.
   */
  const placedOnce = useRef(false);
  useEffect(() => {
    if (placedOnce.current || !placing || !canEdit || !view || !width) return;
    placedOnce.current = true;
    void (async () => {
      let moment: { at: number; precision: Precision } | null = null;
      try {
        const response = await fetch(`/api/entries/${placing.entryId}`, { cache: 'no-store' });
        if (response.ok) {
          const data = (await response.json()) as { fields?: Record<string, unknown> };
          const fields = data.fields ?? {};
          const candidates = [fields.date, ...Object.values(fields)].filter(
            (value): value is string => typeof value === 'string' && value.trim() !== '',
          );
          for (const candidate of candidates) {
            const parsed = parseDutchDate(candidate);
            if (parsed) {
              moment = parsed;
              break;
            }
          }
        }
      } catch {
        /* no date to be had; the form below asks for one */
      }
      // Nothing said, but the tijdlijn itself is of one day: the middle of
      // what is on screen is inside that day, and the anchor makes it right.
      if (!moment && span) moment = { at: view.origin + width / 2 / view.pxPerSecond, precision: timeline.scale };
      if (!moment) {
        setSheet({ mode: 'add', at: null, entry: placing });
        return;
      }
      const precision = clampPrecision(moment.precision, timeline.scale);
      const at = onAxis(moment.at, precision);
      const ok = await addEvent({ kind: 'entry', entryId: placing.entryId, at, precision, text: '' });
      if (!ok) setSheet({ mode: 'add', at, entry: placing });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placing, canEdit, view, width]);

  const patchEvent = useCallback(
    async (eventId: string, patch: EventPatchInput & { entryId?: string }): Promise<boolean> => {
      setBusy(true);
      try {
        const response = await fetch(`/api/timelines/${timeline.id}/events/${eventId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = (await response.json()) as { event?: TimelineEvent; error?: string };
        if (!response.ok || !data.event) {
          ui.toast(data.error ?? 'Opslaan is niet gelukt.');
          return false;
        }
        const saved = data.event;
        setEvents((current) => current.map((e) => (e.id === saved.id ? saved : e)).sort((a, b) => a.at - b.at));
        refreshArchive();
        return true;
      } catch {
        ui.toast('Geen verbinding.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [timeline.id, ui, refreshArchive],
  );

  // Escape shuts the full-size picture, wherever the focus happens to be.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  /* ------------------------------------------------------------- pasting */

  /**
   * §30, on the axis: a picture on the clipboard becomes a losse gebeurtenis
   * where the hand is.
   *
   * The road already existed twice over — the prikbord takes a paste on the
   * bare cork, and the blad of a gebeurtenis takes one while it is open — and
   * the tijdlijn itself was the hole between them: you could give a picture to
   * a gebeurtenis that already existed, and you could not make one *of* a
   * picture without first filling in a form for a thing you had not named yet.
   * Ctrl+V is the gesture people try, so that is what this is.
   *
   * Everything after the file is found is the file dialog's own road, exactly
   * as rule 30 asks: `fitUpload` shrinks a photograph that is over the reader's
   * ceiling and says so once, `/api/assets` weighs it, and the toasts are the
   * ones the sheet already uses. Then two writes, in this order: the
   * gebeurtenis is put down at the moment under the hand, and the picture is
   * hung on it. The blad opens on top, because the one thing the paste cannot
   * guess is what this is a picture *of* — the name is a filename until
   * somebody says otherwise, and the caret is already in that box.
   *
   * `sheet` is checked because `EditEventSheet` listens for a paste of its own
   * while it is open; without that guard one Ctrl+V would both give the open
   * gebeurtenis its picture and make a second one.
   */
  const [uploading, setUploading] = useState(false);

  const pasteImage = useCallback(
    (paste: ClipboardEvent) => {
      if (!canEdit || !view || !width || uploading) return;
      // Somebody typing wants the text on their clipboard, not a gebeurtenis.
      if (pasteIsForTyping(paste.target)) return;
      // A blad is open on top of the axis; a paste there is not the axis's, and
      // the blad has a listener of its own.
      if (sheet) return;
      if ((paste.target as HTMLElement | null)?.closest?.('.sheet')) return;
      // The full-size picture is over the stage; a paste there is not the axis's.
      if (lightbox) return;
      // §33: with the potlood out, the stage belongs to the tekenlaag.
      if (inkActive) return;

      const file = imageFromClipboard(paste);
      if (!file) return;
      paste.preventDefault();

      const moment = pointerAt.current ?? view.origin + width / 2 / view.pxPerSecond;
      const at = onAxis(moment, timeline.scale);

      void (async () => {
        setUploading(true);
        try {
          const fitted = await fitUpload(file, ui.uploadLimit);
          if ('error' in fitted) {
            ui.toast(fitted.error);
            return;
          }
          if (fitted.shrunk) ui.toast(SHRUNK_NOTICE);
          const form = new FormData();
          form.append('file', fitted.file);
          const result = await uploadForm<{ asset: { id: string } }>('/api/assets', form);
          if (!result.ok) {
            ui.toast(result.error);
            return;
          }
          const created = await createEvent({
            kind: 'note',
            // `imageFromClipboard` already dates a nameless paste ("Geplakt
            // 2026-09-06 14.02"), so this is a real name almost always.
            name: file.name.replace(/\.[^.]+$/, '') || 'Afbeelding',
            at,
            precision: timeline.scale,
            text: '',
          });
          if (!created) return;
          await patchEvent(created.id, { assetId: result.data.asset.id, showImage: true });
          setSheet({ mode: 'edit', eventId: created.id });
        } finally {
          setUploading(false);
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, view, width, uploading, sheet, lightbox, inkActive, onAxis, timeline.scale, ui, createEvent, patchEvent],
  );

  useEffect(() => {
    document.addEventListener('paste', pasteImage);
    return () => document.removeEventListener('paste', pasteImage);
  }, [pasteImage]);

  const removeEvent = useCallback(
    async (event: TimelineEvent) => {
      const yes = await ui.confirm({
        title: `${event.name} van de ${words.timeline} halen?`,
        message:
          event.kind === 'entry'
            ? `Het ${words.entry} zelf blijft bestaan; alleen de ${words.event} op deze ${words.timeline} gaat weg.`
            : `Een losse ${words.event} bestaat nergens anders; dit is definitief.`,
        confirmLabel: 'Weghalen',
        danger: true,
      });
      if (!yes) return;
      setBusy(true);
      try {
        const response = await fetch(`/api/timelines/${timeline.id}/events/${event.id}`, { method: 'DELETE' });
        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          ui.toast(data.error ?? 'Weghalen is niet gelukt.');
          return;
        }
        setEvents((current) => current.filter((e) => e.id !== event.id));
        setSheet(null);
        refreshArchive();
      } catch {
        ui.toast('Geen verbinding.');
      } finally {
        setBusy(false);
      }
    },
    [timeline.id, ui, words.entry, words.event, words.timeline, refreshArchive],
  );

  /** §8: a note becomes the gebeurtenis of an artikel, in place. */
  const convertToEntry = useCallback(
    (event: TimelineEvent, seed: { name: string; text: string }) => {
      ui.openNewEntry({
        name: seed.name,
        shortDescription: seed.text,
        typeSlug: 'event',
        caseId: timeline.caseId ?? undefined,
        onCreated: (created) => {
          void patchEvent(event.id, { entryId: created.id }).then((ok) => {
            if (ok) ui.toast(`${created.name} staat nu als ${words.entry} op ${timeline.name}.`);
          });
        },
      });
    },
    [ui, timeline.caseId, timeline.name, patchEvent, words.entry],
  );

  const saveSettings = useCallback(
    async (patch: {
      name?: string;
      description?: string;
      scale?: Scale;
      anchorAt?: number | null;
      anchorUnit?: AnchorUnit | null;
    }): Promise<boolean> => {
      setBusy(true);
      try {
        const response = await fetch(`/api/timelines/${timeline.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          ui.toast(data.error ?? 'Opslaan is niet gelukt.');
          return false;
        }
        setSheet(null);
        router.refresh();
        return true;
      } catch {
        ui.toast('Geen verbinding.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [timeline.id, ui, router],
  );

  // A re-measured tijdlijn arrives through the page's own refresh; the
  // gebeurtenissen are pulled again so their precision follows the new scale.
  const lastScale = useRef(`${timeline.scale}:${anchorAt}:${anchorUnit}`);
  useEffect(() => {
    const now = `${timeline.scale}:${anchorAt}:${anchorUnit}`;
    if (lastScale.current === now) return;
    lastScale.current = now;
    void pull();
    // §35: a tijdlijn that has just been given a day opens on that day.
    if (width) fit(events, width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.scale, anchorAt, anchorUnit]);

  const deleteTimeline = useCallback(async () => {
    const yes = await ui.confirm({
      title: `${timeline.name} in de prullenbak?`,
      message: `De ${words.timeline} gaat met alles erop naar de prullenbak; een ${words.keeper} kan hem terugzetten.`,
      confirmLabel: 'In de prullenbak',
      danger: true,
    });
    if (!yes) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/timelines/${timeline.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        ui.toast(data.error ?? 'Verwijderen is niet gelukt.');
        return;
      }
      router.push(timeline.caseSlug ? `/c/${timeline.caseSlug}` : '/timelines');
    } catch {
      ui.toast('Geen verbinding.');
    } finally {
      setBusy(false);
    }
  }, [ui, timeline, words.timeline, words.keeper, router]);

  /* -------------------------------------------------------------- render */

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOpen = events.length > 0 && events.every((e) => expanded.has(e.id));

  const editing = sheet?.mode === 'edit' ? (events.find((e) => e.id === sheet.eventId) ?? null) : null;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="timeline-frame" {...gate}>
      <div className="row-wrap timeline-toolbar" style={{ gap: '0.4rem' }}>
        {canEdit && (
          <button type="button" className="btn btn-primary btn-small" onClick={() => setSheet({ mode: 'add', at: null, entry: null })} data-testid="timeline-add">
            <Icon name="plus" size={15} />
            {cap(words.event)} toevoegen
          </button>
        )}
        {events.length > 0 && (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => setExpanded(allOpen ? new Set() : new Set(events.map((e) => e.id)))}
            data-testid="timeline-toggle-all"
          >
            <Icon name={allOpen ? 'close' : 'eye'} size={14} />
            {allOpen ? 'Alles inklappen' : 'Alles tonen'}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-small" title="Uitzoomen" aria-label="Uitzoomen" onClick={() => zoomAt(1 / 1.6, width / 2)}>
          <Icon name="zoomOut" size={16} />
        </button>
        <button type="button" className="btn btn-ghost btn-small" title="Inzoomen" aria-label="Inzoomen" onClick={() => zoomAt(1.6, width / 2)}>
          <Icon name="zoomIn" size={16} />
        </button>
        <button type="button" className="btn btn-ghost btn-small" title="Alles in beeld" aria-label="Alles in beeld" onClick={() => fit(events, width)}>
          <Icon name="fit" size={16} />
        </button>
        {canEdit && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setSheet({ mode: 'settings' })} data-testid="timeline-settings">
            <Icon name="gear" size={16} />
            Instellingen
          </button>
        )}
      </div>

      <div className="timeline-stage-wrap">
      <div
        ref={stageRef}
        className={`timeline-stage${grabbing ? ' timeline-stage-grabbing' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        data-testid="timeline-stage"
      >
        {/* §33: the tekenlaag, under the axis and the gebeurtenissen. */}
        <InkCanvas
          className="ink-layer"
          strokes={ink.strokes}
          stableCount={ink.stableCount}
          project={inkProject}
          widthScale={inkWidthOf}
          viewKey={`${view?.origin ?? 0},${view?.pxPerSecond ?? 0},${stageH},${width}`}
          width={width}
          height={stageH}
        />
        <div className="timeline-axis" style={{ top: axisY }} />
        {ticks.map((tick) => (
          <div
            key={tick.at}
            className={`timeline-tick${tick.major ? ' timeline-tick-major' : ''}`}
            style={{ left: xOf(tick.at), top: axisY }}
          >
            <span>{tick.label}</span>
          </div>
        ))}

        {placed.map(({ event, x, side, lane }) => {
          if (x < -400 || x > width + 400) return null;
          const open = expanded.has(event.id);
          const colour = event.kind === 'entry' ? (event.entry?.typeColour ?? 'var(--ink-muted)') : NOTE_COLOUR;
          const reach = LANE_0 + lane * LANE_STEP;
          const dragging = draggingId === event.id;
          return (
            <div
              key={event.id}
              className={`timeline-event timeline-event-${side} timeline-event-${event.kind}${open ? ' timeline-event-open' : ''}${dragging ? ' timeline-event-dragging' : ''}`}
              style={{ left: x, top: axisY, ['--event-colour' as string]: colour, ['--reach' as string]: `${reach}px` }}
              data-testid="timeline-event"
              data-event-id={event.id}
              onPointerDown={(pointer) => onEventPointerDown(pointer, event)}
              onPointerMove={onEventPointerMove}
              onPointerUp={onEventPointerUp}
              onPointerCancel={() => abortEventDrag()}
            >
              <span className="timeline-stem" />
              {/*
               * §35: the press is the drag and the click both, so neither
               * button answers a pointer any more — `onEventPointerUp` folds
               * the window out when the hand did not move. A keyboard's own
               * click (`detail === 0`) still has to be answered here.
               */}
              <button
                type="button"
                className="timeline-marker"
                aria-label={`${event.name}, ${formatWhen(event.at, event.precision)}`}
                aria-expanded={open}
                onClick={(click) => click.detail === 0 && toggle(event.id)}
              >
                {event.kind === 'entry' && <Icon name={event.entry?.typeIcon ?? 'file'} size={12} />}
              </button>
              <button
                type="button"
                className="timeline-tag"
                onClick={(click) => click.detail === 0 && toggle(event.id)}
                aria-expanded={open}
                title={formatWhen(event.at, event.precision)}
              >
                {event.name}
              </button>
            </div>
          );
        })}

        {inkActive && (
          <InkCapture
            tool={inkTool.tool}
            toContent={inkToContent}
            widthScale={inkWidthNow}
            onBegin={ink.begin}
            onExtend={ink.extend}
            onEnd={ink.end}
            onAbort={ink.abort}
            stopPropagation
          />
        )}
        {ink.enabled && (
          <InkToolbar
            active={inkTool.active}
            tool={inkTool.tool}
            onActive={(next) => {
              inkTool.setActive(next);
              if (next) setExpanded(new Set());
            }}
            onTool={inkTool.setTool}
            canUndo={ink.canUndo}
            onUndo={ink.undo}
            saving={ink.saving}
          />
        )}

        {!events.length && !inkActive && (
          <p className="timeline-empty small muted">
            {canEdit
              ? `Nog geen ${words.eventPlural}. Dubbelklik op de as, of gebruik '${cap(words.event)} toevoegen'.`
              : `Nog geen ${words.eventPlural} op deze ${words.timeline}.`}
          </p>
        )}
      </div>

      {/* The folded-out windows live outside the clipped stage, so one near
          the top can open upward past the edge instead of being cut off. */}
      <div className="timeline-popouts" aria-live="polite">
        {placed
          .filter(({ event }) => expanded.has(event.id))
          .map(({ event, x, side, lane }) => {
            const reach = LANE_0 + lane * LANE_STEP;
            const left = Math.max(4, Math.min(width - POPOUT_W - 4, x - POPOUT_W / 2));
            return (
              <Popout
                key={event.id}
                event={event}
                side={side}
                left={left}
                tagTop={axisY - reach - TAG_H / 2}
                tagBottom={axisY + reach + TAG_H / 2}
                canEdit={canEdit}
                setBy={event.createdBy ? (peopleNames[event.createdBy] ?? null) : null}
                onClose={() => toggle(event.id)}
                onEdit={() => setSheet({ mode: 'edit', eventId: event.id })}
                onShowImage={() => void patchEvent(event.id, { showImage: true })}
                onHideImage={() => void patchEvent(event.id, { showImage: false })}
                onViewFull={(assetId) => setLightbox({ assetId, name: event.name })}
              />
            );
          })}
      </div>
      </div>

      <p className="tiny muted timeline-count">
        {events.length} {events.length === 1 ? words.event : words.eventPlural}
        {span && anchorAt !== null && anchorUnit !== null && (
          <> · speelt op {formatWhen(anchorAt, anchorUnit)}</>
        )}
        {' · '}sleep om te schuiven, Ctrl+scroll of knijp om te zoomen
        {canEdit && (
          <>
            {' '}· sleep een {words.event} om hem te verzetten · dubbelklik op de as voor een {words.event} op dat
            moment
            {/* Nobody finds a paste that is not written down — the same
                sentence the prikbord carries, in the same tiny grey line. */}
            {!isPhone && <> · plak een afbeelding voor een losse {words.event} met die afbeelding erop</>}
            {uploading && <> · uploaden…</>}
          </>
        )}
      </p>

      {sheet?.mode === 'add' && (
        <Sheet onClose={() => setSheet(null)} labelledBy="new-event-title">
          <NewEventSheet timeline={timeline} busy={busy} initialAt={sheet.at} preselected={sheet.entry} onSubmit={addEvent} />
        </Sheet>
      )}

      {editing && (
        <Sheet onClose={() => setSheet(null)} labelledBy="event-title">
          <EditEventSheet
            timeline={timeline}
            event={editing}
            busy={busy}
            liveUser={liveUser}
            setBy={editing.createdBy ? (peopleNames[editing.createdBy] ?? null) : null}
            onSave={(patch) => patchEvent(editing.id, patch)}
            onRemove={() => void removeEvent(editing)}
            onConvert={(seed) => convertToEntry(editing, seed)}
          />
        </Sheet>
      )}

      {sheet?.mode === 'settings' && (
        <Sheet onClose={() => setSheet(null)} labelledBy="timeline-settings-title">
          <TimelineSettingsSheet
            timeline={timeline}
            busy={busy}
            canManage={access.canManage}
            isKeeper={isKeeper}
            viewerId={viewerId}
            access={access.settings}
            onSave={saveSettings}
            onDelete={() => void deleteTimeline()}
          />
          {isKeeper && (
            <InkKeeperControls
              enabled={ink.enabled}
              strokeCount={ink.layer.strokes.length}
              noun={`deze ${words.timeline}`}
              onSetEnabled={(enabled) => void ink.keeper({ enabled })}
              onClear={() =>
                void ui
                  .confirm({
                    title: 'Tekenlaag wissen?',
                    message: `Alle streken op deze ${words.timeline} gaan weg, voor iedereen. Dit is niet terug te draaien.`,
                    confirmLabel: 'Wissen',
                    danger: true,
                  })
                  .then((yes) => yes && ink.keeper({ clear: true }))
              }
            />
          )}
        </Sheet>
      )}

      {/* The same full-screen picture the prikbord opens, and the same class,
          so the two are one look and one set of rules rather than two. */}
      {lightbox && (
        <div
          className="board-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name || 'Afbeelding'}
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(lightbox.assetId, 'full')} alt={lightbox.name || ''} />
          <button type="button" className="btn btn-small" aria-label="Sluiten">
            <Icon name="close" size={16} />
            Sluiten
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One folded-out window. It measures itself after the first paint, because an
 * `up` window opens upward from its tag and must not climb past the top of
 * the page: with no room above it is pushed down over the tag instead — a
 * window you can read beats one that keeps its place off screen.
 */
function Popout({
  event,
  side,
  left,
  tagTop,
  tagBottom,
  canEdit,
  setBy,
  onClose,
  onEdit,
  onShowImage,
  onHideImage,
  onViewFull,
}: {
  event: TimelineEvent;
  side: Side;
  left: number;
  tagTop: number;
  tagBottom: number;
  canEdit: boolean;
  setBy: string | null;
  onClose: () => void;
  onEdit: () => void;
  onShowImage: () => void;
  onHideImage: () => void;
  onViewFull: (assetId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // How far above the stage a window may climb: the toolbar's margin, no more.
  const HEADROOM = 8;
  const top = side === 'up' ? Math.max(-HEADROOM, tagTop - 6 - (height ?? 0)) : tagBottom + 6;
  const image = event.kind === 'entry' ? (event.entry?.coverAssetId ?? null) : event.assetId;
  const colour = event.kind === 'entry' ? (event.entry?.typeColour ?? 'var(--ink-muted)') : NOTE_COLOUR;
  const framed = event.showImage;

  return (
    <div
      ref={ref}
      className={`timeline-popout timeline-popout-${side} timeline-popout-${event.kind}`}
      style={{ left, top, width: POPOUT_W, visibility: height === null ? 'hidden' : undefined, ['--event-colour' as string]: colour }}
      role="dialog"
      aria-label={event.name}
      data-testid="timeline-popout"
    >
      <button type="button" className="timeline-popout-close" aria-label="Sluiten" onClick={onClose}>
        <Icon name="close" size={14} />
      </button>
      {/*
        The picture runs the full width of the window and keeps its own shape
        up to a ceiling, instead of being a bordered 4:3 square floating inside
        the window's padding. Two things were wrong with the square: a picture
        in a box in a box reads as a form field rather than a photograph, and
        4:3 `cover` is a crop, so the one thing people actually paste onto a
        tijdlijn — a screenshot of something with writing on it — arrived with
        its top and bottom cut off. Now a wide picture is shown whole and only
        a very tall one is trimmed, from the top down, where the writing is.

        And it is a button: 250 px is a thumbnail, so a click opens the file
        over the whole screen.
      */}
      {framed &&
        (image ? (
          <button
            type="button"
            className="timeline-popout-picture"
            title="Klik om de afbeelding groot te bekijken"
            aria-label={`${event.name} — afbeelding groot bekijken`}
            onClick={() => onViewFull(image)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(image, 'card')} alt="" />
            <span className="timeline-popout-zoom" aria-hidden="true">
              <Icon name="zoomIn" size={13} />
            </span>
          </button>
        ) : (
          <div className="timeline-popout-picture timeline-popout-picture-empty">
            <span className="timeline-popout-placeholder">
              <Icon name={event.kind === 'entry' ? (event.entry?.typeIcon ?? 'file') : 'note'} size={30} />
            </span>
          </div>
        ))}
      <p className="timeline-popout-when tiny">{formatWhen(event.at, event.precision)}</p>
      <h3 className="timeline-popout-name">{event.name}</h3>
      {event.kind === 'entry' && event.entry?.typeLabel && (
        <p className="tiny muted" style={{ margin: '0 0 0.3rem' }}>
          {event.entry.typeLabel}
        </p>
      )}
      {event.text ? (
        <p className="small timeline-popout-text"><MentionText text={event.text} /></p>
      ) : event.kind === 'entry' && event.entry?.shortDescription ? (
        <p className="small muted timeline-popout-text">{event.entry.shortDescription}</p>
      ) : null}
      <div className="row-wrap" style={{ gap: '0.3rem', marginTop: '0.4rem' }}>
        {event.kind === 'entry' && event.entry && (
          <Link className="btn btn-small btn-primary" href={`/e/${event.entry.slug}`} data-testid="timeline-read-more">
            <Icon name="file" size={13} />
            Lees verder
          </Link>
        )}
        {canEdit && (
          <button type="button" className="btn btn-small" onClick={onEdit} data-testid="timeline-edit-event">
            <Icon name="edit" size={13} />
            Bewerken
          </button>
        )}
        {/* One switch, both ways. It used to appear only while the frame was
            shut, so a window whose picture you did not want stayed that way
            until you opened its blad — the button that turns a thing on is the
            button that turns it off. */}
        {canEdit && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            title={framed ? 'Afbeelding verbergen' : image ? 'Afbeelding tonen' : 'Sjabloonafbeelding tonen'}
            aria-label={framed ? 'Afbeelding verbergen' : image ? 'Afbeelding tonen' : 'Sjabloonafbeelding tonen'}
            onClick={framed ? onHideImage : onShowImage}
          >
            <Icon name={framed ? 'eyeOff' : 'camera'} size={13} />
          </button>
        )}
      </div>
      {setBy && (
        <p className="tiny muted" style={{ margin: '0.4rem 0 0' }}>
          gezet door {setBy}
        </p>
      )}
    </div>
  );
}
