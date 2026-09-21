'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { cameraKey } from '@/components/canvas/cameraKeys';
import CanvasZoomControls from '@/components/canvas/CanvasZoomControls';
import { DRAG_SLOP, passedSlop, wheelFactor, ZOOM_STEP } from '@/lib/canvas/view';
import { MentionRow, MentionText } from '@/components/ui/MentionPopover';
import { LiveField, LiveFields, useLiveFields } from '@/components/live/LiveFields';
import { useLive, useLiveChanges } from '@/components/live/LiveProvider';
import type { LiveUser } from '@/components/editor/useLiveDoc';
import { mapKey, pinFieldsRoomKey } from '@/lib/live/keys';
import { popoverIsOpen } from '@/lib/popoverStack';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { useMayType } from '@/components/you/AuthorProvider';
import { AUTHOR_GATE_OFF, useCanvasAuthorGate } from '@/components/canvas/useCanvasAuthorGate';
import { useIsPhone } from '@/components/useIsPhone';
import { fuzzyScore } from '@/lib/search/fuzzy';
import type { MapPin, MapSummary } from '@/lib/maps/service';
import {
  CLUSTER_RADIUS,
  clusterPins,
  layerAfter,
  viewForCluster,
  type LayerCommand,
} from '@/lib/maps/cluster';
import { InkCanvas } from '@/components/ink/InkCanvas';
import { InkShell } from '@/components/ink/InkShell';
import { UnderFold } from '@/components/ink/UnderFold';
import { usePanZoomInk } from '@/components/ink/panZoom';
import { useCanvasInk } from '@/components/ink/useCanvasInk';
import type { InkLayerView } from '@/lib/ink/types';
import { SUGGEST_DEBOUNCE_MS } from '@/lib/search/suggest';
import { useMakeOnEmpty } from '@/components/canvas/useMakeOnEmpty';
import { usePinch } from '@/components/canvas/usePinch';
import { useMarqueeSelect } from '@/components/canvas/useMarqueeSelect';
import { groupDelta, normaliseRect } from '@/lib/canvas/select';
import { UNDO_LIMIT, createUndoStack, type UndoStack } from '@/components/canvas/undoStack';
import CanvasUndoButton from '@/components/canvas/CanvasUndoButton';
import { useCanvasMode } from '@/components/canvas/useCanvasMode';
import CanvasModeToggle from '@/components/canvas/CanvasModeToggle';
import { CanvasPeek } from '@/components/canvas/CanvasPeek';

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

/*
 * §69: the landkaart keeps its own two zoom numbers, and that is a decision
 * rather than a leftover. Zoom 1 here means *one picture pixel per screen
 * pixel* — so a 400 px drawing at the shared ceiling of 2.5 would still be a
 * postage stamp, and a 4000 px survey map at the shared floor of 0.25 is still
 * perfectly readable. The floor is a fraction of whatever "fits", the ceiling
 * is absolute. What is shared is the road they travel: `clampZoom` below. The
 * shared `FIT_PADDING` is the one thing this canvas does *not* take — see the
 * note in `fit`.
 */
const MIN_ZOOM_FACTOR = 0.4;
const MAX_ZOOM = 8;
/** §69: the threshold itself is shared; this name is used all over the file. */
const DRAG_THRESHOLD = DRAG_SLOP;
const NOTE_COLOUR = 'var(--stamp-red)';
/**
 * §39: a speld that stands for another landkaart. The ink blue the archive
 * uses for a way through to somewhere else, so a doorway does not read as a
 * notitie (red) or as a fiche (its type's own colour).
 */
const MAP_COLOUR = 'var(--link)';

export type Legend = { key: string; label: string; icon: string; colour: string; count: number };

type View = { zoom: number; tx: number; ty: number };

/**
 * §69: one step back on a landkaart. See the note on `undoStackRef` for why
 * this is an action rather than a snapshot.
 */
type MapUndo =
  | { kind: 'move'; pinId: string; x: number; y: number }
  /* §69 (2.1): een groep die in één gebaar verplaatst is, gaat in één stap terug. */
  | { kind: 'moveMany'; at: Record<string, { x: number; y: number }> }
  | { kind: 'remove'; pinId: string }
  /* §69 (3.2): Delete op een keuze van zes is één stap, niet zes. */
  | { kind: 'removeMany'; pinIds: string[] };

/**
 * §69 (2.1): hoe groot een speldenkop is op het scherm, in pixels, gedeeld door
 * twee. Een kader raakt een speld als het zijn kop raakt — niet zijn punt, want
 * een punt van nul bij nul wordt door `boxesTouch` (streng, met opzet) nooit
 * geraakt. Bij elke zoom omgerekend naar breuken van de plaat, want de kop
 * groeit níet mee (dat is de hele reden dat spelden in een eigen laag staan).
 */
const PIN_HALF_PX = 14;

type Placing =
  | { mode: 'pick' }
  | { mode: 'ask'; x: number; y: number }
  | { mode: 'entry'; entryId: string; entryName: string };

/**
 * Which legend row a speld belongs to. A notitie is a notitie, a landkaart
 * speld is a landkaart — one row for all of them, so "Landkaarten" can be
 * switched off like any other kind — and a fiche speld is its own type.
 */
function legendKey(pin: MapPin): string {
  if (pin.kind === 'note') return 'note';
  if (pin.kind === 'map') return 'map';
  return `type:${pin.entry?.typeSlug ?? '?'}`;
}

/**
 * The colour and the icon of a speld, in one place. The kind branches in three
 * views — the legend, the head on the map, the head in the sheet — and they
 * drifted apart once already when the notitie was added.
 */
function pinColour(pin: MapPin): string {
  if (pin.kind === 'note') return NOTE_COLOUR;
  if (pin.kind === 'map') return MAP_COLOUR;
  return pin.entry?.typeColour ?? 'var(--ink-muted)';
}

/**
 * §39: a landkaart speld wears the map icon, not a thumbnail of the map. The
 * pin layer is deliberately never scaled (see the note at the top), so a
 * picture there would be new visual weight at every zoom — and the icon is the
 * one `subjectOf` already gives a landkaart on a prikbord.
 */
function pinIcon(pin: MapPin): string {
  if (pin.kind === 'note') return 'note';
  if (pin.kind === 'map') return 'map';
  return pin.entry?.typeIcon ?? 'file';
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

/**
 * The empty div a landkaart's page leaves below the canvas (`UnderFold` in
 * `components/ink/UnderFold.tsx` — §34: the Keeper's tekenlaag switch is a
 * tool, and 132 px of tool on a telephone is a third of the map).
 */
const UNDER_FOLD_ID = 'map-underfold';

export function MapCanvas({
  map,
  initialPins,
  pickableMaps,
  viewerId,
  isKeeper,
  peopleNames,
  liveUser,
  initialInk,
}: {
  map: MapSummary;
  initialPins: MapPin[];
  /**
   * §39: the landkaarten a speld may point at — every one this viewer may see,
   * minus this one. Handed over whole and matched in the browser, exactly as a
   * prikbord does it (`pickableMaps` in `BoardCanvas`): the list is short, and
   * a search road of its own would be a second set of rules about who may see
   * which landkaart.
   */
  pickableMaps: { id: string; name: string }[];
  /** §33: the tekenlaag, as this viewer may see it. */
  initialInk: InkLayerView;
  viewerId: string;
  isKeeper: boolean;
  /** §21: this person's name and ink, for the shared fields of a note pin. */
  liveUser: LiveUser;
  /** §18: who set each pin, by the name they wear — keyed by account id. */
  peopleNames: Record<string, string>;
}) {
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  const search = useSearchParams();
  const isPhone = useIsPhone();
  /*
   * §18b: a speld says who set it ("Gezet door …"), so setting one asks for a
   * name first. Without an onderzoeker the landkaart is a picture with pins on
   * it: it pans, it zooms, its legend works, and nothing on it moves.
   */
  const mayType = useMayType();
  // Read by the callbacks below, which are built once and would otherwise
  // close over the answer as it was then.
  const mayTypeRef = useRef(mayType);
  mayTypeRef.current = mayType;
  /*
   * §73: Lezen of Bewerken. Everything this glas lets a hand change — setting a
   * speld, moving one, its laag, the potlood — asks an onderzoeker first
   * (§18b), so that is the right the switch narrows: a hand that could never
   * set a speld here has one mode and no switch. A phone opens in Lezen, a desk
   * in Bewerken, and nothing is remembered.
   */
  const mode = useCanvasMode(mayType);
  const editing = mode.editing;
  /* Read by the keydown listener, which is bound once. */
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ zoom: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitZoomRef = useRef(1);

  const [pins, setPins] = useState<MapPin[]>(initialPins);
  /*
   * §69 (2.1) — de landkaart kiest zoals het prikbord en de stamboom.
   *
   * Tot deze ronde kon een landkaart precies één speld tegelijk aan: één
   * `selectedId`, geen shift, geen kader, en dus geen manier om er drie te
   * verplaatsen of vier weg te halen. Dat was de laatste rij van tafel 1 die
   * nog `TOEVAL` zei — het was niet zo besloten, het was er nooit van gekomen.
   *
   * **De wereld is hier de plaat, in breuken.** Een speld staat opgeslagen als
   * een breuk van de afbeelding (0–1), niet in pixels, want de plaat schaalt en
   * de speld moet meeschuiven maar niet meegroeien. Dus is dát de ruimte waarin
   * geveegd en geraakt wordt: `toWorld` is `toPicture`, en `boxOf` geeft een
   * vakje rond het punt zo groot als de kop op het scherm — bij deze zoom, want
   * dát is wat de hand ziet aanwijzen.
   *
   * `selectedId` bestaat nog als *de speld van het blad*: precies één gekozen.
   * Twee bronnen van waarheid zijn er één te veel, dus het is afgeleid en niet
   * bewaard.
   */
  /*
   * Twee spiegels voor de hook: hij leest ze in een `pointerdown`, lang nadat
   * deze render voorbij is, dus ze mogen verderop in het bestand gevuld worden.
   */
  const shownRef = useRef<MapPin[]>([]);
  /** `selection.clear` bestaat pas verderop; een toets leest hem hierdoor. */
  const clearSelectionRef = useRef<() => void>(() => {});
  /** Wat er nu gekozen is, voor een pointer-handler die geen render afwacht. */
  const selectionRef = useRef<Set<string>>(new Set());
  /** Het openstaande kader, zoals het de lijn op gaat (§8: zicht, geen staat). */
  const boxRef = useRef<[number, number, number, number] | null>(null);
  const stagePointRef = useRef<(event: { clientX: number; clientY: number }) => Pointer>(() => ({
    x: 0,
    y: 0,
  }));
  const selection = useMarqueeSelect<MapPin>({
    items: () => shownRef.current,
    boxOf: (pin) => {
      const v = viewRef.current;
      const half = PIN_HALF_PX / v.zoom;
      return {
        x: pin.x - half / map.width,
        y: pin.y - half / map.height,
        width: (half * 2) / map.width,
        height: (half * 2) / map.height,
      };
    },
    toWorld: (clientX, clientY) => {
      const point = stagePointRef.current({ clientX, clientY });
      return toPicture(point.x, point.y);
    },
    /* Geen kader op een telefoon (geen shift), niet met het potlood uit, en
       niet terwijl er een speld geplaatst wordt: dan is een tik een plek. */
    enabled: !isPhone,
    mode: 'replace',
    /*
     * **Geen `onBroadcast` hier**, en dat is geen vergetelheid.
     *
     * De hook rondt het kader af op hele getallen voor de lijn — verstandig op
     * een prikbord en een stamboom, waar de wereld in pixels telt, en fataal
     * hier: een landkaart telt in bréuken van de plaat, dus `Math.round` maakt
     * van elk kader 0 of 1. Het kader gaat daarom hieronder mee in `reportHand`,
     * rechtstreeks uit `selection.marquee`, ongerond.
     */
  });
  const selectedIds = selection.selected;
  selectionRef.current = selectedIds;
  clearSelectionRef.current = selection.clear;
  /* Zie hierboven: ongerond, want dit zijn breuken van de plaat. */
  boxRef.current = selection.marquee
    ? [selection.marquee.x0, selection.marquee.y0, selection.marquee.x1, selection.marquee.y1]
    : null;
  /** Het blad hoort bij een keuze van precies één. */
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;
  const selectOnly = useCallback(
    (id: string | null) => {
      if (id === null) selection.clear();
      else selection.setSelected(new Set([id]));
    },
    [selection],
  );
  /** Waar de oude code `setSelectedId(x)` zei. */
  const setSelectedId = selectOnly;
  const [placing, setPlacing] = useState<Placing | null>(null);
  /*
   * §73: leaving Bewerken puts the crosshair down (the potlood is put down
   * next to `useCanvasInk` below). Declared *before* the `?place=` effect on
   * purpose: effects run in the order they are written, and a phone that
   * hydrates into Lezen in the same commit that link turns Bewerken back on
   * must cancel first and set the crosshair second, not the other way round.
   */
  useEffect(() => {
    if (!editing) setPlacing(null);
  }, [editing]);
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
      /*
       * §69: air round the picture, and a ceiling.
       *
       * This used to divide the stage by the picture and take the answer as
       * read, which fitted a picture much smaller than the stage at a zoom
       * above the ceiling — a 200×150 drawing on a 1440 px screen opened at
       * 5.04, and the first press of "Inzoomen" *shrank* it, because `zoomBy`
       * clamps and `fit` did not. The ceiling is the fix, and it stays.
       *
       * The **air does not**, and that is this canvas's one named exception to
       * §69's shared `FIT_PADDING` (Nick, round 35). The other three are
       * drawings with things scattered over them, and a card sitting hard
       * against the glass reads as cut off. A landkaart is one rectangle you
       * look *into*: the picture is the whole subject, and 48 px on each side
       * of a 390 px phone is a quarter of the screen given away to nothing.
       * So a landkaart fills the glass.
       */
      const room = { w: Math.max(1, size.w), h: Math.max(1, size.h) };
      const zoom = Math.min(MAX_ZOOM, Math.min(room.w / map.width, room.h / map.height));
      // The floor is a fraction of *this* number (`clampZoom`), so it is the
      // fit itself that is remembered, not the clamped view.
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
        label:
          pin.kind === 'note'
            ? `${words.note.charAt(0).toUpperCase()}${words.note.slice(1)}s`
            : pin.kind === 'map'
              ? `${words.mapPlural.charAt(0).toUpperCase()}${words.mapPlural.slice(1)}`
              : (pin.entry?.typeLabel ?? '?'),
        icon: pinIcon(pin),
        colour: pinColour(pin),
        count: 1,
      });
    }
    return [...out.values()].sort((a, b) => (a.key === 'note' ? 1 : b.key === 'note' ? -1 : a.label.localeCompare(b.label)));
  }, [pins, words.mapPlural, words.note]);

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
  /* §69 (2.1): een kader veegt alleen op wat te zien is — een speld die de
     legenda heeft uitgezet hoort niet stilletjes in een keuze te belanden. */
  shownRef.current = shown;

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
    // §18b: "Zet op de landkaart" arrives as a URL; without an onderzoeker
    // there is nothing to set, so the crosshair never comes up.
    if (place && mayTypeRef.current) {
      // §73: the person pressed "Zet op de landkaart" to set a speld — that is
      // a hand asking for Bewerken, even on a phone that opens in Lezen.
      mode.setMode('edit');
      setPlacing({ mode: 'entry', entryId: place, entryName: placeName ?? words.entry });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreOn, pins, search, stageSize.w, words.entry]);

  /* ----------------------------------------------------------- pointer */

  type Pointer = { x: number; y: number };
  const pointers = useRef(new Map<number, Pointer>());
  const gesture = useRef<{
    kind: 'pan' | 'pin';
    moved: boolean;
    start: Pointer;
    view: View;
    pinId?: string;
    /** False for someone else's pin: a drag on it pans the map instead. */
    movable?: boolean;
    pinStart?: { x: number; y: number };
    /*
     * §69 (2.1): waar élke meegenomen speld stond toen de druk begon. Een
     * groepssleep rekent altijd vanaf dáár en nooit vanaf waar iets nu staat,
     * anders telt de sleep zichzelf frame na frame op (`groupDelta`).
     */
    groupStart?: Map<string, { x: number; y: number }>;
  } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  /* ---------------------------------------------------------------- live */

  // §21: the map is a place. Other people's hands and the pins they carry are
  // drawn from the site line; a pin someone else moved, set or removed is
  // pulled again the moment the archive says so — except the one under this
  // person's own hand, which lands where they put it.
  const live = useLive();

  /*
   * §33: the tekenlaag, in picture pixels under the same pan and zoom as the
   * picture. Its width scales with the zoom like the picture does. §67: the
   * wiring is `useCanvasInk`, the same in all four places; what stays here is
   * the space the picture is panned in (`tx`/`ty` under this canvas's own
   * names) and the corner the bar stands in.
   */
  const inkView = useMemo(() => ({ x: view.tx, y: view.ty, zoom: view.zoom }), [view]);
  const inkSpace = usePanZoomInk(stageRef, inkView);
  const ink = useCanvasInk({
    kind: 'map',
    id: map.id,
    initial: initialInk,
    project: inkSpace.project,
    toContent: inkSpace.toContent,
    widthScale: view.zoom,
    noun: `deze ${words.map}`,
    onError: (message) => ui.toast(message),
    onOpen: () => setSelectedId(null),
    stopPropagation: true,
  });
  /* §90: the §18b question only where this glas can write — Bewerken, or the
     potlood in the hand. Lezen and the legend's search ask nothing. */
  const gate = useCanvasAuthorGate(editing || ink.inkActive);
  const onInkKey = ink.onKeyDown;
  /*
   * §73: leaving Bewerken puts the potlood down too (the crosshair went at
   * `placing`). An open capture sheet would otherwise go on drawing in Lezen.
   */
  const setInkActive = ink.inkTool.setActive;
  const inkToolActive = ink.inkTool.active;
  useEffect(() => {
    if (!editing && inkToolActive) setInkActive(false);
  }, [editing, inkToolActive, setInkActive]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (onInkKey(event)) return;
      // §69: `+`, `−` and `0` move the camera here too.
      /*
       * §69: Ctrl+Z, as on the prikbord and the stamboom. Below `onInkKey`,
       * which answers first while the potlood is out — with the pencil in hand
       * the stage belongs to the tekenlaag and its own Ctrl+Z takes back a
       * stroke (§33).
       */
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        // §73: a step back moves or digs up a speld — that is Bewerken's.
        if (!editingRef.current) return;
        event.preventDefault();
        void undoRef.current();
        return;
      }
      /*
       * §69 (2.1/3.2): Escape wist de keuze, Delete haalt hem weg. Allebei de
       * gewoonte van het prikbord en de stamboom; de landkaart kende geen van
       * beide, want er viel niets te wissen zolang er maar één speld tegelijk
       * gekozen kon worden.
       */
      if (event.key === 'Escape') {
        if (selectionRef.current.size === 0) return;
        event.preventDefault();
        selectionRef.current = new Set();
        clearSelectionRef.current();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // §73: in Lezen a key is never a way to lose a speld.
        if (selectionRef.current.size === 0 || !editingRef.current) return;
        event.preventDefault();
        void removeSelectedRef.current();
        return;
      }
      const camera = cameraKey(event);
      if (!camera) return;
      event.preventDefault();
      if (camera === 'fit') fit();
      else zoomBy(camera === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onInkKey, fit, zoomBy]);

  /*
   * §69 (3.3): Escape closes the docked speld-blad.
   *
   * The `Sheet` this replaced on the desktop brought Escape with it, and four
   * specs in `maps.spec.ts` press it to put a speld away — but the reason to
   * keep it is not the specs. A panel that can only be closed by finding a
   * small cross with the mouse is worse than the sheet it replaces, and Escape
   * is what every other floating thing in this archive answers to.
   *
   * Two differences from the effect above. It listens on `document` in the
   * **capture** phase, as `Sheet` does, so it hears the press before whatever
   * has focus inside the panel; and it does **not** bail on an `INPUT` target,
   * because the panel's own name and text boxes are exactly where the caret
   * usually is when somebody wants it gone. What it does defer to is an open
   * popover — the `@`-list of the notitie's text box — so one press peels one
   * layer, the same rule `Sheet` follows.
   *
   * §74: not on a phone. There the blad is a `CanvasPeek`, which answers
   * Escape itself on `window` — after the canvas's own listener above, which
   * clears the choice and marks the press handled, so one press closes it once.
   */
  useEffect(() => {
    if (isPhone || !selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (popoverIsOpen()) return;
      event.stopPropagation();
      setSelectedId(null);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isPhone, selectedId]);

  /*
   * §69: the keydown listener is bound once for the life of the canvas, so it
   * reaches `undo` through a ref rather than closing over the one that existed
   * when it was bound.
   */
  const undoRef = useRef<() => Promise<void>>(async () => {});
  const draggingRef = useRef<string | null>(null);
  draggingRef.current = dragging;
  /** §69: undo runs from a keystroke and from a toast, both outside a render. */
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  useLiveChanges([mapKey(map.id)], () => {
    void (async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/pins`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { pins?: MapPin[] };
        if (!Array.isArray(data.pins)) return;
        const held = draggingRef.current;
        setCarried((current) => (current.size ? new Map() : current));
        setPins((current) => {
          const mine = held ? current.find((p) => p.id === held) : undefined;
          const next = data.pins!.map((pin) => (mine && pin.id === mine.id ? mine : pin));
          if (mine && !next.some((p) => p.id === mine.id)) next.push(mine);
          return JSON.stringify(next) === JSON.stringify(current) ? current : next;
        });
      } catch {
        /* the next signal tries again */
      }
    })();
  });
  /*
   * §67/§69 (2.1): wat déze hand vasthoudt gaat de lijn op, zodat iedereen
   * anders er een ring omheen ziet (`.map-held`). Het was alleen de speld die
   * op dat moment gesleept werd; nu is het de hele keuze, want een keuze is
   * precies het ding dat je "vasthoudt" — de hub kapt af op zestig.
   */
  const holdingKey = [...selectedIds].sort().join(',');
  useEffect(() => {
    live.setHolding(holdingKey ? holdingKey.split(',') : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingKey]);
  /**
   * Where other people's pins are right now, before their drop is saved. A
   * position sticks after the hand lets go, until the pins are pulled again —
   * otherwise the pin would jump back to its old place for the moment between
   * the drop and the save reaching this screen.
   */
  /**
   * §69 (2.1): wie wat vasthoudt. Eén ring per speld — zie de tekening beneden.
   * De roster van de site-lijn laat deze tab er zelf al uit, maar niet elke
   * bron doet dat, dus het wordt hier nog eens gezegd.
   */
  const heldByOthers = useMemo(() => {
    const held = new Map<string, { name: string; colour: string }>();
    for (const person of live.people) {
      if (person.clientId === live.clientId) continue;
      for (const id of person.holding ?? []) {
        if (!held.has(id)) held.set(id, { name: person.name, colour: person.colour });
      }
    }
    return held;
  }, [live.people, live.clientId]);

  const [carried, setCarried] = useState<Map<string, [number, number]>>(new Map());
  useEffect(() => {
    setCarried((current) => {
      let changed = false;
      const next = new Map(current);
      for (const pointer of live.pointers) {
        for (const [id, pos] of Object.entries(pointer.m)) {
          const known = next.get(id);
          if (!known || known[0] !== pos[0] || known[1] !== pos[1]) {
            next.set(id, pos);
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }, [live.pointers]);

  const stagePoint = (event: { clientX: number; clientY: number }): Pointer => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };
  stagePointRef.current = stagePoint;

  /** §18b: the right — this hand may move and pull this speld at all. */
  const mayTouch = (pin: MapPin) => mayType && (isKeeper || pin.createdBy === viewerId);
  /*
   * §73: and whether it may *now*. In Lezen a press on your own speld is a
   * press on someone else's: it pans the map (`movable: false`), and a tap
   * still opens the blad.
   */
  const mayMove = (pin: MapPin) => editing && mayTouch(pin);
  /* Voor een toetsaanslag, die buiten een render om gebeurt. */
  const mayMoveRef = useRef(mayMove);
  mayMoveRef.current = mayMove;

  const onStagePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const point = stagePoint(event);
    pointers.current.set(event.pointerId, point);
    /*
     * §69/§66: **no pointer capture yet** — it is taken at the drag threshold
     * in `onStagePointerMove`. Chromium retargets the compatibility mouse
     * events at the capture element, so a stage that captures on the way down
     * swallows the `click` of anything inside it. The stamboom was taught this
     * by a spec; the landkaart, whose spelden carry links in their blad, was
     * still doing it the old way.
     */

    // §72: a second finger never gets this far — `pinchHand` took it in the
    // capture phase and stopped it, so everything below is one hand.
    if (gesture.current?.kind === 'pin') return;
    /*
     * §67/§69 (2.1): shift op kaal papier veegt een kader; een gewone sleep
     * pant, zoals op alle vier. Het kader vervángt wat er gekozen was — een
     * veeg die begint met zes spelden nog omlijnd leest als "voeg toe aan
     * deze".
     */
    if (event.shiftKey && selection.beginMarquee(event)) {
      selection.clear();
      gesture.current = { kind: 'pan', moved: true, start: point, view: viewRef.current };
      return;
    }
    gesture.current = { kind: 'pan', moved: false, start: point, view: viewRef.current };
  };

  const onPinPointerDown = (event: React.PointerEvent, pin: MapPin) => {
    // While placing, a pin is just part of the map: the tap lands beside it.
    if (placing) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.stopPropagation();
    const point = stagePoint(event);
    pointers.current.set(event.pointerId, point);
    /*
     * §69/§66: the capture is taken at the drag threshold, in
     * `onStagePointerMove`, and the stage is what takes it — so the up arrives
     * there even when the hand has left the speld. Until then the speld keeps
     * its own events, which is what lets a press that goes nowhere stay a
     * press on the speld rather than a press on the stage.
     */
    /*
     * §67/§69 (2.1): shift wisselt, een gewone druk op iets dat al gekozen is
     * laat de hele groep staan (`pressSelection`) — want de volgende
     * millimeter is een groepssleep.
     */
    const already = selectionRef.current.has(pin.id);
    selection.select(pin.id, event.shiftKey, already);

    /*
     * Wie er meegaat: de gekozen spelden die deze hand ook mág verplaatsen. Een
     * speld van iemand anders in de keuze blijft staan in plaats van de sleep
     * te weigeren — je hebt hem niet aangeraakt, je hebt hem aangewezen.
     */
    const group = new Map<string, { x: number; y: number }>();
    if (!event.shiftKey && already && selectionRef.current.size > 1) {
      for (const one of pinsRef.current) {
        if (selectionRef.current.has(one.id) && mayMove(one)) group.set(one.id, { x: one.x, y: one.y });
      }
    }
    if (!group.has(pin.id) && mayMove(pin)) group.set(pin.id, { x: pin.x, y: pin.y });

    gesture.current = {
      kind: 'pin',
      moved: false,
      start: point,
      view: viewRef.current,
      pinId: pin.id,
      movable: mayMove(pin),
      pinStart: { x: pin.x, y: pin.y },
      groupStart: group,
    };
  };

  const reportHand = (point: Pointer, moving?: Record<string, [number, number]>) => {
    const at = toPicture(point.x, point.y);
    const inside = at.x >= 0 && at.x <= 1 && at.y >= 0 && at.y <= 1;
    /*
     * §69 (2.1): `m` draagt nu een hele groep in plaats van één speld, en `s`
     * het kader. Een frame is een *staat*, geen telegram (§67), dus `s` gaat
     * expliciet als `null` mee zodra het kader dicht is — anders blijft er op
     * het andere scherm een rechthoek staan die hier allang weg is.
     */
    live.reportPointer(
      inside ? { x: at.x, y: at.y, m: moving ?? {}, s: boxRef.current } : null,
    );
  };

  const onStagePointerMove = (event: React.PointerEvent) => {
    const point = stagePoint(event);
    const g = gesture.current;
    if (!g) {
      if (event.pointerType !== 'touch') reportHand(point);
      return;
    }
    pointers.current.set(event.pointerId, point);

    /* §69 (2.1): het kader eet de beweging op; het frame gaat mee via `reportHand`. */
    if (selection.onPointerMove(event)) {
      if (event.pointerType !== 'touch') reportHand(point);
      return;
    }

    const dx = point.x - g.start.x;
    const dy = point.y - g.start.y;
    // §69: one threshold, one shape of sum, on all four canvases.
    if (!g.moved && !passedSlop(dx, dy, DRAG_THRESHOLD)) return;
    if (!g.moved) {
      /*
       * §69/§66: *now* the capture. The hand really is carrying something — the
       * picture or a speld — so the up belongs to the stage wherever it lands,
       * and swallowing the trailing click is exactly right.
       */
      stageRef.current?.setPointerCapture(event.pointerId);
    }
    g.moved = true;

    if (g.kind === 'pan' || (g.kind === 'pin' && !g.movable)) {
      setView({ zoom: g.view.zoom, tx: g.view.tx + dx, ty: g.view.ty + dy });
    } else if (g.kind === 'pin' && g.pinId && g.pinStart) {
      setDragging(g.pinId);
      /*
       * §69 (2.1): de hele groep, in één som. `groupDelta` rondt niet af hier —
       * een speld staat in breuken van de plaat, en afronden op hele getallen
       * zou elke speld naar de hoek 0,0 of 1,1 gooien. (Dat is precies waarom
       * die schakelaar bestaat.)
       */
      const ddx = dx / (map.width * g.view.zoom);
      const ddy = dy / (map.height * g.view.zoom);
      const moved = groupDelta(g.groupStart ?? new Map(), ddx, ddy, false);
      const clamped: Record<string, { x: number; y: number }> = {};
      for (const [id, at] of Object.entries(moved)) {
        clamped[id] = { x: Math.min(1, Math.max(0, at.x)), y: Math.min(1, Math.max(0, at.y)) };
      }
      setPins((current) => current.map((p) => (clamped[p.id] ? { ...p, ...clamped[p.id] } : p)));
      if (event.pointerType !== 'touch') {
        const hands: Record<string, [number, number]> = {};
        for (const [id, at] of Object.entries(clamped)) hands[id] = [at.x, at.y];
        reportHand(point, hands);
      }
      return;
    }
    if (event.pointerType !== 'touch') reportHand(point);
  };

  const onStagePointerUp = (event: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(event.pointerId);
    if (!g) return;
    gesture.current = null;

    if (g.kind === 'pin' && g.pinId) {
      setDragging(null);
      boxRef.current = null;
      /*
       * §69 (2.1): het einde van de druk. Een shift-druk op iets dat al gekozen
       * was wisselt hier pas — als de hand niet gereisd heeft (`endPress`); een
       * druk die wél reisde was een sleep en laat de keuze met rust.
       */
      selection.endPress(g.moved);
      if (!g.moved) {
        // De keuze is al gezet in `onPinPointerDown`; hier valt niets meer te
        // kiezen. Het blad volgt uit "precies één gekozen".
      } else if (g.movable && g.groupStart) {
        const moving = [...g.groupStart.keys()];
        const now = pinsRef.current.filter((p) => g.groupStart!.has(p.id));
        if (now.length) {
          /* Eén stap terug voor het hele gebaar, niet één per speld. */
          if (moving.length === 1) {
            const only = g.groupStart.get(moving[0])!;
            rememberUndo({ kind: 'move', pinId: moving[0], x: only.x, y: only.y });
          } else {
            rememberUndo({ kind: 'moveMany', at: Object.fromEntries(g.groupStart) });
          }
          for (const pin of now) void savePin(pin.id, { x: pin.x, y: pin.y });
        }
      }
      return;
    }

    /* §69 (2.1): een kader dat dichtgaat kiest wat het raakte. */
    if (selection.onPointerUp(event)) {
      boxRef.current = null;
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

  /*
   * §69: the capture is lazy now, so a press that leaves the stage *before* it
   * passes the threshold never comes back as a pointerup here — and a gesture
   * left standing would make the next press on the picture read as the tail of
   * this one. The prikbord has kept this same net since §61; this is its shape.
   * A gesture that moved took the capture and needs no help.
   */
  useEffect(() => {
    const finish = () => {
      const g = gesture.current;
      if (!g || g.moved) return;
      gesture.current = null;
      pointers.current.clear();
      setDragging(null);
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, []);

  const onWheel = (event: React.WheelEvent) => {
    /*
     * §69: a sideways swipe pans, as it does on the prikbord and the stamboom.
     * `deltaX` used to be read by nobody here, so the gesture was silent.
     */
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      setView((current) => ({ ...current, tx: current.tx - event.deltaX }));
      return;
    }
    const point = stagePoint(event);
    zoomBy(wheelFactor(event.deltaY, event.deltaMode), point);
  };

  // React attaches wheel listeners passively; keeping the page from scrolling
  // under the map needs a real one. The legend scrolls on its own.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const block = (event: WheelEvent) => {
      // §69 (3.3): the docked speld-blad scrolls on its own, like the legend.
      if ((event.target as HTMLElement | null)?.closest('.map-legend, .map-panel')) return;
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
        /*
         * §5/§69: the last third of the gap CLAUDE.md names. A speld that was
         * **created** and one that was **removed** have refreshed since round
         * 13; a speld that was **moved** did not, so walking down the chip and
         * coming back up put it back where it stood before the drag. One
         * refresh per gesture, and only where something actually moved — a
         * name or a line of text typed in the blad is already live.
         */
        if (patch.x !== undefined || patch.y !== undefined) router.refresh();
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
      // §18b: nothing to sign a speld with. The archive would refuse it too.
      if (!mayTypeRef.current) return null;
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
        /*
         * §5: the page under this canvas is server-rendered, so the browser is
         * holding a payload of this landkaart from before the speld existed.
         * Without this, walking down a landkaart speld and coming back up the
         * chip lands on that older payload and the speld is not there — which
         * is exactly the road §39 just built. The write already happened; this
         * only brings the page behind it into line.
         */
        router.refresh();
        return made;
      } catch {
        ui.toast('Geen verbinding.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [map.id, map.name, router, ui],
  );

  /**
   * §69: bare cork asks what goes there — a double-click on a desk, a
   * half-second press on a phone, the same gesture the tijdlijn has had since
   * §62 and the wall and the stamboom got in the same round.
   *
   * It opens the *same* sheet the "Speld zetten" button opens, at the point
   * under the hand, rather than a second road into `createPin`: a speld may be
   * an artikel, a notitie or another landkaart, and that question has one
   * place to be asked.
   *
   * Only inside the picture. The stage is much larger than the drawing on it
   * (§6's note about `.map-world`), and a double-click on bare stage is a
   * double-click on nothing.
   */
  const makeOnEmpty = useMakeOnEmpty({
    /* §73: making is Bewerken's; in Lezen a long press on the map is just a press. */
    enabled: mayType && editing && !ink.ink.enabled && !placing,
    /* §71: het cijfertje is een knop, geen kaal papier — een dubbelklik erop
       vraagt geen nieuwe speld, hij zoomt in. */
    ignore: '.map-pin, .map-cluster-badge, .map-legend, .map-legend-toggle, .map-panel',
    busy: () => Boolean(gesture.current?.moved),
    onMake: ({ clientX, clientY }) => {
      const point = stagePoint({ clientX, clientY });
      const at = toPicture(point.x, point.y);
      if (at.x < 0 || at.x > 1 || at.y < 0 || at.y > 1) return;
      setPlacing({ mode: 'ask', x: at.x, y: at.y });
    },
  });

  /*
   * §72: the knijp. It used to live in this file's own pointer list, which
   * kept a finger whose `pointerup` never came back — a speld that folded into
   * a kluitje under the zoom (§71) took its up with it — and then read the next
   * single finger as a knijp against that ghost. And a second finger that
   * landed *on* a speld replaced the knijp with a speld-press.
   */
  const viewNow = useRef(view);
  viewNow.current = view;
  const pinchHand = usePinch({
    stageRef,
    clamp: clampZoom,
    read: () => ({ x: viewNow.current.tx, y: viewNow.current.ty, zoom: viewNow.current.zoom }),
    write: (next) => {
      const v = { zoom: next.zoom, tx: next.x, ty: next.y };
      viewNow.current = v;
      viewRef.current = v;
      setView(v);
    },
    onStart: () => {
      makeOnEmpty.cancel();
      const g = gesture.current;
      gesture.current = null;
      pointers.current.clear();
      boxRef.current = null;
      if (g?.kind === 'pin' && g.moved && g.groupStart) {
        // A speld half-way across the picture goes back where it stood: the
        // hand changed its mind into a knijp, not into a drop.
        const back = g.groupStart;
        setPins((current) => current.map((p) => (back.has(p.id) ? { ...p, ...back.get(p.id)! } : p)));
      }
      setDragging(null);
    },
  });

  /**
   * §69: put it back. The road behind the toast — see `restorePin`.
   *
   * It does not put the speld back into `pins` from the client's own copy: it
   * asks the archive and takes what comes back, because in between somebody
   * else may have moved it, renamed it, or turned the note into an artikel.
   * The undo is "un-remove", not "restore my snapshot".
   */
  /**
   * §69: Ctrl+Z on a landkaart.
   *
   * The prikbord and the stamboom have had an undo since §61 and §66; the
   * landkaart and the tijdlijn had none at all, which is the last row of the
   * contract's "Ongedaan" block that still read TOEVAL.
   *
   * What goes on the stack here is **not a snapshot of the canvas**, the way it
   * is on the other two. Those own a document; this one owns rows in a table
   * that other people are writing to at the same time, so a snapshot would
   * quietly put back somebody else's speld along with yours. An *action to
   * reverse* is the honest unit: where this speld was, or which speld to dig up.
   *
   * §29's rule stands and is why there is no `'add'` here: undo never deletes
   * server-side, because one person's Ctrl+Z must not take away a speld another
   * hand set meanwhile.
   */
  const undoStackRef = useRef<UndoStack<MapUndo> | null>(null);
  if (!undoStackRef.current) undoStackRef.current = createUndoStack<MapUndo>(UNDO_LIMIT);
  const undoStack = undoStackRef.current;
  /** Only so the button can go grey; the stack itself is the truth. */
  const [undoDepth, setUndoDepth] = useState(0);
  const rememberUndo = useCallback(
    (step: MapUndo) => {
      undoStack.push(step);
      setUndoDepth(undoStack.size());
    },
    [undoStack],
  );

  const undoRemovePin = useCallback(
    async (pinId: string) => {
      try {
        const response = await fetch(`/api/maps/${map.id}/pins/${pinId}/restore`, { method: 'POST' });
        const data = (await response.json()) as { pin?: MapPin; error?: string };
        if (!response.ok || !data.pin) {
          ui.toast(data.error ?? 'Terugzetten is niet gelukt.');
          return;
        }
        const back = data.pin;
        setPins((current) => (current.some((p) => p.id === back.id) ? current : [...current, back]));
        setSelectedId(back.id);
        router.refresh();
      } catch {
        ui.toast('Geen verbinding.');
      }
    },
    [map.id, router, ui],
  );

  /**
   * §69: the speld comes off without being asked about, and the question is in
   * the toast afterwards.
   *
   * It used to open a `ui.confirm` first. Four canvases disagreed about that —
   * the prikbord took a card off a wall with no question at all — and of the two
   * answers, this is the one that costs nothing when you meant it and costs one
   * press when you did not. What makes it honest rather than merely faster is
   * that `removePin` buries the row instead of deleting it, so *Ongedaan maken*
   * gives back the same speld: same id, same hand, same karakter.
   *
   * A whole landkaart is still asked about. That is a different thing — it goes
   * to the prullenbak, which is where a Keeper looks for it by name, and the
   * question there is not "did you mean to?" but "do you know what hangs in it?"
   */
  const removePin = useCallback(
    async (pin: MapPin) => {
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
        // §5, as above: a pulled speld must not come back on the way back up.
        router.refresh();
        // Not `cap` — that is declared further down the component, so naming it
        // in the dep list below would read it in its own temporal dead zone.
        const what = pin.name || words.mapPin.charAt(0).toUpperCase() + words.mapPin.slice(1);
        // §69: the toast and Ctrl+Z are the same step, so it goes on the stack
        // too — a hand that missed the toast has four seconds *and* a keystroke.
        rememberUndo({ kind: 'remove', pinId: pin.id });
        ui.toast(`${what} is van de ${words.map} gehaald.`, {
          label: 'Ongedaan maken',
          onAction: () => void undoRemovePin(pin.id),
        });
      } catch {
        ui.toast('Geen verbinding.');
      } finally {
        setBusy(false);
      }
    },
    [map.id, rememberUndo, router, ui, undoRemovePin, words.map, words.mapPin],
  );

  /**
   * §69 (3.2) — Delete haalt de hele keuze weg, in één stap en met één melding.
   *
   * Dezelfde regel als overal sinds deze ronde: geen bevestiging vooraf, de
   * vraag zit in de toast erna, en de rij wordt *begraven* zodat *Ongedaan
   * maken* dezelfde spelden teruggeeft — met hun id, hun hand en hun karakter.
   *
   * Wat er niet van deze hand is, blijft staan. Stil, en dat is met opzet: je
   * hebt die speld niet aangeraakt, je hebt hem aangewezen, en een melding
   * "vier weggehaald, twee geweigerd" bij elke veeg over een drukke plaat is
   * lawaai. Het aantal in de toast zegt wat er écht gebeurd is.
   */
  const removeSelected = useCallback(async () => {
    const mine = pinsRef.current.filter((p) => selectionRef.current.has(p.id) && mayMoveRef.current(p));
    if (!mine.length) return;
    setBusy(true);
    const gone: string[] = [];
    try {
      for (const pin of mine) {
        const response = await fetch(`/api/maps/${map.id}/pins/${pin.id}`, { method: 'DELETE' });
        if (response.ok) gone.push(pin.id);
      }
      if (!gone.length) {
        ui.toast('Weghalen is niet gelukt.');
        return;
      }
      const dead = new Set(gone);
      setPins((current) => current.filter((p) => !dead.has(p.id)));
      selection.clear();
      router.refresh();
      rememberUndo({ kind: 'removeMany', pinIds: gone });
      const what =
        gone.length === 1
          ? (mine.find((p) => p.id === gone[0])?.name ?? cap(words.mapPin))
          : `${gone.length} ${words.mapPinPlural}`;
      ui.toast(`${what} ${gone.length === 1 ? 'is' : 'zijn'} van de ${words.map} gehaald.`, {
        label: 'Ongedaan maken',
        onAction: () => void Promise.all(gone.map((id) => undoRemovePin(id))),
      });
    } catch {
      ui.toast('Geen verbinding.');
    } finally {
      setBusy(false);
    }
  }, [map.id, rememberUndo, router, selection, ui, undoRemovePin, words.map, words.mapPin, words.mapPinPlural]);
  const removeSelectedRef = useRef(removeSelected);
  removeSelectedRef.current = removeSelected;

  /**
   * §69: one step back.
   *
   * Reverses the action rather than restoring a picture of the canvas, so two
   * hands on one landkaart do not undo each other's work — the whole reason the
   * stack holds actions (see `undoStackRef`).
   *
   * A step that cannot be taken says so instead of failing quietly: a speld
   * somebody else has since pulled, or one swept after a day
   * (`sweepDeletedRows`), answers with a toast rather than a silent no-op.
   */
  const undo = useCallback(async () => {
    const step = undoStack.pop();
    setUndoDepth(undoStack.size());
    if (!step) return;
    if (step.kind === 'move') {
      const pin = pinsRef.current.find((p) => p.id === step.pinId);
      if (!pin) {
        ui.toast('Die speld is er niet meer.');
        return;
      }
      // Put it back on the glass first, then tell the archive — the same order
      // a drag uses, so the picture never waits on the round trip.
      setPins((current) => current.map((p) => (p.id === step.pinId ? { ...p, x: step.x, y: step.y } : p)));
      await savePin(step.pinId, { x: step.x, y: step.y });
      return;
    }
    if (step.kind === 'moveMany') {
      /* §69 (2.1): één gebaar, één stap terug — ook al waren het zes spelden. */
      const here = new Set(pinsRef.current.map((p) => p.id));
      const back = Object.entries(step.at).filter(([id]) => here.has(id));
      if (!back.length) {
        ui.toast(`Die ${words.mapPinPlural} zijn er niet meer.`);
        return;
      }
      setPins((current) =>
        current.map((p) => (step.at[p.id] ? { ...p, x: step.at[p.id].x, y: step.at[p.id].y } : p)),
      );
      for (const [id, at] of back) await savePin(id, { x: at.x, y: at.y });
      return;
    }
    if (step.kind === 'removeMany') {
      /*
       * §69 (3.2): alle begraven rijen weer omhoog. Elke `restore` kan op
       * zichzelf mislukken — iemand anders kan er één definitief hebben
       * opgeruimd — en dat is geen reden om de rest te laten liggen.
       */
      for (const id of step.pinIds) await undoRemovePin(id);
      return;
    }
    await undoRemovePin(step.pinId);
  }, [savePin, ui, undoRemovePin, undoStack, words.mapPinPlural]);
  undoRef.current = undo;

  /**
   * §8: a note speld becomes the speld of an artikel, without moving.
   *
   * The sibling of `onConvertToEntry` on a prikbord: the same sheet, seeded the
   * same way (the note's name becomes the artikel's name, its text the
   * one-liner), and when the artikel comes back the thing on the wall is
   * patched in place rather than pulled and re-set. No `caseId` here — a
   * prikbord can hang off a dossier, a landkaart hangs off nothing.
   */
  const convertToEntry = useCallback(
    (pin: MapPin, seed: { name: string; text: string }) => {
      ui.openNewEntry({
        // What is on the screen, not what was last pulled: the name and text of
        // a note speld are a shared field room, and the sheet's own copy is the
        // newest one this person has (§21, §25).
        name: seed.name,
        shortDescription: seed.text,
        onCreated: (created) => {
          void (async () => {
            setBusy(true);
            try {
              const response = await fetch(`/api/maps/${map.id}/pins/${pin.id}`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ entryId: created.id }),
              });
              const data = (await response.json()) as { pin?: MapPin; error?: string };
              if (!response.ok || !data.pin) {
                // The artikel was made either way, so say what did not happen:
                // it is the speld that is still a notitie, not the writing.
                ui.toast(data.error ?? `De ${words.mapPin} is niet omgezet.`);
                return;
              }
              const saved = data.pin;
              setPins((current) => current.map((p) => (p.id === saved.id ? saved : p)));
              // The speld's legend key changed with its kind; a soort that was
              // switched off would hide the speld that was just converted.
              setHidden((current) => {
                if (!current.has(legendKey(saved))) return current;
                const next = new Set(current);
                next.delete(legendKey(saved));
                writeHidden(map.id, next);
                return next;
              });
              ui.toast(`${created.name} staat nu op ${map.name}.`);
            } catch {
              ui.toast('Geen verbinding.');
            } finally {
              setBusy(false);
            }
          })();
        },
      });
    },
    [map.id, map.name, ui, words.mapPin],
  );

  /* --------------------------------------------------------------- §71 */

  /**
   * §71: de laag van één speld verzetten.
   *
   * De rekensom staat in `lib/maps/cluster.ts` en gebeurt hier, want hier
   * liggen alle spelden al op tafel — "Voorgrond" is "één boven de hoogste die
   * er verder ligt", en dat is een vraag over de hele landkaart. De server
   * krijgt dus een getal, geen bevel: `PATCH … { layer }`.
   */
  const changeLayer = useCallback(
    async (pin: MapPin, command: LayerCommand) => {
      const next = layerAfter(command, pin, pinsRef.current);
      if (next === pin.layer) return;
      // Meteen op het glas; de server bevestigt hem zo.
      setPins((current) => current.map((p) => (p.id === pin.id ? { ...p, layer: next } : p)));
      setBusy(true);
      try {
        const response = await fetch(`/api/maps/${map.id}/pins/${pin.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ layer: next }),
        });
        const data = (await response.json()) as { pin?: MapPin; error?: string };
        if (!response.ok || !data.pin) {
          ui.toast(data.error ?? 'Opslaan is niet gelukt.');
          router.refresh();
          return;
        }
        const saved = data.pin;
        setPins((current) => current.map((p) => (p.id === saved.id ? saved : p)));
        // §5: een canvas op een servergetekende pagina ververst na élke schrijf.
        router.refresh();
      } catch {
        ui.toast('Geen verbinding.');
      } finally {
        setBusy(false);
      }
    },
    [map.id, router, ui],
  );

  /**
   * §71: wie hoort er bij wie, bij deze zoom.
   *
   * Nooit iemand die op dit moment gedrágen wordt — deze hand of die van een
   * ander. Een speld die halverwege een sleep onder een `+3` verdwijnt omdat
   * hij langs een andere kwam, is een speld die je kwijt bent, en de hele groep
   * gaat mee omdat de hele groep meereist.
   *
   * **Kiezen telt hier niet mee**, en dat is een keuze: een speld aanwijzen zou
   * anders het kluitje uit elkaar laten springen terwijl je ernaar kijkt. Een
   * speld die onder een `+n` ligt bereik je door op dat cijfertje te drukken —
   * dat is waar het voor is.
   */
  const keepApart = useMemo(() => {
    const keep = new Set<string>();
    if (dragging) {
      keep.add(dragging);
      for (const id of selectedIds) keep.add(id);
    }
    for (const id of carried.keys()) keep.add(id);
    return keep;
  }, [carried, dragging, selectedIds]);

  const clusters = useMemo(
    () =>
      clusterPins(shown, {
        zoom: view.zoom,
        picture: { width: map.width, height: map.height },
        radius: CLUSTER_RADIUS,
        keep: keepApart,
      }),
    [keepApart, map.height, map.width, shown, view.zoom],
  );

  /** §71: één klik op een `+n` zet precies díe spelden op het glas. */
  const zoomToCluster = useCallback(
    (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
      setView((current) =>
        viewForCluster(bounds, { width: map.width, height: map.height }, { w: stageSize.w, h: stageSize.h }, current, {
          step: ZOOM_STEP,
          minZoom: fitZoomRef.current * MIN_ZOOM_FACTOR,
          maxZoom: MAX_ZOOM,
        }),
      );
    },
    [map.height, map.width, stageSize.h, stageSize.w],
  );

  /* ------------------------------------------------------------ render */

  const selected = selectedId ? (pins.find((p) => p.id === selectedId) ?? null) : null;

  /**
   * §69 (3.3) — the speld's blad is one component with two chromes.
   *
   * It was a modal `Sheet` on every screen, and that was the last thing on the
   * landkaart that made the surface unusable while something was open: a scrim
   * over the picture, focus trapped in the panel, and no way to look at where
   * the speld actually stands while reading what it says. The prikbord has not
   * worked that way since §52 — `BoardInspector` is docked to the cork and the
   * wall goes on living behind it — and the contract's axis 3 says the four
   * surfaces answer this the same way.
   *
   * So: on a desk the panel is docked inside the stage (`.map-panel`), the
   * picture pans and zooms behind it, and a press on another speld simply moves
   * the panel to that one. On a phone there is no room to dock anything beside
   * a picture, so it comes up from below — since §74 as a `CanvasPeek`, not a
   * modal `Sheet`: at most a third of the screen, no scrim, the map above it
   * still pans and the next speld is one tap away. What the speld *is* comes
   * first in `PinSheetBody` (head, a clamped line of text, the way through),
   * and what you can do to it scrolls below.
   *
   * Two things the desktop panel keeps from the sheet on purpose:
   * `role="dialog"` (without `aria-modal`, which would be a lie) so the panel
   * still says what it is and the four specs that find it by name still do, and
   * Escape, which closes it — four specs press Escape to put a speld away and,
   * more to the point, a panel you can only close with the mouse is a step
   * backwards from the sheet it replaces.
   */
  const pinPanel = selected ? (
    <PinSheet
      /* A different speld is a different blad: its name and text boxes must
         not keep the last one's typing (the peek swaps in place, §74). */
      key={selected.id}
      pin={selected}
      busy={busy}
      /* §73: the blad's own fields and buttons are a deliberate press and stay
         in Lezen; only arranging (the laag) and the drag hint are Bewerken's. */
      mayEdit={mayTouch(selected)}
      arranging={mayMove(selected)}
      setBy={selected.createdBy ? (peopleNames[selected.createdBy] ?? null) : null}
      onSave={(patch) => void savePin(selected.id, patch)}
      onRemove={() => void removePin(selected)}
      onConvert={(seed) => convertToEntry(selected, seed)}
      onLayer={(command) => void changeLayer(selected, command)}
      liveUser={liveUser}
    />
  ) : null;

  const mapWord = words.map;
  const pinWord = words.mapPin;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const legendPanel = (
    /* §90: a legend filters and finds — reading, in either mode. */
    <div className="map-legend-body" {...AUTHOR_GATE_OFF}>
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
                    name={pinIcon(pin)}
                    size={14}
                    style={{ color: pinColour(pin) }}
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
    <div className="map-page" {...gate}>
      <div className="row-wrap map-toolbar">
        {/* §73: first in the row, as on every glas; nothing for a hand that may not set a speld. */}
        <CanvasModeToggle mode={mode} />
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
          /* §73: gone in Lezen. A hand with no onderzoeker still sees it
             greyed, so the author gate can ask for one on the press (§18b). */
          (!mode.canEdit || editing) && (
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={!mayType}
            onClick={() => {
              setSelectedId(null);
              setPlacing({ mode: 'pick' });
            }}
            /* §64/§69 (6.6): de letters mogen weg op 390 px, de naam nooit —
               en vier specs zoeken deze knop op zijn naam. */
            aria-label={`${cap(pinWord)} zetten`}
            title={`${cap(pinWord)} zetten`}
          >
            <Icon name="mapPin" size={15} />
            <span className="canvas-tool-word">{cap(pinWord)} zetten</span>
          </button>
          )
        )}
        <div className="spacer" />
        {isPhone && (
          <button
            type="button"
            className={`btn btn-small${legendOpen ? ' btn-primary' : ''}`}
            aria-expanded={legendOpen}
            aria-label="Legenda"
            title="Legenda"
            onClick={toggleLegend}
          >
            <Icon name="filter" size={14} />
            <span className="canvas-tool-word">Legenda</span>
          </button>
        )}
        {/* §69: the shared block. The third button was called "Passend maken"
            here and "Alles in beeld" on the other three; the number beside it
            is picture pixels per screen pixel, which is what zoom means on a
            landkaart. */}
        <CanvasZoomControls
          percent={view.zoom * 100}
          onOut={() => zoomBy(1 / ZOOM_STEP)}
          onIn={() => zoomBy(ZOOM_STEP)}
          onFit={() => fit()}
        />
        {/* §69: a landkaart had no undo at all before this round. */}
        {/* §73: greyed in Lezen rather than gone, so the row keeps its width. */}
        {mayType && <CanvasUndoButton onUndo={() => void undo()} canUndo={editing && undoDepth > 0} />}
      </div>

      {/*
        §69 (5.7): op een telefoon is de legenda een blad dat van onderen opkomt.

        Het stond in de stroom *boven* het glas, en dat is op 390 px het duurste
        dat er is: §34 geeft de stage het scherm, en een opengeklapte legenda
        met zes soorten, een zoekvak en een vinkje nam er de helft van af — je
        kon dus de filters zien óf de landkaart waarop ze werken. Een blad ligt
        eróver, met een raakdoel per rij, en gaat weg als je het dichtdoet.

        Het `.map-legend`-omhulsel blijft, want de helper in `maps.spec.ts`
        zoekt de legenda daarop en de rijen eronder zijn dezelfde rijen.
      */}
      {isPhone && legendOpen && (
        <Sheet onClose={toggleLegend} labelledBy="map-legend-title">
          <h2 id="map-legend-title" className="label" style={{ margin: '0 0 0.5rem' }}>
            Legenda
          </h2>
          <div className="map-legend map-legend-phone">{legendPanel}</div>
        </Sheet>
      )}

      <div
        ref={stageRef}
        className={`map-stage${placing ? ' map-stage-placing' : ''}`}
        onDoubleClick={makeOnEmpty.onDoubleClick}
        onPointerDownCapture={(event) => {
          // §72: a second finger is a knijp, before a speld under it can start a press.
          if (pinchHand.onPointerDown(event) && !(event.target as HTMLElement).closest('.ink-capture')) {
            event.stopPropagation();
          }
        }}
        onPointerMoveCapture={(event) => {
          if (pinchHand.onPointerMove(event)) event.stopPropagation();
        }}
        onPointerUpCapture={(event) => {
          if (pinchHand.onPointerUp(event)) event.stopPropagation();
        }}
        onPointerDown={(event) => {
          onStagePointerDown(event);
          makeOnEmpty.onPointerDown(event);
        }}
        onPointerMove={(event) => {
          onStagePointerMove(event);
          makeOnEmpty.onPointerMove(event);
        }}
        onPointerUp={(event) => {
          makeOnEmpty.cancel();
          onStagePointerUp(event);
        }}
        onPointerCancel={(event) => {
          makeOnEmpty.cancel();
          onStagePointerUp(event);
        }}
        onPointerLeave={() => live.reportPointer(null)}
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

        {/* §33: the tekenlaag, over the picture and under the spelden. */}
        <InkCanvas
          className="ink-layer"
          {...ink.layerProps}
          viewKey={`${view.tx},${view.ty},${view.zoom}`}
          width={stageSize.w}
          height={stageSize.h}
        />

        {/*
          §69 (2.1): het kader, terwijl het getrokken wordt.

          Getekend in stage-pixels als een gewoon vlak, want de spelden staan
          ook in stage-pixels — het kader en wat het raakt moeten op hetzelfde
          scherm hetzelfde beeld geven. De rekenkunde blijft in breuken van de
          plaat (daar hoort hij, want een speld staat zo opgeslagen); dit is
          alleen de weg terug naar het glas.
        */}
        {selection.marquee && (
          <div
            className="map-marquee"
            data-testid="map-marquee"
            style={(() => {
              const box = normaliseRect(selection.marquee);
              return {
                left: view.tx + box.x * map.width * view.zoom,
                top: view.ty + box.y * map.height * view.zoom,
                width: box.width * map.width * view.zoom,
                height: box.height * map.height * view.zoom,
              };
            })()}
          />
        )}

        {/* The pins: stage pixels, never scaled — see the note at the top. */}
        <div className="map-pins">
          {/*
            §71: getekend per groepje, van achter naar voren.

            `clusterPins` geeft de koppen al in tekenvolgorde terug, dus de laag
            doet hier geen `z-index` nodig: wie later in de lijst staat, staat
            later in de DOM en ligt dus bovenop. Staat er iemand achter de kop,
            dan komt er een `+n` naast, en die `+n` is het enige wat erover
            vertelt — niets verdwijnt, en er verschijnt geen zwevend lijstje.
          */}
          {clusters.map(({ lead: pin, count, bounds }) => {
            const colour = pinColour(pin);
            const isSelected = selectedIds.has(pin.id);
            // A pin in someone else's hand is drawn where their hand has it.
            const hand = dragging === pin.id ? undefined : carried.get(pin.id);
            const px = hand ? hand[0] : pin.x;
            const py = hand ? hand[1] : pin.y;
            const left = view.tx + px * map.width * view.zoom;
            const top = view.ty + py * map.height * view.zoom;
            return (
              <Fragment key={pin.id}>
                <button
                  type="button"
                  className={`map-pin${isSelected ? ' map-pin-selected' : ''}${dragging === pin.id ? ' map-pin-dragging' : ''}${hand ? ' map-pin-carried' : ''}`}
                  style={{ left, top, ['--pin-colour' as string]: colour }}
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
                    <Icon name={pinIcon(pin)} size={13} />
                  </span>
                  <span className="map-pin-label">{pin.name}</span>
                </button>
                {count > 0 && (
                  /*
                    §71: het cijfertje. Middelharnis (+10).

                    Een knop op zichzelf, en niet een hoekje van de speld: hij doet
                    iets anders (inzoomen in plaats van het blad openen) en hij
                    moet op een telefoon een eigen raakdoel hebben. Hij stopt zijn
                    eigen pointer-events, want de stage pakt op de drempel de
                    pointer capture en zou de klik erna naar zich toe trekken — een
                    zwevende knop die dat niet doet is niet ingedrukt te krijgen
                    (§6).
                  */
                  <button
                    type="button"
                    className="map-cluster-badge"
                    style={{ left, top }}
                    data-cluster-for={pin.id}
                    data-testid="map-cluster-badge"
                    aria-label={`Nog ${count} ${count === 1 ? words.mapPin : words.mapPinPlural} hier — inzoomen`}
                    title={`Nog ${count} ${count === 1 ? words.mapPin : words.mapPinPlural} hier`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerUp={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      zoomToCluster(bounds);
                    }}
                  >
                    +{count}
                  </button>
                )}
              </Fragment>
            );
          })}
          {/*
            §69 (2.1): een ring om een speld die iemand anders vasthoudt.

            Het prikbord en de stamboom tekenen die al sinds §67; de landkaart
            kon niets vasthouden en had hem dus niet nodig. Eén ring per speld:
            twee mensen op dezelfde speld is zeldzaam en gestapelde ringen zijn
            soep.
          */}
          {shown.map((pin) => {
            const holder = heldByOthers.get(pin.id);
            if (!holder) return null;
            const hand = carried.get(pin.id);
            return (
              <div
                key={`held-${pin.id}`}
                className="map-held map-pin"
                aria-hidden="true"
                style={{
                  left: view.tx + (hand ? hand[0] : pin.x) * map.width * view.zoom,
                  top: view.ty + (hand ? hand[1] : pin.y) * map.height * view.zoom,
                  ['--held-colour' as string]: holder.colour,
                }}
              >
                <span className="map-pin-head" />
              </div>
            );
          })}

          {/*
            §69 (2.1): het kader dat iemand anders trekt. Zicht, geen staat
            (§67): het staat er zolang hun frame het noemt en het is weg zodra
            hun frame `null` zegt.
          */}
          {live.pointers.map((pointer) =>
            !pointer.s ? null : (
              <div
                key={`box-${pointer.clientId}`}
                className="map-marquee map-marquee-other"
                aria-hidden="true"
                style={{
                  left: view.tx + Math.min(pointer.s[0], pointer.s[2]) * map.width * view.zoom,
                  top: view.ty + Math.min(pointer.s[1], pointer.s[3]) * map.height * view.zoom,
                  width: Math.abs(pointer.s[2] - pointer.s[0]) * map.width * view.zoom,
                  height: Math.abs(pointer.s[3] - pointer.s[1]) * map.height * view.zoom,
                  ['--marquee-colour' as string]: pointer.colour,
                }}
              />
            ),
          )}

          {/* §21: everyone else's hand, in picture coordinates under this viewer's pan and zoom. */}
          {live.pointers.map((pointer) =>
            pointer.x === null || pointer.y === null ? null : (
              <div
                key={pointer.clientId}
                className="board-cursor map-cursor"
                aria-hidden="true"
                style={{
                  left: view.tx + pointer.x * map.width * view.zoom,
                  top: view.ty + pointer.y * map.height * view.zoom,
                  ['--cursor-colour' as string]: pointer.colour,
                }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" className="board-cursor-arrow">
                  <path d="M4 3l7.5 17 2.3-7.2L21 10.5z" />
                </svg>
                <span className="board-cursor-name">{pointer.name}</span>
              </div>
            ),
          )}
        </div>

        {/* §33: the sheet and the bar, in that order — bottom-left, because the
            legend has the top-left corner. */}
        {/* §73: the potlood is Bewerken's. §74: on a phone the peek has the
            bottom edge while a speld is open, so the bar goes up for as long. */}
        <InkShell
          shell={ink}
          corner="bottom-left"
          toolbar={!placing && (editing || !mode.canEdit)}
          bottomTaken={isPhone && Boolean(pinPanel)}
        />

        {/*
          §69 (6.7) — een lege landkaart zegt het op het glas.

          De stamboom (§66) en de tijdlijn (§62) doen dit allebei: een vlak
          zonder inhoud zegt op de plek waar de inhoud zou staan wat je moet
          doen om er iets op te krijgen. De landkaart zei niets — hij hing een
          plaat op en verder was het aan de lezer om te raden dat een dubbelklik
          (of op een telefoon een halve seconde drukken) een speld vraagt. Dat is
          precies de aanwijzing die je op 390 px het hardst mist, waar het
          gebaar ook nog eens een ander is dan op een bureau.

          Niet tijdens het tekenen en niet tijdens het zetten van een speld:
          dan staat er al iets anders om aandacht te vragen.
        */}
        {!pins.length && !ink.ink.enabled && !placing && (
          <div className="map-empty">
            <p className="small muted">
              {mayType && !editing
                ? /* §73: in Lezen the gestures below do nothing, so do not offer them. */
                  `Nog geen ${words.mapPinPlural} op deze ${mapWord}. Kies Bewerken om er een te zetten.`
                : mayType
                ? `Nog geen ${words.mapPinPlural} op deze ${mapWord}. ${
                    isPhone
                      ? `Houd de ${mapWord} ingedrukt om hier een ${pinWord} te zetten`
                      : `Dubbelklik op de ${mapWord}`
                  }, of gebruik '${cap(pinWord)} zetten'.`
                : `Nog geen ${words.mapPinPlural} op deze ${mapWord}.`}
            </p>
          </div>
        )}

        {!isPhone &&
          (legendOpen ? (
            <aside
              className="map-legend"
              /* §69: an `aside` with no name is "complementary" and nothing
                 more; every floating panel on every canvas says what it is. */
              aria-label="Legenda"
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

        {/*
          §69 (3.3): the speld's blad, docked, on a desk only.

          Inside the stage rather than beside it, so it is positioned against
          the picture and moves with nothing — and, like the legend above it,
          it stops its own pointer events from reaching the stage: §6's rule
          about anything floating over a canvas. The stage takes the capture on
          the way down, so a control that does not stop the press here is not
          merely panned under, it is unpressable.
        */}
        {!isPhone && pinPanel && (
          <aside
            className="map-panel"
            /* Not `aria-modal`: the picture behind it is live, and saying
               otherwise would tell a screen reader to ignore the map. */
            role="dialog"
            aria-labelledby="pin-title"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="map-panel-close"
              aria-label="Sluiten"
              title="Sluiten (Esc)"
              onClick={() => setSelectedId(null)}
            >
              <Icon name="close" size={14} />
            </button>
            {/* The panel is a column: the cross stays put and only what is
                under it scrolls, so a long notitie never scrolls its own way
                out of the panel. */}
            <div className="map-panel-body">{pinPanel}</div>
          </aside>
        )}
      </div>

      <p className="tiny muted" style={{ margin: '0.4rem 0 0' }}>
        {shown.length} van {pins.length} {pins.length === 1 ? pinWord : words.mapPinPlural} te zien
        {' · '}sleep om te schuiven, scroll of knijp om te zoomen
        {ink.ink.enabled && <> · het potlood tekent op de {mapWord}, Esc stopt</>}
      </p>

      {isKeeper && <UnderFold slotId={UNDER_FOLD_ID}>{ink.keeperControls}</UnderFold>}

      {/*
        §74: a phone gets the peek. See `pinPanel` above for why. Keyed by the
        speld, so a tap on the next one starts small and at the top again. It
        is `position: fixed` and stops its own presses, so it lives out here
        beside the stage rather than in it, and the map above it stays live.
      */}
      {isPhone && pinPanel && selected && (
        <CanvasPeek
          key={selected.id}
          labelledBy="pin-title"
          onClose={() => setSelectedId(null)}
          className="map-peek"
        >
          {pinPanel}
        </CanvasPeek>
      )}

      {placing?.mode === 'ask' && (
        <Sheet onClose={() => setPlacing(null)} labelledBy="new-pin-title">
          <NewPinSheet
            busy={busy}
            pickableMaps={pickableMaps}
            onEntry={(entryId) => {
              void createPin({ kind: 'entry', entryId, x: placing.x, y: placing.y }).then(() => setPlacing(null));
            }}
            onNote={(name, text) => {
              void createPin({ kind: 'note', name, text, x: placing.x, y: placing.y }).then(() => setPlacing(null));
            }}
            onMap={(targetMapId) => {
              void createPin({ kind: 'map', targetMapId, x: placing.x, y: placing.y }).then(() => setPlacing(null));
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
  arranging,
  setBy,
  onSave,
  onRemove,
  onConvert,
  onLayer,
  liveUser,
}: {
  pin: MapPin;
  busy: boolean;
  /** §18b: this hand may rename, convert and pull this speld. */
  mayEdit: boolean;
  /** §73: …and may arrange it right now — Bewerken, not Lezen. */
  arranging: boolean;
  setBy: string | null;
  onSave: (patch: { name?: string; text?: string }) => void;
  onRemove: () => void;
  /** §8: turn this notitie into an artikel, in place. */
  onConvert: (seed: { name: string; text: string }) => void;
  /** §71: Naar voren / Naar achter / Voorgrond / Achtergrond. */
  onLayer: (command: LayerCommand) => void;
  liveUser: LiveUser;
}) {
  // §21: a note pin's name and text are shared fields — typed into by whoever
  // may edit the pin, saved by the room. The sheet joins the pin's room when it
  // opens (no state is handed over: the room answers within the round trip).
  if (pin.kind === 'note' && mayEdit) {
    return (
      <LiveFields room={pinFieldsRoomKey(pin.id)} state="" user={liveUser} canEdit>
        <PinSheetBody
          pin={pin}
          busy={busy}
          mayEdit={mayEdit}
          arranging={arranging}
          setBy={setBy}
          onSave={onSave}
          onRemove={onRemove}
          onConvert={onConvert}
          onLayer={onLayer}
        />
      </LiveFields>
    );
  }
  return (
    <PinSheetBody
      pin={pin}
      busy={busy}
      mayEdit={mayEdit}
      arranging={arranging}
      setBy={setBy}
      onSave={onSave}
      onRemove={onRemove}
      onConvert={onConvert}
      onLayer={onLayer}
    />
  );
}

function PinSheetBody({
  pin,
  busy,
  mayEdit,
  arranging,
  setBy,
  onSave,
  onRemove,
  onConvert,
  onLayer,
}: {
  pin: MapPin;
  busy: boolean;
  mayEdit: boolean;
  arranging: boolean;
  setBy: string | null;
  onSave: (patch: { name?: string; text?: string }) => void;
  onRemove: () => void;
  onConvert: (seed: { name: string; text: string }) => void;
  onLayer: (command: LayerCommand) => void;
}) {
  const ui = useUi();
  const words = ui.words;
  const room = useLiveFields();
  const shared = Boolean(room?.canEdit);
  const [name, setName] = useState(pin.name);
  const [text, setText] = useState(pin.text);
  const dirty = !shared && (name !== pin.name || text !== pin.text);

  /*
   * §74: the order is the peek's. On a phone this opens in about a third of the
   * screen, so the first ~250 px hold what the speld *is* — its head, a line or
   * three of what it says (clamped in the peek, `.map-pin-summary`), and the
   * way through to its artikel or landkaart. What you can *do* to it (the
   * fields, the laag, convert, pull) follows, in the same scrolling body.
   */
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span
          className="map-pin-head map-pin-head-static"
          style={{ ['--pin-colour' as string]: pinColour(pin) }}
        >
          <Icon name={pinIcon(pin)} size={14} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="pin-title" style={{ margin: 0 }}>
            {pin.name}
          </h2>
          <p className="tiny muted" style={{ margin: '0.2rem 0 0' }}>
            {pin.kind === 'note'
              ? `${words.note.charAt(0).toUpperCase()}${words.note.slice(1)} op de ${words.map}`
              : pin.kind === 'map'
                ? `${words.map.charAt(0).toUpperCase()}${words.map.slice(1)}`
                : pin.entry?.typeLabel}
            {setBy && <> · gezet door {setBy}</>}
          </p>
        </div>
      </div>

      {pin.kind === 'entry' && pin.entry && (
        <>
          {pin.entry.shortDescription && (
            <p className="small map-pin-summary" style={{ margin: 0 }}>
              {pin.entry.shortDescription}
            </p>
          )}
          <p style={{ margin: 0 }}>
            <Link className="btn btn-small btn-primary" href={`/e/${pin.entry.slug}`}>
              <Icon name="file" size={14} />
              {words.entry.charAt(0).toUpperCase() + words.entry.slice(1)} openen
            </Link>
          </p>
        </>
      )}

      {/*
        §39: the way down. A tap on a landkaart speld opens *this* sheet rather
        than navigating, because everything a speld has — "gezet door", the
        drag hint, "speld weghalen" — lives here, and a speld that jumped to
        another page on one tap could never be moved on a telephone. The button
        below is the road, and it is the entry speld's button word for word.
      */}
      {pin.kind === 'map' && pin.map && (
        <p style={{ margin: 0 }}>
          <Link className="btn btn-small btn-primary" href={`/maps/${pin.map.slug}`}>
            <Icon name="map" size={14} />
            {words.map.charAt(0).toUpperCase() + words.map.slice(1)} openen
          </Link>
        </p>
      )}

      {pin.kind === 'note' &&
        (mayEdit ? (
          <>
            <label className="label" htmlFor="pin-name">
              Naam
            </label>
            <LiveField field="name" id="pin-name" className="input" value={name} onValue={(next) => setName(next)} />
            <label className="label" htmlFor="pin-text">
              Tekst
            </label>
            <LiveField
              as="textarea"
              field="text"
              id="pin-text"
              className="input"
              rows={4}
              value={text}
              onValue={(next) => setText(next)}
              mentions
            />
            <MentionRow text={text} />
            {shared && (
              <p className="tiny muted" style={{ margin: 0 }}>
                Wat je hier typt wordt meteen bewaard en ziet iedereen op deze {words.map}.
              </p>
            )}
            {dirty && (
              <p style={{ margin: 0 }}>
                <button type="button" className="btn btn-small btn-primary" disabled={busy || !name.trim()} onClick={() => onSave({ name, text })}>
                  Opslaan
                </button>
              </p>
            )}
          </>
        ) : (
          pin.text && (
            <p className="small map-pin-summary" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              <MentionText text={pin.text} />
            </p>
          )
        ))}

      {/*
        §71 — de laag, in het blad van de speld zelf.

        Hier en niet in de legenda of in een eigen menu: dit is een eigenschap
        van één speld, en het blad is het enige scherm dat over één speld gaat.
        Het is ook waar de hand al is — je klikt (of dubbelklikt) een speld aan,
        het blad gaat open, en de vier knoppen staan onder wat de speld zegt.

        De rang is per speld en niet per soort (Nick, ronde 36): op de ene
        landkaart hoort een dorp boven een huis, op de andere is de kamer het
        onderwerp en hoort díe bovenaan. Er wordt dus niets afgeleid; de hand
        zegt het.

        §73: de laag is schikken, en schikken is verplaatsen onder een andere
        naam — dus alleen in Bewerken.
      */}
      {arranging && (
        <>
          <p className="label" style={{ margin: '0.2rem 0 0' }} id="pin-layer-label">
            Laag
          </p>
          <div className="row-wrap map-layer-row" role="group" aria-labelledby="pin-layer-label">
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => onLayer('backward')}>
              Naar achter
            </button>
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => onLayer('forward')}>
              Naar voren
            </button>
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => onLayer('back')}>
              Achtergrond
            </button>
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => onLayer('front')}>
              Voorgrond
            </button>
            <span className="tiny muted map-layer-value" data-testid="pin-layer">
              {pin.layer}
            </span>
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>
            Hoe hoger de laag, hoe meer naar voren. Staan er meer {words.mapPinPlural} op één plek, dan is de hoogste
            degene die je ziet — met een cijfertje erbij voor de rest.
          </p>
        </>
      )}

      {mayEdit ? (
        // §73: in Lezen a drag pans, so the hint would be a lie.
        arranging && (
          <p className="tiny muted" style={{ margin: 0 }}>
            Sleep de {words.mapPin} om hem te verplaatsen.
          </p>
        )
      ) : (
        <p className="tiny muted" style={{ margin: 0 }}>
          Deze {words.mapPin} is van iemand anders: alleen wie hem zette, of een {words.keeper}, kan hem verplaatsen of
          weghalen.
        </p>
      )}

      {mayEdit && pin.kind === 'note' && (
        <p className="tiny muted" style={{ margin: 0 }}>
          De naam en de tekst hierboven worden de naam en de eerste regel van het {words.entry}; de{' '}
          {words.mapPin} blijft staan waar hij staat.
        </p>
      )}

      {mayEdit && (
        <div className="row-wrap" style={{ marginTop: '0.2rem' }}>
          {/*
            §8: the same offer a notitie on a prikbord has had — what was
            scribbled during a session becomes the artikel it was always going
            to be, and the speld stays exactly where it was put. Only for a
            notitie: a speld that already stands for an artikel has nothing to
            become.
          */}
          {pin.kind === 'note' && (
            <button
              type="button"
              className="btn btn-small btn-primary"
              disabled={busy}
              onClick={() => onConvert({ name, text })}
            >
              <Icon name="plus" size={14} />
              Maak er een {words.entry} van
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={onRemove}>
            <Icon name="trash" size={14} />
            {words.mapPin.charAt(0).toUpperCase() + words.mapPin.slice(1)} weghalen
          </button>
        </div>
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
  pickableMaps,
  onEntry,
  onNote,
  onMap,
}: {
  busy: boolean;
  pickableMaps: { id: string; name: string }[];
  onEntry: (entryId: string) => void;
  onNote: (name: string, text: string) => void;
  /** §39: a speld that opens another landkaart. */
  onMap: (targetMapId: string) => void;
}) {
  const ui = useUi();
  const words = ui.words;
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PinSuggestion[]>([]);
  const typed = query.trim();
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  /*
   * §39: the landkaarten matching what is typed. Not `/api/suggest`, which
   * answers with artikelen and nothing else — the prikbord took the same road
   * for the same reason: the list of landkaarten a person may see is short,
   * it came down with the page behind the viewer's own dial, and a fuzzy match
   * in the browser needs no second endpoint with a second set of rules about
   * who may see what.
   */
  const mapMatches = useMemo(() => {
    if (!typed) return [];
    return pickableMaps
      .map((item) => ({ item, score: fuzzyScore(item.name, typed) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((row) => row.item);
  }, [pickableMaps, typed]);

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
    }, SUGGEST_DEBOUNCE_MS);
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
          Zoek een {words.entry} of een {words.map}, of typ een naam voor een {words.note}
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
            // Enter takes the first row: the best artikel, else the best
            // landkaart, else the note — the order the list is drawn in.
            if (event.key !== 'Enter' || !typed || busy) return;
            event.preventDefault();
            if (items[0]) onEntry(items[0].id);
            else if (mapMatches[0]) onMap(mapMatches[0].id);
            else onNote(typed, '');
          }}
        />
        <p className="tiny muted" style={{ margin: '0.3rem 0 0' }}>
          Een bestaand {words.entry} uit de lijst, een andere {words.map}, een nieuw {words.entry} met deze naam, of
          een losse {words.note}.
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
          {/*
            §39: the landkaarten, matched here rather than asked for — you have
            a dozen of them, not a thousand, which is the same reason a prikbord
            matches them in the browser. This is the road down: a speld on the
            town that opens the town's own {words.map}.
          */}
          {mapMatches.map((item) => (
            <li key={`map-${item.id}`}>
              <button type="button" className="suggest-item" disabled={busy} onClick={() => onMap(item.id)}>
                <Icon name="map" size={15} style={{ color: MAP_COLOUR }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{item.name}</strong>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {cap(words.map)} — de {words.mapPin} opent hem
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
