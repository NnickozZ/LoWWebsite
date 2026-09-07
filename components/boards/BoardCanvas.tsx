'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { assetUrl } from '@/components/Cover';
import { borderLabel } from '@/components/borders';
import { Icon } from '@/components/Icon';
import { ConnectionsLink } from '@/components/web/ConnectionsLink';
import { AccessEditor, type AccessSettings } from '@/components/access/AccessEditor';
import { Sheet } from '@/components/ui/Sheet';
import { useIsPhone } from '@/components/useIsPhone';
import { useUi } from '@/components/ui/UiProvider';
import { useAuthorGate, useMayType } from '@/components/you/AuthorProvider';
import { capitalise } from '@/lib/words';
import {
  boardBounds,
  CARD_SCALE_MAX,
  CARD_SCALE_MIN,
  CARD_SCALE_STEP,
  CARD_SIZE,
  cardBox,
  cardRef,
  cardSize,
  DEFAULT_CARD_SCALE,
  defaultShowImage,
  DEFAULT_STRING_STYLE,
  DEFAULT_STRING_WIDTH,
  endpointsEqual,
  headOf,
  isCardEnd,
  placementRotation,
  sameEnds,
  stringColourValue,
  stringDash,
  type BoardCard,
  type BoardState,
  type BoardString,
  type Endpoint,
  type StringColour,
  type StringStyle,
  type Viewport,
} from '@/lib/boards/merge';
import type {
  BoardCaseFacts,
  BoardEntryFacts,
  BoardMapFacts,
  BoardRefs,
  BoardTimelineFacts,
} from '@/lib/boards/service';
import { BoardCardView, CARD_WIDTH, cardBorder, cardImage, subjectOf } from './BoardCard';
import { BoardInspector } from './BoardInspector';
import { BoardTray, type TrayEntry } from './BoardTray';
import { offerToFileEntry } from './offerToFile';
import { syncLabel, useBoardSync } from './useBoardSync';
import { useBoardLive } from './useBoardLive';
import { imageFromClipboard, pasteIsForTyping, uploadForm, SHRUNK_NOTICE } from '@/lib/upload';
import { fitUpload } from '@/components/shrinkImage';
import { InkCanvas } from '@/components/ink/InkCanvas';
import { InkCapture, InkKeeperControls, InkToolbar, useInkTool } from '@/components/ink/InkTools';
import { useElementSize } from '@/components/ink/useElementSize';
import { useInk } from '@/components/ink/useInk';
import type { InkLayerView } from '@/lib/ink/types';
import { fuzzyScore } from '@/lib/search/fuzzy';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const UNDO_LIMIT = 50;
/** Size of the SVG layer the red string is drawn on, centred on the origin. */
const STRING_LAYER = 40000;

type Snapshot = { cards: BoardCard[]; strings: BoardString[] };

/**
 * A string being run, whether it is a new one from a card's pin or an existing
 * end being taken off its card and put somewhere else. Both are the same
 * gesture — hold one end still, drag the other — so they are the same state.
 */
type Drawing = {
  /** The end that stays put. */
  anchor: Endpoint;
  /** Where the dragged end currently is, in board coordinates. */
  x: number;
  y: number;
  /** Set when an existing string's end is being moved rather than a new one run. */
  editing?: { id: string; end: 'from' | 'to' };
};

function newCardId() {
  return `c_${Math.random().toString(36).slice(2, 12)}`;
}
function newStringId() {
  return `s_${Math.random().toString(36).slice(2, 12)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** The curve of a slack piece of string between two pins. */
function stringPath(ax: number, ay: number, bx: number, by: number) {
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  const sag = Math.min(60, Math.hypot(bx - ax, by - ay) * 0.16);
  return `M ${ax} ${ay} Q ${midX} ${midY + sag} ${bx} ${by}`;
}

/**
 * The same curve, shifted sideways along the chord's normal — the two strands
 * of a "dubbel" string.
 *
 * Knocking a thinner line out of a thick one would have been less code and
 * would have shown the cork (and any card behind the string) straight through
 * the gap, because there is nothing to knock it out *of*: the layer is
 * transparent.
 */
function stringPathOffset(ax: number, ay: number, bx: number, by: number, offset: number) {
  const length = Math.hypot(bx - ax, by - ay) || 1;
  const dx = (-(by - ay) / length) * offset;
  const dy = ((bx - ax) / length) * offset;
  const midX = (ax + bx) / 2 + dx;
  const midY = (ay + by) / 2 + dy;
  const sag = sagOf(ax, ay, bx, by);
  return `M ${ax + dx} ${ay + dy} Q ${midX} ${midY + sag} ${bx + dx} ${by + dy}`;
}

function sagOf(ax: number, ay: number, bx: number, by: number) {
  return Math.min(60, Math.hypot(bx - ax, by - ay) * 0.16);
}

export function BoardCanvas({
  boardId,
  boardName,
  caseId,
  caseName,
  caseSlug,
  caseEntries,
  initialState,
  initialEntries,
  initialMaps,
  initialCases,
  initialTimelines,
  pickableMaps,
  pickableCases,
  pickableTimelines,
  readOnly: locked,
  access,
  initialInk,
}: {
  boardId: string;
  boardName: string;
  /** §33: the tekenlaag, as this viewer may see it. */
  initialInk: InkLayerView;
  /** §17: may look, not touch. Every write path below is switched off. */
  readOnly: boolean;
  access: {
    settings: AccessSettings;
    canManage: boolean;
    isKeeper: boolean;
    viewerId: string;
    /** §43, round 18: whether this wall counts in the web and under "Genoemd in". */
    inWeb: boolean;
  };
  /** The case this board belongs to, if any — the filing prompt needs it. */
  caseId: string | null;
  caseName: string | null;
  caseSlug: string | null;
  /** Everything filed in that case: the tray's source, and the filing prompt's. */
  caseEntries: TrayEntry[];
  initialState: BoardState;
  initialEntries: Record<string, BoardEntryFacts>;
  /** §19: the landkaarten this wall points at, resolved for this viewer. */
  initialMaps: Record<string, BoardMapFacts>;
  /** §7: the dossiers it points at — a dossier card is a card like any other. */
  initialCases: Record<string, BoardCaseFacts>;
  /**
   * What could still be put on the wall. Both lists are already filtered for
   * this viewer on the server, and both are small enough to hand over whole:
   * you have a dozen landkaarten, not a thousand, so the search box matches
   * them here instead of asking.
   */
  pickableMaps: { id: string; name: string }[];
  pickableCases: { id: string; name: string }[];
  /** §32: the tijdlijnen it points at, and the ones that could still go up. */
  initialTimelines: Record<string, BoardTimelineFacts>;
  pickableTimelines: { id: string; name: string }[];
}) {
  const ui = useUi();
  const router = useRouter();
  const isPhone = useIsPhone();

  const [cards, setCards] = useState<BoardCard[]>(initialState.cards);
  const [strings, setStrings] = useState<BoardString[]>(initialState.strings);
  const [entries, setEntries] = useState<Record<string, BoardEntryFacts>>(initialEntries);
  const [maps, setMaps] = useState<Record<string, BoardMapFacts>>(initialMaps);
  const [caseFacts, setCaseFacts] = useState<Record<string, BoardCaseFacts>>(initialCases);
  const [timelineFacts, setTimelineFacts] = useState<Record<string, BoardTimelineFacts>>(initialTimelines);
  const [viewport, setViewport] = useState<Viewport>(initialState.viewport);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedStringId, setSelectedStringId] = useState<string | null>(null);
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    assetId: string;
    name: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState(boardName);

  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [marquee, setMarquee] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<
    {
      id: string;
      name: string;
      typeIcon: string;
      typeColour: string;
      typeLabel: string;
    }[]
  >([]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Which card an incoming file belongs to, or 'new' for a fresh photo card. */
  const photoTarget = useRef<string | 'new'>('new');
  /**
   * Where the hand last was on the cork, in board coordinates. A pasted
   * picture lands there rather than in the middle of the view: you paste where
   * you are looking. Null when the pointer has left the board or never was on
   * it (a paste straight after a page load, or one made with the keyboard),
   * and then the centre of the view is the honest answer.
   */
  const pointerAt = useRef<{ x: number; y: number } | null>(null);
  const undoStack = useRef<Snapshot[]>([]);
  const dragMoved = useRef(false);
  /** Which card was already selected when the current press began. */
  const pressWasSelected = useRef<string | null>(null);
  /** Entry ids already filed in this board's case; kept up to date as we file. */
  const filed = useRef<Set<string>>(new Set(caseEntries.map((entry) => entry.id)));
  /** The card an in-flight tray drag is carrying. */
  const dragging = useRef<TrayEntry | null>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    origin: Map<string, { x: number; y: number }>;
    /** The board before the press, pushed to undo only once something moves. */
    before: Snapshot;
  } | null>(null);
  const cropDrag = useRef<{
    startX: number;
    startY: number;
    from: { x: number; y: number; zoom: number };
  } | null>(null);
  /**
   * The third thing a press on a card can be, beside moving it and moving the
   * picture inside it: the corner grip, which makes the card bigger.
   *
   * Held as a ref like the other two, and for the same reason — a resize is a
   * stream of pointer moves, and re-rendering the wall to remember where the
   * hand started would cost a frame each time. `distance` is how far the grip
   * was from the card's middle when it was taken; the card's size is that
   * distance's ratio ever since, which is the one formula that works whatever
   * corner is dragged and whichever way the card is tilted.
   */
  const resize = useRef<{
    id: string;
    centre: { x: number; y: number };
    distance: number;
    from: number;
    /** The board before the press, pushed to undo only once something changes. */
    before: Snapshot;
    moved: boolean;
  } | null>(null);
  const pan = useRef<{ startX: number; startY: number; from: Viewport } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  /*
   * §18b: a speler with no onderzoeker may look at the wall and touch nothing
   * on it. Folded into the `readOnly` §17 already threads through every write
   * path here rather than added beside it — one gate is one thing to get
   * right, and the wall has forty places that ask.
   */
  const mayType = useMayType();
  const gate = useAuthorGate();
  const readOnly = locked || !mayType;

  // §8: no dragging or string-drawing on screens under 768 px. Selecting and
  // editing still work, or the inspector would be unreachable on a phone.
  const interactive = !isPhone && !readOnly;
  const [accessOpen, setAccessOpen] = useState(false);
  // §43, round 18: the wall's own say in whether it is a line in the web.
  const [inWeb, setInWeb] = useState(access.inWeb);

  /**
   * §8, live: this tab. One person with the board open twice is two hands on
   * the wall, which is what they will see, so the id belongs to the tab rather
   * than the account. Generated once and never re-generated — a new id on every
   * render would look like somebody new arriving sixty times a second.
   */
  const clientIdRef = useRef<string>('');
  if (!clientIdRef.current) clientIdRef.current = `t_${Math.random().toString(36).slice(2, 12)}`;
  const clientId = clientIdRef.current;

  const busy = Boolean(drag.current || cropDrag.current || resize.current || drawing || marquee);

  /**
   * Applying someone else's version of the board. Shared with the save path,
   * because "the merge came back from my save" and "the merge came back because
   * Bram moved something" want exactly the same thing done with them.
   */
  const applyRemote = useCallback((state: BoardState, refs: BoardRefs) => {
    setCards(state.cards);
    setStrings(state.strings);
    setEntries((current) => ({ ...current, ...refs.entries }));
    setMaps((current) => ({ ...current, ...refs.maps }));
    setCaseFacts((current) => ({ ...current, ...refs.cases }));
    setTimelineFacts((current) => ({ ...current, ...(refs.timelines ?? {}) }));
    // A card someone else deleted must not stay selected here: the inspector
    // would be editing something that no longer exists.
    const alive = new Set(state.cards.map((card) => card.id));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => alive.has(id)));
      return next.size === current.size ? current : next;
    });
    setSelectedStringId((current) =>
      current && state.strings.some((line) => line.id === current) ? current : null,
    );
    setCroppingId((current) => (current && alive.has(current) ? current : null));
  }, []);

  const sync = useBoardSync({
    boardId,
    clientId,
    cards,
    strings,
    viewport,
    paused: busy,
    onMerged: applyRemote,
  });

  /**
   * The other half: what everybody else is doing. `dirty` covers the save that
   * is queued or in flight — pulling on top of unsaved local work would throw
   * it away, and the save is about to return the merge anyway.
   */
  const live = useBoardLive({
    boardId,
    clientId,
    holding: useMemo(() => [...selected], [selected]),
    paused: busy,
    dirty: sync.state === 'dirty' || sync.state === 'saving',
    onRemote: applyRemote,
    onRename: (remoteName) => {
      // Not while it is being typed in: the caret would jump.
      if (document.activeElement?.id === 'board-name') return;
      setName((current) => (current === remoteName ? current : remoteName));
    },
  });

  /**
   * §33: the tekenlaag. Its own hook and its own line (the site line, not
   * the board hub), because it is not the board: drawing is for everyone who
   * may look, including a viewer this wall is read-only for.
   */
  const ink = useInk({ kind: 'board', id: boardId, initial: initialInk, onError: (message) => ui.toast(message) });
  const inkTool = useInkTool();
  const inkActive = inkTool.active && ink.enabled;
  const viewportSize = useElementSize(viewportRef);
  const inkProject = useCallback(
    (x: number, y: number) => ({ x: viewport.x + x * viewport.zoom, y: viewport.y + y * viewport.zoom }),
    [viewport],
  );
  // The switch turned off under an open toolbar closes it.
  useEffect(() => {
    if (!ink.enabled && inkTool.active) inkTool.setActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink.enabled]);

  /**
   * One card, resolved. Everything that has to know what a card *is* — the
   * card itself, the inspector, the double-click that opens it — asks this,
   * so there is one place that knows how the three kinds are looked up.
   */
  const refs = useMemo<BoardRefs>(
    () => ({ entries, maps, cases: caseFacts, timelines: timelineFacts }),
    [entries, maps, caseFacts, timelineFacts],
  );
  const subjectFor = useCallback((card: BoardCard) => subjectOf(card, refs), [refs]);

  const pushUndo = useCallback(() => {
    undoStack.current.push({ cards, strings });
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
  }, [cards, strings]);

  const commit = useCallback(
    (next: Partial<Snapshot>, options: { undo?: boolean } = {}) => {
      if (readOnly) return;
      if (options.undo !== false) pushUndo();
      if (next.cards) setCards(next.cards);
      if (next.strings) setStrings(next.strings);
      sync.markDirty();
    },
    [pushUndo, sync, readOnly],
  );

  const undo = useCallback(() => {
    if (readOnly) return;
    const previous = undoStack.current.pop();
    if (!previous) return;
    // Anything undo brings back must not still be queued for deletion, and the
    // server has to be told to lift the tombstone it wrote when the deletion
    // was first saved — otherwise the card reappears here and is swept away
    // again on the next save.
    sync.noteRestored(
      previous.cards.map((card) => card.id),
      previous.strings.map((line) => line.id),
    );
    setCards(previous.cards);
    setStrings(previous.strings);
    setSelected(new Set());
    setSelectedStringId(null);
    if (!readOnly) sync.markDirty();
  }, [sync]);

  /* ------------------------------------------------------------ geometry */

  const toBoard = useCallback(
    (clientX: number, clientY: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom,
      };
    },
    [viewport],
  );

  const centreOfView = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 200, y: 200 };
    return toBoard(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [toBoard]);

  /**
   * §8, live: the cards as they are *seen*. A card someone else is dragging is
   * drawn where their hand has it right now, not where the last save left it
   * — the strings tied to it follow, and so does the hit test, because what
   * you see is what you can point at. `cards` itself is untouched: it is what
   * gets saved, and another person's drag is not ours to save.
   */
  const shownCards = useMemo(() => {
    if (!live.carried.size) return cards;
    return cards.map((card) => {
      const held = live.carried.get(card.id);
      return held && !selected.has(card.id) ? { ...card, x: held.x, y: held.y } : card;
    });
  }, [cards, live.carried, selected]);

  const cardById = useMemo(() => new Map(shownCards.map((card) => [card.id, card])), [shownCards]);

  /** Where an end of a string sits on the cork. Null if its card has gone. */
  const pointOf = useCallback(
    (end: Endpoint): { x: number; y: number } | null => {
      if (!isCardEnd(end)) return { x: end.x, y: end.y };
      const card = cardById.get(end.card);
      return card ? headOf(card) : null;
    },
    [cardById],
  );

  /** The topmost card — or pin — under a board point, or null for bare cork. */
  const cardAt = useCallback(
    (x: number, y: number) =>
      [...shownCards].reverse().find((card) => {
        // `cardBox`, not `card.x` plus a size: a card that has been made bigger
        // grows about its middle, so its corner is no longer where it is stored.
        const box = cardBox(card);
        return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
      }) ?? null,
    [shownCards],
  );

  /**
   * A bare pin whose head sits exactly where a string end was dropped. A lead
   * that goes somewhere you have not named yet gets a pin of its own on the
   * wall, which can then be dragged, labelled, and have more string tied to it.
   */
  const pinAt = useCallback((x: number, y: number): BoardCard => {
    const head = headOf({ kind: 'pin', x: 0, y: 0 });
    return {
      id: newCardId(),
      kind: 'pin',
      entryId: null,
      assetId: null,
      crop: null,
      border: null,
      showImage: false,
      name: '',
      text: '',
      x: Math.round(x - head.x),
      y: Math.round(y - head.y),
      rotation: 0,
      scale: DEFAULT_CARD_SCALE,
    };
  }, []);

  const selectedCards = useMemo(
    () => cards.filter((card) => selected.has(card.id)),
    [cards, selected],
  );
  const selectedString = useMemo(
    () => strings.find((line) => line.id === selectedStringId) ?? null,
    [strings, selectedStringId],
  );

  /* ----------------------------------------------------------- mutations */

  /**
   * §8 puts a new card at the viewport centre. Dropping every card on the exact
   * same spot buries the last one and its pin, so it steps outward on a grid,
   * preferring somewhere still on screen.
   */
  const freeSpotNear = useCallback(
    (cx: number, cy: number, size: { width: number; height: number }) => {
      const stepX = size.width + 28;
      const stepY = size.height + 28;
      const clear = (x: number, y: number) =>
        !cards.some((card) => {
          const other = cardBox(card);
          return (
            x < other.x + other.width &&
            x + size.width > other.x &&
            y < other.y + other.height &&
            y + size.height > other.y
          );
        });

      const rect = viewportRef.current?.getBoundingClientRect();
      const view = rect
        ? {
            left: -viewport.x / viewport.zoom,
            top: -viewport.y / viewport.zoom,
            right: (rect.width - viewport.x) / viewport.zoom,
            bottom: (rect.height - viewport.y) / viewport.zoom,
          }
        : null;
      const onScreen = (x: number, y: number) =>
        !view ||
        (x >= view.left &&
          y >= view.top &&
          x + size.width <= view.right &&
          y + size.height <= view.bottom);

      const originX = Math.round(cx - size.width / 2);
      const originY = Math.round(cy - size.height / 2);
      if (clear(originX, originY)) return { x: originX, y: originY };

      let fallback: { x: number; y: number } | null = null;
      for (let ring = 1; ring <= 12; ring++) {
        for (let dx = -ring; dx <= ring; dx++) {
          for (let dy = -ring; dy <= ring; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            const x = originX + dx * stepX;
            const y = originY + dy * stepY;
            if (!clear(x, y)) continue;
            if (onScreen(x, y)) return { x, y };
            fallback ??= { x, y };
          }
        }
      }

      /*
       * Nothing free *and* in sight. On a phone that is the ordinary case
       * rather than the exception: the view is about two cards wide and two
       * tall, and the search steps a whole card at a time, so the third card
       * added to a wall has nowhere clear left on the screen at all.
       *
       * The old answer was to take the first clear spot anywhere, which put
       * the card outside the view — you press "Nieuwe notitie" on a phone and
       * nothing appears, because it was laid down above the top edge. A wall is
       * perfectly happy with two bits of paper overlapping; a card you cannot
       * see is no card at all. So a spot in sight wins over a spot that is
       * clear, and the overlap is offset the way a desk stacks paper: a little
       * down and to the right each time, still inside the view.
       */
      /*
       * How tall a card really is. `CARD_SIZE` is the nominal card the document
       * reasons in — the room `freeSpotNear` reserves, the box `cardAt` hit-tests
       * — but the paper itself grows to fit what is written on it, so a framed
       * card is nearer 290 px than 250. Placement is the one job where guessing
       * short is the dangerous way round: it is what put a card half a card's
       * height below the bottom edge, near enough to look right and far enough
       * that the browser scrolled the whole cork to reach it. So ask the wall.
       */
      const measured = viewportRef.current?.querySelector('.board-card') as HTMLElement | null;
      const paper = Math.max(size.height, measured ? measured.offsetHeight : 0);

      /*
       * Nothing free *and* in sight, which on a phone is the ordinary case
       * rather than the exception: the view is about two cards wide and two
       * tall and the ring search steps a whole card at a time, so the third
       * card added to a wall has nowhere clear left on the screen at all.
       *
       * The old answer was the first clear spot *anywhere*, which laid the card
       * down outside the view — you press "Nieuwe notitie" on a phone and
       * nothing appears, because it went above the top edge. A wall is happy
       * with two bits of paper overlapping; a card you cannot see is not a card
       * at all. So a spot in sight beats a spot that is clear, and among the
       * spots in sight the one that covers the least of what is already there
       * wins — which keeps the middle of every earlier card reachable, and is
       * what a person does with paper anyway: lay it in the gap.
       */
      const cascaded = view
        ? (() => {
            const margin = 12;
            const minX = view.left + margin;
            const minY = view.top + margin;
            const maxX = Math.max(minX, view.right - size.width - margin);
            const maxY = Math.max(minY, view.bottom - paper - margin);

            const overlap = (x: number, y: number) =>
              cards.reduce((total, card) => {
                const other = cardBox(card);
                const w = Math.min(x + size.width, other.x + other.width) - Math.max(x, other.x);
                const h = Math.min(y + paper, other.y + other.height) - Math.max(y, other.y);
                return total + (w > 0 && h > 0 ? w * h : 0);
              }, 0);

            const step = 24;
            let best = { x: Math.round(minX), y: Math.round(minY), score: Infinity, near: Infinity };
            for (let x = minX; x <= maxX + 0.5; x += step) {
              for (let y = minY; y <= maxY + 0.5; y += step) {
                const score = overlap(x, y);
                // Ties go to the spot nearest where the person was looking.
                const near = (x - originX) ** 2 + (y - originY) ** 2;
                if (score < best.score || (score === best.score && near < best.near)) {
                  best = { x: Math.round(x), y: Math.round(y), score, near };
                }
                if (score === 0 && near === 0) break;
              }
            }
            return { x: best.x, y: best.y };
          })()
        : null;

      return cascaded ?? fallback ?? { x: originX, y: originY };
    },
    [cards, viewport],
  );

  type NewCard = Pick<BoardCard, 'id' | 'kind' | 'name' | 'text'> & Partial<BoardCard>;

  const addCard = useCallback(
    (card: NewCard) => {
      const centre = centreOfView();
      const spot = freeSpotNear(centre.x, centre.y, cardSize(card));
      const placed: BoardCard = {
        entryId: null,
        mapId: null,
        caseId: null,
        timelineId: null,
        assetId: null,
        crop: null,
        border: null,
        // Every new card is the size a card has always been; the grip and the
        // bar are how it becomes anything else.
        scale: DEFAULT_CARD_SCALE,
        // Only a card that has something to show opens its frame; the rule and
        // the reasoning live in `defaultShowImage`. A caller that knows better
        // — the photo card, which is made around a picture — says so below and
        // wins, because `...card` comes after.
        showImage: defaultShowImage(card.kind),
        ...card,
        x: card.x ?? spot.x,
        y: card.y ?? spot.y,
        // A pin stands straight; only paper gets the slight tilt.
        rotation: card.kind === 'pin' ? 0 : placementRotation(),
      };
      commit({ cards: [...cards, placed] });
      return placed;
    },
    [cards, centreOfView, commit, freeSpotNear],
  );

  const patchCard = useCallback(
    (cardId: string, patch: Partial<BoardCard>) => {
      commit({
        cards: cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)),
      });
    },
    [cards, commit],
  );

  const patchString = useCallback(
    (stringId: string, patch: Partial<BoardString>) => {
      commit({
        strings: strings.map((line) => (line.id === stringId ? { ...line, ...patch } : line)),
      });
    },
    [strings, commit],
  );

  const removeCards = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const doomed = new Set(ids);
      // A string tied to a card that is going has to go too; one tied to a bare
      // point at the other end keeps that end, so it goes as a whole.
      const touches = (line: BoardString) =>
        (isCardEnd(line.from) && doomed.has(line.from.card)) ||
        (isCardEnd(line.to) && doomed.has(line.to.card));

      const removedCards = cards.filter((card) => doomed.has(card.id));
      const removedStrings = strings.filter(touches);

      for (const card of removedCards) sync.noteDeletedCard(card.id);
      for (const line of removedStrings) sync.noteDeletedString(line.id);

      commit({
        cards: cards.filter((card) => !doomed.has(card.id)),
        strings: strings.filter((line) => !touches(line)),
      });
      setSelected(new Set());
      setCroppingId(null);

      ui.toast(
        `${removedCards.length === 1 ? 'Kaart' : `${removedCards.length} kaarten`} verwijderd.`,
        { label: 'Ongedaan maken', onAction: () => undo() },
      );
    },
    [cards, strings, commit, sync, ui, undo],
  );

  const removeString = useCallback(
    (stringId: string) => {
      const line = strings.find((item) => item.id === stringId);
      if (!line) return;
      sync.noteDeletedString(stringId);
      commit({ strings: strings.filter((item) => item.id !== stringId) });
      setSelectedStringId(null);
      ui.toast('Draad verwijderd.', { label: 'Ongedaan maken', onAction: () => undo() });
    },
    [strings, commit, sync, ui, undo],
  );

  /* ------------------------------------------------------- filing prompt */

  /**
   * A board hanging off a case is that case's wall. Pinning someone to it
   * almost always means they belong in the file too — but not always, so this
   * asks rather than doing it, and only when the entry is not already filed.
   *
   * The question itself lives in `offerToFile.tsx`, because the same one has to
   * be asked from the artikel page's "Op het prikbord" as well, in the same
   * words. Whichever card is put on whichever wall, the archive asks once.
   */
  const offerToFile = useCallback(
    (entryId: string, entryName: string) => {
      if (!caseId || filed.current.has(entryId)) return;
      // Booked in optimistically so a second card of the same entry, placed
      // while the sheet is open, does not ask the same question twice.
      filed.current.add(entryId);
      void offerToFileEntry(ui, { caseId, caseName, entryId, entryName }).then((done) => {
        if (done) router.refresh();
        else filed.current.delete(entryId);
      });
    },
    [caseId, caseName, router, ui],
  );

  /* -------------------------------------------------------------- photos */

  const askForPhoto = useCallback((target: string | 'new') => {
    photoTarget.current = target;
    fileRef.current?.click();
  }, []);

  /**
   * A picture onto the wall. One road for every way a file can arrive — the
   * file dialog and the clipboard both end up here — which is what keeps the
   * size ceiling honest: it is `/api/assets` that weighs the bytes against
   * `uploadLimitFor` and answers `tooLargeMessage`, and `readUploadResponse`
   * that turns a bare 413 from the web server in front of it into
   * `PROXY_TOO_LARGE`. A paste is a file like any other and gets exactly that
   * gate and exactly those words, because it takes the same road.
   *
   * Being the one road is also why the shrinking sits here and not in two
   * handlers: a photograph off a phone is heavier than a player's ceiling, so
   * `fitUpload` re-encodes it to fit before it goes up, and says so once.
   *
   * `at` is a board point when we know where the hand was; without it the card
   * lands in the middle of the view, as the file dialog has always done.
   */
  const uploadPhoto = useCallback(
    async (file: File, at?: { x: number; y: number } | null) => {
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
        const data = result.data;

        const fresh = { x: 0.5, y: 0.5, zoom: 1 };
        if (photoTarget.current === 'new') {
          const placed = addCard({
            id: newCardId(),
            /*
             * A picture pinned to the wall is a *notitie with a picture on it*,
             * not a third thing. `photo` was that third thing: it looked like a
             * card, held a title and words like a card, and was the one kind of
             * card with no way off the wall — no "Artikel aanmaken", because
             * that button asks `kind === 'note'`. Nick's word for it was an
             * in-between: you pasted a photograph of a document, wrote what it
             * was underneath, and then could do nothing with it.
             *
             * So a pasted or chosen picture makes a `note` that happens to have
             * an `assetId`. Everything a notitie can do it can now do — be
             * written on, be tied on with string, become an artikel and carry
             * its picture over as that artikel's cover. `photo` stays in
             * `CardKind` and is still read, drawn and converted, because every
             * wall already hung is full of them; nothing new is made with it.
             */
            kind: 'note',
            assetId: data.asset.id,
            crop: fresh,
            // Said out loud rather than left to the default (`note` starts with
            // its frame shut): this one card is made *around* a picture, so its
            // frame is the whole point of it.
            showImage: true,
            name: file.name.replace(/\.[^.]+$/, ''),
            text: '',
            ...(at
              ? {
                  x: Math.round(at.x - CARD_WIDTH / 2),
                  y: Math.round(at.y - CARD_SIZE.height / 2),
                }
              : {}),
          });
          setSelected(new Set([placed.id]));
          setSelectedStringId(null);
          setCroppingId(placed.id);
        } else {
          const cardId = photoTarget.current;
          patchCard(cardId, {
            assetId: data.asset.id,
            crop: fresh,
            showImage: true,
          });
          setCroppingId(cardId);
        }
      } finally {
        setUploading(false);
      }
    },
    [addCard, patchCard, ui],
  );

  /**
   * §30: the same picture, arriving on the clipboard.
   *
   * A screenshot of a map, a portrait copied out of a browser tab, a photo
   * copied in Explorer — all of it was a trip through the file dialog, and a
   * screenshot had to be saved to disk first. The gesture people already try
   * is Ctrl+V on the wall, so that is what this is; everything after the file
   * has been found is the file dialog's own road, down to the toasts.
   *
   * With exactly one card selected and that card not an artikel card, the
   * picture becomes *that* card's photo — the same thing "Foto vervangen"
   * does, and the same card the inspector offers it for. An artikel card is
   * left out for the reason the inspector leaves it out: its picture is the
   * artikel's cover and belongs on the artikel, not on one wall.
   */
  const pasteImage = useCallback(
    (event: ClipboardEvent) => {
      // A viewer who may not touch this wall pastes nothing onto it.
      if (readOnly) return;
      // One upload at a time: two in flight would race for `photoTarget`.
      if (uploading) return;
      // The clipboard belongs to whoever is typing — a note's text, the search
      // box, a name being renamed, any field in an open sheet.
      if (pasteIsForTyping(event.target)) return;
      // A sheet or the lightbox is on top of the board; a paste there is not
      // the board's, even when it lands on something that is not a field.
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[role="dialog"], .sheet, .board-lightbox')) return;
      if (accessOpen || lightbox) return;

      const file = imageFromClipboard(event);
      if (!file) return;
      event.preventDefault();

      const single = selectedCards.length === 1 ? selectedCards[0] : null;
      photoTarget.current = single && single.kind !== 'entry' ? single.id : 'new';
      void uploadPhoto(file, photoTarget.current === 'new' ? pointerAt.current : null);
    },
    [accessOpen, lightbox, readOnly, selectedCards, uploadPhoto, uploading],
  );

  useEffect(() => {
    document.addEventListener('paste', pasteImage);
    return () => document.removeEventListener('paste', pasteImage);
  }, [pasteImage]);

  /* ------------------------------------------------------------- pointer */

  function selectCard(cardId: string, additive: boolean) {
    setSelectedStringId(null);
    setSelected((current) => {
      const next = new Set(additive ? current : []);
      if (additive && next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  /*
   * A card is *not* given `preventDefault()` here, and that is deliberate.
   * Cancelling a pointerdown suppresses the compatibility mouse events the
   * browser builds a double-click out of, and a double-click is this card's
   * entire vocabulary: open the artikel, open the picture, start writing. The
   * blue sweep that preventDefault was wanted for is already gone — `.board-card`
   * carries `user-select: none`, so a drag that begins on a card selects
   * nothing at all, here or anywhere else on the page. The two places on a card
   * that are drags and nothing else — the pin head and the crop — do refuse it.
   */
  function onCardPointerDown(event: React.PointerEvent, cardId: string) {
    if (event.button !== 0) return;

    // While cropping, dragging inside the card moves the picture, not the card.
    if (croppingId === cardId) {
      const card = cardById.get(cardId);
      if (!card) return;
      event.preventDefault();
      cropDrag.current = {
        startX: event.clientX,
        startY: event.clientY,
        from: card.crop ?? { x: 0.5, y: 0.5, zoom: 1 },
      };
      return;
    }

    if (croppingId) setCroppingId(null);

    const additive = event.shiftKey;
    const alreadySelected = selected.has(cardId);
    pressWasSelected.current = alreadySelected ? cardId : null;
    if (!additive && !alreadySelected) selectCard(cardId, false);
    else selectCard(cardId, additive);

    if (!interactive) return;

    const chosen = new Set(additive || alreadySelected ? selected : []);
    chosen.add(cardId);
    const origin = new Map<string, { x: number; y: number }>();
    for (const card of cards)
      if (chosen.has(card.id)) origin.set(card.id, { x: card.x, y: card.y });

    dragMoved.current = false;
    // Not pushed to undo yet: a click, or the first half of a double-click, is
    // a press too, and undo should not be full of drags that went nowhere.
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin,
      before: { cards, strings },
    };
  }

  /**
   * §41: the corner grip. A drag away from the card's middle makes it bigger, one
   * towards it smaller, and the numbers land on a twentieth — hold Shift for
   * anything in between, the same bargain the rest of the app makes with a
   * snap.
   *
   * The middle is worked out once, from the card's *intrinsic* box, because
   * that point does not move while the card grows: `cardBox` grows about it.
   */
  function onGripPointerDown(event: React.PointerEvent, card: BoardCard) {
    if (!interactive) return;
    // A grip is only ever dragged: no click, no focus, no pan underneath it.
    event.stopPropagation();
    event.preventDefault();
    const base = cardSize({ kind: card.kind, name: card.name });
    const centre = { x: card.x + base.width / 2, y: card.y + base.height / 2 };
    const point = toBoard(event.clientX, event.clientY);
    resize.current = {
      id: card.id,
      centre,
      distance: Math.max(8, Math.hypot(point.x - centre.x, point.y - centre.y)),
      from: card.scale,
      before: { cards, strings },
      moved: false,
    };
  }

  function onPinPointerDown(event: React.PointerEvent, cardId: string) {
    if (!interactive) return;
    // A pin head is a drag and nothing else — no click, no focus, no text —
    // so refusing the default here costs nothing and stops the string from
    // dragging a blue selection along behind it.
    event.preventDefault();
    const point = toBoard(event.clientX, event.clientY);
    setSelected(new Set());
    setSelectedStringId(null);
    setDrawing({ anchor: { card: cardId }, x: point.x, y: point.y });
  }

  /** Taking one end of an already-drawn string off its card to move it. */
  function onEndHandlePointerDown(
    event: React.PointerEvent,
    line: BoardString,
    end: 'from' | 'to',
  ) {
    if (!interactive) return;
    event.stopPropagation();
    // Same as the pin head: a grip is only ever dragged.
    event.preventDefault();
    const point = toBoard(event.clientX, event.clientY);
    pushUndo();
    setDrawing({
      anchor: end === 'from' ? line.to : line.from,
      x: point.x,
      y: point.y,
      editing: { id: line.id, end },
    });
  }

  function onStringPointerDown(event: React.PointerEvent, stringId: string) {
    event.stopPropagation();
    setSelected(new Set());
    setCroppingId(null);
    setSelectedStringId(stringId);
  }

  function onSurfacePointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (
      target.closest('.board-card') ||
      target.closest('.board-inspector') ||
      // The drawer and its spine sit inside the viewport, so a press in the
      // filter box bubbled out here and panned the wall out from under it.
      target.closest('.board-tray') ||
      target.closest('.board-tray-spine') ||
      target.closest('.board-end-handle') ||
      target.closest('.board-grip') ||
      // §33: a press on the tekenlaag's sheet or its toolbar is a stroke or a
      // click, never a pan.
      target.closest('.ink-capture') ||
      target.closest('.ink-toolbar')
    ) {
      return;
    }

    /*
     * Bare cork, and this press is a pan or a marquee. Both are drags, and the
     * browser's own answer to a drag is to sweep a text selection across the
     * page — the cards, the toolbar, whatever is above the board. `user-select:
     * none` on the cork stops it from selecting anything *in* here; refusing
     * the default stops the gesture from being read as a selection at all.
     *
     * The one thing the default would have done that is worth keeping is
     * moving focus off whatever was being typed in, so do that by hand — the
     * board's name saves on blur, and it would otherwise never lose focus.
     * Nothing on bare cork wants focus, and nothing on it answers a click.
     */
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body) active.blur?.();
    event.preventDefault();

    setSelected(new Set());
    setSelectedStringId(null);
    setCroppingId(null);

    if (event.shiftKey && interactive) {
      const point = toBoard(event.clientX, event.clientY);
      setMarquee({ x0: point.x, y0: point.y, x1: point.x, y1: point.y });
      return;
    }

    pan.current = {
      startX: event.clientX,
      startY: event.clientY,
      from: viewport,
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    // §8, live: where this hand is, for everyone else's wall. A finger has no
    // hover, so touch only reports while it is actually dragging a card.
    if (event.pointerType !== 'touch' && live.state === 'live') {
      live.reportPointer({ cursor: toBoard(event.clientX, event.clientY) });
    }
    // Remembered for the paste, which has no coordinates of its own.
    if (event.pointerType !== 'touch') pointerAt.current = toBoard(event.clientX, event.clientY);

    if (resize.current) {
      const state = resize.current;
      const point = toBoard(event.clientX, event.clientY);
      const reach = Math.hypot(point.x - state.centre.x, point.y - state.centre.y);
      const raw = clamp((state.from * reach) / state.distance, CARD_SCALE_MIN, CARD_SCALE_MAX);
      // A twentieth, unless Shift says otherwise; two decimals either way, so
      // nothing like 1.7000000000000002 ever reaches a style attribute.
      const next = event.shiftKey
        ? Math.round(raw * 100) / 100
        : Math.round(raw / CARD_SCALE_STEP) * CARD_SCALE_STEP;
      const scale = Math.round(next * 100) / 100;
      if (!state.moved) {
        state.moved = true;
        undoStack.current.push(state.before);
        if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
      }
      sync.touch();
      setCards((current) =>
        current.map((card) => (card.id === state.id ? { ...card, scale } : card)),
      );
      return;
    }

    if (cropDrag.current && croppingId) {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const state = cropDrag.current;
      /*
       * The frame is CARD_WIDTH wide at zoom 1 *and at scale 1*; dragging right
       * moves the picture right, so the focal point moves left.
       *
       * §41: the card's own size belongs in this divisor beside the board's zoom,
       * for exactly the same reason: a card at 250% has a cover two and a half
       * times as wide on screen, so a hand that travels 100 px has crossed less
       * of the picture. Without it, cropping a card somebody had enlarged moved
       * the photograph two and a half times too fast.
       */
      const paper = viewport.zoom * (cardById.get(croppingId)?.scale ?? DEFAULT_CARD_SCALE);
      const dx = (event.clientX - state.startX) / paper / CARD_WIDTH / state.from.zoom;
      const dy = (event.clientY - state.startY) / paper / ((CARD_WIDTH * 4) / 3) / state.from.zoom;
      const next = {
        x: clamp(state.from.x - dx, 0, 1),
        y: clamp(state.from.y - dy, 0, 1),
        zoom: state.from.zoom,
      };
      sync.touch();
      setCards((current) =>
        current.map((card) => (card.id === croppingId ? { ...card, crop: next } : card)),
      );
      return;
    }

    if (drag.current) {
      const dx = (event.clientX - drag.current.startX) / viewport.zoom;
      const dy = (event.clientY - drag.current.startY) / viewport.zoom;
      if (!dragMoved.current && Math.abs(dx) + Math.abs(dy) > 4) {
        dragMoved.current = true;
        undoStack.current.push(drag.current.before);
        if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
      }
      sync.touch();
      const origin = drag.current.origin;
      const moving: Record<string, { x: number; y: number }> = {};
      for (const [id, from] of origin) moving[id] = { x: Math.round(from.x + dx), y: Math.round(from.y + dy) };
      // Everyone else sees the cards travel with the hand, not just land.
      if (dragMoved.current && live.state === 'live') live.reportPointer({ moving });
      setCards((current) =>
        current.map((card) => {
          const at = moving[card.id];
          return at ? { ...card, x: at.x, y: at.y } : card;
        }),
      );
      return;
    }

    if (pan.current) {
      // Read the ref here, not inside the updater: React runs updaters later —
      // twice over in Strict Mode — by which time pointerup has cleared it.
      const { from, startX, startY } = pan.current;
      const nextX = from.x + (event.clientX - startX);
      const nextY = from.y + (event.clientY - startY);
      setViewport((current) => ({ ...current, x: nextX, y: nextY }));
      return;
    }

    if (drawing) {
      const point = toBoard(event.clientX, event.clientY);
      setDrawing({ ...drawing, x: point.x, y: point.y });
      return;
    }

    if (marquee) {
      const point = toBoard(event.clientX, event.clientY);
      setMarquee({ ...marquee, x1: point.x, y1: point.y });
      // §8, live: a box dragged round half the wall is something you are doing
      // *to* a board somebody else is working on. They should see it happen,
      // not only see six cards light up when it closes.
      if (live.state === 'live') {
        live.reportPointer({
          selection: [
            Math.round(marquee.x0),
            Math.round(marquee.y0),
            Math.round(point.x),
            Math.round(point.y),
          ],
        });
      }
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    if (resize.current) {
      const changed = resize.current.moved;
      resize.current = null;
      // The live pointer channel carries positions and nothing else, so a size
      // reaches everybody else on the drop rather than while the hand moves —
      // the same way a border or a colour change does.
      if (!readOnly) {
        if (changed) void sync.saveNow();
        else sync.markDirty();
      }
      return;
    }

    if (cropDrag.current) {
      cropDrag.current = null;
      if (!readOnly) sync.markDirty();
      return;
    }

    if (drag.current) {
      const moved = dragMoved.current;
      drag.current = null;
      // The drop is the one save everyone else is waiting on: they have been
      // watching this card travel, and its final place should not lag behind
      // the hand by a debounce.
      if (!readOnly) {
        if (moved) sync.saveNow();
        else sync.markDirty();
      }
      return;
    }

    if (pan.current) {
      pan.current = null;
      if (!readOnly) sync.markDirty();
      return;
    }

    if (drawing) {
      // Hit-test by geometry rather than by DOM target: a card sitting under
      // another one, or a transparent overlay, would otherwise swallow the drop.
      const point = toBoard(event.clientX, event.clientY);
      const hit = cardAt(point.x, point.y);
      // On a card or a pin, tie to it. On bare cork, push a new pin in right
      // there and tie to that: a lead that goes somewhere you have not named
      // yet gets a place on the wall, and the pin can be moved and labelled.
      const fresh = hit ? null : pinAt(point.x, point.y);
      const end: Endpoint = { card: hit ? hit.id : fresh!.id };
      let nextCards = fresh ? [...cards, fresh] : cards;

      // One string between any two things. Landing on a pair that is already
      // joined selects the string that joins them rather than adding a twin.
      const twin = strings.find(
        (item) =>
          item.id !== drawing.editing?.id && sameEnds(item, { from: drawing.anchor, to: end }),
      );
      if (twin) {
        // Nothing changed, so the grip's undo entry has nothing to undo.
        if (drawing.editing) undoStack.current.pop();
        setSelectedStringId(twin.id);
        setDrawing(null);
        ui.toast('Die twee zijn al met elkaar verbonden.');
        return;
      }

      if (!endpointsEqual(end, drawing.anchor)) {
        if (drawing.editing) {
          const { id, end: which } = drawing.editing;
          const line = strings.find((item) => item.id === id);
          const nextStrings = strings.map((item) =>
            item.id === id ? { ...item, [which]: end } : item,
          );
          // Pulling the string off a bare, unlabelled pin that nothing else is
          // tied to takes the pin out with it — nobody leaves an empty pin in
          // the wall on purpose.
          const left = line?.[which];
          if (left && isCardEnd(left)) {
            const pin = cardById.get(left.card);
            const stillUsed = nextStrings.some(
              (item) =>
                (isCardEnd(item.from) && item.from.card === left.card) ||
                (isCardEnd(item.to) && item.to.card === left.card),
            );
            if (pin && pin.kind === 'pin' && !pin.name && !stillUsed) {
              nextCards = nextCards.filter((item) => item.id !== pin.id);
              sync.noteDeletedCard(pin.id);
            }
          }
          // This gesture already pushed its undo entry when the grip was taken.
          commit({ cards: nextCards, strings: nextStrings }, { undo: false });
          setSelectedStringId(id);
        } else {
          const line: BoardString = {
            id: newStringId(),
            from: drawing.anchor,
            to: end,
            label: '',
            colour: 'red',
            width: DEFAULT_STRING_WIDTH,
            style: DEFAULT_STRING_STYLE,
          };
          commit({ cards: nextCards, strings: [...strings, line] });
          // Select it, so the inspector is right there to label and colour it.
          setSelectedStringId(line.id);
        }
      }
      setDrawing(null);
      return;
    }

    if (marquee) {
      const minX = Math.min(marquee.x0, marquee.x1);
      const maxX = Math.max(marquee.x0, marquee.x1);
      const minY = Math.min(marquee.y0, marquee.y1);
      const maxY = Math.max(marquee.y0, marquee.y1);
      const hit = cards
        .filter((card) => {
          const box = cardBox(card);
          return (
            box.x + box.width > minX &&
            box.x < maxX &&
            box.y + box.height > minY &&
            box.y < maxY
          );
        })
        .map((card) => card.id);
      setSelected(new Set(hit));
      setMarquee(null);
      // The box is closed; take it off everyone else's wall. The selection it
      // made shows up as the coloured borders presence already draws.
      if (live.state === 'live') live.reportPointer({ selection: null });
    }
  }

  /* ----------------------------------------------------------------- zoom */

  const zoomAround = useCallback(
    (factor: number, px?: number, py?: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const atX = px ?? rect.width / 2;
      const atY = py ?? rect.height / 2;
      setViewport((current) => {
        const nextZoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        return {
          zoom: nextZoom,
          x: atX - ((atX - current.x) / current.zoom) * nextZoom,
          y: atY - ((atY - current.y) / current.zoom) * nextZoom,
        };
      });
      if (!readOnly) sync.markDirty();
    },
    [sync],
  );

  function onWheel(event: React.WheelEvent) {
    // While cropping, the wheel zooms the picture rather than the board.
    if (croppingId) {
      const card = cardById.get(croppingId);
      if (!card) return;
      const crop = card.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
      const nextZoom = clamp(crop.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08), 1, 4);
      patchCard(croppingId, {
        crop: { ...crop, zoom: Number(nextZoom.toFixed(3)) },
      });
      return;
    }
    if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAround(
      event.deltaY < 0 ? 1.1 : 1 / 1.1,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  }

  function onTouchMove(event: React.TouchEvent) {
    if (event.touches.length !== 2) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pinch.current) {
      pinch.current = { distance, zoom: croppingId ? 1 : viewport.zoom };
      return;
    }
    const ratio = distance / pinch.current.distance;

    if (croppingId) {
      const card = cardById.get(croppingId);
      if (!card) return;
      const crop = card.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
      setCards((current) =>
        current.map((item) =>
          item.id === croppingId
            ? {
                ...item,
                crop: { ...crop, zoom: clamp(crop.zoom * ratio, 1, 4) },
              }
            : item,
        ),
      );
      pinch.current = { distance, zoom: 1 };
      sync.touch();
      return;
    }

    const nextZoom = clamp(pinch.current.zoom * ratio, MIN_ZOOM, MAX_ZOOM);
    setViewport((current) => ({ ...current, zoom: nextZoom }));
  }

  function fitAll() {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || !cards.length) return;
    const bounds = boardBounds(cards);
    const zoom = clamp(
      Math.min((rect.width - 80) / bounds.width, (rect.height - 80) / bounds.height),
      MIN_ZOOM,
      1.2,
    );
    setViewport({
      zoom,
      x: rect.width / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: rect.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    });
    if (!readOnly) sync.markDirty();
  }

  /* ---------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      if (event.key === 'Escape') {
        if (lightbox) setLightbox(null);
        else if (inkTool.active) inkTool.setActive(false);
        else if (croppingId) setCroppingId(null);
        else if (drawing) setDrawing(null);
        else if (!typing) {
          setSelected(new Set());
          setSelectedStringId(null);
        }
        return;
      }
      if (typing) return;

      // §33: in the tekenmodus, Ctrl+Z takes back your own last stroke — for
      // a viewer too, who has no cards to undo.
      if (inkActive && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        ink.undo();
        return;
      }

      if (readOnly) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedStringId) {
          event.preventDefault();
          removeString(selectedStringId);
        } else if (selected.size) {
          event.preventDefault();
          removeCards([...selected]);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, selectedStringId, croppingId, drawing, lightbox, removeCards, removeString, undo, readOnly, inkActive, inkTool, ink]);

  /** If the pointer leaves the board mid-drag, finish rather than stick. */
  useEffect(() => {
    const finish = () => {
      if (drag.current) {
        drag.current = null;
        if (!readOnly) sync.markDirty();
      }
      if (cropDrag.current) {
        cropDrag.current = null;
        if (!readOnly) sync.markDirty();
      }
      if (resize.current) {
        resize.current = null;
        if (!readOnly) sync.markDirty();
      }
      if (pan.current) {
        pan.current = null;
        if (!readOnly) sync.markDirty();
      }
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [sync]);

  /* ------------------------------------------------------------- search */

  useEffect(() => {
    const typed = search.trim();
    if (typed.length < 1) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(typed)}&limit=6`, {
          signal: controller.signal,
        });
        if (response.ok) setSuggestions((await response.json()).entries ?? []);
      } catch {
        /* aborted */
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  /**
   * Puts an entry on the wall. `at` is a board point when the card was dragged
   * from the tray and dropped somewhere specific; without it the card lands in
   * the middle of the view, as the search box has always done.
   */
  const placeEntry = useCallback(
    (
      entry: {
        id: string;
        slug?: string;
        name: string;
        coverAssetId?: string | null;
        coverCrop?: unknown;
        typeIcon?: string;
        typeColour?: string;
        typeBorder?: string;
      },
      at?: { x: number; y: number },
    ) => {
      if (entry.slug) {
        setEntries((current) => ({
          ...current,
          [entry.id]: {
            id: entry.id,
            slug: entry.slug!,
            name: entry.name,
            coverAssetId: entry.coverAssetId ?? null,
            coverCrop: entry.coverCrop ?? null,
            typeIcon: entry.typeIcon ?? 'file',
            typeColour: entry.typeColour ?? 'var(--ink-muted)',
            typeBorder: entry.typeBorder ?? 'solid',
            missing: false,
          },
        }));
      }
      addCard({
        id: newCardId(),
        kind: 'entry',
        entryId: entry.id,
        name: entry.name,
        text: '',
        // §32: an artikel without a cover keeps its frame shut until somebody
        // opens it; `undefined` (a caller that does not know) keeps the old answer.
        showImage: defaultShowImage('entry', entry.coverAssetId === undefined ? undefined : Boolean(entry.coverAssetId)),
        ...(at
          ? { x: Math.round(at.x - CARD_WIDTH / 2), y: Math.round(at.y - CARD_SIZE.height / 2) }
          : {}),
      });
    },
    [addCard],
  );

  /**
   * A landkaart or a dossier on the wall. Same card, same drag, same string —
   * only the id it carries is different, and what it stands for is looked up
   * per viewer like everything else.
   */
  const placeMap = useCallback(
    (map: { id: string; name: string }) => {
      setMaps((current) =>
        current[map.id]
          ? current
          : { ...current, [map.id]: { id: map.id, slug: '', name: map.name, assetId: null, missing: false } },
      );
      addCard({ id: newCardId(), kind: 'map', mapId: map.id, name: map.name, text: '' });
      setSearch('');
      setSuggestions([]);
      // The slug and the picture come back with the next pull; until then the
      // card shows its name, which is what was just typed.
      void sync.saveNow();
    },
    [addCard, sync],
  );

  const placeCase = useCallback(
    (item: { id: string; name: string }) => {
      setCaseFacts((current) =>
        current[item.id]
          ? current
          : {
              ...current,
              [item.id]: {
                id: item.id,
                slug: '',
                name: item.name,
                status: 'open',
                assetId: null,
                crop: null,
                missing: false,
              },
            },
      );
      addCard({ id: newCardId(), kind: 'case', caseId: item.id, name: item.name, text: '' });
      setSearch('');
      setSuggestions([]);
      void sync.saveNow();
    },
    [addCard, sync],
  );

  /** §32: a tijdlijn on the wall — the same shape as a landkaart card. */
  const placeTimeline = useCallback(
    (item: { id: string; name: string }) => {
      setTimelineFacts((current) =>
        current[item.id] ? current : { ...current, [item.id]: { id: item.id, slug: '', name: item.name, scale: 'day', missing: false } },
      );
      addCard({ id: newCardId(), kind: 'timeline', timelineId: item.id, name: item.name, text: '', showImage: false });
      setSearch('');
      setSuggestions([]);
      void sync.saveNow();
    },
    [addCard, sync],
  );

  /** Landkaarten, dossiers and tijdlijnen matching what is typed, and not already up. */
  const otherMatches = useMemo(() => {
    const typed = search.trim();
    if (!typed) return { maps: [], cases: [], timelines: [] };
    const onWall = {
      map: new Set(cards.filter((card) => card.kind === 'map').map((card) => card.mapId)),
      case: new Set(cards.filter((card) => card.kind === 'case').map((card) => card.caseId)),
      timeline: new Set(cards.filter((card) => card.kind === 'timeline').map((card) => card.timelineId)),
    };
    const pick = <T extends { id: string; name: string }>(list: T[], up: Set<unknown>) =>
      list
        .filter((item) => !up.has(item.id))
        .map((item) => ({ item, score: fuzzyScore(item.name, typed) }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((row) => row.item);
    return {
      maps: pick(pickableMaps, onWall.map),
      cases: pick(pickableCases, onWall.case),
      timelines: pick(pickableTimelines, onWall.timeline),
    };
  }, [search, cards, pickableMaps, pickableCases, pickableTimelines]);

  /** Everything in the case that is not already a card on this wall. */
  const trayEntries = useMemo(() => {
    const onWall = new Set(
      cards.filter((card) => card.kind === 'entry' && card.entryId).map((card) => card.entryId),
    );
    return caseEntries.filter((entry) => !onWall.has(entry.id));
  }, [caseEntries, cards]);

  async function addEntryCard(entryId: string, entryName: string) {
    // §32: unknown until the preview answers; a card of an artikel without a
    // cover starts with its frame shut (`defaultShowImage`).
    let hasCover: boolean | undefined;
    const response = await fetch(`/api/preview?id=${encodeURIComponent(entryId)}`);
    if (response.ok) {
      const data = await response.json();
      if (data.entry) {
        hasCover = Boolean(data.entry.coverAssetId);
        setEntries((current) => ({
          ...current,
          [entryId]: {
            id: data.entry.id,
            slug: data.entry.slug,
            name: data.entry.name,
            coverAssetId: data.entry.coverAssetId,
            coverCrop: data.entry.coverCrop ?? null,
            typeIcon: data.entry.typeIcon,
            typeColour: data.entry.typeColour,
            typeBorder: data.entry.typeBorder ?? 'solid',
            missing: false,
          },
        }));
      }
    }
    addCard({
      id: newCardId(),
      kind: 'entry',
      entryId,
      name: entryName,
      text: '',
      showImage: defaultShowImage('entry', hasCover),
    });
    setSearch('');
    setSuggestions([]);
    offerToFile(entryId, entryName);
  }

  /**
   * §11: a prikbord into the bin. It had no way out at all — a wall made by
   * mistake stayed on the shelf for ever — and every other thing the archive
   * makes has one. Soft, like the rest: a Keeper puts it back from Beheer, or
   * takes it off the shelf for good after typing its name.
   */
  const [removing, setRemoving] = useState(false);
  const removeBoard = useCallback(async () => {
    const yes = await ui.confirm({
      title: `${name || `Dit ${ui.words.board}`} weggooien?`,
      message: (
        <>
          Het {ui.words.board} gaat naar de prullenbak; een {ui.words.keeper} kan het terugzetten.
          De {ui.words.entryPlural} die eraan hangen blijven gewoon staan — alleen deze muur
          verdwijnt.
        </>
      ),
      confirmLabel: 'Naar de prullenbak',
      danger: true,
    });
    if (!yes) return;
    setRemoving(true);
    const response = await fetch(`/api/boards/${boardId}`, { method: 'DELETE' }).catch(() => null);
    if (!response?.ok) {
      setRemoving(false);
      ui.toast('Weggooien is niet gelukt.');
      return;
    }
    router.push(caseSlug ? `/c/${caseSlug}` : '/boards');
    router.refresh();
  }, [boardId, caseSlug, name, router, ui]);

  /* ------------------------------------------------------------- render */

  const world = {
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    transformOrigin: '0 0',
  } as const;

  const drawingAnchor = drawing ? pointOf(drawing.anchor) : null;
  const singleSelected = selectedCards.length === 1 ? selectedCards[0] : null;
  const selectedSubject = singleSelected ? subjectFor(singleSelected) : undefined;
  const selectedImage = singleSelected ? cardImage(singleSelected, selectedSubject) : null;

  /** Every loose end on the board, so a string never stops in mid-air. */
  const anchors = useMemo(() => {
    const out: { key: string; x: number; y: number }[] = [];
    for (const line of strings) {
      for (const end of [line.from, line.to] as const) {
        if (isCardEnd(end)) continue;
        out.push({ key: `${line.id}-${end.x}-${end.y}`, x: end.x, y: end.y });
      }
    }
    return out;
  }, [strings]);

  return (
    <div className="board-page">
      <div className="board-bar">
        <label className="visually-hidden" htmlFor="board-name">
          Naam van het prikbord
        </label>
        <input
          id="board-name"
          className="board-name-input"
          value={name}
          readOnly={readOnly}
          onChange={(event) => setName(event.target.value)}
          onBlur={() =>
            !readOnly &&
            void fetch(`/api/boards/${boardId}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name, clientId }),
            })
          }
        />
        {/* §43: the web, with this prikbord in the middle. */}
        <ConnectionsLink kind="board" id={boardId} as="chip" />
        {readOnly && (
          <span className="chip" title="Je kunt dit prikbord bekijken, niet bewerken.">
            <Icon name="lock" size={12} />
            Alleen kijken
          </span>
        )}
        {(access.canManage || access.settings.locked) && (
          <button
            type="button"
            className="chip chip-selectable"
            onClick={() => setAccessOpen(true)}
            title="Wie mag dit prikbord zien en bewerken"
          >
            <Icon name={access.settings.viewMode === 'all' ? 'eye' : 'lock'} size={12} />
            Rechten
          </button>
        )}
        {caseSlug && (
          <Link className="chip" href={`/c/${caseSlug}`}>
            <Icon name="folder" size={12} />
            {caseName}
          </Link>
        )}
        <div className="spacer" />

        {live.others.length > 0 && (
          <span
            className="board-people"
            aria-label={`Ook op dit ${ui.words.board}: ${live.others.map((p) => p.name).join(', ')}`}
          >
            {live.others.slice(0, 5).map((person) => (
              <span
                key={person.clientId}
                className="board-person"
                style={{ background: person.colour }}
                title={person.name}
              >
                {person.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
            {live.others.length > 5 && (
              <span className="board-person board-person-more">+{live.others.length - 5}</span>
            )}
          </span>
        )}

        <span className="save-state">{syncLabel(sync.state)}</span>

        <span className="board-zoom" role="group" aria-label="Zoomen">
          <button type="button" onClick={() => zoomAround(1 / 1.25)} aria-label="Uitzoomen">
            &minus;
          </button>
          <span className="board-zoom-level">{Math.round(viewport.zoom * 100)}%</span>
          <button type="button" onClick={() => zoomAround(1.25)} aria-label="Inzoomen">
            +
          </button>
        </span>

        <button type="button" className="btn btn-small" onClick={fitAll}>
          Alles in beeld
        </button>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={undo}
          title="Ongedaan maken (Ctrl+Z)"
        >
          Ongedaan maken
        </button>
        {!readOnly && (
          <button
            type="button"
            className="btn btn-small btn-ghost"
            disabled={removing}
            onClick={() => void removeBoard()}
            title={`Dit ${ui.words.board} naar de prullenbak`}
            /* The word is hidden on a phone, where the bar is crowded, so the
               button needs a name of its own — an icon is not a label. */
            aria-label={`${capitalise(ui.words.board)} verwijderen`}
          >
            <Icon name="trash" size={14} />
            <span className="board-bar-wide-only">{capitalise(ui.words.board)} verwijderen</span>
          </button>
        )}
      </div>

      {!readOnly && (
      <div className="board-tools">
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
          <label className="visually-hidden" htmlFor="board-search">
            {capitalise(ui.words.card)} toevoegen
          </label>
          <input
            id="board-search"
            className="input"
            value={search}
            placeholder={`Zoek een ${ui.words.entry}, een landkaart of een ${ui.words.case}…`}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search.trim() && (
            <ul
              className="suggest-list"
              style={{ position: 'absolute', zIndex: 30, left: 0, right: 0 }}
            >
              {suggestions.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="suggest-item"
                    onClick={() => void addEntryCard(item.id, item.name)}
                  >
                    <Icon name={item.typeIcon} size={16} style={{ color: item.typeColour }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{item.name}</strong>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {item.typeLabel}
                      </span>
                    </span>
                  </button>
                </li>
              ))}

              {/* The other two things this archive holds that a wall might
                  want to point at. Matched here rather than asked for: you
                  have a dozen landkaarten, not a thousand. */}
              {otherMatches.maps.map((item) => (
                <li key={`map-${item.id}`}>
                  <button type="button" className="suggest-item" onClick={() => placeMap(item)}>
                    <Icon name="map" size={16} style={{ color: 'var(--ink-muted)' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{item.name}</strong>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        Landkaart
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {otherMatches.cases.map((item) => (
                <li key={`case-${item.id}`}>
                  <button type="button" className="suggest-item" onClick={() => placeCase(item)}>
                    <Icon name="folder" size={16} style={{ color: 'var(--ink-muted)' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{item.name}</strong>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {capitalise(ui.words.case)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {otherMatches.timelines.map((item) => (
                <li key={`timeline-${item.id}`}>
                  <button type="button" className="suggest-item" onClick={() => placeTimeline(item)}>
                    <Icon name="timeline" size={16} style={{ color: 'var(--ink-muted)' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{item.name}</strong>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {capitalise(ui.words.timeline)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="suggest-item"
                  onClick={() => {
                    addCard({
                      id: newCardId(),
                      kind: 'note',
                      name: search.trim(),
                      text: '',
                    });
                    setSearch('');
                    setSuggestions([]);
                  }}
                >
                  <Icon name="plus" size={16} style={{ color: 'var(--stamp-red)' }} />
                  <span>
                    &lsquo;<strong>{search.trim()}</strong>&rsquo; als notitie toevoegen
                  </span>
                </button>
              </li>
            </ul>
          )}
        </div>

        <button
          type="button"
          className="btn btn-small"
          onClick={() => addCard({ id: newCardId(), kind: 'note', name: 'Notitie', text: '' })}
        >
          <Icon name="plus" size={15} />
          Nieuwe notitie
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => askForPhoto('new')}
          disabled={uploading}
          title="Kies een afbeelding, of plak er een met Ctrl+V"
        >
          <Icon name="camera" size={15} />
          {uploading ? 'Uploaden…' : 'Foto'}
        </button>
        {/* Nobody finds a paste that is not written down. Hidden on a phone,
            where there is no clipboard gesture on the cork to find. */}
        <span className="tiny muted board-paste-hint">of plak een afbeelding</span>
        <button
          type="button"
          className="btn btn-small"
          title={`Een losse ${ui.words.pin}: een plek op de muur voor een spoor dat nog geen ${ui.words.card} heeft`}
          onClick={() => {
            const placed = addCard({ id: newCardId(), kind: 'pin', name: '', text: '' });
            setSelected(new Set([placed.id]));
            setSelectedStringId(null);
          }}
        >
          <span className="board-pin board-pin-inline" aria-hidden="true" />
          {capitalise(ui.words.pin)}
        </button>
      </div>
      )}

      {isPhone && !readOnly && <p className="board-hint">Verschuiven werkt het best op een tablet of computer.</p>}

      <div
        className="board-viewport"
        ref={viewportRef}
        {...gate}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        /*
         * The wall's position is the transform on `.board-world`, and nothing
         * else. `overflow: clip` means this box cannot be scrolled at all where
         * the browser knows that word; where it does not, this puts back what
         * the browser scrolled behind the board's back — a focused field being
         * revealed, an assistive jump — because a cork that has quietly slid
         * 100 px is one where every card is a little to the left of where it
         * says it is, strings included.
         */
        onScroll={(event) => {
          const box = event.currentTarget;
          if (box.scrollLeft !== 0) box.scrollLeft = 0;
          if (box.scrollTop !== 0) box.scrollTop = 0;
        }}
        onPointerLeave={() => {
          pointerAt.current = null;
          live.reportPointer({ cursor: null });
        }}
        onWheel={onWheel}
        onTouchMove={onTouchMove}
        onTouchEnd={() => {
          pinch.current = null;
          if (!readOnly) sync.markDirty();
        }}
        onDragOver={(event) => {
          // Only say yes to a card from our own tray; a file dropped here is
          // not something the cork knows what to do with.
          if (!dragging.current) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          const entry = dragging.current;
          dragging.current = null;
          if (!entry) return;
          event.preventDefault();
          const point = toBoard(event.clientX, event.clientY);
          placeEntry(entry, point);
        }}
      >
        {/* §33: the tekenlaag, under the cork's cards and strings. */}
        <InkCanvas
          className="ink-layer"
          strokes={ink.strokes}
          stableCount={ink.stableCount}
          project={inkProject}
          widthScale={viewport.zoom}
          viewKey={`${viewport.x},${viewport.y},${viewport.zoom}`}
          width={viewportSize.width}
          height={viewportSize.height}
        />

        <div className="board-world" style={world}>
          <svg
            className="board-strings"
            width={STRING_LAYER}
            height={STRING_LAYER}
            viewBox={`${-STRING_LAYER / 2} ${-STRING_LAYER / 2} ${STRING_LAYER} ${STRING_LAYER}`}
            aria-hidden="true"
          >
            {strings.map((line) => {
              const a = pointOf(line.from);
              const b = pointOf(line.to);
              if (!a || !b) return null;
              const d = stringPath(a.x, a.y, b.x, b.y);
              const colour = stringColourValue(line.colour);
              const isSelected = line.id === selectedStringId;
              // Board units, inside `.board-world`, which is scaled by the zoom
              // — so a thread grows and shrinks with the wall, like string.
              const width = line.width ?? DEFAULT_STRING_WIDTH;
              const dash = stringDash(line.style, width);
              // "Dubbel" is two thinner strands either side of the centre; the
              // two together carry the thickness that was asked for.
              const strands =
                line.style === 'double'
                  ? [width * 0.45, -width * 0.45].map((offset) => ({
                      d: stringPathOffset(a.x, a.y, b.x, b.y, offset),
                      width: width * 0.4,
                    }))
                  : [{ d, width }];
              return (
                <g key={line.id}>
                  {/*
                    A wide invisible path, because 2 px of string is not a
                    target — the centre curve for every kind of string, and
                    unbroken, so a dashed one can be caught in its gaps too.
                  */}
                  <path
                    className="board-string-hit"
                    d={d}
                    style={{ '--string-hit': `${Math.max(18, width * 3)}px` } as CSSProperties}
                    onPointerDown={(event) => onStringPointerDown(event, line.id)}
                  />
                  {/*
                    Width and dash travel as custom properties, never as
                    presentation attributes: `.board-string` is a CSS rule and
                    would beat an attribute every time, which is the trap the
                    colour fell into once already.
                  */}
                  {strands.map((strand, index) => (
                    <path
                      key={index}
                      className={`board-string${isSelected ? ' board-string-selected' : ''}`}
                      d={strand.d}
                      stroke={colour}
                      style={
                        {
                          // px, because inside an SVG one CSS pixel *is* one
                          // user unit — and a unit keeps `calc()` happy.
                          '--string-w': `${strand.width}px`,
                          '--string-dash': dash ?? 'none',
                        } as CSSProperties
                      }
                    />
                  ))}
                </g>
              );
            })}

            {drawing && drawingAnchor && (
              <path
                className="board-string board-string-drawing"
                d={stringPath(drawingAnchor.x, drawingAnchor.y, drawing.x, drawing.y)}
                stroke={stringColourValue('red')}
              />
            )}
          </svg>

          {/* A pin for every loose end, so string never stops at nothing. */}
          {anchors.map((anchor) => (
            <span
              key={anchor.key}
              className="board-anchor"
              style={{ left: anchor.x, top: anchor.y }}
              aria-hidden="true"
            />
          ))}

          {/*
            §8, live: whose hand is on what. The same idea as the coloured
            border Google Sheets draws round a cell someone else has selected —
            drawn as its own layer in board coordinates rather than pushed into
            `BoardCardView`, so a card's own markup and its own selected state
            stay exactly what they were.
          */}
          {shownCards.map((card) => {
            const holder = live.heldByOthers.get(card.id);
            if (!holder) return null;
            // The painted box, not the stored corner: this outline is drawn
            // beside the card rather than inside it, so it has to be told where
            // a card that has been made bigger actually reaches to.
            const box = cardBox(card);
            return (
              <div
                key={`held-${card.id}`}
                className={`board-held${live.carried.has(card.id) ? ' board-card-carried' : ''}`}
                aria-hidden="true"
                style={{
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                  transform: `rotate(${card.rotation}deg)`,
                  ['--held-colour' as string]: holder.colour,
                }}
              >
                <span className="board-held-name">{holder.name}</span>
              </div>
            );
          })}

          {shownCards.map((card) => (
            <BoardCardView
              key={card.id}
              card={card}
              carried={live.carried.has(card.id) && !selected.has(card.id)}
              subject={subjectFor(card)}
              selected={selected.has(card.id)}
              interactive={interactive}
              cropping={croppingId === card.id}
              canOpenOnTap={() => !interactive && pressWasSelected.current === card.id}
              onPointerDown={(event) => onCardPointerDown(event, card.id)}
              onPinPointerDown={(event) => onPinPointerDown(event, card.id)}
              onTextChange={(text) => !readOnly && patchCard(card.id, { text })}
              onOpen={() => {
                if (dragMoved.current) return;
                const subject = subjectFor(card);
                if (subject) router.push(subject.href);
              }}
              onViewFull={() => {
                if (dragMoved.current) return;
                if (card.assetId) setLightbox({ assetId: card.assetId, name: card.name });
              }}
              onConvertToEntry={() =>
                ui.openNewEntry({
                  name: card.name,
                  shortDescription: card.text,
                  // §24: a wall that hangs off a dossier is that dossier's, so
                  // an artikel made here is made in it.
                  caseId: caseId ?? undefined,
                  onCreated: (created) => {
                    /*
                     * A picture pinned to this card comes along as the new
                     * artikel's cover, crop and all. Without this the road out
                     * of a pasted photograph lost the photograph: you pasted a
                     * document, made an artikel of it, and the artikel came
                     * into the world blank while the picture stayed behind on
                     * one wall. The card keeps its own copy too — that is what
                     * it is already drawing — so a refused patch (a viewer's
                     * write turned into a voorstel, a connection that dropped)
                     * costs the cover and never the picture.
                     */
                    const carried = card.assetId ?? null;
                    if (carried) {
                      void fetch(`/api/entries/${created.id}`, {
                        method: 'PATCH',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ coverAssetId: carried, coverCrop: card.crop ?? null }),
                      }).then(() => router.refresh());
                    }
                    setEntries((current) => ({
                      ...current,
                      [created.id]: {
                        id: created.id,
                        slug: created.slug,
                        name: created.name,
                        coverAssetId: carried,
                        coverCrop: carried ? (card.crop ?? null) : null,
                        typeIcon: created.typeIcon,
                        typeColour: created.typeColour,
                        typeBorder: 'solid',
                        missing: false,
                      },
                    }));
                    // §8: the note becomes an entry card in place.
                    patchCard(card.id, {
                      kind: 'entry',
                      entryId: created.id,
                      name: created.name,
                      // A freshly written artikel has no cover of its own unless
                      // this card just gave it one: either way the frame stays
                      // exactly as it was.
                    });
                    offerToFile(created.id, created.name);
                  },
                })
              }
            />
          ))}

          {/*
            Labels are HTML on top of the cards, not SVG underneath them: the
            string itself belongs behind a card, but its label has to stay
            readable when two cards sit shoulder to shoulder — and a chip you
            can actually tap beats 11px of text with a stroke around it.
          */}
          {strings.map((line) => {
            if (!line.label) return null;
            const a = pointOf(line.from);
            const b = pointOf(line.to);
            if (!a || !b) return null;
            return (
              <button
                key={`label-${line.id}`}
                type="button"
                className={`board-string-label${line.id === selectedStringId ? ' board-string-label-on' : ''}`}
                style={{
                  left: (a.x + b.x) / 2,
                  top: (a.y + b.y) / 2 + sagOf(a.x, a.y, b.x, b.y) + 4,
                  borderColor: stringColourValue(line.colour),
                }}
                onPointerDown={(event) => onStringPointerDown(event, line.id)}
              >
                {line.label}
              </button>
            );
          })}

          {/*
            The two grips on the selected string. Grab one and drop it on
            another card, or on bare cork, to move that end — the same gesture
            as running a new string, so there is nothing extra to learn.
          */}
          {interactive &&
            selectedString &&
            (['from', 'to'] as const).map((which) => {
              const at = pointOf(selectedString[which]);
              if (!at) return null;
              return (
                <button
                  key={`handle-${selectedString.id}-${which}`}
                  type="button"
                  className="board-end-handle"
                  aria-label={`Verplaats het ${which === 'from' ? 'eerste' : 'tweede'} uiteinde van deze draad`}
                  style={{ left: at.x, top: at.y }}
                  onPointerDown={(event) => onEndHandlePointerDown(event, selectedString, which)}
                />
              );
            })}

          {/*
            §41: the grip that sizes a card, on the one card that is selected. In
            the world layer beside the string grips rather than inside the card:
            the card carries the `scale()` this sets, so a grip within it would
            be scaled by the very thing it is for. Not offered while the picture
            inside the card is being moved — that is the same drag, on the same
            card, meaning something else.
          */}
          {interactive && singleSelected && !croppingId && !inkActive && (() => {
            const box = cardBox(singleSelected);
            return (
              <button
                type="button"
                className="board-grip"
                aria-label={`Maak deze ${singleSelected.kind === 'pin' ? ui.words.pin : ui.words.card} groter of kleiner`}
                title="Sleep om de grootte te veranderen. Houd Shift ingedrukt voor tussenmaten."
                style={{
                  left: box.x + box.width,
                  top: box.y + box.height,
                  // The wall's zoom is already on `.board-world`; undoing it
                  // here keeps the grip the same size on screen at every zoom.
                  transform: `scale(${1 / viewport.zoom})`,
                }}
                onPointerDown={(event) => onGripPointerDown(event, singleSelected)}
              />
            );
          })()}

          {marquee && (
            <div
              className="board-marquee"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          )}

          {/*
            §8, live: everyone else's hand. Drawn in board coordinates so each
            viewer sees it under their own pan and zoom, counter-scaled so an
            arrow is an arrow at every zoom, and eased between frames so
            sixteen frames a second read as one movement.
          */}
          {live.marquees.map((box) => (
            <div
              key={`marquee-${box.clientId}`}
              className="board-marquee board-marquee-other"
              aria-hidden="true"
              style={{
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                ['--marquee-colour' as string]: box.colour,
              }}
            >
              <span className="board-marquee-name">{box.name}</span>
            </div>
          ))}

          {live.pointers.map((pointer) => (
            <div
              key={pointer.clientId}
              className="board-cursor"
              aria-hidden="true"
              style={{
                left: pointer.x,
                top: pointer.y,
                transform: `scale(${1 / viewport.zoom})`,
                ['--cursor-colour' as string]: pointer.colour,
              }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" className="board-cursor-arrow">
                <path d="M4 3l7.5 17 2.3-7.2L21 10.5z" />
              </svg>
              <span className="board-cursor-name">{pointer.name}</span>
            </div>
          ))}
        </div>

        {inkActive && (
          <InkCapture
            tool={inkTool.tool}
            toContent={toBoard}
            widthScale={viewport.zoom}
            onBegin={ink.begin}
            onExtend={ink.extend}
            onEnd={ink.end}
            onAbort={ink.abort}
          />
        )}
        {ink.enabled && (
          <InkToolbar
            className="ink-toolbar-board"
            active={inkTool.active}
            tool={inkTool.tool}
            onActive={(next) => {
              inkTool.setActive(next);
              if (next) {
                setSelected(new Set());
                setSelectedStringId(null);
                setCroppingId(null);
              }
            }}
            onTool={inkTool.setTool}
            canUndo={ink.canUndo}
            onUndo={ink.undo}
            saving={ink.saving}
          />
        )}

        {!cards.length && !inkActive && (
          <div className="board-empty">
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--serif)',
                fontSize: '1.1rem',
              }}
            >
              Nog niets geprikt.
            </p>
            <p className="small" style={{ margin: '0.3rem 0 0' }}>
              Zoek hierboven om een {ui.words.entry} te prikken, begin een {ui.words.note}, of druk een losse {ui.words.pin}
              in de muur voor een spoor dat nog geen kaart heeft. Sleep vanaf de kop van een
              {ui.words.pin} om {ui.words.string} te spannen &mdash; naar een andere {ui.words.card}, of naar het kale kurk,
              waar vanzelf een nieuwe {ui.words.pin} in gaat.
            </p>
          </div>
        )}

        {caseId && !readOnly && (
          <BoardTray
            entries={trayEntries}
            onAdd={(entry) => placeEntry(entry)}
            onDragStart={(entry, event) => {
              dragging.current = entry;
              event.dataTransfer.effectAllowed = 'copy';
              // Firefox will not start a drag without payload on the transfer.
              event.dataTransfer.setData('text/plain', entry.name);
            }}
          />
        )}

        {!readOnly && (
        <BoardInspector
          cards={selectedCards}
          string={selectedString}
          cropping={Boolean(croppingId)}
          busy={uploading}
          canCrop={Boolean(singleSelected?.showImage && selectedImage?.assetId)}
          /* A card with nothing to put in a frame no longer draws one whatever
             the flag says, so "Foto tonen" on a bare notitie would be a button
             that does nothing at all. Offered where there is something to show
             — a picture, or a soort icon to stand in until there is one, which
             is the same question `BoardCard` asks itself. */
          canShowImage={Boolean(selectedImage?.assetId || selectedSubject)}
          hasOwnPhoto={Boolean(singleSelected?.assetId)}
          inheritedBorderLabel={
            selectedSubject?.border ? borderLabel(selectedSubject.border) : null
          }
          borderValue={
            singleSelected
              ? (singleSelected.border ??
                (selectedSubject ? '' : cardBorder(singleSelected, selectedSubject)))
              : ''
          }
          openLabel={
            selectedSubject
              ? selectedSubject.kind === 'entry'
                ? `${capitalise(ui.words.entry)} openen`
                : `${capitalise(selectedSubject.noun)} openen`
              : null
          }
          onLabelChange={(label) => selectedString && patchString(selectedString.id, { label })}
          onColourChange={(colour: StringColour) =>
            selectedString && patchString(selectedString.id, { colour })
          }
          onWidthChange={(width: number) =>
            selectedString && patchString(selectedString.id, { width })
          }
          onStyleChange={(style: StringStyle) =>
            selectedString && patchString(selectedString.id, { style })
          }
          onRemoveString={() => selectedString && removeString(selectedString.id)}
          onCrop={() => singleSelected && setCroppingId(singleSelected.id)}
          onDoneCropping={() => setCroppingId(null)}
          onAddPhoto={() => singleSelected && askForPhoto(singleSelected.id)}
          onRemovePhoto={() =>
            singleSelected && patchCard(singleSelected.id, { assetId: null, crop: null })
          }
          onToggleImage={() =>
            singleSelected &&
            patchCard(singleSelected.id, {
              showImage: !singleSelected.showImage,
            })
          }
          scaleValue={singleSelected ? singleSelected.scale : null}
          onScaleChange={(scale) => singleSelected && patchCard(singleSelected.id, { scale })}
          onBorderChange={(border) => singleSelected && patchCard(singleSelected.id, { border })}
          onRename={(name) => singleSelected && patchCard(singleSelected.id, { name })}
          onOpenEntry={() => selectedSubject && router.push(selectedSubject.href)}
          onRemoveCards={() => removeCards(selectedCards.map((card) => card.id))}
          onClose={() => {
            setSelected(new Set());
            setSelectedStringId(null);
            setCroppingId(null);
          }}
        />
        )}
      </div>

      {accessOpen && (
        <Sheet onClose={() => setAccessOpen(false)} labelledBy="board-access-title">
          <div className="row" style={{ marginBottom: '0.8rem' }}>
            <h2 id="board-access-title" style={{ margin: 0, fontSize: '1.3rem' }}>
              Wie mag hier aan
            </h2>
            <div className="spacer" />
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => setAccessOpen(false)}
              aria-label="Sluiten"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <AccessEditor
            target="board"
            id={boardId}
            initial={access.settings}
            canManage={access.canManage}
            isKeeper={access.isKeeper}
            viewerId={access.viewerId}
            nouns={{ this: `dit ${ui.words.board}` }}
          />
          {access.canManage && (
            <label className="row" style={{ gap: '0.6rem', marginTop: '1rem', alignItems: 'flex-start' }} data-testid="board-in-web">
              <input
                type="checkbox"
                checked={inWeb}
                onChange={(event) => {
                  const next = event.target.checked;
                  setInWeb(next);
                  void fetch(`/api/boards/${boardId}`, {
                    method: 'PATCH',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ inWeb: next }),
                  }).then((response) => {
                    if (!response.ok) setInWeb(!next);
                  });
                }}
              />
              <span>
                <strong style={{ display: 'block' }}>Telt mee in het web</strong>
                <span className="small muted">
                  Uit: wat hier hangt wordt geen lijn in het web en staat niet onder &ldquo;Genoemd in&rdquo; op een {ui.words.entry}. Het {ui.words.board} zelf blijft zo zichtbaar als de rechten zeggen.
                </span>
              </span>
            </label>
          )}
          {access.isKeeper && (
            <InkKeeperControls
              enabled={ink.enabled}
              strokeCount={ink.layer.strokes.length}
              noun={`dit ${ui.words.board}`}
              onSetEnabled={(enabled) => void ink.keeper({ enabled })}
              onClear={() =>
                void ui
                  .confirm({
                    title: 'Tekenlaag wissen?',
                    message: `Alle streken op dit ${ui.words.board} gaan weg, voor iedereen. Dit is niet terug te draaien.`,
                    confirmLabel: 'Wissen',
                    danger: true,
                  })
                  .then((yes) => yes && ink.keeper({ clear: true }))
              }
            />
          )}
        </Sheet>
      )}

      {lightbox && (
        <div
          className="board-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name || 'Foto'}
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

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void uploadPhoto(file);
        }}
      />
    </div>
  );
}
