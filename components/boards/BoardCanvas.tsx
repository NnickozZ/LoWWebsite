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
import { changedIds, dropCards, restoredIds, shouldReadd } from '@/lib/boards/dirty';
import { cameraKey } from '@/components/canvas/cameraKeys';
import CanvasZoomControls from '@/components/canvas/CanvasZoomControls';
import { groupDelta } from '@/lib/canvas/select';
import {
  clampZoom,
  FIT_PADDING,
  fitViewport,
  passedSlop,
  wheelFactor,
  zoomAbout,
  ZOOM_STEP,
} from '@/lib/canvas/view';
import { useMarqueeSelect } from '@/components/canvas/useMarqueeSelect';
import { UNDO_LIMIT, createUndoStack, type UndoStack } from '@/components/canvas/undoStack';
import {
  boxAtPoint,
  freeSpotNear as findFreeSpot,
  leadPlace,
  pendingPinHolds,
  type PendingPin,
  type PlaceWhere,
} from '@/lib/boards/place';
import type {
  BoardBoardFacts,
  BoardCaseFacts,
  BoardEntryFacts,
  BoardMapFacts,
  BoardRefs,
  BoardTimelineFacts,
} from '@/lib/boards/service';
import type { FamilyTreeFacts } from '@/lib/families/service';
import { BoardCardView, CARD_WIDTH, cardBorder, cardImage, subjectOf } from './BoardCard';
import { BoardPicker, type PickableItem, type SuggestedEntry } from './BoardPicker';
import { BoardInspector } from './BoardInspector';
import { BoardTray, type TrayEntry } from './BoardTray';
import { offerToFileEntry } from './offerToFile';
import { syncLabel, useBoardSync } from './useBoardSync';
import { useBoardLive } from './useBoardLive';
import { imageFromClipboard, pasteIsForTyping, uploadForm, SHRUNK_NOTICE } from '@/lib/upload';
import { fitUpload } from '@/components/shrinkImage';
import { InkCanvas } from '@/components/ink/InkCanvas';
import { InkShell } from '@/components/ink/InkShell';
import { contentPanZoom, stageBoxOf, usePanZoomInk } from '@/components/ink/panZoom';
import { useCanvasInk } from '@/components/ink/useCanvasInk';
import { useElementSize } from '@/components/ink/useElementSize';
import type { InkLayerView } from '@/lib/ink/types';
import { useMakeOnEmpty } from '@/components/canvas/useMakeOnEmpty';

/*
 * §67: the wall's zoom floor and ceiling, and its undo depth, are the shared
 * ones now — `lib/canvas/view.ts` and `components/canvas/undoStack.ts` both
 * took their numbers from this file in the first place. What is left here is
 * the two "alles in beeld" ever had of its own.
 */
/** How far in "Alles in beeld" is allowed to go. A wall of four cards blown up
 *  two and a half times reads as broken rather than as helpful. */
const FIT_MAX_ZOOM = 1.2;
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
  initialBoards,
  initialFamilyTrees,
  pickableMaps,
  pickableCases,
  pickableTimelines,
  pickableBoards,
  pickableFamilyTrees,
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
  /**
   * §52: the prikborden it points at, and the ones that could still go up. The
   * wall's own id is not in the second list — the server leaves it out, so a
   * wall cannot be pinned to itself.
   */
  initialBoards: Record<string, BoardBoardFacts>;
  pickableBoards: { id: string; name: string }[];
  /**
   * §66: the stambomen it points at, and the ones that could still go up. Same
   * shape and same rule as the tijdlijnen above: resolved per viewer on the
   * server, so one this viewer may not open is simply absent here and its card
   * is stamped MISSING.
   */
  initialFamilyTrees: Record<string, FamilyTreeFacts>;
  pickableFamilyTrees: { id: string; name: string }[];
}) {
  const ui = useUi();
  const router = useRouter();
  const isPhone = useIsPhone();

  const [cards, setCards] = useState<BoardCard[]>(initialState.cards);
  const [strings, setStrings] = useState<BoardString[]>(initialState.strings);
  /**
   * §61: the document as it is *now*, not as it was when this render began.
   *
   * Every callback on this wall that builds the next board used to read `cards`
   * out of its closure. That is the render's copy, and half the work here
   * crosses an `await` or a sheet before it writes: an upload, "'X' aanmaken",
   * a pull that landed while the file dialog was open. The next document was
   * then built on a snapshot from before all of it — reverting whatever had
   * arrived in between, on this screen *and*, a moment later, on everybody
   * else's, because that revert was posted.
   *
   * So there are two of everything: state, which is what the wall is drawn
   * from, and a ref, which is what the next document is built from. The ref is
   * written at the same instant as the state, by hand, in every place that
   * writes — `commit`, `applyRemote`, undo, and the two pointer paths. Read it
   * for a snapshot; never write one without the other.
   */
  const cardsRef = useRef(cards);
  const stringsRef = useRef(strings);
  /** The one place both halves are written, so they cannot drift apart. */
  const putBoard = useCallback((next: { cards?: BoardCard[]; strings?: BoardString[] }) => {
    if (next.cards) {
      cardsRef.current = next.cards;
      setCards(next.cards);
    }
    if (next.strings) {
      stringsRef.current = next.strings;
      setStrings(next.strings);
    }
  }, []);
  const [entries, setEntries] = useState<Record<string, BoardEntryFacts>>(initialEntries);
  const [maps, setMaps] = useState<Record<string, BoardMapFacts>>(initialMaps);
  const [caseFacts, setCaseFacts] = useState<Record<string, BoardCaseFacts>>(initialCases);
  const [timelineFacts, setTimelineFacts] = useState<Record<string, BoardTimelineFacts>>(initialTimelines);
  const [boardFacts, setBoardFacts] = useState<Record<string, BoardBoardFacts>>(initialBoards);
  const [familyTreeFacts, setFamilyTreeFacts] =
    useState<Record<string, FamilyTreeFacts>>(initialFamilyTrees);
  const [viewport, setViewport] = useState<Viewport>(initialState.viewport);
  const [selectedStringId, setSelectedStringId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    assetId: string;
    name: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState(boardName);

  const [drawing, setDrawing] = useState<Drawing | null>(null);

  /**
   * §52: the picker opened where a string was let go on bare cork. `pin` is
   * the speld that string is already tied to — picking upgrades that very card
   * rather than making a second one, so the string never has to be rewritten;
   * cancelling leaves the speld, which is exactly what dropping a string in
   * the void has always done.
   *
   * §64: this is the **box**, and nothing else. Where the card belongs is
   * `pendingPin` below, which outlives it.
   */
  const [picker, setPicker] = useState<{
    pin: string;
    at: { x: number; y: number };
    left: number;
    top: number;
  } | null>(null);

  /**
   * §64: een punaise aan een draad houdt vast tot er iets op komt.
   *
   * The bare punaise a draad was let go on, waiting for something to become.
   * `picker` above is only the box that asks; this is the answer's address, and
   * it has to outlive the box — a reader presses Escape, clicks the cork, gets
   * interrupted by a pull that shuts the box, and then reaches for the search
   * field at the top of the wall, which is the obvious place to add a card.
   * Before this round that road placed the card in the middle of the view and
   * left the punaise hanging off the draad: "spawned hij in los van het einde".
   *
   * A **ref**, on purpose and not negotiable: between the drop and the card
   * landing there is a re-render, an `await` on `/api/preview`, possibly the
   * nieuw-artikel sheet, the "Toevoegen aan {dossier}" confirm and the
   * `router.refresh()` after it, and at least one incoming document. State is
   * overwritten by the first of those; a ref is not reachable from any of them.
   * `pendingPinHolds` is what decides it is still worth anything (§64), and
   * `takeLead`, called from `putCard` and nowhere else, is the only road out.
   *
   * One punaise, the most recent: a reader who drops three leads before naming
   * any of them answers the last one, and the other two stay what they were
   * before this round — bare punaises on the wall, each with its draad, each
   * still draggable and labelable. A queue would have to guess which lead a pick
   * belonged to, and guessing wrong is worse than the card landing where the
   * hand last was.
   */
  const pendingPin = useRef<PendingPin | null>(null);
  /**
   * §64: the same fact, in a shape a render can see — and *only* for the hint.
   *
   * The ref above is the authority; this is a shadow of it, set in the three
   * places the ref moves (the drop, `takeLead`, the expiry effect). It exists
   * because the bar's search box has to be able to say "dit komt aan de draad
   * die nog wacht" — a behaviour a reader cannot see coming is a behaviour that
   * reads as a bug the first time it surprises them. If the two ever drift the
   * worst case is a line of help shown or not shown; where the card lands is
   * never decided from here.
   *
   * Whatever this turns on in the toolbar **may not take up room**. `.board-tools`
   * is laid out above `.board-viewport`, so anything that appears there pushes the
   * whole wall down by its height — mid-gesture, and out from under every
   * coordinate anything had measured. It cost `round-27-board.spec.ts` its second
   * draad: the hand came down twenty pixels above the speld it was aiming at. See
   * the placeholder in `BoardPicker`.
   */
  const [holdingAPin, setHoldingAPin] = useState(false);

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
  /**
   * §67: the shared ring, which was this wall's own fifty-deep array before the
   * stamboom copied it and §67 gave the two of them one file. Made once and
   * held for the life of the wall, the same way `clientIdRef` below is.
   */
  const undoStackRef = useRef<UndoStack<Snapshot> | null>(null);
  if (!undoStackRef.current) undoStackRef.current = createUndoStack<Snapshot>(UNDO_LIMIT);
  const undoStack = undoStackRef.current;
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
  /**
   * The second thing a press on a card can be, beside moving it: the corner
   * grip, which makes the card bigger.
   *
   * Held as a ref like the drag, and for the same reason — a resize is a
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

  /**
   * §67: which kaartjes are chosen, and the box being swept over the cork.
   *
   * Both used to be state right here, with the hit test written out in
   * `onPointerUp` below. They are the same gesture on every canvas, so they
   * live in `components/canvas/useMarqueeSelect.ts` now and the arithmetic in
   * `lib/canvas/select.ts`. What stays this wall's own is everything around
   * them: the draad's own selection (`selectedStringId`), undo, which ids a
   * save may assert, the coloured borders of everybody else's hands, and the
   * inspector.
   *
   * Called this high up in the file because `busy` — which pauses the pull —
   * has to know about the box, and `busy` is what `useBoardSync` and
   * `useBoardLive` are given. `toBoard` and `live` are both declared further
   * down; the hook only ever calls them from a pointer handler, long after
   * this render has finished, so reading them from these closures is safe.
   */
  const selection = useMarqueeSelect<BoardCard>({
    // §61: the wall as it is at the drop, not as it was at the render that
    // opened the box.
    items: () => cardsRef.current,
    boxOf: cardBox,
    toWorld: (clientX, clientY) => toBoard(clientX, clientY),
    // §8: no marquee under 768 px, and none on a wall this hand may not edit.
    enabled: interactive,
    mode: 'replace',
    onBroadcast: (rect) => {
      if (live.state === 'live') live.reportPointer({ selection: rect });
    },
  });
  const { selected, setSelected, marquee } = selection;

  /**
   * §61: a hand on the wall, as *state* rather than as a read of two refs
   * during render. The refs are written by a pointer handler, which does not
   * schedule a render, so "busy" could lag a frame behind the hand it describes
   * — and `busy` is what defers the merge (§8). A frame late is exactly long
   * enough for a pull to land on the first millimetre of a drag.
   */
  const [handOn, setHandOn] = useState(false);
  const busy = handOn || Boolean(drawing) || selection.busy;

  /**
   * Applying someone else's version of the board. Shared with the save path,
   * because "the merge came back from my save" and "the merge came back because
   * Bram moved something" want exactly the same thing done with them.
   */
  const applyRemote = useCallback((state: BoardState, refs: BoardRefs) => {
    /*
     * §61: an incoming document is the archive's version of this wall, and the
     * archive is behind by whatever this hand has done and not yet saved. Two
     * examples from the wall, both of which used to end with the revert being
     * posted to everyone else a moment later:
     *
     *  - a string's end is pulled onto another card while the save that made
     *    that string is still in flight. The merge that comes back still ties
     *    it to the speld, and the next save posts *that* — with the speld's
     *    deletion — so the string dies on every screen;
     *  - a pull that was already on its way lands a millisecond after a card is
     *    dragged, and puts the card back where it started.
     *
     * So what is still outstanding stays local, and everything else is taken as
     * it comes. `sync.pending()` is that list.
     */
    const held = syncRef.current?.pending();
    let nextCards = state.cards;
    let nextStrings = state.strings;
    if (held && !held.all) {
      const mineCards = new Map(cardsRef.current.map((card) => [card.id, card]));
      const mineStrings = new Map(stringsRef.current.map((line) => [line.id, line]));
      const seenCards = new Set(state.cards.map((card) => card.id));
      const seenStrings = new Set(state.strings.map((line) => line.id));
      nextCards = state.cards
        // Taken off the wall here, and the archive has not been told yet.
        .filter((card) => !held.deletedCards.has(card.id))
        .map((card) => (held.cards.has(card.id) ? mineCards.get(card.id) ?? card : card));
      for (const card of cardsRef.current) {
        /*
         * Made here and not in the document yet — a card, or a speld a string
         * was tied to, that the archive has simply not heard of. §61: *not*
         * heard of. A card the archive knows to be gone carries a tombstone
         * (`state.deleted`), and pushing that one back left a ghost of somebody
         * else's deletion standing on this screen until something unrelated
         * moved — and posted it back to them on the next save.
         */
        if (seenCards.has(card.id)) continue;
        if (
          shouldReadd(card.id, {
            dirty: held.cards,
            deletedHere: held.deletedCards,
            restoredHere: held.restoredCards,
            tombstones: state.deleted?.cards,
          })
        ) {
          nextCards.push(card);
        }
      }
      nextStrings = state.strings
        .filter((line) => !held.deletedStrings.has(line.id))
        .map((line) => (held.strings.has(line.id) ? mineStrings.get(line.id) ?? line : line));
      for (const line of stringsRef.current) {
        if (seenStrings.has(line.id)) continue;
        if (
          shouldReadd(line.id, {
            dirty: held.strings,
            deletedHere: held.deletedStrings,
            restoredHere: held.restoredStrings,
            tombstones: state.deleted?.strings,
          })
        ) {
          nextStrings.push(line);
        }
      }
      // A string is only a string while both its ends are on the wall.
      const alive = new Set(nextCards.map((card) => card.id));
      nextStrings = nextStrings.filter(
        (line) =>
          (!isCardEnd(line.from) || alive.has(line.from.card)) &&
          (!isCardEnd(line.to) || alive.has(line.to.card)),
      );
    }
    // Through the refs as well, or the next local change would be built on
    // the document from before this merge and post it straight back.
    cardsRef.current = nextCards;
    stringsRef.current = nextStrings;
    setCards(nextCards);
    setStrings(nextStrings);
    setEntries((current) => ({ ...current, ...refs.entries }));
    setMaps((current) => ({ ...current, ...refs.maps }));
    setCaseFacts((current) => ({ ...current, ...refs.cases }));
    setTimelineFacts((current) => ({ ...current, ...(refs.timelines ?? {}) }));
    setBoardFacts((current) => ({ ...current, ...(refs.boards ?? {}) }));
    setFamilyTreeFacts((current) => ({ ...current, ...(refs.familyTrees ?? {}) }));
    // A card someone else deleted must not stay selected here: the inspector
    // would be editing something that no longer exists. §61: measured against
    // the wall as it ends up, which is the document plus whatever this hand
    // has not saved yet.
    const standing = new Set(nextCards.map((card) => card.id));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => standing.has(id)));
      return next.size === current.size ? current : next;
    });
    setSelectedStringId((current) =>
      current && nextStrings.some((line) => line.id === current) ? current : null,
    );
  }, []);

  /**
   * §61: the save, reachable from `applyRemote` above, which is defined first.
   * Written during render, like every other "the latest one" ref here.
   */
  const syncRef = useRef<ReturnType<typeof useBoardSync> | null>(null);

  const sync = useBoardSync({
    boardId,
    clientId,
    cards,
    strings,
    viewport,
    paused: busy,
    onMerged: applyRemote,
    /*
     * §61: the save reads the wall through the refs, not through this render's
     * `cards`. A save scheduled from a callback whose render has not landed yet
     * — an upload that finished, a sheet that answered — would otherwise post
     * the document from before it and clear the ids it never carried.
     */
    snapshot: useCallback(() => ({ cards: cardsRef.current, strings: stringsRef.current }), []),
    /*
     * §61: the archive refused these cards by name (§50 — their reference is on
     * the other side). They come off the wall; keeping them meant posting the
     * same refusal for ever, and nothing else on this wall was ever saved
     * again. The strings tied to them go with them, as they do for any card.
     */
    onRefusedCards: useCallback(
      (ids: string[]) => {
        putBoard(dropCards(cardsRef.current, stringsRef.current, ids));
        setSelected((current) => {
          const next = new Set([...current].filter((id) => !ids.includes(id)));
          return next.size === current.size ? current : next;
        });
      },
      [putBoard],
    ),
    onNotice: useCallback((message: string) => ui.toast(message), [ui]),
  });
  syncRef.current = sync;

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
  const viewportSize = useElementSize(viewportRef);
  /*
   * §67: the cork's own pan-and-zoom pair, from the shared helper — and it is
   * the wall's `toBoard` as well (below), so a card and a streek land on the
   * same point of the cork.
   */
  const inkSpace = usePanZoomInk(viewportRef, viewport);
  const ink = useCanvasInk({
    kind: 'board',
    id: boardId,
    initial: initialInk,
    project: inkSpace.project,
    toContent: inkSpace.toContent,
    widthScale: viewport.zoom,
    noun: `dit ${ui.words.board}`,
    onError: (message) => ui.toast(message),
    onOpen: () => {
      setSelected(new Set());
      setSelectedStringId(null);
    },
  });
  const inkActive = ink.inkActive;
  const onInkKey = ink.onKeyDown;

  /**
   * One card, resolved. Everything that has to know what a card *is* — the
   * card itself, the inspector, the double-click that opens it — asks this,
   * so there is one place that knows how the three kinds are looked up.
   */
  const refs = useMemo<BoardRefs>(
    () => ({
      entries,
      maps,
      cases: caseFacts,
      timelines: timelineFacts,
      boards: boardFacts,
      familyTrees: familyTreeFacts,
    }),
    [entries, maps, caseFacts, timelineFacts, boardFacts, familyTreeFacts],
  );
  const subjectFor = useCallback((card: BoardCard) => subjectOf(card, refs), [refs]);

  const pushUndo = useCallback(
    (snapshot: Snapshot) => {
      undoStack.push(snapshot);
    },
    [undoStack],
  );

  /**
   * §61: **`commit` takes an updater.** The next board is built from `prev` —
   * the document as it is at this instant — and never from a `cards` captured
   * when the render that made this callback ran. Everything that writes to the
   * wall goes through here, so this one rule is what keeps a pull, a drag, a
   * paste and an upload that finished thirty seconds late from overwriting one
   * another.
   *
   * It also derives what changed and hands the ids to the save (§61's dirty
   * set), so a save asserts this hand's cards and leaves everybody else's
   * alone.
   */
  const commit = useCallback(
    (make: (prev: Snapshot) => Partial<Snapshot>, options: { undo?: boolean } = {}) => {
      if (readOnly) return;
      const prev: Snapshot = { cards: cardsRef.current, strings: stringsRef.current };
      const next = make(prev);
      if (options.undo !== false) pushUndo(prev);
      const nextCards = next.cards ?? prev.cards;
      const nextStrings = next.strings ?? prev.strings;
      putBoard(next);
      sync.markDirty({
        cards: changedIds(prev.cards, nextCards),
        strings: changedIds(prev.strings, nextStrings),
      });
    },
    [pushUndo, putBoard, sync, readOnly],
  );

  const undo = useCallback(() => {
    if (readOnly) return;
    const previous = undoStack.pop();
    if (!previous) return;
    const current: Snapshot = { cards: cardsRef.current, strings: stringsRef.current };
    /*
     * Anything undo brings back must not still be queued for deletion, and the
     * server has to be told to lift the tombstone it wrote when the deletion
     * was first saved — otherwise the card reappears here and is swept away
     * again on the next save.
     *
     * §61: *anything undo brings back*, and nothing else. Asserting every id in
     * the snapshot lifted the tombstones of cards other people had deleted
     * while this step sat on the stack — their deletion undone by a stranger's
     * Ctrl+Z — and the queue of this client's own pending deletions was thrown
     * away whole along with it.
     */
    sync.noteRestored(
      restoredIds(previous.cards, current.cards),
      restoredIds(previous.strings, current.strings),
    );
    putBoard(previous);
    setSelected(new Set());
    setSelectedStringId(null);
    sync.markDirty({
      cards: changedIds(current.cards, previous.cards),
      strings: changedIds(current.strings, previous.strings),
    });
  }, [putBoard, readOnly, setSelected, sync, undoStack]);

  /* ------------------------------------------------------------ geometry */

  /*
   * A point of the screen, in board units. §67: the shared sum
   * (`components/ink/panZoom.ts`) — which also takes the viewport's 1 px
   * border off, because `.board-world` is laid out against the padding box
   * while a bounding rectangle starts at the border box.
   */
  const toBoard = inkSpace.toContent;

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
   *
   * §61: the search itself now lives in `lib/boards/place.ts`, where it is pure
   * and measured (a wall of three hundred cards used to cost hundreds of
   * thousands of allocations per new card, on the main thread). What is left
   * here is the two things only the browser knows: where the view is, and how
   * tall a card actually paints.
   */
  const freeSpotNear = useCallback(
    (cx: number, cy: number, size: { width: number; height: number }) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      const view = rect
        ? {
            left: -viewport.x / viewport.zoom,
            top: -viewport.y / viewport.zoom,
            right: (rect.width - viewport.x) / viewport.zoom,
            bottom: (rect.height - viewport.y) / viewport.zoom,
          }
        : null;
      /*
       * How tall a card really is. `CARD_SIZE` is the nominal card the document
       * reasons in — the room the search reserves, the box `cardAt` hit-tests —
       * but the paper itself grows to fit what is written on it, so a framed
       * card is nearer 290 px than 250. Placement is the one job where guessing
       * short is the dangerous way round: it is what put a card half a card's
       * height below the bottom edge, near enough to look right and far enough
       * that the browser scrolled the whole cork to reach it. So ask the wall.
       */
      const measured = viewportRef.current?.querySelector('.board-card') as HTMLElement | null;
      return findFreeSpot({
        cx,
        cy,
        size,
        // §61: the document as it is now, not as it was at render.
        cards: cardsRef.current,
        view,
        paper: measured ? measured.offsetHeight : 0,
      });
    },
    [viewport],
  );

  type NewCard = Pick<BoardCard, 'id' | 'kind' | 'name' | 'text'> & Partial<BoardCard>;

  /**
   * §69: bare cork makes a notitie — a double-click on a desk, a half-second
   * press on a phone.
   *
   * The wall is the surface people scatter most on, and until round 35 it was
   * the one with no way to put something down without going to the toolbar. The
   * gesture itself is the tijdlijn's, from §62, lifted into
   * `components/canvas/useMakeOnEmpty.ts` so all four answer it the same way.
   *
   * Placed *where the hand is* rather than in the middle of the view, which is
   * the only thing that makes it better than the button: `addCard` falls back to
   * `freeSpotNear(centreOfView())` when no x/y is given, and here there is one.
   * The free-spot search still runs, so a double-click on top of a card that is
   * already there nudges the new one clear instead of hiding it.
   */
  const makeOnEmpty = useMakeOnEmpty({
    /*
     * `!readOnly`, deliberately **not** `interactive` — which is
     * `!isPhone && !readOnly` and is the gate on *dragging* a card, for §6.2's
     * separate reason. Making something is not dragging something: a phone
     * that can press the toolbar's "Notitie" can press bare cork for half a
     * second, and the contract spec found this by asking the phone the same
     * question it asks the desk.
     */
    enabled: !readOnly && !inkActive,
    ignore: '.board-card, .board-string, .board-string-hit, .board-grip, .board-handle, .board-inspector, .board-picker',
    busy: () => dragMoved.current || pan.current !== null,
    onMake: ({ clientX, clientY }) => {
      const at = toBoard(clientX, clientY);
      const spot = freeSpotNear(at.x, at.y, cardSize({ kind: 'note' }));
      addCard({ id: newCardId(), kind: 'note', name: 'Notitie', text: '', x: spot.x, y: spot.y });
    },
  });

  const addCard = useCallback(
    (card: NewCard) => {
      const centre = centreOfView();
      const spot = freeSpotNear(centre.x, centre.y, cardSize(card));
      const placed: BoardCard = {
        entryId: null,
        mapId: null,
        caseId: null,
        timelineId: null,
        boardId: null,
        familyTreeId: null,
        assetId: null,
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
      // §61: appended to whatever the wall holds *now* — this is the call that
      // came back from an upload or a sheet and would otherwise revert it.
      commit((prev) => ({ cards: [...prev.cards, placed] }));
      return placed;
    },
    [centreOfView, commit, freeSpotNear],
  );

  const patchCard = useCallback(
    (cardId: string, patch: Partial<BoardCard>) => {
      commit((prev) => ({
        cards: prev.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)),
      }));
    },
    [commit],
  );

  const patchString = useCallback(
    (stringId: string, patch: Partial<BoardString>) => {
      commit((prev) => ({
        strings: prev.strings.map((line) => (line.id === stringId ? { ...line, ...patch } : line)),
      }));
    },
    [commit],
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

      // §61: what is on the wall now, not at render — a deletion must not take
      // a card someone else added in the meantime down with it.
      const removedCards = cardsRef.current.filter((card) => doomed.has(card.id));
      const removedStrings = stringsRef.current.filter(touches);

      for (const card of removedCards) sync.noteDeletedCard(card.id);
      for (const line of removedStrings) sync.noteDeletedString(line.id);

      commit((prev) => ({
        cards: prev.cards.filter((card) => !doomed.has(card.id)),
        strings: prev.strings.filter((line) => !touches(line)),
      }));
      setSelected(new Set());

      ui.toast(
        `${removedCards.length === 1 ? 'Kaart' : `${removedCards.length} kaarten`} verwijderd.`,
        { label: 'Ongedaan maken', onAction: () => undo() },
      );
    },
    [commit, sync, ui, undo],
  );

  const removeString = useCallback(
    (stringId: string) => {
      const line = stringsRef.current.find((item) => item.id === stringId);
      if (!line) return;
      sync.noteDeletedString(stringId);
      commit((prev) => ({ strings: prev.strings.filter((item) => item.id !== stringId) }));
      setSelectedStringId(null);
      ui.toast('Draad verwijderd.', { label: 'Ongedaan maken', onAction: () => undo() });
    },
    [commit, sync, ui, undo],
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
        } else {
          patchCard(photoTarget.current, {
            assetId: data.asset.id,
            showImage: true,
          });
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

  /*
   * A card is *not* given `preventDefault()` here, and that is deliberate.
   * Cancelling a pointerdown suppresses the compatibility mouse events the
   * browser builds a double-click out of, and a double-click is this card's
   * entire vocabulary: open the artikel, open the picture, start writing. The
   * blue sweep that preventDefault was wanted for is already gone — `.board-card`
   * carries `user-select: none`, so a drag that begins on a card selects
   * nothing at all, here or anywhere else on the page. The one place on a card
   * that is a drag and nothing else — the pin head — does refuse it.
   */
  function onCardPointerDown(event: React.PointerEvent, cardId: string) {
    if (event.button !== 0) return;

    const additive = event.shiftKey;
    const alreadySelected = selected.has(cardId);
    pressWasSelected.current = alreadySelected ? cardId : null;
    /*
     * §67: shift toggles; a plain press on a card that is *not* chosen chooses
     * only it; a plain press on one that already is leaves the whole group
     * standing, because the next thing that press does is drag the group.
     *
     * That last case is the one this round repairs. The wall used to collapse
     * the selection to the pressed card here while `chosen` below still carried
     * all six along with the hand: six kaartjes travelled and one was outlined,
     * the inspector said "1 kaart", and the drop left five of them looking
     * unpicked in a place nobody had asked for.
     */
    setSelectedStringId(null);
    selection.select(cardId, additive, alreadySelected);

    if (!interactive) return;

    const chosen = new Set(additive || alreadySelected ? selected : []);
    chosen.add(cardId);
    const origin = new Map<string, { x: number; y: number }>();
    for (const card of cardsRef.current)
      if (chosen.has(card.id)) origin.set(card.id, { x: card.x, y: card.y });

    dragMoved.current = false;
    // Not pushed to undo yet: a click, or the first half of a double-click, is
    // a press too, and undo should not be full of drags that went nowhere.
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin,
      before: { cards: cardsRef.current, strings: stringsRef.current },
    };
    // §61: a hand is on the wall from this instant, not from the next render.
    setHandOn(true);
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
    // §69/§68: only the left button is the archive's. A touch reports 0 too.
    if (event.button !== 0) return;
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
      before: { cards: cardsRef.current, strings: stringsRef.current },
      moved: false,
    };
    setHandOn(true);
  }

  function onPinPointerDown(event: React.PointerEvent, cardId: string) {
    if (!interactive) return;
    /*
     * §69/§68: only the left button. Without this, a right-press on a pin head
     * started a draad — measured: a `.board-string-drawing` path followed the
     * right button across the cork while the browser's own menu was opening.
     */
    if (event.button !== 0) return;
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
    // §69/§68: only the left button.
    if (event.button !== 0) return;
    event.stopPropagation();
    // Same as the pin head: a grip is only ever dragged.
    event.preventDefault();
    const point = toBoard(event.clientX, event.clientY);
    pushUndo({ cards: cardsRef.current, strings: stringsRef.current });
    setDrawing({
      anchor: end === 'from' ? line.to : line.from,
      x: point.x,
      y: point.y,
      editing: { id: line.id, end },
    });
  }

  function onStringPointerDown(event: React.PointerEvent, stringId: string) {
    // §69/§68: only the left button — a right-press on a draad belongs to the
    // browser, and choosing the draad under its menu is not what was asked.
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelected(new Set());
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
      target.closest('.ink-toolbar') ||
      // §52: nor is a press in the picker a string was dropped into.
      target.closest('.board-picker')
    ) {
      return;
    }

    // Anywhere else on the cork closes that picker, leaving the speld behind —
    // and §64: leaving the *question* behind too. The box is gone; the draad is
    // still asking, and the bar at the top of the wall may answer it.
    if (picker) setPicker(null);

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

    // §67: shift-drag on bare cork sweeps a box; a plain drag pans.
    if (event.shiftKey && selection.beginMarquee(event)) return;

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
        pushUndo(state.before);
      }
      // §61: one card is growing, and the save should say only that.
      sync.touch({ cards: [state.id] });
      putBoard({
        cards: cardsRef.current.map((card) =>
          card.id === state.id ? { ...card, scale } : card,
        ),
      });
      return;
    }

    if (drag.current) {
      const dx = (event.clientX - drag.current.startX) / viewport.zoom;
      const dy = (event.clientY - drag.current.startY) / viewport.zoom;
      /*
       * §69: the shared threshold, measured where the hand is — on the screen.
       * This asked for four *board units* of Manhattan travel, which is a hand
       * that has to move sixteen screen pixels at zoom 0.25 and under two at
       * 2.5: the same press was a click on a zoomed-out wall and a drag on a
       * zoomed-in one.
       */
      if (
        !dragMoved.current &&
        passedSlop(
          event.clientX - drag.current.startX,
          event.clientY - drag.current.startY,
        )
      ) {
        dragMoved.current = true;
        pushUndo(drag.current.before);
      }
      // §67: every member of the group from where it stood at the press, never
      // from where it is now, or a drag would compound itself frame by frame.
      const moving = groupDelta(drag.current.origin, dx, dy);
      // §61: these cards, and no others — a drag of one card must not assert
      // where the other thirty-nine are.
      sync.touch({ cards: Object.keys(moving) });
      // Everyone else sees the cards travel with the hand, not just land.
      if (dragMoved.current && live.state === 'live') live.reportPointer({ moving });
      putBoard({
        cards: cardsRef.current.map((card) => {
          const at = moving[card.id];
          return at ? { ...card, x: at.x, y: at.y } : card;
        }),
      });
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

    // §67: the box grows, and §8/live: a box dragged round half the wall is
    // something you are doing *to* a board somebody else is working on, so they
    // see it happen rather than only seeing six cards light up when it closes.
    // The frame itself goes out through `onBroadcast`, where the hook was made.
    if (selection.onPointerMove(event)) return;
  }

  function onPointerUp(event: React.PointerEvent) {
    /*
     * §69: a shift-press the hook held back, answered now that the press is
     * over. A press that travelled was a group being dragged by one of its
     * members and leaves the group standing; one that did not is the toggle
     * it looked like. First thing in the handler, because every road out of
     * here returns early — and on a phone or a read-only wall there is no
     * `drag.current` at all, so no later branch would reach it.
     */
    selection.endPress(dragMoved.current);
    if (resize.current) {
      const changed = resize.current.moved;
      const id = resize.current.id;
      resize.current = null;
      setHandOn(false);
      // The live pointer channel carries positions and nothing else, so a size
      // reaches everybody else on the drop rather than while the hand moves —
      // the same way a border or a colour change does.
      if (!readOnly) {
        if (changed) void sync.saveNow({ cards: [id] });
        else sync.markDirty({ cards: [id] });
      }
      return;
    }

    if (drag.current) {
      const moved = dragMoved.current;
      const ids = [...drag.current.origin.keys()];
      drag.current = null;
      setHandOn(false);
      // The drop is the one save everyone else is waiting on: they have been
      // watching this card travel, and its final place should not lag behind
      // the hand by a debounce.
      if (!readOnly) {
        if (moved) sync.saveNow({ cards: ids });
        else sync.markDirty({ cards: ids });
      }
      return;
    }

    if (pan.current) {
      pan.current = null;
      // §61: a pan moves the shared viewport and not one card on the wall.
      if (!readOnly) sync.markDirty({ viewport: true });
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
      // §61: the wall as it is now. A string let go after a pull landed used to
      // be tied on top of the document from before that pull.
      const held = { cards: cardsRef.current, strings: stringsRef.current };
      let nextCards = fresh ? [...held.cards, fresh] : held.cards;

      // One string between any two things. Landing on a pair that is already
      // joined selects the string that joins them rather than adding a twin.
      const twin = held.strings.find(
        (item) =>
          item.id !== drawing.editing?.id && sameEnds(item, { from: drawing.anchor, to: end }),
      );
      if (twin) {
        // Nothing changed, so the grip's undo entry has nothing to undo.
        if (drawing.editing) undoStack.pop();
        setSelectedStringId(twin.id);
        setDrawing(null);
        ui.toast('Die twee zijn al met elkaar verbonden.');
        return;
      }

      if (!endpointsEqual(end, drawing.anchor)) {
        if (drawing.editing) {
          const { id, end: which } = drawing.editing;
          const line = held.strings.find((item) => item.id === id);
          const nextStrings = held.strings.map((item) =>
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
          commit(() => ({ cards: nextCards, strings: nextStrings }), { undo: false });
          setSelectedStringId(id);
          /*
           * §64: an end pulled onto bare cork makes the very same thing — a bare
           * punaise with a draad on it and nothing on the punaise — so it asks
           * the same question and the bar may answer it. No box opens here,
           * which is §52's own choice and left alone: moving an end is a
           * correction to a draad that already exists, not a new lead, and a
           * search box springing up mid-correction would be in the way. But the
           * punaise that *did* appear is still waiting, and "een punaise aan een
           * draad houdt vast tot er iets op komt" has to be true of every bare
           * punaise a draad was just dropped on, or the symptom this round fixes
           * comes straight back through the other gesture.
           */
          if (fresh) {
            pendingPin.current = { pin: fresh.id, at: point };
            setHoldingAPin(true);
          }
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
          commit(() => ({ cards: nextCards, strings: [...held.strings, line] }));
          // Select it, so the inspector is right there to label and colour it.
          setSelectedStringId(line.id);
          /*
           * §52: a string let go in the void asks what it points at.
           *
           * The speld goes in first and the string is tied to it, exactly as it
           * always has been — so pressing Escape, or clicking away, leaves the
           * wall as it was before this round: a lead with a place on it. Answer
           * the picker and that same speld *becomes* the thing picked, which is
           * why the knot survives without a single string being rewritten.
           *
           * §64: and the question is remembered whether the box is on the
           * screen or not. This line is the fix: the punaise is written down
           * *before* the picker is opened and is not forgotten when it closes,
           * so the answer may arrive from the bar at the top of the wall, after
           * an Escape, or ten minutes and a pull later, and still land here.
           */
          if (fresh) {
            pendingPin.current = { pin: fresh.id, at: point };
            setHoldingAPin(true);
          }
          /*
           * The box itself only wants a wall this hand may edit. It used to ask
           * `interactive`, which is `!isPhone && !readOnly` — but the phone half
           * of that was never doing anything: §8 refuses to *start* a draad
           * below 768 px (`onPinPointerDown`, `onEndHandlePointerDown` both bail
           * on `!interactive`), so a phone can never reach a dropped string in
           * the first place. Naming the phone here only suggested the box was
           * deliberately withheld from it. If §8 ever lets a phone draw a
           * draad, this box comes with it for free.
           */
          if (fresh && !readOnly) {
            const rect = viewportRef.current?.getBoundingClientRect();
            // Kept clear of the right and bottom edges: the cork is clipped,
            // and a picker half off it cannot be typed in.
            const width = 336;
            // Beside the speld, not on top of it: the head and its tag stay
            // where the hand left them, and stay grabbable.
            const left = event.clientX - (rect?.left ?? 0) + 48;
            const top = event.clientY - (rect?.top ?? 0) + 36;
            setPicker({
              pin: fresh.id,
              at: point,
              left: Math.max(8, Math.min(left, (rect?.width ?? width) - width)),
              top: Math.max(8, Math.min(top, (rect?.height ?? 0) - 90)),
            });
          }
        }
      }
      setDrawing(null);
      return;
    }

    /*
     * §67: the box closes. Everything it *touches* is picked — half a kaartje
     * is enough, the rule every drawing program has — and what was picked
     * before is replaced, not added to. The hit test measures `cardsRef`, the
     * wall as it is at the drop (§61), and it is written down once in
     * `lib/canvas/select.ts`. The `selection: null` frame that takes the box
     * off everybody else's wall goes out through `onBroadcast`.
     */
    if (selection.onPointerUp(event)) return;
  }

  /* ----------------------------------------------------------------- zoom */

  const zoomAround = useCallback(
    (factor: number, px?: number, py?: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const atX = px ?? rect.width / 2;
      const atY = py ?? rect.height / 2;
      // §67: the same sum the stamboom does, and now the same code — keep the
      // board point under the pointer exactly where it is.
      setViewport((current) => zoomAbout(current, factor, atX, atY));
      // §61: the viewport is the only shared thing a zoom touches.
      if (!readOnly) sync.markDirty({ viewport: true });
    },
    [readOnly, sync],
  );

  /*
   * §52: keep the page still under the wall.
   *
   * React attaches `wheel` passively, so `preventDefault` inside the `onWheel`
   * prop below is a silent no-op — every notch zoomed the cork *and* scrolled
   * the page behind it. A real listener with `{ passive: false }` is the only
   * thing a browser honours; this is the shape `MapCanvas` has used since it
   * was written, and `TimelineCanvas` and `WebCanvas` after it.
   *
   * The furniture that lives inside the viewport and scrolls on its own is
   * excluded, the way the landkaart excludes its legend: the drawer, the
   * inspector, the tekenlaag's toolbar, and either picker's list of hits.
   */
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const block = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          '.board-tray, .board-inspector, .ink-toolbar, .suggest-list, .board-picker',
        )
      ) {
        return;
      }
      event.preventDefault();
    };
    node.addEventListener('wheel', block, { passive: false });
    return () => node.removeEventListener('wheel', block);
  }, []);

  function onWheel(event: React.WheelEvent) {
    /*
     * §52: a trackpad's sideways swipe pans the wall. It used to fall straight
     * through this early return, which meant the gesture did nothing here and
     * scrolled the *page* instead — the worst of both. Nothing above it is
     * refused any more, so it may as well do the thing it looks like.
     */
    if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      setViewport((current) => ({ ...current, x: current.x - event.deltaX }));
      if (!readOnly) sync.markDirty({ viewport: true });
      return;
    }
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    // §69: the shared reading of a wheel. This was a flat 1.1 per event, which
    // answered a mouse's click and a trackpad's long swipe with the same step.
    zoomAround(
      wheelFactor(event.deltaY, event.deltaMode),
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  }

  function onTouchMove(event: React.TouchEvent) {
    if (event.touches.length !== 2) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    /*
     * §69: a knijp zooms about the point between the two fingers, the way the
     * landkaart, the tijdlijn and the stamboom already do it.
     *
     * This used to set `zoom` and nothing else, which anchors the wall at its
     * top-left corner rather than under the hand — measured on a 390 px
     * screen, the y never moved at all and the x drifted fifty pixels. And
     * both fingers had each started a pan of their own on the way down, so the
     * wall slid *under* the knijp as well: a second finger ends the pan.
     */
    pan.current = null;
    if (!pinch.current) {
      pinch.current = { distance, zoom: viewport.zoom };
      return;
    }
    const started = pinch.current;
    const midX = (a.clientX + b.clientX) / 2 - rect.left;
    const midY = (a.clientY + b.clientY) / 2 - rect.top;
    setViewport((current) => {
      const wanted = clampZoom(started.zoom * (distance / started.distance));
      return zoomAbout(current, wanted / current.zoom, midX, midY);
    });
  }

  function fitAll() {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || !cardsRef.current.length) return;
    const bounds = boardBounds(cardsRef.current);
    /*
     * §67: the shared "alles in beeld", with the wall's own two numbers — forty
     * pixels of air on each side, and a ceiling of 1.2 rather than the canvas
     * maximum, because a board of four kaartjes blown up two and a half times
     * reads as broken. `boardBounds` answers x/y/width/height; this wants the
     * four edges.
     */
    setViewport(
      fitViewport(
        {
          minX: bounds.x,
          minY: bounds.y,
          maxX: bounds.x + bounds.width,
          maxY: bounds.y + bounds.height,
        },
        { width: rect.width, height: rect.height },
        FIT_PADDING,
        FIT_MAX_ZOOM,
      ),
    );
    if (!readOnly) sync.markDirty({ viewport: true });
  }

  /* ---------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      if (event.key === 'Escape') {
        // §52: the picker a dropped string opened. Closing it leaves the speld
        // and the string exactly as they were — nothing is placed and nothing
        // is taken back. §64: nor is the question forgotten; see `onCancel`.
        if (picker) setPicker(null);
        else if (lightbox) setLightbox(null);
        else if (onInkKey(event)) return;
        else if (drawing) setDrawing(null);
        else if (!typing) {
          setSelected(new Set());
          setSelectedStringId(null);
        }
        return;
      }
      if (typing) return;

      // §33: in the tekenmodus, Ctrl+Z takes back your own last stroke — for
      // a viewer too, who has no cards to undo. (§67: and the same two keys,
      // in the same words, on all four canvases.)
      if (onInkKey(event)) return;

      /*
       * §69: `+`, `−` and `0` move the camera. Above the `readOnly` gate on
       * purpose — a viewer may look wherever they like, and on a wall with no
       * zoom buttons on a phone this is the keyboard's only way in.
       */
      const camera = cameraKey(event);
      if (camera) {
        event.preventDefault();
        if (camera === 'fit') fitAll();
        else zoomAround(camera === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP);
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
  }, [
    selected,
    selectedStringId,
    drawing,
    lightbox,
    removeCards,
    removeString,
    undo,
    readOnly,
    onInkKey,
    picker,
    zoomAround,
  ]);

  /** If the pointer leaves the board mid-drag, finish rather than stick. */
  useEffect(() => {
    const finish = () => {
      if (drag.current) {
        const ids = [...drag.current.origin.keys()];
        drag.current = null;
        setHandOn(false);
        if (!readOnly) sync.markDirty({ cards: ids });
      }
      if (resize.current) {
        const id = resize.current.id;
        resize.current = null;
        setHandOn(false);
        if (!readOnly) sync.markDirty({ cards: [id] });
      }
      if (pan.current) {
        pan.current = null;
        if (!readOnly) sync.markDirty({ viewport: true });
      }
      // §61: whatever happened, the hand is off the wall now. A `busy` that
      // stuck on would defer every merge for the life of the page — the exact
      // shape of "op een bepaald moment update het niet meer".
      setHandOn(false);
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [sync]);

  /* ------------------------------------------------------------- search */

  /**
   * §64: the waiting punaise, taken — **the only place that consumes it**.
   *
   * Called from exactly one caller, `putCard` below, at the instant a card is
   * actually being hung up. That is the repair of the repair: the first version
   * took the lead in the picker rows, the moment a row was pressed, and
   * `startEntry`'s row does not place anything — it opens the nieuw-artikel
   * sheet and waits. Close that sheet without saving and the punaise was still
   * on the wall with nothing holding it: the next pick from the bar spawned the
   * card in the middle of the view, which is the reported bug back again, with
   * no way to re-arm it short of redrawing the draad.
   *
   * So: a pick is only a pick when it places something. Nothing between the row
   * and the card — an `await` on `/api/preview`, a sheet, a confirm, a pull —
   * can lose the lead, because nothing between them touches it.
   *
   * Two readers of one ref is how that bug happened, so there is one. Every
   * picker row calls `closePicker` instead, which only shuts the box.
   */
  const takeLead = useCallback((): PlaceWhere | null => {
    const pending = pendingPin.current;
    if (!pending) return null;
    const place = leadPlace({ pending, cards: cardsRef.current, strings: stringsRef.current });
    // Cleared whether it still held or not: a lead that has stopped holding is
    // not a lead, and leaving it on the pile would hand it to the *next* card.
    pendingPin.current = null;
    setHoldingAPin(false);
    return place;
  }, []);

  /**
   * §64: shut the box, keep the lead. Every row of either picker, before it acts.
   *
   * The counterpart to `takeLead`: pressing a row is finished with the search
   * box whatever happens next, but it is not yet a card on the wall, so it is
   * not yet an answer to the draad.
   */
  const closePicker = useCallback(() => setPicker(null), []);

  /*
   * §52: where a picked thing lands.
   *
   * `at` is a board point — a card dragged out of the tray, or a string let go
   * on the cork. `onto` is a card that is already there and is to *become* the
   * thing picked, which is the one the string drop uses: the string is tied to
   * that speld already, so changing the card in place keeps the knot and a new
   * card would not.
   *
   * §64: and a caller that names **no** place at all gets the waiting punaise.
   * Here rather than at six call sites, so the seventh cannot forget it. The
   * line it draws is **naming something takes the draad; making something blank
   * does not**: everything that arrives through here is a thing the person
   * named — an artikel, a landkaart, a dossier, a tijdlijn, another wall, a
   * notitie they titled — and the draad still hanging is the most specific place
   * on the wall to put it. The roads that go straight to `addCard` are outside
   * it on purpose: "Nieuwe notitie" and a pasted picture make a blank thing, and
   * a paste already has a point of its own. A caller with its own `at` — a card
   * dragged out of the tray and dropped somewhere — has a place and keeps it.
   */
  const putCard = useCallback(
    (card: NewCard, given: PlaceWhere = {}) => {
      // §64: one consumer, and this is it — see `takeLead`. A caller that named
      // a place of its own keeps it and the lead is left alone.
      const where = given.onto || given.at ? given : takeLead() ?? given;
      const box = where.at ? boxAtPoint(where.at, { width: CARD_WIDTH, height: CARD_SIZE.height }) : {};
      /*
       * §64: an `onto` that is no longer on the wall must not swallow the card.
       *
       * `patchCard` maps over the document, so naming a card that is gone is a
       * silent no-op — and nothing appears at all, which is worse than the bug
       * this round is fixing. `takeLead` asks `leadPlace` in this same tick, so
       * this cannot happen by way of the lead any more; it stays because a caller
       * may hand an `onto` in from anywhere, and a card the reader can see beats
       * a card that was never drawn. With `at` to go on it lands at the drop
       * point: untied beats absent.
       */
      const onto =
        where.onto && cardsRef.current.some((item) => item.id === where.onto) ? where.onto : undefined;
      if (onto) {
        const { id: _newId, ...rest } = card;
        patchCard(onto, {
          // Every id this card might have carried before is cleared first, so a
          // speld that becomes a dossier cannot keep pointing at an artikel.
          entryId: null,
          mapId: null,
          caseId: null,
          timelineId: null,
          boardId: null,
          familyTreeId: null,
          ...rest,
          /*
           * §64: and **no `box`**. The card keeps the punaise's own x and y,
           * because the punaise is where the draad's end is *now*.
           *
           * `...box` used to be applied here too, which only looked harmless
           * while the lead lived no longer than the floating picker. It does not
           * any more: drop a draad, drag the bare punaise six hundred units
           * across the wall, then answer from the bar, and the card appeared back
           * at the spot the draad was first let go of — dragging the draad with
           * it, because the draad is tied to this very card. A card landing
           * somewhere the hand has not been is the same complaint this round
           * started from, wearing a different coat. The stored point is still the
           * right answer for the other branch, where the punaise is gone and
           * there is nothing left to inherit a place from.
           */
          // It was a speld a moment ago, and a speld stands straight.
          rotation: placementRotation(),
        });
        return onto;
      }
      return addCard({ ...card, ...box }).id;
    },
    [addCard, patchCard, takeLead],
  );

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
      where: PlaceWhere = {},
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
      putCard(
        {
          id: newCardId(),
          kind: 'entry',
          entryId: entry.id,
          name: entry.name,
          text: '',
          // §32: an artikel without a cover keeps its frame shut until somebody
          // opens it; `undefined` (a caller that does not know) keeps the old answer.
          showImage: defaultShowImage('entry', entry.coverAssetId === undefined ? undefined : Boolean(entry.coverAssetId)),
        },
        where,
      );
    },
    [putCard],
  );

  /**
   * A landkaart or a dossier on the wall. Same card, same drag, same string —
   * only the id it carries is different, and what it stands for is looked up
   * per viewer like everything else.
   */
  const placeMap = useCallback(
    (map: PickableItem, where: PlaceWhere = {}) => {
      setMaps((current) =>
        current[map.id]
          ? current
          : { ...current, [map.id]: { id: map.id, slug: '', name: map.name, assetId: null, missing: false } },
      );
      const placed = putCard({ id: newCardId(), kind: 'map', mapId: map.id, name: map.name, text: '' }, where);
      // The slug and the picture come back with the next pull; until then the
      // card shows its name, which is what was just typed. §61: one card.
      void sync.saveNow({ cards: [placed] });
    },
    [putCard, sync],
  );

  const placeCase = useCallback(
    (item: PickableItem, where: PlaceWhere = {}) => {
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
      const placed = putCard({ id: newCardId(), kind: 'case', caseId: item.id, name: item.name, text: '' }, where);
      void sync.saveNow({ cards: [placed] });
    },
    [putCard, sync],
  );

  /** §32: a tijdlijn on the wall — the same shape as a landkaart card. */
  const placeTimeline = useCallback(
    (item: PickableItem, where: PlaceWhere = {}) => {
      setTimelineFacts((current) =>
        current[item.id] ? current : { ...current, [item.id]: { id: item.id, slug: '', name: item.name, scale: 'day', missing: false } },
      );
      const placed = putCard(
        { id: newCardId(), kind: 'timeline', timelineId: item.id, name: item.name, text: '', showImage: false },
        where,
      );
      void sync.saveNow({ cards: [placed] });
    },
    [putCard, sync],
  );

  /**
   * §52: another prikbord on this one. The same card as a tijdlijn's — a name,
   * an icon and a door — because a wall has no cover of its own either. What is
   * behind it is resolved per viewer, so a wall somebody may not open comes
   * back MISSING rather than named.
   */
  const placeBoard = useCallback(
    (item: PickableItem, where: PlaceWhere = {}) => {
      setBoardFacts((current) =>
        current[item.id]
          ? current
          : { ...current, [item.id]: { id: item.id, name: item.name, caseName: null, missing: false } },
      );
      const placed = putCard(
        { id: newCardId(), kind: 'board', boardId: item.id, name: item.name, text: '', showImage: false },
        where,
      );
      void sync.saveNow({ cards: [placed] });
    },
    [putCard, sync],
  );

  /**
   * §66: a stamboom on the wall. The same card as a tijdlijn's and a prikbord's
   * — a name, an icon and a door — because a stamboom has no cover of its own
   * either. What is behind it is resolved per viewer, so one somebody may not
   * open comes back MISSING rather than named.
   */
  const placeFamilyTree = useCallback(
    (item: PickableItem, where: PlaceWhere = {}) => {
      setFamilyTreeFacts((current) =>
        current[item.id]
          ? current
          : {
              ...current,
              [item.id]: { id: item.id, slug: '', name: item.name, caseName: null, missing: false },
            },
      );
      const placed = putCard(
        {
          id: newCardId(),
          kind: 'family_tree',
          familyTreeId: item.id,
          name: item.name,
          text: '',
          showImage: false,
        },
        where,
      );
      void sync.saveNow({ cards: [placed] });
    },
    [putCard, sync],
  );

  /**
   * §52: "'X' aanmaken" — write the artikel and hang it up in one gesture.
   *
   * The same sheet a card's "Artikel aanmaken" button opens (§24: a wall that
   * hangs off a dossier is that dossier's, so what is written here is written
   * in it), with the card placed when the sheet answers. If the sheet is
   * closed without writing anything, nothing is placed: `onCreated` is the
   * only road out.
   *
   * §64: and it takes **no** place of its own, deliberately. "Nothing is placed"
   * has to mean nothing *happens* — a sheet the reader closes must leave the
   * waiting punaise exactly as it found it — so the lead is resolved inside
   * `onCreated`, by `putCard`, and a dismissed sheet never reaches it.
   */
  const startEntry = useCallback(
    (entryName: string) => {
      ui.openNewEntry({
        name: entryName,
        caseId: caseId ?? undefined,
        onCreated: (created) => {
          setEntries((current) => ({
            ...current,
            [created.id]: {
              id: created.id,
              slug: created.slug,
              name: created.name,
              coverAssetId: null,
              coverCrop: null,
              typeIcon: created.typeIcon,
              typeColour: created.typeColour,
              typeBorder: 'solid',
              missing: false,
            },
          }));
          /*
           * A freshly written artikel has no cover, so its frame starts shut.
           *
           * §61: this runs when the sheet answers, which may be a minute after
           * it was opened — a pull, a drag and three of somebody else's cards
           * later. It lands on the wall as it is at *that* moment, because
           * `putCard` goes through `commit`'s updater; it used to be built from
           * the `cards` this callback closed over and quietly posted the wall
           * back to how it looked before the sheet.
           */
          const placed = putCard(
            {
              id: newCardId(),
              kind: 'entry',
              entryId: created.id,
              name: created.name,
              text: '',
              showImage: defaultShowImage('entry', false),
            },
          );
          void sync.saveNow({ cards: [placed] });
        },
      });
    },
    [caseId, putCard, sync, ui],
  );

  /**
   * §64: the lead stops being a lead, so the box and the ref both let go.
   *
   * The speld can go while the picker is open — an undo, this hand's own
   * delete, or somebody else's — and it can also stop being a *bare* punaise
   * (a name typed on it, the draad pulled off it), which is the half the old
   * version of this missed. `pendingPinHolds` asks all three questions in one
   * place, so the box on the screen and the answer's address can never disagree
   * about whether there is still something to answer.
   *
   * Measured against `cards`/`strings` — the wall as rendered, which is the
   * document *plus* whatever this hand has not saved yet (`applyRemote` pushes
   * an unsaved card back into every incoming document), so a punaise that is
   * merely in flight is never mistaken for one that is gone.
   */
  useEffect(() => {
    const pending = pendingPin.current;
    if (pending && !pendingPinHolds({ pending, cards, strings })) {
      pendingPin.current = null;
      setHoldingAPin(false);
    }
    /*
     * And the box, asked *unconditionally* — not only when there is still a lead.
     * The two used to be one check, which left the box standing over a punaise
     * that had gone whenever the lead had already been consumed (a sheet open
     * behind it, say). The box is a thing on the screen pointing at a card; if
     * that card is not there, it has nothing to stand on, lead or no lead.
     */
    if (picker && !cards.some((card) => card.id === picker.pin)) setPicker(null);
  }, [cards, strings, picker]);

  /** Everything in the case that is not already a card on this wall. */
  const trayEntries = useMemo(() => {
    const onWall = new Set(
      cards.filter((card) => card.kind === 'entry' && card.entryId).map((card) => card.entryId),
    );
    return caseEntries.filter((entry) => !onWall.has(entry.id));
  }, [caseEntries, cards]);

  /**
   * §64: no `PlaceWhere` parameter, on purpose.
   *
   * It had one, which the pickers filled in before this `await` — and a place
   * decided before a card exists is a place that can be decided and then thrown
   * away. `putCard` asks for the lead itself, after the fetch, in the same tick
   * it hangs the card up.
   */
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
    const placed = putCard(
      {
        id: newCardId(),
        kind: 'entry',
        entryId,
        name: entryName,
        text: '',
        showImage: defaultShowImage('entry', hasCover),
      },
    );
    /*
     * §64: saved at once rather than on the 300 ms debounce, the way every other
     * `place*` on this wall already does it. It matters more here than it looks:
     * everybody else on the board is staring at a bare punaise on the end of a
     * draad, and the answer to it should not wait behind the confirm sheet
     * `offerToFile` is about to put up.
     */
    void sync.saveNow({ cards: [placed] });
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

  /*
   * §47: hang this wall in a dossier, or take it out of one.
   *
   * The choice is held here as well as on the server so the box does not snap
   * back to the old dossier for the length of a `router.refresh()`, and it is
   * put back if the write is refused — the wall's own rights are checked
   * there, and so is the dossier's.
   */
  const [filedIn, setFiledIn] = useState<string | null>(caseId);
  const [filing, setFiling] = useState(false);
  useEffect(() => setFiledIn(caseId), [caseId]);
  const fileInCase = useCallback(
    async (next: string | null) => {
      const was = filedIn;
      setFiledIn(next);
      setFiling(true);
      const response = await fetch(`/api/boards/${boardId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caseId: next, clientId }),
      }).catch(() => null);
      setFiling(false);
      if (!response?.ok) {
        setFiledIn(was);
        ui.toast(`Dit ${ui.words.board} verplaatsen is niet gelukt.`);
        return;
      }
      ui.toast(
        next
          ? `Dit ${ui.words.board} hangt nu in ${pickableCases.find((item) => item.id === next)?.name ?? `het ${ui.words.case}`}.`
          : `Dit ${ui.words.board} hangt nergens meer in.`,
      );
      router.refresh();
    },
    [boardId, clientId, filedIn, pickableCases, router, ui],
  );

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
        {/* §47: which dossier this wall hangs in — and the way out of one.
            Only a hand that may hang cards on it may move it, and the list is
            already this viewer's own (the page filters it). */}
        {!readOnly && (
          <select
            className="select board-case-select"
            aria-label={`In welk ${ui.words.case} hangt dit ${ui.words.board}?`}
            data-testid="board-case-select"
            value={filedIn ?? ''}
            disabled={filing}
            onChange={(event) => void fileInCase(event.target.value || null)}
          >
            <option value="">Geen {ui.words.case}</option>
            {pickableCases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
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

        {/* §61: the archive's own reason when it gave one, not a guess. */}
        <span className="save-state">{syncLabel(sync.state, sync.error)}</span>

        {/* §69: the shared block — the same three buttons, the same names and
            the same size as the landkaart, the tijdlijn and the stamboom. */}
        <CanvasZoomControls
          percent={viewport.zoom * 100}
          onOut={() => zoomAround(1 / ZOOM_STEP)}
          onIn={() => zoomAround(ZOOM_STEP)}
          onFit={fitAll}
        />
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
          {/*
            §52: the same picker the string drop opens, in the bar where it has
            always been. Everything picked here lands in the middle of the view,
            as the search box has always done —

            §64: — *unless* a punaise is still waiting on the end of a draad, and
            then this is the box that answers it. That is the whole repair: this
            list is where a reader goes once the floating box has closed, and it
            places things through exactly the same `putCard` the floating one
            does, so the two roads cannot disagree about where the card belongs.
            Neither of them takes the lead here: pressing a row only shuts the
            box (`closePicker`), and the lead is consumed where the card is
            actually hung up — or not at all, if the row opened a sheet the
            reader then closed without saving.
          */}
          <BoardPicker
            variant="bar"
            cards={cards}
            holding={holdingAPin}
            pickableMaps={pickableMaps}
            pickableCases={pickableCases}
            pickableTimelines={pickableTimelines}
            pickableBoards={pickableBoards}
            pickableFamilyTrees={pickableFamilyTrees}
            onPickEntry={(item) => {
              closePicker();
              void addEntryCard(item.id, item.name);
            }}
            onPickMap={(item) => {
              closePicker();
              placeMap(item);
            }}
            onPickCase={(item) => {
              closePicker();
              placeCase(item);
            }}
            onPickTimeline={(item) => {
              closePicker();
              placeTimeline(item);
            }}
            onPickBoard={(item) => {
              closePicker();
              placeBoard(item);
            }}
            onPickFamilyTree={(item) => {
              closePicker();
              placeFamilyTree(item);
            }}
            onCreateNote={(noteName) => {
              closePicker();
              putCard({ id: newCardId(), kind: 'note', name: noteName, text: '' });
            }}
            onCreateEntry={(entryName) => {
              closePicker();
              startEntry(entryName);
            }}
          />
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
        onDoubleClick={makeOnEmpty.onDoubleClick}
        onPointerDown={(event) => {
          onSurfacePointerDown(event);
          makeOnEmpty.onPointerDown(event);
        }}
        onPointerMove={(event) => {
          onPointerMove(event);
          makeOnEmpty.onPointerMove(event);
        }}
        onPointerUp={(event) => {
          makeOnEmpty.cancel();
          onPointerUp(event);
        }}
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
          if (!readOnly) sync.markDirty({ viewport: true });
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
          placeEntry(entry, { at: point });
        }}
      >
        {/* §33: the tekenlaag, under the cork's cards and strings. */}
        <InkCanvas
          className="ink-layer"
          {...ink.layerProps}
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
              canOpenOnTap={() => !interactive && pressWasSelected.current === card.id}
              /* A card's faces are real links now, so the click a drag ends
                 with has to be able to say it was a drag — otherwise a card
                 moved with ctrl held down would open its artikel on the way
                 down. The same ref `onOpen` below already asks. */
              pressMoved={() => dragMoved.current}
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
                // §52: the live name, like the card's own title — the copy on
                // the card is a fallback for what no longer resolves.
                if (card.assetId)
                  setLightbox({ assetId: card.assetId, name: subjectFor(card)?.name || card.name });
              }}
              canMakeEntry={!readOnly}
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
                     * artikel's cover. Without this the road out
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
                        body: JSON.stringify({ coverAssetId: carried }),
                      }).then(() => router.refresh());
                    }
                    setEntries((current) => ({
                      ...current,
                      [created.id]: {
                        id: created.id,
                        slug: created.slug,
                        name: created.name,
                        coverAssetId: carried,
                        coverCrop: null,
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
          {interactive && singleSelected && !inkActive && (() => {
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

        {/*
          §52: the picker a string was dropped into, at the spot it was dropped.
          Outside `.board-world` on purpose — that layer carries the wall's
          zoom, and a search box drawn at 40% is not a search box.
        */}
        {picker && !readOnly && (
          <BoardPicker
            variant="float"
            style={{ left: picker.left, top: picker.top }}
            cards={cards}
            pickableMaps={pickableMaps}
            pickableCases={pickableCases}
            pickableTimelines={pickableTimelines}
            pickableBoards={pickableBoards}
            pickableFamilyTrees={pickableFamilyTrees}
            onPickEntry={(item) => {
              closePicker();
              void addEntryCard(item.id, item.name);
            }}
            onPickMap={(item) => {
              closePicker();
              placeMap(item);
            }}
            onPickCase={(item) => {
              closePicker();
              placeCase(item);
            }}
            onPickTimeline={(item) => {
              closePicker();
              placeTimeline(item);
            }}
            onPickBoard={(item) => {
              closePicker();
              placeBoard(item);
            }}
            onPickFamilyTree={(item) => {
              closePicker();
              placeFamilyTree(item);
            }}
            onCreateNote={(noteName) => {
              closePicker();
              putCard({ id: newCardId(), kind: 'note', name: noteName, text: '' });
            }}
            onCreateEntry={(entryName) => {
              closePicker();
              startEntry(entryName);
            }}
            /*
             * §64: cancelling shuts the box and **keeps the lead**.
             *
             * Deliberate, and the same in all three places a cancel can happen
             * (here, Escape, a press on bare cork): the punaise and its draad
             * stay on the wall exactly as §52 left them — a lead with a place on
             * it, draggable and labelable — and the question they ask stays
             * open, so the next thing named in either picker still lands on it.
             * Taking them away instead would reverse §52's documented decision
             * and would make a mistyped Escape destroy the draad the person had
             * just drawn. Letting go is the gestures that already exist: pull
             * the draad off the punaise (which takes a bare unused one out with
             * it) or delete it.
             */
            onCancel={() => setPicker(null)}
          />
        )}

        {/* §33: the sheet and the bar, in that order — bottom-right, because
            every other corner of the cork is taken. */}
        <InkShell shell={ink} corner="bottom-right" />

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
          busy={uploading}
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
          onAddPhoto={() => singleSelected && askForPhoto(singleSelected.id)}
          onRemovePhoto={() =>
            singleSelected && patchCard(singleSelected.id, { assetId: null })
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
          subjectName={selectedSubject?.name ?? null}
          onRemoveCards={() => removeCards(selectedCards.map((card) => card.id))}
          onClose={() => {
            setSelected(new Set());
            setSelectedStringId(null);
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
          {access.isKeeper && ink.keeperControls}
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
