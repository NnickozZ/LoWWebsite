'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { useIsPhone } from '@/components/useIsPhone';
import type { MapPin, MapSummary } from '@/lib/maps/service';

/**
 * §19: one map, its pins, and the legend that switches kinds of pin on and off.
 *
 * The picture is the world: pins live in picture coordinates (0..1) and the
 * picture is panned and zoomed with one CSS transform. The pins are *not* in
 * that transformed layer. They used to be, counter-scaled by 1/zoom, and the
 * browser rasterised them along with the picture — at the picture's scale —
 * so a pin at 4x zoom was a 28 px badge drawn at 7 px and blown up: blurry
 * and unreadable (Nick, 5 Sep 2026). Now each pin is placed in stage pixels,
 * `tx + x·width·zoom`, in a layer of its own that is never scaled, so a
 * speld is crisp and the same size at every zoom — the map grows, the pins
 * do not.
 *
 * Touch: one finger pans, two pinch, a tap on a pin opens it. Mouse: drag
 * pans, the wheel zooms around the pointer, a click on a pin opens it. In
 * "Speld zetten" mode a tap or click on the map asks what goes there.
 */

const MIN_ZOOM_FACTOR = 0.4;
const MAX_ZOOM = 8;
const DRAG_THRESHOLD = 5;
const NOTE_COLOUR = 'var(--stamp-red)';

export type Legend = { key: string; label: string; icon: string; colour: string; count: number };

type View = { zoom: number; tx: number; ty: number };

type Placing =
  | { mode: 'pick' }
  | { mode: 'ask'; x: number; y: number }
  | { mode: 'entry'; entryId: string; entryName: string };

function legendKey(pin: MapPin): string {
  return pin.kind === 'note' ? 'note' : `type:${pin.entry?.typeSlug ?? '?'}`;
}

function readHidden(mapId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(`map-legend:${mapId}`);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeHidden(mapId: string, hidden: Set<string>) {
  try {
    window.localStorage.setItem(`map-legend:${mapId}`, JSON.stringify([...hidden]));
  } catch {
    /* a private window, or storage turned off: the legend just resets next time */
  }
}

/**
 * Whether the desktop legend is unfolded. Folded by default — it covered a
 * good corner of the picture — and remembered per browser, not per map: a
 * person who likes it open likes it open everywhere.
 */
const LEGEND_OPEN_KEY = 'map-legend-open';

function readLegendOpen(): boolean {
  try {
    return window.localStorage.getItem(LEGEND_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeLegendOpen(open: boolean) {
  try {
    window.localStorage.setItem(LEGEND_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* fine */
  }
}

export function MapCanvas({
  map,
  initialPins,
  viewerId,
  isKeeper,
  peopleNames,
}: {
  map: MapSummary;
  initialPins: MapPin[];
  viewerId: string;
  isKeeper: boolean;
  /** §18: who set each pin, by the name they wear — keyed by account id. */
  peopleNames: Record<string, string>;
}) {
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  const search = useSearchParams();
  const isPhone = useIsPhone();

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ zoom: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitZoomRef = useRef(1);

  const [pins, setPins] = useState<MapPin[]>(initialPins);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [onlyMine, setOnlyMine] = useState(false);
  const [find, setFind] = useState('');
  const [busy, setBusy] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  useEffect(() => {
    // Phones start folded regardless; the memory is for the floating panel.
    if (!isPhone) setLegendOpen(readLegendOpen());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleLegend = () => {
    setLegendOpen((open) => {
      if (!isPhone) writeLegendOpen(!open);
      return !open;
    });
  };

  /* ------------------------------------------------------------ geometry */

  const fit = useCallback(
    (size = stageSize) => {
      if (!size.w || !size.h || !map.width || !map.height) return;
      const zoom = Math.min(size.w / map.width, size.h / map.height);
      fitZoomRef.current = zoom;
      setView({
        zoom,
        tx: (size.w - map.width * zoom) / 2,
        ty: (size.h - map.height * zoom) / 2,
      });
    },
    [map.height, map.width, stageSize],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize({ w: rect.width, h: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Fit once the stage has a size; later resizes keep the view the person set.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !stageSize.w) return;
    fitted.current = true;
    fit(stageSize);
  }, [fit, stageSize]);

  const clampZoom = useCallback((zoom: number) => {
    const min = fitZoomRef.current * MIN_ZOOM_FACTOR;
    return Math.min(MAX_ZOOM, Math.max(min, zoom));
  }, []);

  /** Zoom by a factor around a stage point (defaults to the centre). */
  const zoomBy = useCallback(
    (factor: number, at?: { x: number; y: number }) => {
      setView((current) => {
        const next = clampZoom(current.zoom * factor);
        const ratio = next / current.zoom;
        const cx = at?.x ?? stageSize.w / 2;
        const cy = at?.y ?? stageSize.h / 2;
        return { zoom: next, tx: cx - (cx - current.tx) * ratio, ty: cy - (cy - current.ty) * ratio };
      });
    },
    [clampZoom, stageSize.h, stageSize.w],
  );

  const centreOn = useCallback(
    (pin: MapPin, zoom?: number) => {
      const z = zoom ?? Math.max(viewRef.current.zoom, fitZoomRef.current * 2);
      setView({
        zoom: z,
        tx: stageSize.w / 2 - pin.x * map.width * z,
        ty: stageSize.h / 2 - pin.y * map.height * z,
      });
    },
    [map.height, map.width, stageSize.h, stageSize.w],
  );

  /** Stage pixel → picture fraction. */
  const toPicture = useCallback(
    (sx: number, sy: number) => {
      const v = viewRef.current;
      return { x: (sx - v.tx) / (map.width * v.zoom), y: (sy - v.ty) / (map.height * v.zoom) };
    },
    [map.height, map.width],
  );

  /* ------------------------------------------------------------- legend */

  useEffect(() => {
    setHidden(readHidden(map.id));
  }, [map.id]);

  const legend = useMemo<Legend[]>(() => {
    const out = new Map<string, Legend>();
    for (const pin of pins) {
      const key = legendKey(pin);
      const existing = out.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      out.set(key, {
        key,
        label: pin.kind === 'note' ? `${words.note.charAt(0).toUpperCase()}${words.note.slice(1)}s` : (pin.entry?.typeLabel ?? '?'),
        icon: pin.kind === 'note' ? 'note' : (pin.entry?.typeIcon ?? 'file'),
        colour: pin.kind === 'note' ? NOTE_COLOUR : (pin.entry?.typeColour ?? 'var(--ink-muted)'),
        count: 1,
      });
    }
    return [...out.values()].sort((a, b) => (a.key === 'note' ? 1 : b.key === 'note' ? -1 : a.label.localeCompare(b.label)));
  }, [pins, words.note]);

  const toggleKind = (key: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeHidden(map.id, next);
      return next;
    });
  };

  const showAll = () => {
    setHidden(new Set());
    writeHidden(map.id, new Set());
  };

  const shown = useMemo(
    () => pins.filter((pin) => !hidden.has(legendKey(pin)) && (!onlyMine || pin.createdBy === viewerId)),
    [hidden, onlyMine, pins, viewerId],
  );

  const found = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return [];
    return pins.filter((pin) => pin.name.toLowerCase().includes(q)).slice(0, 8);
  }, [find, pins]);

  /* -------------------------------------------------------- deep links */

  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !stageSize.w) return;
    deepLinked.current = true;
    const pinId = search.get('pin');
    if (pinId) {
      const pin = pins.find((p) => p.id === pinId);
      if (pin) {
        centreOn(pin);
        setSelectedId(pin.id);
      }
    }
    const place = search.get('place');
    const placeName = search.get('name');
    if (place) setPlacing({ mode: 'entry', entryId: place, entryName: placeName ?? words.entry });
  }, [centreOn, pins, search, stageSize.w, words.entry]);

  /* ----------------------------------------------------------- pointer */

  type Pointer = { x: number; y: number };
  const pointers = useRef(new Map<number, Pointer>());
  const gesture = useRef<{
    kind: 'pan' | 'pinch' | 'pin';
    moved: boolean;
    start: Pointer;
    view: View;
    pinId?: string;
    /** False for someone else's pin: a drag on it pans the map instead. */
    movable?: boolean;
    pinStart?: { x: number; y: number };
    pinchDist?: number;
    pinchMid?: Pointer;
  } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const stagePoint = (event: { clientX: number; clientY: number }): Pointer => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const mayMove = (pin: MapPin) => isKeeper || pin.createdBy === viewerId;

  const onStagePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const point = stagePoint(event);
    pointers.current.set(event.pointerId, point);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: 'pinch',
        moved: true,
        start: point,
        view: viewRef.current,
        pinchDist: Math.hypot(a.x - b.x, a.y - b.y),
        pinchMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      return;
    }
    if (gesture.current?.kind === 'pin') return;
    gesture.current = { kind: 'pan', moved: false, start: point, view: viewRef.current };
  };

  const onPinPointerDown = (event: React.PointerEvent, pin: MapPin) => {
    // While placing, a pin is just part of the map: the tap lands beside it.
    if (placing) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.stopPropagation();
    const point = stagePoint(event);
    pointers.current.set(event.pointerId, point);
    // The stage holds the capture, so the up arrives there even off the pin.
    // (Which also means no `click` reaches the pin: selection happens on up.)
    stageRef.current?.setPointerCapture(event.pointerId);
    gesture.current = {
      kind: 'pin',
      moved: false,
      start: point,
      view: viewRef.current,
      pinId: pin.id,
      movable: mayMove(pin),
      pinStart: { x: pin.x, y: pin.y },
    };
  };

  const onStagePointerMove = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const point = stagePoint(event);
    pointers.current.set(event.pointerId, point);

    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const factor = dist / (g.pinchDist || dist);
      const zoom = clampZoom(g.view.zoom * factor);
      const ratio = zoom / g.view.zoom;
      const start = g.pinchMid ?? mid;
      setView({
        zoom,
        tx: mid.x - (start.x - g.view.tx) * ratio,
        ty: mid.y - (start.y - g.view.ty) * ratio,
      });
      return;
    }

    const dx = point.x - g.start.x;
    const dy = point.y - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    g.moved = true;

    if (g.kind === 'pan' || (g.kind === 'pin' && !g.movable)) {
      setView({ zoom: g.view.zoom, tx: g.view.tx + dx, ty: g.view.ty + dy });
    } else if (g.kind === 'pin' && g.pinId && g.pinStart) {
      setDragging(g.pinId);
      const x = Math.min(1, Math.max(0, g.pinStart.x + dx / (map.width * g.view.zoom)));
      const y = Math.min(1, Math.max(0, g.pinStart.y + dy / (map.height * g.view.zoom)));
      setPins((current) => current.map((p) => (p.id === g.pinId ? { ...p, x, y } : p)));
    }
  };

  const onStagePointerUp = (event: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(event.pointerId);
    if (!g) return;
    if (g.kind === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null;
      else gesture.current = { kind: 'pan', moved: true, start: [...pointers.current.values()][0], view: viewRef.current };
      return;
    }
    gesture.current = null;

    if (g.kind === 'pin' && g.pinId) {
      setDragging(null);
      if (!g.moved) {
        setSelectedId(g.pinId);
      } else if (g.movable) {
        const pin = pins.find((p) => p.id === g.pinId);
        if (pin) void savePin(pin.id, { x: pin.x, y: pin.y });
      }
      return;
    }

    if (g.kind === 'pan' && !g.moved) {
      // A plain tap on the map.
      const point = stagePoint(event);
      const at = toPicture(point.x, point.y);
      const inside = at.x >= 0 && at.x <= 1 && at.y >= 0 && at.y <= 1;
      if (placing && inside) {
        if (placing.mode === 'entry') {
          void createPin({ kind: 'entry', entryId: placing.entryId, x: at.x, y: at.y });
          setPlacing(null);
        } else {
          setPlacing({ mode: 'ask', x: at.x, y: at.y });
        }
      } else {
        setSelectedId(null);
      }
    }
  };

  const onWheel = (event: React.WheelEvent) => {
    const point = stagePoint(event);
    zoomBy(Math.exp(-event.deltaY * 0.0015), point);
  };

  // React attaches wheel listeners passively; keeping the page from scrolling
  // under the map needs a real one. The legend scrolls on its own.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const block = (event: WheelEvent) => {
      if ((event.target as HTMLElement | null)?.closest('.map-legend')) return;
      event.preventDefault();
    };
    stage.addEventListener('wheel', block, { passive: false });
    return () => stage.removeEventListener('wheel', block);
  }, []);

  /* --------------------------------------------------------------- api */

  const savePin = useCallback(
    async (pinId: string, patch: { x?: number; y?: number; name?: string; text?: string }) => {
      setBusy(true);
      try {
        const response = await fetch(`/api/maps/${map.id}/pins/${pinId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = (await response.json()) as { pin?: MapPin; error?: string };
        if (!response.ok || !data.pin) {
          ui.toast(data.error ?? 'Opslaan is niet gelukt.');
          router.refresh();
          return;
        }
        const saved = data.pin;
        setPins((current) => current.map((p) => (p.id === saved.id ? saved : p)));
      } catch {
        ui.toast('Geen verbinding.');
      } finally {
        setBusy(false);
      }
    },
    [map.id, router, ui],
  );

  const createPin = useCallback(
    async (input: Record<string, unknown>) => {
      setBusy(true);
      try {
        const response = await fetch(`/api/maps/${map.id}/pins`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = (await response.json()) as { pin?: MapPin; error?: string };
        if (!response.ok || !data.pin) {
          ui.toast(data.error ?? 'De speld is niet gezet.');
          return null;
        }
        const made = data.pin;
        setPins((current) => [...current, made]);
        setSelectedId(made.id);
        // A kind that was switched off would hide the pin just set: switch it on.
        setHidden((current) => {
          if (!current.has(legendKey(made))) return current;
          const next = new Set(current);
          next.delete(legendKey(made));
          writeHidden(map.id, next);
          return next;
        });
        ui.toast(`${made.name} staat op ${map.name}.`);
        return made;
      } catch {
        ui.toast('Geen verbinding.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [map.id, map.name, ui],
  );

  const removePin = useCallback(
    async (pin: MapPin) => {
      const yes = await ui.confirm({
        title: `${pin.name} van de ${words.map} halen?`,
        message: pin.kind === 'entry' ? `De ${words.entry} zelf blijft bestaan; alleen de ${words.mapPin} gaat weg.` : undefined,
        confirmLabel: `${words.mapPin.charAt(0).toUpperCase()}${words.mapPin.slice(1)} weghalen`,
        danger: true,
      });
      if (!yes) return;
      setBusy(true);
      try {
        const response = await fetch(`/api/maps/${map.id}/pins/${pin.id}`, { method: 'DELETE' });
        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          ui.toast(data.error ?? 'Weghalen is niet gelukt.');
          return;
        }
        setPins((current) => current.filter((p) => p.id !== pin.id));
        setSelectedId(null);
      } catch {
        ui.toast('Geen verbinding.');
      } finally {
        setBusy(false);
      }
    },
    [map.id, ui, words.entry, words.map, words.mapPin],
  );

  /* ------------------------------------------------------------ render */

  const selected = selectedId ? (pins.find((p) => p.id === selectedId) ?? null) : null;
  const mapWord = words.map;
  const pinWord = words.mapPin;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const legendPanel = (
    <div className="map-legend-body">
      <div className="row" style={{ gap: '0.4rem' }}>
        {isPhone ? (
          <strong className="small">Legenda</strong>
        ) : (
          <button
            type="button"
            className="map-legend-fold"
            aria-expanded={true}
            title="Legenda inklappen"
            onClick={toggleLegend}
          >
            <Icon name="chevron" size={14} className="map-legend-chevron" />
            <strong className="small">Legenda</strong>
          </button>
        )}
        <div className="spacer" />
        {hidden.size > 0 && (
          <button type="button" className="btn btn-ghost btn-small" onClick={showAll}>
            Alles aan
          </button>
        )}
      </div>
      {legend.length === 0 ? (
        <p className="tiny muted" style={{ margin: '0.3rem 0 0' }}>
          Nog geen {words.mapPinPlural}. Zet de eerste met &lsquo;{cap(pinWord)} zetten&rsquo;.
        </p>
      ) : (
        <ul className="map-legend-list">
          {legend.map((item) => {
            const on = !hidden.has(item.key);
            return (
              <li key={item.key}>
                <label className="map-legend-item">
                  <input type="checkbox" checked={on} onChange={() => toggleKind(item.key)} />
                  <span className="map-legend-swatch" style={{ borderColor: item.colour, color: item.colour }}>
                    <Icon name={item.icon} size={12} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
                  <span className="tiny muted">{item.count}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <label className="map-legend-item" style={{ marginTop: '0.4rem' }}>
        <input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)} />
        <span>Alleen mijn {words.mapPinPlural}</span>
      </label>
      <div style={{ position: 'relative', marginTop: '0.5rem' }}>
        <input
          className="input"
          value={find}
          placeholder={`Zoek een ${pinWord}…`}
          aria-label={`Zoek een ${pinWord}`}
          onChange={(event) => setFind(event.target.value)}
        />
        {found.length > 0 && (
          <ul className="suggest-list" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0 }}>
            {found.map((pin) => (
              <li key={pin.id}>
                <button
                  type="button"
                  className="suggest-item"
                  onClick={() => {
                    setFind('');
                    setHidden((current) => {
                      if (!current.has(legendKey(pin))) return current;
                      const next = new Set(current);
                      next.delete(legendKey(pin));
                      writeHidden(map.id, next);
                      return next;
                    });
                    centreOn(pin);
                    setSelectedId(pin.id);
                    setLegendOpen(false);
                  }}
                >
                  <Icon
                    name={pin.kind === 'note' ? 'note' : (pin.entry?.typeIcon ?? 'file')}
                    size={14}
                    style={{ color: pin.kind === 'note' ? NOTE_COLOUR : pin.entry?.typeColour }}
                  />
                  <span>{pin.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="map-page">
      <div className="row-wrap map-toolbar">
        {placing ? (
          <>
            <span className="small">
              <Icon name="crosshair" size={14} />{' '}
              {placing.mode === 'entry'
                ? `Tik op de ${mapWord} waar ${placing.entryName} hoort.`
                : `Tik op de ${mapWord} waar de ${pinWord} moet komen.`}
            </span>
            <button type="button" className="btn btn-small" onClick={() => setPlacing(null)}>
              Annuleren
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => {
              setSelectedId(null);
              setPlacing({ mode: 'pick' });
            }}
          >
            <Icon name="mapPin" size={15} />
            {cap(pinWord)} zetten
          </button>
        )}
        <div className="spacer" />
        {isPhone && (
          <button
            type="button"
            className={`btn btn-small${legendOpen ? ' btn-primary' : ''}`}
            aria-expanded={legendOpen}
            onClick={toggleLegend}
          >
            <Icon name="filter" size={14} />
            Legenda
          </button>
        )}
        <span className="row" style={{ gap: '0.2rem' }} aria-label="Zoomen">
          <button type="button" className="btn btn-ghost btn-small" aria-label="Uitzoomen" onClick={() => zoomBy(1 / 1.4)}>
            <Icon name="zoomOut" size={16} />
          </button>
          <button type="button" className="btn btn-ghost btn-small" aria-label="Inzoomen" onClick={() => zoomBy(1.4)}>
            <Icon name="zoomIn" size={16} />
          </button>
          <button type="button" className="btn btn-ghost btn-small" aria-label="Passend maken" title="Passend maken" onClick={() => fit()}>
            <Icon name="fit" size={16} />
          </button>
        </span>
      </div>

      {isPhone && legendOpen && <div className="map-legend map-legend-phone">{legendPanel}</div>}

      <div
        ref={stageRef}
        className={`map-stage${placing ? ' map-stage-placing' : ''}`}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerUp}
        onWheel={onWheel}
        role="application"
        aria-label={`${cap(mapWord)}: ${map.name}`}
      >
        <div
          className="map-world"
          style={{
            width: map.width,
            height: map.height,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.zoom})`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(map.assetId)} alt={map.name} width={map.width} height={map.height} draggable={false} />
        </div>

        {/* The pins: stage pixels, never scaled — see the note at the top. */}
        <div className="map-pins">
          {shown.map((pin) => {
            const colour = pin.kind === 'note' ? NOTE_COLOUR : (pin.entry?.typeColour ?? 'var(--ink-muted)');
            const isSelected = pin.id === selectedId;
            return (
              <button
                key={pin.id}
                type="button"
                className={`map-pin${isSelected ? ' map-pin-selected' : ''}${dragging === pin.id ? ' map-pin-dragging' : ''}`}
                style={{
                  left: view.tx + pin.x * map.width * view.zoom,
                  top: view.ty + pin.y * map.height * view.zoom,
                  ['--pin-colour' as string]: colour,
                }}
                data-pin-id={pin.id}
                aria-label={pin.name}
                aria-pressed={isSelected}
                onPointerDown={(event) => onPinPointerDown(event, pin)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(pin.id);
                  }
                }}
              >
                <span className="map-pin-head">
                  <Icon name={pin.kind === 'note' ? 'note' : (pin.entry?.typeIcon ?? 'file')} size={13} />
                </span>
                <span className="map-pin-label">{pin.name}</span>
              </button>
            );
          })}
        </div>

        {!isPhone &&
          (legendOpen ? (
            <aside
              className="map-legend"
              // The legend floats over the stage; what happens in it is not a pan.
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
            >
              {legendPanel}
            </aside>
          ) : (
            <button
              type="button"
              className="map-legend-toggle"
              aria-expanded={false}
              title="Legenda uitklappen"
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={toggleLegend}
            >
              <Icon name="filter" size={14} />
              Legenda
              {hidden.size > 0 && (
                <span className="map-legend-badge" title={`${hidden.size} soort${hidden.size === 1 ? '' : 'en'} uit`}>
                  {hidden.size} uit
                </span>
              )}
              {onlyMine && <span className="map-legend-badge">alleen de mijne</span>}
            </button>
          ))}
      </div>

      <p className="tiny muted" style={{ margin: '0.4rem 0 0' }}>
        {shown.length} van {pins.length} {pins.length === 1 ? pinWord : words.mapPinPlural} te zien
        {' · '}sleep om te schuiven, scroll of knijp om te zoomen
      </p>

      {selected && (
        <Sheet onClose={() => setSelectedId(null)} labelledBy="pin-title">
          <PinSheet
            pin={selected}
            busy={busy}
            mayEdit={mayMove(selected)}
            setBy={selected.createdBy ? (peopleNames[selected.createdBy] ?? null) : null}
            onSave={(patch) => void savePin(selected.id, patch)}
            onRemove={() => void removePin(selected)}
          />
        </Sheet>
      )}

      {placing?.mode === 'ask' && (
        <Sheet onClose={() => setPlacing(null)} labelledBy="new-pin-title">
          <NewPinSheet
            busy={busy}
            onEntry={(entryId) => {
              void createPin({ kind: 'entry', entryId, x: placing.x, y: placing.y }).then(() => setPlacing(null));
            }}
            onNote={(name, text) => {
              void createPin({ kind: 'note', name, text, x: placing.x, y: placing.y }).then(() => setPlacing(null));
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

function PinSheet({
  pin,
  busy,
  mayEdit,
  setBy,
  onSave,
  onRemove,
}: {
  pin: MapPin;
  busy: boolean;
  mayEdit: boolean;
  setBy: string | null;
  onSave: (patch: { name?: string; text?: string }) => void;
  onRemove: () => void;
}) {
  const ui = useUi();
  const words = ui.words;
  const [name, setName] = useState(pin.name);
  const [text, setText] = useState(pin.text);
  const dirty = name !== pin.name || text !== pin.text;

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span
          className="map-pin-head map-pin-head-static"
          style={{ ['--pin-colour' as string]: pin.kind === 'note' ? NOTE_COLOUR : pin.entry?.typeColour }}
        >
          <Icon name={pin.kind === 'note' ? 'note' : (pin.entry?.typeIcon ?? 'file')} size={14} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="pin-title" style={{ margin: 0 }}>
            {pin.name}
          </h2>
          <p className="tiny muted" style={{ margin: '0.2rem 0 0' }}>
            {pin.kind === 'note' ? `${words.note.charAt(0).toUpperCase()}${words.note.slice(1)} op de ${words.map}` : pin.entry?.typeLabel}
            {setBy && <> · gezet door {setBy}</>}
          </p>
        </div>
      </div>

      {pin.kind === 'entry' && pin.entry && (
        <>
          {pin.entry.shortDescription && <p className="small" style={{ margin: 0 }}>{pin.entry.shortDescription}</p>}
          <p style={{ margin: 0 }}>
            <Link className="btn btn-small btn-primary" href={`/e/${pin.entry.slug}`}>
              <Icon name="file" size={14} />
              {words.entry.charAt(0).toUpperCase() + words.entry.slice(1)} openen
            </Link>
          </p>
        </>
      )}

      {pin.kind === 'note' &&
        (mayEdit ? (
          <>
            <label className="label" htmlFor="pin-name">
              Naam
            </label>
            <input id="pin-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
            <label className="label" htmlFor="pin-text">
              Tekst
            </label>
            <textarea
              id="pin-text"
              className="input"
              rows={4}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            {dirty && (
              <p style={{ margin: 0 }}>
                <button type="button" className="btn btn-small btn-primary" disabled={busy || !name.trim()} onClick={() => onSave({ name, text })}>
                  Opslaan
                </button>
              </p>
            )}
          </>
        ) : (
          pin.text && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{pin.text}</p>
        ))}

      {mayEdit ? (
        <p className="tiny muted" style={{ margin: 0 }}>
          Sleep de {words.mapPin} om hem te verplaatsen.
        </p>
      ) : (
        <p className="tiny muted" style={{ margin: 0 }}>
          Deze {words.mapPin} is van iemand anders: alleen wie hem zette, of een {words.keeper}, kan hem verplaatsen of
          weghalen.
        </p>
      )}

      {mayEdit && (
        <p style={{ margin: 0 }}>
          <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={onRemove}>
            <Icon name="trash" size={14} />
            {words.mapPin.charAt(0).toUpperCase() + words.mapPin.slice(1)} weghalen
          </button>
        </p>
      )}
    </div>
  );
}

type PinSuggestion = {
  id: string;
  name: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
};

/**
 * "Wat komt hier?" — one box, and a list that grows under it. The list is in
 * the flow of the sheet, not floated over it: a floating list inside a sheet
 * that scrolls gave a scrollbar for eight rows of results (Nick, 5 Sep 2026).
 * Every choice is a row: an existing artikel, a new one with this name, or a
 * note with this name — the note's text is typed on the pin once it stands.
 */
function NewPinSheet({
  busy,
  onEntry,
  onNote,
}: {
  busy: boolean;
  onEntry: (entryId: string) => void;
  onNote: (name: string, text: string) => void;
}) {
  const ui = useUi();
  const words = ui.words;
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PinSuggestion[]>([]);
  const typed = query.trim();
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  useEffect(() => {
    if (!typed) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(typed)}&limit=8`, { signal: controller.signal });
        if (!response.ok) return;
        const data = (await response.json()) as { entries: PinSuggestion[] };
        setItems(data.entries ?? []);
      } catch {
        /* aborted, or offline: the list just stays as it was */
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typed]);

  return (
    <div className="stack">
      <h2 id="new-pin-title" style={{ margin: 0 }}>
        Wat komt hier?
      </h2>
      <div>
        <label className="visually-hidden" htmlFor="new-pin-query">
          Zoek een {words.entry}, of typ een naam voor een {words.note}
        </label>
        <input
          id="new-pin-query"
          className="input"
          value={query}
          placeholder={`Zoek een ${words.entry}…`}
          autoFocus
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter takes the first row: the best match, else the note.
            if (event.key !== 'Enter' || !typed || busy) return;
            event.preventDefault();
            if (items[0]) onEntry(items[0].id);
            else onNote(typed, '');
          }}
        />
        <p className="tiny muted" style={{ margin: '0.3rem 0 0' }}>
          Een bestaand {words.entry} uit de lijst, een nieuw {words.entry} met deze naam, of een losse {words.note}.
        </p>
      </div>

      {typed && (
        <ul className="suggest-list pin-choices" aria-label="Wat hier kan komen">
          {items.map((entry) => (
            <li key={entry.id}>
              <button type="button" className="suggest-item" disabled={busy} onClick={() => onEntry(entry.id)}>
                <Icon name={entry.typeIcon} size={15} style={{ color: entry.typeColour }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{entry.name}</strong>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {entry.typeLabel}
                  </span>
                </span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="suggest-item" disabled={busy} onClick={() => onNote(typed, '')}>
              <Icon name="note" size={15} style={{ color: NOTE_COLOUR }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>
                  {cap(words.note)} &lsquo;{typed}&rsquo; zetten
                </strong>
                <span className="tiny muted" style={{ display: 'block' }}>
                  Een losse aantekening op de {words.map}; de tekst typ je zo op de {words.mapPin}.
                </span>
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className="suggest-item"
              disabled={busy}
              onClick={() =>
                ui.openNewEntry({
                  name: typed,
                  onCreated: (entry) => onEntry(entry.id),
                })
              }
            >
              <Icon name="plus" size={15} style={{ color: 'var(--stamp-red)' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>&lsquo;{typed}&rsquo; als nieuw {words.entry} aanmaken</strong>
                <span className="tiny muted" style={{ display: 'block' }}>
                  Het {words.entry} komt in de wiki én op deze plek.
                </span>
              </span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
