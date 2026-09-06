'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { useLiveChanges } from '@/components/live/LiveProvider';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { useIsPhone } from '@/components/useIsPhone';
import type { LiveUser } from '@/components/editor/useLiveDoc';
import type { AccessSettings } from '@/lib/access';
import { timelineKey } from '@/lib/live/keys';
import type { TimelineEvent, TimelineSummary } from '@/lib/timelines/service';
import {
  fitView,
  floorTo,
  formatWhen,
  maxPxPerSecond,
  MIN_PX_PER_SECOND,
  placeTags,
  ticksBetween,
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

const STAGE_H_DESKTOP = 460;
const STAGE_H_PHONE = 400;
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
  canEdit,
  viewerId,
  isKeeper,
  peopleNames,
  liveUser,
  access,
  placing,
  focusEventId,
}: {
  timeline: TimelineSummary;
  initialEvents: TimelineEvent[];
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
  const isPhone = useIsPhone();
  const stageH = isPhone ? STAGE_H_PHONE : STAGE_H_DESKTOP;
  const axisY = stageH / 2;

  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  useEffect(() => setEvents(initialEvents), [initialEvents]);

  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [view, setView] = useState<View | null>(null);
  const fit = useCallback(
    (list: TimelineEvent[], w: number) => setView(fitView(list.map((e) => e.at), w || 900, timeline.scale)),
    [timeline.scale],
  );
  // The first view: everything on the tijdlijn, once the stage has a width.
  useEffect(() => {
    if (view === null && width > 0) fit(events, width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(focusEventId ? [focusEventId] : []));
  const [sheet, setSheet] = useState<
    | null
    | { mode: 'add'; at: number | null; entry: { entryId: string; name: string } | null }
    | { mode: 'edit'; eventId: string }
    | { mode: 'settings' }
  >(placing && canEdit ? { mode: 'add', at: null, entry: placing } : null);
  const [busy, setBusy] = useState(false);

  /* ----------------------------------------------------------------- live */

  const pull = useCallback(async () => {
    try {
      const response = await fetch(`/api/timelines/${timeline.id}/events`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { events?: TimelineEvent[] };
      if (!Array.isArray(data.events)) return;
      setEvents((current) => (JSON.stringify(data.events) === JSON.stringify(current) ? current : data.events!));
    } catch {
      /* the next signal tries again */
    }
  }, [timeline.id]);
  useLiveChanges([timelineKey(timeline.id)], () => void pull());

  /* ------------------------------------------------------------- geometry */

  const xOf = useCallback((at: number) => (view ? (at - view.origin) * view.pxPerSecond : 0), [view]);

  const placed = useMemo<Placed[]>(() => {
    if (!view) return [];
    const items = events.map((event) => ({ id: event.id, x: xOf(event.at), width: tagWidth(event.name) }));
    const spots = placeTags(items, 3);
    return events.map((event) => {
      const spot = spots.get(event.id) ?? { side: 'up' as Side, lane: 0 };
      return { event, x: xOf(event.at), side: spot.side, lane: spot.lane };
    });
  }, [events, view, xOf]);

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
    setView((current) => (current ? { ...current, origin: target.at - width / 2 / current.pxPerSecond } : current));
  }, [view, focusEventId, events, width]);

  /* ---------------------------------------------------------------- zoom */

  const zoomAt = useCallback(
    (factor: number, stageX: number) => {
      setView((current) => {
        if (!current) return current;
        const next = Math.min(maxPxPerSecond(timeline.scale), Math.max(MIN_PX_PER_SECOND, current.pxPerSecond * factor));
        const moment = current.origin + stageX / current.pxPerSecond;
        return { origin: moment - stageX / next, pxPerSecond: next };
      });
    },
    [timeline.scale],
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
        setView((current) => (current ? { ...current, origin: current.origin + delta / current.pxPerSecond } : current));
      }
    };
    // Not passive: the page must not scroll under the axis.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

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

  function onPointerDown(event: React.PointerEvent) {
    if (!view) return;
    if ((event.target as HTMLElement).closest('.timeline-event, .timeline-popout')) return;
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
    const g = gesture.current;
    const el = stageRef.current;
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
    setView((current) => (current ? { ...current, origin: g.startOrigin - dx / current.pxPerSecond } : current));
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
    if ((event.target as HTMLElement).closest('.timeline-event, .timeline-popout')) return;
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const moment = floorTo(view.origin + (event.clientX - rect.left) / view.pxPerSecond, timeline.scale);
    setSheet({ mode: 'add', at: moment, entry: null });
  }

  /* -------------------------------------------------------------- writes */

  const addEvent = useCallback(
    async (input: NewEventInput): Promise<boolean> => {
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
          return false;
        }
        const created = data.event;
        setEvents((current) => [...current.filter((e) => e.id !== created.id), created].sort((a, b) => a.at - b.at));
        setExpanded(new Set([created.id]));
        setSheet(null);
        // If it landed out of view, bring it in.
        setView((current) => {
          if (!current || !width) return current;
          const x = (created.at - current.origin) * current.pxPerSecond;
          if (x >= 40 && x <= width - 40) return current;
          return { ...current, origin: created.at - width / 2 / current.pxPerSecond };
        });
        if (placing) router.replace(`/timelines/${timeline.slug}`);
        return true;
      } catch {
        ui.toast('Geen verbinding.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [timeline.id, timeline.slug, ui, words.event, width, placing, router],
  );

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
        return true;
      } catch {
        ui.toast('Geen verbinding.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [timeline.id, ui],
  );

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
      } catch {
        ui.toast('Geen verbinding.');
      } finally {
        setBusy(false);
      }
    },
    [timeline.id, ui, words.entry, words.event, words.timeline],
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
    async (patch: { name?: string; description?: string; scale?: Scale }): Promise<boolean> => {
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
  const lastScale = useRef(timeline.scale);
  useEffect(() => {
    if (lastScale.current === timeline.scale) return;
    lastScale.current = timeline.scale;
    void pull();
    if (width) fit(events, width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.scale]);

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
    <div className="timeline-frame">
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
        style={{ height: stageH }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        data-testid="timeline-stage"
      >
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
          return (
            <div
              key={event.id}
              className={`timeline-event timeline-event-${side} timeline-event-${event.kind}${open ? ' timeline-event-open' : ''}`}
              style={{ left: x, top: axisY, ['--event-colour' as string]: colour, ['--reach' as string]: `${reach}px` }}
              data-testid="timeline-event"
              data-event-id={event.id}
            >
              <span className="timeline-stem" />
              <button
                type="button"
                className="timeline-marker"
                aria-label={`${event.name}, ${formatWhen(event.at, event.precision)}`}
                aria-expanded={open}
                onClick={() => toggle(event.id)}
              >
                {event.kind === 'entry' && <Icon name={event.entry?.typeIcon ?? 'file'} size={12} />}
              </button>
              <button type="button" className="timeline-tag" onClick={() => toggle(event.id)} aria-expanded={open} title={formatWhen(event.at, event.precision)}>
                {event.name}
              </button>
            </div>
          );
        })}

        {!events.length && (
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
              />
            );
          })}
      </div>
      </div>

      <p className="tiny muted" style={{ margin: '0.4rem 0 0' }}>
        {events.length} {events.length === 1 ? words.event : words.eventPlural}
        {' · '}sleep om te schuiven, Ctrl+scroll of knijp om te zoomen
        {canEdit && <> · dubbelklik op de as voor een {words.event} op dat moment</>}
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
        </Sheet>
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
      {framed && (
        <div className="timeline-popout-picture">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(image, 'card')} alt="" />
          ) : (
            <span className="timeline-popout-placeholder">
              <Icon name={event.kind === 'entry' ? (event.entry?.typeIcon ?? 'file') : 'note'} size={36} />
            </span>
          )}
        </div>
      )}
      <p className="timeline-popout-when tiny">{formatWhen(event.at, event.precision)}</p>
      <h3 className="timeline-popout-name">{event.name}</h3>
      {event.kind === 'entry' && event.entry?.typeLabel && (
        <p className="tiny muted" style={{ margin: '0 0 0.3rem' }}>
          {event.entry.typeLabel}
        </p>
      )}
      {event.text ? (
        <p className="small timeline-popout-text">{event.text}</p>
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
        {canEdit && !framed && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            title={image ? 'Afbeelding tonen' : 'Sjabloonafbeelding tonen'}
            aria-label={image ? 'Afbeelding tonen' : 'Sjabloonafbeelding tonen'}
            onClick={onShowImage}
          >
            <Icon name="camera" size={13} />
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
