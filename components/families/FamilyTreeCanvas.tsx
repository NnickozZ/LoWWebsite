'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { EntryPicker, type EntryRef } from '@/components/entry/EntryPicker';
import { InkCanvas } from '@/components/ink/InkCanvas';
import { InkShell } from '@/components/ink/InkShell';
import { UnderFold } from '@/components/ink/UnderFold';
import { usePanZoomInk } from '@/components/ink/panZoom';
import { useCanvasInk } from '@/components/ink/useCanvasInk';
import { OWN_WRITE_MUTE_MS, useLive, useLiveChanges } from '@/components/live/LiveProvider';
import { useHoldRefresh } from '@/components/live/refreshHold';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { useIsPhone } from '@/components/useIsPhone';
import { useMayType } from '@/components/you/AuthorProvider';
import {
  AUTHOR_GATE_OFF,
  useAskAuthorFirst,
  useCanvasAuthorGate,
  useCanvasMaker,
} from '@/components/canvas/useCanvasAuthorGate';

import { cameraKey } from '@/components/canvas/cameraKeys';
import CanvasZoomControls from '@/components/canvas/CanvasZoomControls';
import { useMarqueeSelect } from '@/components/canvas/useMarqueeSelect';
import { CanvasFind } from '@/components/canvas/CanvasFind';
import type { Findable } from '@/lib/canvas/find';
import { useFloatBox } from '@/components/canvas/useFloatBox';
import { clampFloat } from '@/lib/canvas/clamp';
import type { AccessSettings } from '@/lib/access';
import { groupDelta, pressSelection } from '@/lib/canvas/select';
import {
  centreView,
  FIT_PADDING,
  followPoint,
  panToBring,
  passedSlop,
  readableFit,
  readingFloor,
  wheelFactor,
  ZOOM_STEP,
} from '@/lib/canvas/view';
import { CHOICE_PARAM, readCamera, readChoice, writeCamera, writeChoice } from '@/lib/canvas/memory';
import { FRAME_LABELS } from '@/lib/families/frames';
import {
  betweenBoxes,
  boxCentre,
  clampZoom,
  curvePath,
  edgeGeometry,
  fitViewport,
  isTreeView,
  layoutTree,
  partnerLine,
  polylineMidpoint,
  toWorld,
  zoomAbout,
  type Box,
  type Point,
  type TreeView,
} from '@/lib/families/layout';
import { SIBLING_WORDS } from '@/lib/families/siblings';
import { edgeInLineage, lineageOf } from '@/lib/families/lineage';
import { connectVerdict } from '@/lib/families/connect';
import { edgesTouching, unionsTouching } from '@/lib/families/followEdges';
import {
  closeGroup,
  isEmptyStep,
  landedOps,
  openGroup,
  oppositeStep,
  outcomeOf,
  redoOps,
  stackMark,
  stackMoved,
  undoOps,
  walkNotice,
  type OpOutcome,
  type RelationOp,
  type StepGroup,
  type TreeStep,
} from '@/lib/families/undoSteps';
import { emptyTreeState, newLooseId, newTieId, normaliseTreeState } from '@/lib/families/merge';
import { ROLE_LABELS } from '@/lib/families/roles';
import {
  FRAME_KINDS,
  NODE_SIZE,
  type FamilyGraph,
  type FamilyTree,
  type FamilyTreeState,
  type FieldRole,
  type FrameKind,
  type GraphEdge,
  type GraphNode,
  type GraphNodeId,
  type LooseCard,
  type NodeRef,
  type RoleFieldInfo,
  type TreeMember,
  type TreeTie,
} from '@/lib/families/types';
import type { InkLayerView } from '@/lib/ink/types';
import { entryKey, familyTreeKey } from '@/lib/live/keys';
import { capitalise, fill } from '@/lib/words';
import { ShortField } from '@/components/live/LiveFields';
import { useMakeOnEmpty } from '@/components/canvas/useMakeOnEmpty';
import { usePinch } from '@/components/canvas/usePinch';
import CanvasUndoButton from '@/components/canvas/CanvasUndoButton';
import CanvasModeToggle from '@/components/canvas/CanvasModeToggle';
import { CanvasEmpty } from '@/components/canvas/CanvasEmpty';
import { useCanvasMode } from '@/components/canvas/useCanvasMode';
import {
  TreeContextMenu,
  TreeHandles,
  TreeLineHandle,
  TreeSelectionMenu,
  TreeSharedHandle,
  type HandleOffer,
  type HandleRole,
  type TreeMenuItem,
} from './TreeHandles';
import { TreeNode } from './TreeNode';
import { announceTreeMode } from './TreeTitle';
import { createUndoStack, UNDO_LIMIT } from './treeUndo';
import { useTreeHolding } from './useTreeHolding';
import { useTreeSync, type PendingIds } from './useTreeSync';
import { useFollow } from '@/components/canvas/useFollow';
import { useCarried, useDragConflict, useLockHint, useLocks } from '@/components/canvas/useSoftLock';
import type { Vec } from '@/lib/canvas/follow';

/** §105 (golf J): the glass and the things on it, for `gatePress`. */
/** §105 (golf J): the height the round `+` takes off the foot of a phone's glass. */
const PHONE_DOCK = 72;
const TREE_GLASS = { glass: '.tree-stage', things: '.tree-node, .tree-line-hit' };

/**
 * §66 — de stamboom.
 *
 * A window onto the archive's kinship, not a second place where kinship is
 * written down. Who is whose parent, child or partner is a fact about a person
 * and lives on the artikel, in koppelingsvelden that carry a role; this canvas
 * *draws* those lines and lets a hand add one without leaving the picture. What
 * the tree itself remembers is only what is its own: who stands in it, where a
 * hand put them, the loose cards that are not artikelen yet, and the ties that
 * touch one.
 *
 * Four things follow from that, and they are the whole of this file:
 *
 * 1. **The layout is never stored.** `layoutTree` is run from the graph and the
 *    state on every change; only a *pinned* position — a card a hand dragged —
 *    is in the document. "Opnieuw schikken" is one commit that clears the pins.
 * 2. **A `+` handle writes a field on an artikel**, through
 *    `POST /api/family-trees/{id}/relations`, so §38's gate, the mirroring, the
 *    mentions, the revision and the voorstel road all apply exactly as they do
 *    on the artikel's own page. The only thing it touches in the tree's own
 *    state is membership.
 * 3. **Undo is for the tree's own state** — moves, loose cards, ties,
 *    membership — *and, since golf M, for the one ref a `+` or* Lijn
 *    verwijderen *wrote on an artikel*: a step may carry the relation it sent,
 *    and undoing it sends exactly that ref back, inverted, down the same road
 *    (`lib/families/undoSteps.ts`). Never a whole field. Redo walks the same
 *    steps forward (Ctrl+Shift+Z, Ctrl+Y).
 * 4. **The save says only what this hand did** (§61), and a document that comes
 *    back is applied *around* whatever is still unsaved. `useTreeSync` is that.
 *
 * §34: the whole thing is a canvas page — a bar, a toolbar and then a stage
 * that is `flex: 1`. §64: nothing in the toolbar that can turn on and off may
 * take up room, so a count goes *inside* a button's own name and a notice goes
 * in a placeholder or a `.visually-hidden` paragraph.
 *
 * §67 adds four things to that picture, and none of them changes the four rules
 * above:
 *
 * 5. **A selection is a set** (`useMarqueeSelect`, the prikbord's gesture):
 *    shift-click toggles, shift-drag on bare paper sweeps a box, a plain drag
 *    still pans. A drag carries every chosen card and lands them in **one**
 *    commit; Delete asks **one** question and makes **one** commit. The four
 *    `+` handles want exactly one card, because there is no single card for
 *    them to hang off otherwise — with two chosen there is one shared `+`
 *    instead, and with more there is only the `…`.
 * 6. **Everybody else sees what this hand has chosen** — the ids go out as
 *    `holding` on the site line and come back as coloured rings
 *    (`useTreeHolding`, `.tree-held`), and an open box travels in the pointer
 *    frame's `s` field.
 * 7. **A `+ kind` asks a second question**: who the other parent is. Nothing
 *    is preselected, "Overslaan" has the focus, and a partner never implies a
 *    parent.
 * 8. **Sibling lines are mostly not drawn**, and the ones that are cannot
 *    always be taken away: a line the archive worked out for itself
 *    (`source.kind === 'derived'`) says "Volgt uit de ouders" where the
 *    remove button would be.
 */

export type FamilyTreeCanvasProps = {
  tree: FamilyTree;
  /** Built per viewer on the server; the canvas re-pulls it from GET /api/family-trees/[id]. */
  initialGraph: FamilyGraph;
  canEdit: boolean;
  viewerId: string | null;
  isKeeper: boolean;
  /** Account id → name to print on a hand (see the tijdlijn page's `peopleNames`). */
  peopleNames: Record<string, string>;
  /** This window's own presence name + colour, or null when signed out. */
  liveUser: { name: string; colour: string } | null;
  access: {
    settings: AccessSettings;
    canManage: boolean;
    /** §43 */
    inWeb: boolean;
  };
  /** §33: the tekenlaag, as this viewer may see it. */
  initialInk: InkLayerView;
};

/*
 * §69: how far a pointer may travel before a press on a card is a drag used to
 * be a `DRAG_SLOP` of this file's own. The number and the sum both live in
 * `lib/canvas/view.ts` now (`DRAG_SLOP`, `passedSlop`), where the prikbord,
 * the landkaart and the tijdlijn read the same ones.
 */
/**
 * §67: how many carried cards one live frame may name. The site line takes the
 * first forty keys of `m` (`pointerFrame`, `app/api/live/site/route.ts`) and
 * drops the rest without a word, so the cut is made here where it can be seen.
 */
const POINTER_CARD_LIMIT = 40;
/** The stage before it has been measured; the floor lives in `.tree-stage`. */
const UNMEASURED = { width: 900, height: 520 };
/**
 * §94 (C7): the zoom a stamboom opens at, at least — where a name
 * (`.tree-node-name`, 0.86rem ≈ 14 world px) is ten screen pixels.
 */
const TREE_READ_FLOOR = readingFloor(14);
/**
 * §99 (C8-restant): and at most — the prikbord's `OPEN_MAX_ZOOM`. The first
 * view of a brand-new stamboom is worked out when its first card lands, and a
 * fit of one los kaartje was two times blown up: the card took the glass and
 * its worded handles (*Broer/zus*, *Partner*) hung off both edges of a phone.
 * At 1 the card and its four words fit on 390 px. *Alles in beeld* keeps the
 * full range.
 */
const TREE_OPEN_MAX_ZOOM = 1;

/** What one commit may change. Absence is never a deletion; a tombstone is (§61). */
type TreeChange = Partial<Pick<FamilyTreeState, 'members' | 'loose' | 'ties'>> & {
  deletedMembers?: string[];
  deletedLoose?: string[];
  deletedTies?: string[];
};

type DrawnLine = {
  edge: GraphEdge;
  d: string;
  /** Where the word on the line is written. */
  at: Point;
  /**
   * §67: what that word *is*. Usually the edge's own label (the field's name),
   * but a derived half-sibling line says "half" — the field it would name does
   * not exist, because nobody wrote this line down: the parents did.
   */
  word: string;
};

/**
 * §67: the floating box a handle opens, and the second question it may ask.
 *
 * A `+ kind` does not close when the child is chosen: a child usually has two
 * parents, and asking for the second one *here* is the difference between one
 * gesture and a walk to two artikelen. `child` is the step-two state — who was
 * just attached, and to whom — and `both` is the other road to the same place:
 * two cards were already chosen and the shared handle wrote both parents at
 * once, so there is no second question left to ask.
 */
type PickerState = {
  nodeId: GraphNodeId;
  role: HandleRole;
  at: { x: number; y: number };
  /** Step two: the child that has just been attached to `nodeId`. */
  child?: { id: GraphNodeId; name: string };
  /** The shared handle: both of these are the parent, and step two is skipped. */
  both?: [GraphNodeId, GraphNodeId];
};

/**
 * Every line of a stamboom, ready to stroke (see `lines` in the canvas). Pulled
 * out of the component in golf M (samen) so the follower can draw the lines of
 * a card that glides in somebody else's hand from the same sums, every frame,
 * without the canvas rendering (`followLines`).
 */
function drawLines(
  edges: readonly GraphEdge[],
  layout: TreeLayout,
  geometry: ReturnType<typeof edgeGeometry>,
  sizes: Record<GraphNodeId, { width: number; height: number }>,
): DrawnLine[] {
  const boxOf = (id: GraphNodeId): Box | null => {
    const at = layout.positions[id];
    const size = sizes[id];
    if (!at || !size) return null;
    return { x: at.x, y: at.y, width: size.width, height: size.height };
  };
  const geomById = new Map(geometry.unions.map((union) => [union.unionId, union]));
  const siblingGeom = new Map(
    geometry.siblings.map((item) => [[item.a, item.b].sort().join('|'), item]),
  );
  const out: DrawnLine[] = [];
  const polyline = (points: Point[]) =>
    points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  for (const edge of edges) {
    // A `child` line is a `parent` line the other way round; the graph builder
    // has already turned them, and a caller that has not is not worth failing.
    const backwards = edge.role === 'child';
    const role: FieldRole = backwards ? 'parent' : edge.role;
    const from = backwards ? edge.to : edge.from;
    const to = backwards ? edge.from : edge.to;
    const boxA = boxOf(from);
    const boxB = boxOf(to);
    if (!boxA || !boxB) continue;
    if (role === 'sibling') {
      /*
       * The shared bar already says `full`, and `unknown` is a guess. A tie
       * the tree owns is always drawn: it has no `sibling` kind because
       * nothing was derived — a hand drew it between a los kaartje and
       * somebody, which is as explicit as a line gets.
       */
      const drawIt = edge.source.kind === 'tie' || edge.sibling === 'half' || edge.sibling === 'explicit';
      if (!drawIt) continue;
      const geom = siblingGeom.get([from, to].sort().join('|'));
      if (!geom) continue;
      out.push({
        edge,
        d: polyline(geom.points),
        at: polylineMidpoint(geom.points),
        // A derived half says "half"; a typed one says whatever the Keeper
        // called the field it came from ("Broers en zussen").
        word: edge.sibling === 'half' ? SIBLING_WORDS.half : edge.label,
      });
      continue;
    }
    if (role === 'parent') {
      const union = layout.unions.find(
        (item) => item.children.includes(to) && item.parents.includes(from),
      );
      const geom = union ? geomById.get(union.id) : undefined;
      const parent = geom?.parents.find((item) => item.id === from);
      const child = geom?.children.find((item) => item.id === to);
      if (geom && parent && child) {
        out.push({ edge, d: polyline([...parent.points, ...child.points]), at: geom.bar, word: edge.label });
        continue;
      }
      // A back edge of a cycle has no union to hang from: a straight line, so
      // it is still drawn and still clickable (`layoutTree` keeps it out of
      // the generations, never out of the picture).
      const a = boxCentre(boxA);
      const b = boxCentre(boxB);
      out.push({
        edge,
        d: polyline([a, b]),
        at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        word: edge.label,
      });
      continue;
    }
    if (role === 'partner') {
      const link = partnerLine(boxA, boxB);
      out.push({
        edge,
        d: `M ${link.x1} ${link.y1} L ${link.x2} ${link.y2}`,
        at: { x: (link.x1 + link.x2) / 2, y: link.y1 },
        word: edge.label,
      });
      continue;
    }
    const a = boxCentre(boxA);
    const b = boxCentre(boxB);
    out.push({
      edge,
      d: curvePath(a.x, a.y, b.x, b.y),
      at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      word: edge.label,
    });
  }
  return out;
}

/**
 * The layout with some cards somewhere else — a drag, or somebody else's
 * hand — and the union bars that hang off them recentred, which is the only
 * part of the geometry a move can change. Golf M (samen): shared by the
 * canvas's `layout` and the follower's `followLines`.
 */
function moveInLayout(
  base: TreeLayout,
  moved: ReadonlyMap<GraphNodeId, { x: number; y: number }>,
  sizes: Record<GraphNodeId, { width: number; height: number }>,
): TreeLayout {
  if (!moved.size) return base;
  const positions = { ...base.positions };
  for (const [id, at] of moved) {
    const was = positions[id];
    if (!was) continue;
    positions[id] = { ...was, x: at.x, y: at.y };
  }
  const unions = base.unions.map((union) => {
    if (!union.parents.some((id) => moved.has(id))) return union;
    const centres = union.parents
      .filter((id) => positions[id])
      .map((id) => positions[id].x + (sizes[id]?.width ?? NODE_SIZE.mortal.width) / 2);
    if (!centres.length) return union;
    return { ...union, x: centres.reduce((sum, value) => sum + value, 0) / centres.length };
  });
  return { ...base, positions, unions };
}

type TreeLayout = ReturnType<typeof layoutTree>;

export function FamilyTreeCanvas({
  tree,
  initialGraph,
  canEdit: allowed,
  isKeeper,
  initialInk,
}: FamilyTreeCanvasProps) {
  /*
   * §90: `liveUser` is not read either any more — it drew *you* as a blue "I"
   * (the first letter of "Ir. Steven Duvekot") beside the shell's live strip,
   * which already says who is here. The roster shows the others only.
   *
   * `viewerId`, `peopleNames` and `access` are part of the page's contract and
   * are deliberately not read here: the rights chip and the §17 sheet live in
   * the page's own head (as they do on a tijdlijn), and every name this canvas
   * prints comes off the live line, which already carries one per hand. They
   * stay in the props so the page does not have to learn a second shape the day
   * a stamboom grows a "gezet door".
   */
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  const isPhone = useIsPhone();
  /**
   * §60/§62: the page passes `pointers={false}` to `LivePage`; this canvas is
   * the one that reports a hand and the one that draws everybody else's — in
   * *world* coordinates, because a fraction of the window means nothing to
   * somebody standing at another zoom.
   */
  const live = useLive();
  const mayType = useMayType();
  const canEdit = allowed && mayType;
  /**
   * §73: lezen of bewerken. `canEdit` stays what it was — the *right* — and
   * `editOn` is whether the hand may change the drawing right now: moving a
   * kaartje, making one (the `+`s, the toolbar, the empty paper), arranging,
   * taking a line away, and the potlood. The camera, choosing, and the second
   * tap that opens an artikel are the same in both.
   */
  const mode = useCanvasMode(canEdit);
  const editOn = mode.editing;

  /* --------------------------------------------------------------- state */

  const [graph, setGraph] = useState<FamilyGraph>(initialGraph);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const [state, setStateValue] = useState<FamilyTreeState>(() => normaliseTreeState(tree.state ?? emptyTreeState()));
  /** §61: the document as it is at *this instant*, for everything that crosses an await. */
  const stateRef = useRef(state);
  const setState = useCallback((next: FamilyTreeState) => {
    stateRef.current = next;
    setStateValue(next);
  }, []);

  /** Golf M (samen): who somebody else took out of this tree while it was open here, as node ids. */
  const goneByOthers = useRef<Set<GraphNodeId>>(new Set());
  const noteGone = useRef<(gone: GraphNodeId[], names: string[]) => void>(() => undefined);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [sheet, setSheet] = useState<{ looseId: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  /**
   * §67: the layout and the card sizes, readable from a pointer handler.
   *
   * `useMarqueeSelect` is set up further down but its hit test runs at the end
   * of a sweep, long after this render — and the layout it has to measure is
   * computed *below* it (it depends on the drag, which depends on the
   * selection). These two refs are written on every render and read only from
   * a handler, which is the same trick `stateRef` plays for §61.
   */
  const layoutRef = useRef<{ positions: Record<GraphNodeId, { x: number; y: number }> }>({ positions: {} });
  const sizesRef = useRef<Record<GraphNodeId, { width: number; height: number }>>({});
  /** The open box, readable from a callback that has already crossed an await. */
  const pickerRef = useRef<PickerState | null>(picker);
  pickerRef.current = picker;

  /**
   * §8, live: this tab. One person with the tree open twice is two hands on it,
   * which is what they will see. Generated once, never re-generated.
   */
  const clientIdRef = useRef('');
  if (!clientIdRef.current) clientIdRef.current = `t_${Math.random().toString(36).slice(2, 12)}`;
  const clientId = clientIdRef.current;

  /**
   * Golf M: a step is the document before it *and* the relations it wrote
   * (`TreeStep`), so a line rubbed out off an artikel walks back on the same
   * stack, interleaved with every move and every los kaartje.
   */
  const undoStack = useRef(createUndoStack<TreeStep>(UNDO_LIMIT));
  /** §69: only so the shared button can go grey; the stack itself is the truth. */
  const [undoDepth, setUndoDepth] = useState(0);
  /** Golf M: the same, the other way. */
  const [redoDepth, setRedoDepth] = useState(0);
  const syncDepths = useCallback(() => {
    setUndoDepth(undoStack.current.size());
    setRedoDepth(undoStack.current.redoSize());
  }, []);
  /**
   * Golf M: one gesture, one step. A `+` that puts somebody in the tree *and*
   * writes the field that joins them is one thing the hand did, so while a
   * gesture is running every commit and every relation it makes is collected
   * and pushed as one step when it ends (`runStep`).
   *
   * Golf M (herstel): collected in a `StepGroup` that is handed down the
   * gesture's own calls, not in one ref for the whole canvas — a drag during a
   * `+` still waiting on the network is a step of its own.
   */
  /** Golf M: Ctrl+Z and Ctrl+Shift+Z wait for each other — an undo may cross the wire. */
  const walking = useRef<Promise<void>>(Promise.resolve());
  /** Golf M: a line pulled out of a `+` (`lib/families/connect.ts`). */
  const connectRef = useRef<{
    pointerId: number;
    role: HandleRole;
    sourceId: GraphNodeId;
    from: Point;
    startX: number;
    startY: number;
    moved: boolean;
    target: GraphNodeId | null;
    /** Golf M (herstel): where the pointer last was, for the next frame. */
    clientX: number;
    clientY: number;
  } | null>(null);
  /**
   * Golf M (herstel): React hears about the line only when it starts, lands
   * on another card or stops — its loose end is written straight onto the
   * `<line>` (`connectLineRef`), once per animation frame (`connectFrame`).
   * `to` here is where it was when React last heard.
   */
  const [connect, setConnect] = useState<{ from: Point; to: Point; target: GraphNodeId | null } | null>(null);
  const connectLineRef = useRef<SVGLineElement>(null);
  const connectFrame = useRef<number | null>(null);
  /** The click that ends a drag out of a `+` is not a click on the `+`. */
  const connectSwallow = useRef(false);
  /** Golf M: the menu the right button opens, in stage coordinates. */
  const [contextMenu, setContextMenu] = useState<{
    at: { x: number; y: number };
    label: string;
    items: TreeMenuItem[];
  } | null>(null);
  /** Golf M: the line the pointer is on, for the `+` between two parents. */
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const hoverTimer = useRef<number | null>(null);

  /* ---------------------------------------------------------- the stage */

  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(UNMEASURED);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () =>
      setSize((current) =>
        current.width === el.clientWidth && current.height === el.clientHeight
          ? current
          : { width: el.clientWidth, height: el.clientHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [view, setView] = useState<TreeView | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  /** The view as it is drawn, an unmeasured stage included. */
  const glass = view ?? { x: 0, y: 0, zoom: 1 };

  /* ------------------------------------------------------------- choosing */

  /**
   * §67 — kiezen op de stamboom, op de manier van het prikbord.
   *
   * Shift-click toggles a card in or out; a plain press on a card that is not
   * chosen chooses only it; a plain press on one that *is* leaves the whole
   * group standing, because the next thing that press does is drag the group
   * (`pressSelection`, and the reason it exists). Shift-drag on bare paper
   * sweeps a box and everything it *touches* is chosen; a plain drag still
   * pans, which is what a stamboom's paper has always done.
   *
   * The arithmetic is `lib/canvas/select.ts` and the React round it is
   * `components/canvas/useMarqueeSelect.ts` — the prikbord's, unchanged. What
   * stays this canvas's own is everything else: undo, which ids a save may
   * assert (§61), what the four handles do, and who else is holding what.
   *
   * It is declared here, above the ink and above `busy`, because an open box is
   * a hand on the page: it holds a refresh (§59) and it pauses the pull.
   */
  const selection = useMarqueeSelect<GraphNode>({
    // §61: the tree as it is at the drop, not as it was at the render that
    // opened the box.
    items: () => graphRef.current.nodes,
    /*
     * A ghost is not in the document at all — it is drawn because somebody in
     * the tree names it — so a box swept across the edge of the picture must
     * not pick up six people who are not in this stamboom. `null` is how
     * `hitsIn` is told to leave a thing out.
     */
    boxOf: (node) => {
      if (node.standing === 'ghost') return null;
      const at = layoutRef.current.positions[node.id];
      const size = sizesRef.current[node.id];
      if (!at || !size) return null;
      return { x: at.x, y: at.y, width: size.width, height: size.height };
    },
    toWorld: (clientX, clientY) => {
      const el = stageRef.current;
      const current = viewRef.current ?? { x: 0, y: 0, zoom: 1 };
      if (!el) return toWorld(current, clientX, clientY);
      const rect = el.getBoundingClientRect();
      return toWorld(current, clientX - rect.left, clientY - rect.top);
    },
    // §8: no box under 768 px — the prikbord's rule, for the prikbord's reason
    // (a finger has no shift key) — and none for a hand that may only look.
    enabled: canEdit && !isPhone,
    mode: 'replace',
    onBroadcast: (rect) => sendFrame({ selection: rect }),
  });
  const selected = selection.selected;
  const setSelectedIds = selection.setSelected;
  /** The one card chosen, when exactly one is: the handles and the menu hang off it. */
  const onlySelected: GraphNodeId | null = selected.size === 1 ? [...selected][0] : null;
  /** Choosing exactly one thing, the way every write on this canvas finishes. */
  const selectOne = useCallback(
    (id: GraphNodeId) => setSelectedIds(new Set([id])),
    [setSelectedIds],
  );
  const clearSelection = selection.clear;
  /*
   * Golf M (samen): a card somebody else took out of the tree, while it was
   * chosen here, or its sheet or its kiezer was open: that lets go, and says
   * why, rather than leaving a ring or a form on somebody who is not there.
   */
  noteGone.current = (gone, names) => {
    const dead = new Set(gone);
    const chosen = gone.filter((id) => selected.has(id));
    const sheetGone = sheet ? dead.has(`loose:${sheet.looseId}` as GraphNodeId) : false;
    const pickerGone = picker ? dead.has(picker.nodeId) || Boolean(picker.both?.some((id) => dead.has(id))) : false;
    if (!chosen.length && !sheetGone && !pickerGone) return;
    if (chosen.length) setSelectedIds(new Set([...selected].filter((id) => !dead.has(id))));
    if (sheetGone) setSheet(null);
    if (pickerGone) setPicker(null);
    setContextMenu(null);
    const named = gone.filter((id) => chosen.includes(id) || sheetGone || pickerGone);
    const first = names[gone.indexOf(named[0] ?? gone[0])] || words.looseCard;
    ui.toast(fill(words.liveGoneByOther, { naam: named.length > 1 ? `${named.length} kaartjes` : first }));
  };

  /* ----------------------------------------------------------------- ink */

  /*
   * §33: the tekenlaag, in *world* units like a prikbord's — `useInk` stores
   * `screenWidth / zoom`, so a brush is as thick as it looked at the zoom it
   * was drawn at and grows and shrinks with the tree. §67: the wiring is the
   * shared one (`useCanvasInk`), and it stands here, above `busy`, because a
   * stroke under the hand is one of the things that holds a refresh (§59).
   */
  const inkSpace = usePanZoomInk(stageRef, glass);
  const ink = useCanvasInk({
    kind: 'family_tree',
    id: tree.id,
    initial: initialInk,
    project: inkSpace.project,
    toContent: inkSpace.toContent,
    widthScale: glass.zoom,
    noun: `deze ${words.familyTree}`,
    onError: (message) => ui.toast(message),
    onOpen: () => {
      clearSelection();
      setSelectedEdge(null);
      setPicker(null);
      /*
       * §69 (3.4): and the `…` menu with it. It was the one floating thing on
       * this canvas the potlood did not put away, so taking the pencil out with
       * a menu open left a list of buttons lying over the paper being drawn on
       * — and the press that closed it drew a dot.
       */
      setMenuOpen(false);
    },
    stopPropagation: true,
  });
  /* §90: the §18b question only where this tree can write — Bewerken, or the
     potlood in the hand. A tap in Lezen asks nothing. */
  // §105 (golf J): a kaartje chosen to be read asks nothing.
  const gate = useCanvasAuthorGate(editOn || ink.inkActive, TREE_GLASS);
  /* §101: en elke maakknop — op de balk en om een kaartje heen — vraagt het
     zélf, vóórdat hij maakt. */
  const maker = useCanvasMaker();
  const askThen = useAskAuthorFirst();
  const inkActive = ink.inkActive;
  const onInkKey = ink.onKeyDown;

  /**
   * §73: turning to Lezen puts away whatever was half-made — the potlood and
   * the kiezer a `+` opened — so nothing that changes the drawing is left open
   * under a hand that has just said it is only looking.
   */
  const inkToolRef = useRef(ink.inkTool);
  inkToolRef.current = ink.inkTool;
  // §73: the heading lives in the page, not here; it is told (`TreeTitle`).
  useEffect(() => {
    announceTreeMode(tree.id, editOn);
  }, [tree.id, editOn]);
  useEffect(() => {
    if (editOn) return;
    if (inkToolRef.current.active) inkToolRef.current.setActive(false);
    setPicker(null);
    setMenuOpen(false);
  }, [editOn]);

  /* ---------------------------------------------------------------- save */

  /** §59/§61: a box being swept is a hand on the page like any other. */
  const busy = dragging || ink.busy || picker !== null || sheet !== null || selection.busy || connect !== null;
  useHoldRefresh(busy);

  /**
   * §8, live: what this hand has chosen, for everybody else's stamboom — and
   * the coloured outlines and open boxes theirs are showing back.
   */
  const holdingIds = useMemo(() => [...selected], [selected]);
  const { heldByOthers, marquees } = useTreeHolding({ clientId, holding: holdingIds });

  /**
   * §61: an incoming document is the archive's version of this tree, and it is
   * behind by whatever this hand has done and not saved. So what is still
   * outstanding stays local and everything else is taken as it comes.
   */
  const applyDocument = useCallback(
    (next: FamilyTreeState, nextGraph: FamilyGraph, pending: PendingIds) => {
      const mine = stateRef.current;
      /*
       * Golf M (samen): what the archive no longer has and this hand did not
       * take out itself went because somebody else took it out. Remembered, so
       * an undo of an older step here cannot bring it back (`walkOnce`), and
       * said, when it was chosen or open here.
       */
      const nextMembers = new Set(next.members.map((item) => item.id));
      const nextLoose = new Set(next.loose.map((item) => item.id));
      const gone: GraphNodeId[] = [];
      const names: string[] = [];
      const nameOf = (id: GraphNodeId) => graphRef.current.nodes.find((node) => node.id === id)?.name ?? '';
      for (const member of mine.members) {
        const id = `entry:${member.id}` as GraphNodeId;
        if (nextMembers.has(member.id)) goneByOthers.current.delete(id);
        else if (!pending.deletedMembers.has(member.id) && !pending.members.has(member.id)) {
          gone.push(id);
          names.push(nameOf(id));
        }
      }
      for (const card of mine.loose) {
        const id = `loose:${card.id}` as GraphNodeId;
        if (nextLoose.has(card.id)) goneByOthers.current.delete(id);
        else if (!pending.deletedLoose.has(card.id) && !pending.loose.has(card.id)) {
          gone.push(id);
          names.push(nameOf(id));
        }
      }
      // With the whole document outstanding nothing here can tell a card made
      // here and not yet saved from one somebody else took out; say nothing.
      if (!pending.all) {
        for (const id of gone) goneByOthers.current.add(id);
        if (gone.length) noteGone.current(gone, names);
      }
      if (pending.all) {
        setGraph(nextGraph);
        return;
      }
      const around = <T extends { id: string }>(
        server: T[],
        local: T[],
        held: Set<string>,
        buried: Set<string>,
      ): T[] => {
        const localById = new Map(local.map((item) => [item.id, item]));
        const seen = new Set(server.map((item) => item.id));
        const out = server
          .filter((item) => !buried.has(item.id))
          .map((item) => (held.has(item.id) ? (localById.get(item.id) ?? item) : item));
        // Made here and the archive has simply not heard of it yet.
        for (const item of local) if (!seen.has(item.id) && held.has(item.id)) out.push(item);
        return out;
      };
      setState({
        v: 1,
        members: around(next.members, mine.members, pending.members, pending.deletedMembers),
        loose: around(next.loose, mine.loose, pending.loose, pending.deletedLoose),
        ties: around(next.ties, mine.ties, pending.ties, pending.deletedTies),
        deleted: next.deleted,
      });
      setGraph(nextGraph);
    },
    [setState],
  );

  const sync = useTreeSync({
    treeId: tree.id,
    clientId,
    snapshot: useCallback(() => stateRef.current, []),
    paused: busy,
    onApply: applyDocument,
    onRefusedMembers: useCallback(
      (ids: string[]) => {
        const drop = new Set(ids);
        const prev = stateRef.current;
        setState({ ...prev, members: prev.members.filter((member) => !drop.has(member.id)) });
      },
      [setState],
    ),
    onNotice: useCallback((message: string) => ui.toast(message), [ui]),
  });
  const syncRef = useRef(sync);
  syncRef.current = sync;

  /**
   * §35: the page is a server component, so the browser's Back button lands on
   * the RSC payload from before this write. Every write below ends here.
   */
  const refreshArchive = useCallback(() => router.refresh(), [router]);

  /**
   * §61: **`commit` takes an updater.** The next document is built from `prev`
   * — the state as it is at this instant — and never from a `state` captured
   * when the render that made this callback ran, because half the work on this
   * canvas crosses an `await` or a sheet before it writes.
   */
  const commit = useCallback(
    (
      make: (prev: FamilyTreeState) => TreeChange,
      options: {
        undo?: boolean;
        now?: boolean;
        /** Golf M (samen): false for a move — a drag never brings anybody back into the tree. */
        revive?: boolean;
        /** Golf M (herstel): the gesture this commit is part of (`runStep`). */
        group?: StepGroup | null;
      } = {},
    ) => {
      if (!canEdit) return;
      const prev = stateRef.current;
      const change = make(prev);
      if (options.undo !== false) {
        // Golf M: inside a gesture the step is pushed when the gesture ends,
        // with the document as it was when the gesture *began*.
        if (options.group) options.group.touched = true;
        else {
          undoStack.current.push({ state: prev, relations: [] });
          syncDepths();
        }
      }

      const buried = {
        members: new Set(change.deletedMembers ?? []),
        loose: new Set(change.deletedLoose ?? []),
        ties: new Set(change.deletedTies ?? []),
      };
      const next: FamilyTreeState = {
        v: 1,
        members: (change.members ?? prev.members).filter((item) => !buried.members.has(item.id)),
        loose: (change.loose ?? prev.loose).filter((item) => !buried.loose.has(item.id)),
        ties: (change.ties ?? prev.ties).filter((item) => !buried.ties.has(item.id)),
        deleted: prev.deleted,
      };
      setState(next);

      /** Identity, not a deep compare: every write here builds a new object. */
      const changedIds = <T extends { id: string }>(before: T[], after: T[]): string[] => {
        const was = new Map(before.map((item) => [item.id, item]));
        return after.filter((item) => was.get(item.id) !== item).map((item) => item.id);
      };
      /*
       * Golf M (samen): what this change puts in the tree that was not in it a
       * moment ago is brought back on purpose — only that may lift a tombstone
       * (`revive` in `mergeTreeState`).
       */
      if (options.revive !== false) {
        const fresh = <T extends { id: string }>(before: T[], after: T[]) => {
          const had = new Set(before.map((item) => item.id));
          return after.filter((item) => !had.has(item.id)).map((item) => item.id);
        };
        const members = fresh(prev.members, next.members);
        const loose = fresh(prev.loose, next.loose);
        const ties = fresh(prev.ties, next.ties);
        if (members.length) syncRef.current.noteRevived('members', members);
        if (loose.length) syncRef.current.noteRevived('loose', loose);
        if (ties.length) syncRef.current.noteRevived('ties', ties);
        for (const id of members) goneByOthers.current.delete(`entry:${id}` as GraphNodeId);
        for (const id of loose) goneByOthers.current.delete(`loose:${id}` as GraphNodeId);
      }
      if (change.deletedMembers?.length) syncRef.current.noteDeleted('members', change.deletedMembers);
      if (change.deletedLoose?.length) syncRef.current.noteDeleted('loose', change.deletedLoose);
      if (change.deletedTies?.length) syncRef.current.noteDeleted('ties', change.deletedTies);
      const ids = {
        members: changedIds(prev.members, next.members),
        loose: changedIds(prev.loose, next.loose),
        ties: changedIds(prev.ties, next.ties),
      };
      if (options.now === false) syncRef.current.markDirty(ids);
      else syncRef.current.saveNow(ids);
      refreshArchive();
    },
    [canEdit, setState, refreshArchive, syncDepths],
  );

  /** Golf M: a finished step goes on the stack, unless it changed nothing. */
  const pushStep = useCallback(
    (step: TreeStep) => {
      if (isEmptyStep(step)) return;
      undoStack.current.push(step);
      syncDepths();
    },
    [syncDepths],
  );

  /**
   * Golf M: run a gesture as one step. Nested gestures join the outer one (a
   * `+` on a line calls `attach`, which is a gesture of its own), and a
   * gesture that crosses the wire keeps the step open until it lands.
   *
   * Golf M (herstel): the step is the gesture's own — `work` gets it and hands
   * it to every commit and relation it makes, and a nested gesture is passed
   * the outer one (`outer`). Nothing else joins it, however long it waits.
   */
  const runStep = useCallback(
    async <T,>(work: (group: StepGroup) => Promise<T> | T, outer?: StepGroup | null): Promise<T> => {
      if (outer) return work(outer);
      const group = openGroup(stateRef.current);
      try {
        return await work(group);
      } finally {
        pushStep(closeGroup(group));
      }
    },
    [pushStep],
  );

  /**
   * §66: the one road that writes a **field on an artikel**, raw. Everything
   * the gate, the mirroring, the mentions, the revision and the voorstel road
   * do happens on the far side of this; the tree's own state is not touched.
   * Golf M split it from `writeRelation` so an undo can use the road without
   * putting what it sends on the stack.
   */
  const postRelation = useCallback(
    async (op: RelationOp, walking = false): Promise<{ outcome: OpOutcome; error?: string; replaced?: string }> => {
      try {
        const response = await fetch(`/api/family-trees/${tree.id}/relations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            entryId: op.entryId,
            fieldKey: op.fieldKey,
            targetId: op.targetId,
            ...(op.add ? {} : { remove: true }),
            // Golf M: a step back or forward never overwrites a one-box field
            // that somebody has filled with somebody else in the meantime.
            ...(walking ? { replace: false } : {}),
          }),
        });
        const data = (await response.json()) as {
          status?: string;
          graph?: FamilyGraph;
          error?: string;
          /** Golf M (herstel): who a `+` pushed out of a one-box field. */
          replaced?: string;
        };
        if (!response.ok) return { outcome: 'refused', error: data.error ?? 'Dat is niet gelukt.' };
        if (data.graph) {
          /*
           * §67: the ref as well as the state. The second question a `+ kind`
           * asks is answered *after* this await, and it needs the role fields
           * of the artikel that was created a moment ago — which arrive in this
           * very answer. `graphRef.current` is otherwise only written on the
           * next render, which has not run yet.
           */
          graphRef.current = data.graph;
          setGraph(data.graph);
        }
        refreshArchive();
        return { outcome: outcomeOf(data.status, true), ...(data.replaced ? { replaced: data.replaced } : {}) };
      } catch {
        return { outcome: 'refused', error: 'Geen verbinding.' };
      }
    },
    [tree.id, refreshArchive],
  );

  /** Golf M: what a walk owes the hand, said once. */
  const sayWalk = useCallback(
    (outcomes: readonly OpOutcome[], error?: string) => {
      const notice = walkNotice(outcomes);
      if (!notice) return;
      const vars = { lijn: words.treeLine, keeper: words.keeper };
      if (notice === 'refused') ui.toast(error ? `${fill(words.treeUndoRefused, vars)} ${error}` : fill(words.treeUndoRefused, vars));
      else if (notice === 'proposed') ui.toast(fill(words.treeUndoProposed, vars));
      else ui.toast(fill(words.treeUndoUnchanged, vars));
    },
    [ui, words],
  );

  /**
   * One step back, or forward. The relations cross the wire first — each one
   * through the same road, inverted for an undo — and then the tree's own
   * document is put back, so a `+` that brought somebody in and drew their line
   * goes back as: the line rubbed out, then the card gone.
   *
   * What comes back is the step for the other direction, holding only the ops
   * that really landed (`oppositeStep`): a line somebody else redrew in the
   * meantime is left alone and said out loud, and it is not replayed later.
   */
  const walkOnce = useCallback(
    async (direction: 'undo' | 'redo') => {
      if (!canEdit) return;
      const stack = undoStack.current;
      const step = direction === 'undo' ? stack.pop() : stack.popRedo();
      syncDepths();
      if (!step) return;
      // Golf M (herstel): what the undo side looked like before the wire.
      const mark = stackMark(stack);
      const sent = direction === 'undo' ? undoOps(step) : redoOps(step);
      const outcomes: OpOutcome[] = [];
      let error: string | undefined;
      for (const op of sent) {
        const answer = await postRelation(op, true);
        outcomes.push(answer.outcome);
        if (answer.error && !error) error = answer.error;
      }
      const current = stateRef.current;
      if (step.state !== undefined) {
        /*
         * Golf M (samen): a step from before somebody else took a card out of
         * the tree does not bring that card back — and what it does bring back
         * (this hand's own removal, undone) is said to be on purpose, so the
         * merge lifts exactly those stones and no others.
         */
        const buried = goneByOthers.current;
        const back = step.state;
        const kept: FamilyTreeState = buried.size
          ? {
              ...back,
              members: back.members.filter((item) => !buried.has(`entry:${item.id}` as GraphNodeId)),
              loose: back.loose.filter((item) => !buried.has(`loose:${item.id}` as GraphNodeId)),
              ties: back.ties.filter(
                (tie) =>
                  ![tie.from, tie.to].some((end) =>
                    buried.has(`${end.kind === 'loose' ? 'loose' : 'entry'}:${end.id}` as GraphNodeId),
                  ),
              ),
            }
          : back;
        const fresh = <T extends { id: string }>(before: T[], after: T[]) => {
          const had = new Set(before.map((item) => item.id));
          return after.filter((item) => !had.has(item.id)).map((item) => item.id);
        };
        syncRef.current.noteRevived('members', fresh(current.members, kept.members));
        syncRef.current.noteRevived('loose', fresh(current.loose, kept.loose));
        syncRef.current.noteRevived('ties', fresh(current.ties, kept.ties));
        setState(kept);
        // The whole document goes: an undo can move anything, and working out
        // what it put back is exactly the bookkeeping `all` exists to avoid.
        syncRef.current.saveNow();
      }
      clearSelection();
      setSelectedEdge(null);
      const opposite = oppositeStep(step, current, sent, outcomes, direction);
      if (!isEmptyStep(opposite)) {
        /*
         * Golf M (herstel): a hand that made a new step while this undo was on
         * the wire started another branch (`push` forgot the redos); a redo
         * left now would replay onto a document it was never taken from.
         */
        if (direction === 'undo') {
          if (!stackMoved(mark, stack)) stack.pushRedo(opposite);
        } else stack.pushFromRedo(opposite);
      }
      syncDepths();
      sayWalk(outcomes, error);
      refreshArchive();
    },
    [canEdit, postRelation, setState, clearSelection, syncDepths, sayWalk, refreshArchive],
  );

  const undo = useCallback(() => {
    walking.current = walking.current.then(() => walkOnce('undo')).catch(() => undefined);
    return walking.current;
  }, [walkOnce]);
  const redo = useCallback(() => {
    walking.current = walking.current.then(() => walkOnce('redo')).catch(() => undefined);
    return walking.current;
  }, [walkOnce]);

  /**
   * Golf M: the *Ongedaan maken* in a toast undoes **that** step. If the hand
   * has done something else since, the toast is out of date, and undoing the
   * newer thing from an old sentence would be a surprise — so it says so.
   */
  const undoIfLast = useCallback(
    (step: TreeStep | undefined) => {
      if (step && undoStack.current.peek() !== step) {
        ui.toast(words.treeUndoGone);
        return;
      }
      void undo();
    },
    [undo, ui, words.treeUndoGone],
  );

  /**
   * Every viewer's own glass, in their own browser. Never state (rule 20).
   * §94 (C5): per tab now (`sessionStorage`, `lib/canvas/memory.ts`), the same
   * road the other three take — it was `localStorage` since §66, which also
   * meant a stamboom opened next week on last week's corner.
   */
  const rememberView = useCallback(
    (next: TreeView) => writeCamera('family_tree', tree.id, next),
    [tree.id],
  );
  const moveView = useCallback(
    (make: (current: TreeView) => TreeView) => {
      setView((current) => {
        const next = make(current ?? { x: 0, y: 0, zoom: 1 });
        rememberView(next);
        return next;
      });
    },
    [rememberView],
  );

  /* -------------------------------------------------------------- layout */

  const sizes = useMemo<Record<GraphNodeId, { width: number; height: number }>>(
    () => Object.fromEntries(graph.nodes.map((node) => [node.id, NODE_SIZE[node.frame] ?? NODE_SIZE.mortal])),
    [graph.nodes],
  );

  /** Only a card a hand has dragged has a position of its own. */
  const pins = useMemo(() => {
    const map = new Map<GraphNodeId, { x: number; y: number }>();
    const take = (id: GraphNodeId, item: { x?: number; y?: number; pinned?: boolean }) => {
      if (!item.pinned || typeof item.x !== 'number' || typeof item.y !== 'number') return;
      map.set(id, { x: item.x, y: item.y });
    };
    for (const member of state.members) take(`entry:${member.id}`, member);
    for (const card of state.loose) take(`loose:${card.id}`, card);
    return map;
  }, [state]);

  const base = useMemo(
    () =>
      layoutTree(
        graph.nodes.map((node) => ({
          id: node.id,
          width: sizes[node.id]?.width ?? NODE_SIZE.mortal.width,
          height: sizes[node.id]?.height ?? NODE_SIZE.mortal.height,
          // A ghost is never pinned: it is not in the document at all.
          pinned: node.standing === 'ghost' ? undefined : pins.get(node.id),
        })),
        graph.edges.map((edge) => ({ from: edge.from, to: edge.to, role: edge.role })),
      ),
    [graph, sizes, pins],
  );

  /**
   * The cards this hand is carrying, and everybody else's. A drag does not
   * re-run the layout — the positions are patched, and the union bars that
   * depend on a moved card are recentred, which is the only part of the
   * geometry a move can change.
   *
   * §67: *cards*, plural. A drag that begins on a chosen card carries the whole
   * selection, so this is a map from node to where the hand has it rather than
   * one card and one point.
   */
  const [drag, setDrag] = useState<Record<GraphNodeId, { x: number; y: number }> | null>(null);
  /*
   * Golf M (samen): the cards in somebody else's hand, and the ones they just
   * put down — the four canvases' shared rules (`lib/live/hands.ts`). A card
   * stays where the hand left it until this tree's own document says where it
   * is, or `SETTLE_MS` passed; it used to wait for an exact match for ever, so
   * a drag called off with Escape, or a hand that vanished mid-drag, left its
   * card in the air until the page was reloaded.
   */
  const docAt = useCallback(
    (id: string) => {
      const at = pins.get(id as GraphNodeId) ?? base.positions[id as GraphNodeId];
      return at ? ([at.x, at.y] as const) : null;
    },
    [pins, base],
  );
  const carried = useCarried({ hands: live.pointers, self: live.clientId, docAt });
  /** Golf M (samen): wat een ander nu sleept — niet te pakken, wel te lezen. */
  const locks = useLocks(live.pointers, live.clientId);
  const locksRef = useRef(locks);
  locksRef.current = locks;
  const sayHeld = useLockHint(ui.toast, words.liveHeldBy);
  /** Golf M (samen): a card in somebody's hand wears their ring whether or not they chose it — the lock, said out loud. */
  const heldAll = useMemo(() => {
    if (!locks.size) return heldByOthers;
    const out = new Map(heldByOthers);
    for (const [id, lock] of locks) out.set(id as GraphNodeId, lock);
    return out;
  }, [heldByOthers, locks]);

  const layout = useMemo(() => {
    const moved = new Map<GraphNodeId, { x: number; y: number }>();
    if (drag) for (const [id, at] of Object.entries(drag)) moved.set(id, at);
    for (const [id, at] of carried) if (!drag?.[id]) moved.set(id, { x: at.x, y: at.y });
    return moveInLayout(base, moved, sizes);
  }, [base, drag, carried, sizes]);

  /*
   * §67: the edges go in as well, because the sibling lines are worked out
   * here — they hang off no union, so `edgeGeometry` needs to be told which
   * pairs there are.
   */
  const geometry = useMemo(() => edgeGeometry(layout, sizes, graph.edges), [layout, sizes, graph.edges]);

  // Read from the pointer handlers, which run long after this render (see the
  // two refs where they are declared, above the selection hook).
  layoutRef.current = layout;
  sizesRef.current = sizes;

  const boxOf = useCallback(
    (id: GraphNodeId): Box | null => {
      const at = layout.positions[id];
      const size = sizes[id];
      if (!at || !size) return null;
      return { x: at.x, y: at.y, width: size.width, height: size.height };
    },
    [layout, sizes],
  );

  /**
   * Every line, ready to stroke, one per `GraphEdge` so a click can name it.
   *
   * A lineage line is the parent's drop plus the child's rise through the same
   * union bar, which is exactly the two polylines `edgeGeometry` already
   * worked out. A partner line is the short double stroke between the pair. A
   * `kin` line is a bow, and it always wears its word — the others show theirs
   * on hover or when they are chosen.
   *
   * §67 — **and most sibling edges are drawn as no line at all.** The graph
   * hands over four kinds (`full`, `half`, `unknown`, `explicit`); only `half`
   * and `explicit` get a stroke. Two people who share both parents already have
   * a line saying so — the bar they both hang from — and a second, thinner one
   * between them would only be the same fact drawn twice. `unknown` is the
   * archive admitting it does not know which of the two it is, and a line that
   * means "possibly" is worse than the shared bar on its own. What is left is
   * exactly the two cases the picture does not otherwise show: a *half* sibling
   * (two bars, one shared parent) and one somebody typed in because the parents
   * are not recorded at all.
   */
  const lines = useMemo<DrawnLine[]>(
    () => drawLines(graph.edges, layout, geometry, sizes),
    [graph.edges, layout, geometry, sizes],
  );

  /*
   * Golf M (samen): a card in somebody else's hand glides between their frames
   * (`useFollow`), and — this is the part a CSS transition never managed — the
   * lines and the union bars go with it. While anything glides, the lines are
   * worked out again each animation frame from where the cards are *drawn*
   * (`moveInLayout`, `drawLines`) and written straight into their `d`; when it
   * stops, once more from the layout, so React's own attributes are what is
   * left. The canvas itself does not render for any of it.
   */
  const threadedLines = useRef(false);
  const fullLayoutRef = useRef(layout);
  fullLayoutRef.current = layout;
  /**
   * Golf M (herstel): the stroked elements of each line, looked up once per
   * render instead of three `querySelectorAll`s per line per frame. A render
   * may have made new elements, so every render marks the map stale and the
   * next frame that needs it builds it again, in one sweep.
   */
  const edgeEls = useRef<Map<string, { d: Element[]; at: Element[]; dot: Element[] }>>(new Map());
  const edgeElsStale = useRef(true);
  useLayoutEffect(() => {
    edgeElsStale.current = true;
  });
  const elsOfEdge = useCallback((root: HTMLElement, edgeId: string) => {
    if (edgeElsStale.current) {
      const map = new Map<string, { d: Element[]; at: Element[]; dot: Element[] }>();
      const slot = (id: string) => {
        let one = map.get(id);
        if (!one) map.set(id, (one = { d: [], at: [], dot: [] }));
        return one;
      };
      root.querySelectorAll('[data-edge-d],[data-edge-at],[data-edge-dot]').forEach((el) => {
        const d = el.getAttribute('data-edge-d');
        const at = el.getAttribute('data-edge-at');
        const dot = el.getAttribute('data-edge-dot');
        if (d !== null) slot(d).d.push(el);
        if (at !== null) slot(at).at.push(el);
        if (dot !== null) slot(dot).dot.push(el);
      });
      edgeEls.current = map;
      edgeElsStale.current = false;
    }
    return edgeEls.current.get(edgeId);
  }, []);
  /** Golf M (herstel): what glided last frame, so its lines are put back when it stops. */
  const lastGliding = useRef<Set<string>>(new Set());
  const followLines = useCallback((visual: ReadonlyMap<string, Vec>) => {
    const root = stageRef.current;
    if (!root || (!visual.size && !threadedLines.current)) return;
    const sizesNow = sizesRef.current;
    const moved = new Map<GraphNodeId, { x: number; y: number }>();
    for (const [id, at] of visual) moved.set(id as GraphNodeId, at);
    /*
     * Golf M (herstel): only the lines a glide can move — those with a gliding
     * end, or hanging from a bar whose parents glide (`edgesTouching`) — and
     * only their unions worked out again. This frame's cards, and last
     * frame's, so a card that just stopped leaves its lines where React has
     * them.
     */
    const ids = new Set<string>([...moved.keys(), ...lastGliding.current]);
    lastGliding.current = new Set(moved.keys());
    const full = fullLayoutRef.current;
    const edges = edgesTouching(graphRef.current.edges, full.unions, ids);
    if (edges.length) {
      const scoped: TreeLayout = { ...full, unions: unionsTouching(full.unions, ids) };
      const drawnLayout = moveInLayout(scoped, moved, sizesNow);
      const drawn = drawLines(edges, drawnLayout, edgeGeometry(drawnLayout, sizesNow, edges), sizesNow);
      for (const line of drawn) {
        const els = elsOfEdge(root, line.edge.id);
        if (!els) continue;
        for (const el of els.d) if (el.getAttribute('d') !== line.d) el.setAttribute('d', line.d);
        for (const el of els.at) {
          el.setAttribute('x', String(line.at.x));
          el.setAttribute('y', String(line.at.y - 4));
        }
        for (const el of els.dot) {
          el.setAttribute('cx', String(line.at.x));
          el.setAttribute('cy', String(line.at.y));
        }
      }
    }
    threadedLines.current = visual.size > 0;
  }, [elsOfEdge]);
  const followTargets = useMemo(() => {
    const out = new Map<string, Vec>();
    for (const [id, at] of carried) {
      if (drag?.[id] || !base.positions[id as GraphNodeId]) continue;
      out.set(id, { x: at.x, y: at.y });
    }
    return out;
  }, [carried, drag, base]);
  const nodeFollow = useFollow({ rootRef: stageRef, targets: followTargets, scale: { x: 1, y: 1 }, onFrame: followLines });
  /** Golf M (samen): their arrows glide too — on the glass, so in pixels at this zoom. */
  const handScale = useMemo(() => ({ x: glass.zoom, y: glass.zoom }), [glass.zoom]);
  const handTargets = useMemo(() => {
    const out = new Map<string, Vec>();
    for (const pointer of live.pointers) if (pointer.x !== null && pointer.y !== null) out.set(pointer.clientId, { x: pointer.x, y: pointer.y });
    return out;
  }, [live.pointers]);
  useFollow({ rootRef: stageRef, targets: handTargets, scale: handScale, prefix: 'hand:' });
  /*
   * Golf M (samen): twee handen pakten hetzelfde kaartje in dezelfde tel. Wie
   * het gelijkspel verliest (`winsTie`), laat los — er was nog niets
   * opgeslagen, een sleep wordt pas bij het neerzetten één commit — en ziet
   * zijn kaartjes glijden van waar hij ze had naar waar de ander ze heeft.
   */
  useDragConflict({
    hands: live.pointers,
    self: live.clientId,
    mine: () => (nodeDrag.current?.moved ? nodeDrag.current.origin.keys() : []),
    onLose: ({ lock }) => {
      if (!nodeDrag.current) return;
      const had = dragRef.current;
      if (had) for (const [id, at] of Object.entries(had)) nodeFollow.seed(id, at);
      nodeDrag.current = null;
      setDragging(false);
      dragRef.current = null;
      setDrag(null);
      reportLivePointer(null);
      ui.toast(fill(words.liveTakenFirst, { naam: lock.name || 'Iemand' }));
    },
  });

  /* ------------------------------------------------------ the first view */

  /**
   * §101 — waar je was, na een `+`.
   *
   * A stamboom stores no layout: where a card is drawn is worked out from the
   * facts (`layoutTree`), so one parent added above pushes a whole generation
   * along and the world coordinates of the card you were working on are
   * different numbers afterwards. The camera stands still in *world*
   * coordinates, so on the glass it jumped: after *+ Ouder* you were looking at
   * two strangers, and "waar was ik?" cost the handeling the `+` had just
   * saved (rij 18 of the meting after golf 3).
   *
   * So a `+` says, before it writes, which card it hung off and where that card
   * stood. The effect below waits for the new card to land, keeps the old one
   * where it was on the glass (`followPoint`) and then pans the least that
   * brings the new one into view (`panIntoView`). No zoom: nothing happened
   * that asks for one, and a camera that zooms unasked reads as a fault.
   */
  const keepInView = useRef<{
    anchor: GraphNodeId;
    at: { x: number; y: number };
    bring: GraphNodeId | null;
  } | null>(null);

  /** What a `+` remembers about where it stood, or null when it cannot tell. */
  const markPlace = useCallback((anchor: GraphNodeId, bring: GraphNodeId | null) => {
    const at = layoutRef.current.positions[anchor];
    keepInView.current = at ? { anchor, at: { x: at.x, y: at.y }, bring } : null;
  }, []);

  const fitAll = useCallback(() => {
    const next = fitViewport(base.bounds, size);
    setView(next);
    rememberView(next);
  }, [base.bounds, size, rememberView]);

  const startedView = useRef(false);
  /** §94 (C5): whether the address's `?node=` has been read yet. */
  const choiceRead = useRef(false);
  useEffect(() => {
    // §94: not on the guess (`UNMEASURED`, 900 wide) — a first view worked
    // out for a stage that is not there put a phone's chosen card off the glass.
    if (startedView.current || size === UNMEASURED || size.width <= 0 || !graph.nodes.length) return;
    startedView.current = true;
    const stored = readCamera('family_tree', tree.id, isTreeView);
    /*
     * §94 (C5): `?node=` chooses a card — the one Back left, or the one the
     * door on an artikel ("In stamboom: …") asked for. A camera this tab left
     * here wins (Back lands exactly where it was); without one, the card is
     * brought to the middle at a zoom a name can be read at.
     */
    const asked = readChoice(CHOICE_PARAM.family_tree);
    const node = asked ? graph.nodes.find((one) => one.id === asked && one.standing !== 'ghost') : undefined;
    choiceRead.current = true;
    if (node) selectOne(node.id);
    if (isTreeView(stored)) setView({ ...stored, zoom: clampZoom(stored.zoom) });
    else if (node && base.positions[node.id]) {
      const at = base.positions[node.id];
      const card = sizes[node.id] ?? NODE_SIZE.mortal;
      setView(centreView({ x: at.x + card.width / 2, y: at.y + card.height / 2 }, size, Math.max(1, TREE_READ_FLOOR)));
    }
    // §94 (C7): a readable start, never names of five pixels.
    else setView(readableFit(base.bounds, size, TREE_READ_FLOOR, FIT_PADDING, TREE_OPEN_MAX_ZOOM));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, graph.nodes.length, base.bounds, tree.id]);
  /*
   * §94 (C4): vinden op de stamboom. Every kaartje that stands in it (a ghost
   * is not in it, so it is not offered), by the name it wears; a pick brings
   * it to the middle at a zoom a name can be read at, and chooses it — so the
   * `+`s hang off it straight away.
   */
  const findable = useMemo<Findable[]>(
    () =>
      graph.nodes
        .filter((node) => node.standing !== 'ghost')
        .map((node) => ({
          id: node.id,
          name: node.name,
          hint: node.kind === 'entry' ? node.typeLabel : capitalise(words.looseCard),
          icon: node.kind === 'entry' ? (node.icon ?? 'person') : 'note',
        })),
    [graph.nodes, words.looseCard],
  );
  const findNode = useCallback(
    (id: GraphNodeId) => {
      const at = layoutRef.current.positions[id];
      if (!at || size.width <= 0) return;
      const card = sizesRef.current[id] ?? NODE_SIZE.mortal;
      const next = centreView(
        { x: at.x + card.width / 2, y: at.y + card.height / 2 },
        size,
        Math.max(viewRef.current?.zoom ?? 1, TREE_READ_FLOOR, 1),
      );
      setView(next);
      rememberView(next);
      selectOne(id);
    },
    [size, rememberView, selectOne],
  );
  /*
   * §101: and the other half of `markPlace` — the camera, once the drawing has
   * settled. It runs on every layout, does nothing at all unless a `+` left
   * something behind, and clears the note the moment it has acted, so a later
   * pan is nobody's business but the hand's.
   *
   * Waiting for the new card is what makes it right rather than nearly right:
   * the relation is written over the wire, so between the press and the answer
   * there are layouts in which the anchor has already moved and the new card
   * does not exist yet. Acting on one of those would keep the camera on a
   * half-finished tree and then let the finished one jump anyway.
   */
  useEffect(() => {
    const keep = keepInView.current;
    if (!keep || size.width <= 0) return;
    const now = layout.positions[keep.anchor];
    if (!now) {
      keepInView.current = null;
      return;
    }
    const bring = keep.bring ? boxOf(keep.bring) : null;
    if (keep.bring && !bring) return;
    keepInView.current = null;
    const current = viewRef.current ?? { x: 0, y: 0, zoom: 1 };
    const held = followPoint(current, keep.at, now);
    // En het nieuwe kaartje erbij — maar nooit ten koste van het kaartje waar
    // de hand mee bezig was: ver ingezoomd passen twee generaties niet samen.
    // §105 (golf J, stuk 8): and if both do not fit (a phone, zoomed in), the
    // new card wins; on a phone above the round `+` and *Ongedaan maken*.
    const glass = isPhone ? { width: size.width, height: Math.max(0, size.height - PHONE_DOCK) } : size;
    const next = bring ? panToBring(held, bring, glass, FIT_PADDING, boxOf(keep.anchor) ?? undefined) : held;
    if (next.x === current.x && next.y === current.y) return;
    setView(next);
    rememberView(next);
  }, [layout, boxOf, size, rememberView, isPhone]);

  // §94 (C5): the one card chosen is in the address, so Back chooses it again.
  useEffect(() => {
    if (choiceRead.current) writeChoice(CHOICE_PARAM.family_tree, onlySelected);
  }, [onlySelected]);
  // An empty tree still needs a view, or nothing has coordinates at all.
  useEffect(() => {
    if (view === null && size.width > 0 && !graph.nodes.length) setView({ x: 0, y: 0, zoom: 1 });
  }, [view, size.width, graph.nodes.length]);

  /** A world point, on the glass. */
  const toScreen = useCallback(
    (point: Point) => ({ x: glass.x + point.x * glass.zoom, y: glass.y + point.y * glass.zoom }),
    [glass],
  );

  /* ---------------------------------------------------------------- zoom */

  const zoomBy = useCallback(
    (factor: number, at?: { x: number; y: number }) => {
      moveView((current) =>
        zoomAbout(current, factor, at?.x ?? size.width / 2, at?.y ?? size.height / 2),
      );
    },
    [moveView, size],
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      /*
       * §69: a sideways swipe pans, the way the prikbord has always answered
       * one. It used to fall through to the zoom, which read `deltaY` — nought
       * on a horizontal swipe — so the gesture did nothing at all.
       */
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        moveView((current) => ({ ...current, x: current.x - event.deltaX }));
        return;
      }
      zoomBy(wheelFactor(event.deltaY, event.deltaMode), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    // Not passive: the page must not scroll under the tree.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy, moveView]);

  /* -------------------------------------------------------- hands, live */

  const reportLivePointer = live.reportPointer;

  /**
   * §60/§67: one frame, three fields, each set only when it is mentioned.
   *
   * A frame on the site line is a *state* rather than a telegram — the fields a
   * caller does not name keep their last value — so this remembers the whole of
   * it and posts the whole of it. The prikbord's `reportPointer` in
   * `useBoardLive` is the same three lines; a stamboom keeps its own copy
   * because its coordinates are the world's and its ids are `GraphNodeId`s.
   */
  const frame = useRef<{
    x: number | null;
    y: number | null;
    m: Record<string, [number, number]>;
    s: [number, number, number, number] | null;
  }>({ x: null, y: null, m: {}, s: null });

  const sendFrame = useCallback(
    (next: {
      cursor?: { x: number; y: number } | null;
      moving?: Record<GraphNodeId, { x: number; y: number }>;
      selection?: [number, number, number, number] | null;
    }) => {
      const current = frame.current;
      if (next.cursor !== undefined) {
        current.x = next.cursor ? Math.round(next.cursor.x) : null;
        current.y = next.cursor ? Math.round(next.cursor.y) : null;
      }
      if (next.moving !== undefined) {
        const m: Record<string, [number, number]> = {};
        /*
         * §67: forty, and no more. `pointerFrame` in
         * `app/api/live/site/route.ts` takes the first forty keys of `m` and
         * silently drops the rest, so a group of sixty dragged across the glass
         * would arrive on the other screens with twenty cards standing still
         * and nothing saying why. Cut it here, where the fact is visible: the
         * other forty-and-more still *land* — the drop is one commit and one
         * pull — they simply do not travel with the hand.
         */
        for (const [id, at] of Object.entries(next.moving).slice(0, POINTER_CARD_LIMIT)) {
          if (Number.isFinite(at.x) && Number.isFinite(at.y)) m[id] = [Math.round(at.x), Math.round(at.y)];
        }
        current.m = m;
      }
      if (next.selection !== undefined) {
        current.s = next.selection
          ? [
              Math.round(next.selection[0]),
              Math.round(next.selection[1]),
              Math.round(next.selection[2]),
              Math.round(next.selection[3]),
            ]
          : null;
      }
      reportLivePointer({ x: current.x, y: current.y, m: current.m, s: current.s });
    },
    [reportLivePointer],
  );

  const reportHand = useCallback(
    (point: { clientX: number; clientY: number } | null, moving?: Record<GraphNodeId, { x: number; y: number }>) => {
      const el = stageRef.current;
      const current = viewRef.current;
      if (!point || !el || !current) {
        frame.current = { x: null, y: null, m: {}, s: null };
        reportLivePointer(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const x = point.clientX - rect.left;
      const y = point.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        frame.current = { x: null, y: null, m: {}, s: null };
        reportLivePointer(null);
        return;
      }
      // A hand that is not carrying anything is carrying nothing — said out
      // loud, or the cards it dropped would stay in the air on every other
      // screen until the pull landed.
      sendFrame({ cursor: toWorld(current, x, y), moving: moving ?? {} });
    },
    [reportLivePointer, sendFrame],
  );
  /*
   * §60: the dependency is the stable *callback*, never the whole `live` value
   * — that is a new object on every incoming frame, so a cleanup hung on it
   * would run per frame and say "my hand has left" twelve times a second.
   */
  useEffect(() => {
    const onLeave = () => reportLivePointer(null);
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('blur', onLeave);
      reportLivePointer(null);
    };
  }, [reportLivePointer]);

  const others = useMemo(
    () => live.people.filter((person) => person.clientId !== clientId),
    [live.people, clientId],
  );

  /* -------------------------------------------------------- the live pull */

  const memberKeys = useMemo(
    () => [familyTreeKey(tree.id), ...state.members.map((member) => entryKey(member.id))].join('\n'),
    [tree.id, state.members],
  );
  const pull = sync.pull;
  useLiveChanges(
    useMemo(() => memberKeys.split('\n'), [memberKeys]),
    useCallback(
      (hit, info) => {
        // Our own echo of our own save: the answer to that POST already landed.
        if (info?.by && info.by === clientId) return;
        const onlyTheTree = hit.every((key) => key === familyTreeKey(tree.id));
        if (
          onlyTheTree &&
          info?.reason !== 'resync' &&
          !info?.by &&
          Date.now() - live.ownWriteAt() < OWN_WRITE_MUTE_MS
        ) {
          return;
        }
        void pull();
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [clientId, tree.id, pull],
    ),
  );

  /* ---------------------------------------------------------------- pan */

  /**
   * `fromCard` (§73): a press on a kaartje by a hand that may not move it right
   * now pans the paper instead. It takes no capture and moves nothing until it
   * passes the slop — the capture would swallow the `click` on the name, and a
   * tap that opens the artikel is left alone in Lezen — and it lets go of
   * nothing at the end, because the press on the card has just chosen it.
   */
  const pan = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    from: TreeView;
    moved: boolean;
    fromCard?: boolean;
  } | null>(null);
  /** §67: which pointer is sweeping a box, so the up that closes it is the right one. */
  const marqueePointer = useRef<number | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  const onStagePointerDown = (event: React.PointerEvent) => {
    if (inkActive) return;
    /*
     * §69/§68: only the left button and a finger start a pan. Without this a
     * right-press on bare paper took the pointer capture and dragged the whole
     * tree while the browser's menu was coming up — measured: 100 px of travel
     * and `.is-grabbing` on the stage.
     */
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    /*
     * §66: everything on the glass that is a *control* is named here, and
     * `.tree-line-menu` is one of them — leaving it out did not merely start a
     * pan under the button, it made the button unpressable. The stage takes the
     * pointer capture on the way down, so the `click` that follows is
     * retargeted to the stage and never reaches "Lijn verwijderen" at all; the
     * press then reads as a press on bare paper and clears the very selection
     * the menu was standing on. Anything floating over the stage that can be
     * pressed belongs in this list.
     */
    if (
      target.closest(
        '.tree-node, .tree-handle, .tree-menu, .tree-menu-anchor, .tree-line-menu, .tree-picker, .tree-line-hit, .ink-toolbar, .ink-capture',
      )
    ) {
      return;
    }
    const el = stageRef.current;
    if (!el) return;
    // §72: a second finger never reaches this — `pinchHand` stopped it.
    el.setPointerCapture(event.pointerId);

    /*
     * §67: **shift-drag on bare paper sweeps a box; a plain drag pans.**
     *
     * The capture is taken first, for the box as much as for the pan: a sweep
     * that leaves the stage — which is exactly how a box round everything is
     * dragged — would otherwise stop receiving moves halfway.
     */
    if (event.shiftKey && selection.beginMarquee(event)) {
      marqueePointer.current = event.pointerId;
      // The box replaces what was chosen, so let go of it on the way down: a
      // sweep that opens with six cards still outlined reads as "add to these".
      clearSelection();
      setSelectedEdge(null);
      setMenuOpen(false);
      setPicker(null);
      return;
    }

    pan.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      from: viewRef.current ?? { x: 0, y: 0, zoom: 1 },
      moved: false,
    };
    setGrabbing(true);
  };

  const onStagePointerMove = (event: React.PointerEvent) => {
    const el = stageRef.current;
    // A card being carried owns the pointer, wherever it has wandered to.
    if (nodeDrag.current) {
      onNodePointerMove(event);
      return;
    }
    // Golf M: and so does a line being pulled out of a `+`.
    if (connectRef.current) {
      onConnectMove(event);
      return;
    }
    // A finger reports nothing: a touch screen has no hovering hand, and an
    // arrow that appears only while somebody presses is a lie.
    if (event.pointerType !== 'touch') {
      reportHand({ clientX: event.clientX, clientY: event.clientY });
    }
    /*
     * §67/§8: the box grows, and it goes out on the line while it does. A
     * rectangle dragged round half a stamboom is something you are doing *to* a
     * picture somebody else is arranging, so they watch it happen rather than
     * watching six cards light up at the end. The frame itself leaves through
     * `onBroadcast`, where the hook was made.
     */
    if (selection.onPointerMove(event)) return;
    const gesture = pan.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    // §69: the same threshold a card drag uses, measured on the diagonal.
    if (gesture.fromCard && !gesture.moved) {
      if (!passedSlop(dx, dy)) return;
      // §73: now it is a pan, and the click the press ends with opens nothing.
      pressTravelled.current = true;
      try {
        el?.setPointerCapture(event.pointerId);
      } catch {
        /* a pointer that has already gone cannot be captured */
      }
      setGrabbing(true);
    }
    if (passedSlop(dx, dy)) gesture.moved = true;
    moveView(() => ({ ...gesture.from, x: gesture.from.x + dx, y: gesture.from.y + dy }));
  };

  const onStagePointerUp = (event: React.PointerEvent, cancelled = false) => {
    // Golf M: a line pulled out of a `+` lands, or does not, before anything else.
    if (connectRef.current) {
      endConnect(event, !cancelled);
      return;
    }
    /*
     * §69: a shift-press the hook held back, answered now the press is over.
     * `pressTravelled` is this canvas's own answer to `DRAG_SLOP`, and it is
     * set for a reader as well as an editor — so a press that went nowhere
     * toggles, and one that dragged the group leaves the group standing.
     * Above every early return, and above the `canEdit` gate below it.
     */
    selection.endPress(pressTravelled.current);
    if (nodeDrag.current) {
      endNodeDrag(event, !cancelled);
      return;
    }
    // §67: a box closes on whatever it touched — and a cancelled gesture (the
    // browser took the pointer) still has to close it, or it hangs on the glass.
    if (marqueePointer.current === event.pointerId) {
      marqueePointer.current = null;
      selection.onPointerUp(event);
      return;
    }
    const gesture = pan.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    pan.current = null;
    setGrabbing(false);
    // A press on bare paper that went nowhere lets everything go. (§73: a press
    // on a kaartje in Lezen chose that kaartje, and keeps it.)
    if (!gesture.moved && !gesture.fromCard) {
      clearSelection();
      setSelectedEdge(null);
      setMenuOpen(false);
      setPicker(null);
    }
  };

  /* --------------------------------------------------------------- drag */

  /**
   * §67: `origin` is a **map**, and it is where every chosen card stood at the
   * press — never where it is now, or the drag would compound itself frame by
   * frame (`groupDelta`, and the reason it takes an origin at all).
   */
  const nodeDrag = useRef<{
    id: GraphNodeId;
    pointerId: number;
    startX: number;
    startY: number;
    origin: Map<GraphNodeId, { x: number; y: number }>;
    moved: boolean;
  } | null>(null);

  /** Where this hand has the cards right now, readable from a plain handler. */
  const dragRef = useRef<Record<GraphNodeId, { x: number; y: number }> | null>(null);
  dragRef.current = drag;

  /**
   * §66: which card was already chosen when this press began, and whether the
   * press travelled.
   *
   * Both are read at the *end* of a press, by the click on a card's name, and
   * neither can be read off state: the selection has already moved by then
   * (`setSelected` runs on the way down), and travel is a fact about a pointer
   * that never schedules a render. The prikbord asks the same two questions
   * through `pressWasSelected` and `pressMoved`.
   */
  const pressWasSelected = useRef<GraphNodeId | null>(null);
  const pressTravelled = useRef(false);

  const onNodePointerDown = (event: React.PointerEvent, node: GraphNode) => {
    if (event.button !== 0 || inkActive) return;
    const additive = event.shiftKey;
    const alreadySelected = selected.has(node.id);
    pressWasSelected.current = alreadySelected ? node.id : null;
    pressTravelled.current = false;
    setSelectedEdge(null);
    setMenuOpen(false);
    /*
     * §69 (3.4): and the kiezer. It is anchored to the card it was opened from,
     * so a press on another card left it hanging over a stamboom that had moved
     * on — and its "los kaartje" field would then have written a relative of the
     * card you were no longer looking at. Bare paper already closed it
     * (`onStagePointerUp`); a card did not.
     */
    setPicker(null);
    /*
     * §69: a schim is not selectable, and now it is not selectable *either
     * way*. `boxOf` has answered `null` for one since §67, so a sweep has
     * always stepped over it — but a plain click chose it, ring and all, and
     * then nothing could be done with it: it cannot be dragged, it cannot be
     * deleted, and it is not in the document to be saved. Two answers to
     * "is this thing chooseable" is one answer too many.
     */
    if (node.standing === 'ghost') {
      clearSelection();
      return;
    }
    /*
     * §67: shift toggles; a plain press on a card that is not chosen chooses
     * only it; a plain press on one that already is leaves the whole group
     * standing, because the next thing that press does is drag the group.
     */
    selection.select(node.id, additive, alreadySelected);
    /*
     * Golf M (samen): het zachte slot. Een kaartje dat een ander nu sleept,
     * kies je wel (de naam opent het artikel, lezen mag), maar het gaat niet
     * mee: de druk zegt wie het heeft, en een sleep die erop begint, schuift
     * het papier — zoals in Lezen.
     */
    const lockHere = locksRef.current.get(node.id);
    if (lockHere && editOn) sayHeld(lockHere, node.id);
    if (!editOn || lockHere) {
      /*
       * §73: in Lezen — and for a hand that may not edit at all — a finger
       * dragged across a kaartje moves the paper, not the kaartje. Nothing
       * else is taken on the way down (see `pan`).
       */
      pan.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        from: viewRef.current ?? { x: 0, y: 0, zoom: 1 },
        moved: false,
        fromCard: true,
      };
      return;
    }
    const at = layout.positions[node.id];
    if (!at) return;
    /*
     * The group as it will be a render from now — `pressSelection` on the very
     * Set the hook is about to fold in, so the cards that travel with the hand
     * and the cards that are outlined are the same cards. A ghost is left out:
     * it is not in the document and has nowhere to be put down.
     */
    const chosen = pressSelection(selected, node.id, additive, alreadySelected);
    const origin = new Map<GraphNodeId, { x: number; y: number }>();
    for (const other of graphRef.current.nodes) {
      // Golf M (samen): wat een ander in de keuze vasthoudt, blijft staan.
      if (!chosen.has(other.id) || other.standing === 'ghost' || locksRef.current.has(other.id)) continue;
      const spot = layout.positions[other.id];
      if (spot) origin.set(other.id, { x: spot.x, y: spot.y });
    }
    origin.set(node.id, { x: at.x, y: at.y });
    /*
     * §66: **no pointer capture yet.** The capture is taken the moment the
     * press turns into a drag (`onNodePointerMove`), and not one pixel before —
     * because a capture swallows the `click` the press ends with. Chromium
     * retargets the compatibility mouse events at the capture element, so with
     * the capture taken on the way *down* the name of a card was a link that
     * could never be followed: the click was delivered to the stage and the
     * `<a>` never saw it. That is a whole road out of the tree lost to a
     * gesture that had not happened yet.
     *
     * When it *is* taken it goes to the **stage**, not the card: a card is
     * unmounted and remounted by the layout as the tree rearranges round it,
     * and a capture on an element that goes away leaves the drag half-done.
     */
    nodeDrag.current = {
      id: node.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      moved: false,
    };
  };

  const onNodePointerMove = (event: React.PointerEvent) => {
    const held = nodeDrag.current;
    if (!held || held.pointerId !== event.pointerId) return;
    const zoom = viewRef.current?.zoom ?? 1;
    const dx = (event.clientX - held.startX) / zoom;
    const dy = (event.clientY - held.startY) / zoom;
    if (passedSlop(event.clientX - held.startX, event.clientY - held.startY)) {
      /*
       * Recorded before anything asks whether this hand may *move* a card: a
       * reader who cannot edit still drags a finger across the paper, and the
       * click that press ends with is no more a click than an editor's — so it
       * must not walk to the artikel either.
       */
      pressTravelled.current = true;
    }
    if (!held.moved && !passedSlop(event.clientX - held.startX, event.clientY - held.startY)) return;
    if (!held.moved) {
      held.moved = true;
      // Now, and only now: the hand is carrying something, so it may leave the
      // card and even the stage without losing it — and the trailing click is
      // swallowed with it, which is exactly right for a drag.
      try {
        stageRef.current?.setPointerCapture(event.pointerId);
      } catch {
        /* a pointer that has already gone cannot be captured; the drag ends */
      }
      setDragging(true);
    }
    // §67: every chosen card from where it stood at the press.
    const moving = groupDelta(held.origin, dx, dy);
    dragRef.current = moving;
    setDrag(moving);
    reportHand({ clientX: event.clientX, clientY: event.clientY }, moving);
  };

  /**
   * §66: **the first click on a card chooses it; the second one opens it.**
   *
   * A stamboom is arranged, not read down: a click in the middle of a thing on
   * a canvas selects it, and a name that walked away on the first press took
   * the reader off the page they were laying out — which is exactly what the
   * screenshot showed. So the walk is refused until the card is the one already
   * chosen. Three things are still the browser's, and all three are asked at
   * the *release*, because a key can go down after a press begins:
   *
   *  - a **modified** press (ctrl, cmd, shift, alt) — a reader asking for a
   *    second place to read in;
   *  - the **keyboard** (`detail === 0`: Enter on the focused link), which has
   *    no notion of "select first" and never had;
   *  - and a press that **travelled** is a drag, whose trailing click opens
   *    nothing at all, chosen or not.
   */
  const openFromName = (event: React.MouseEvent, node: GraphNode) => {
    if (event.detail === 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (pressTravelled.current) {
      event.preventDefault();
      return;
    }
    if (pressWasSelected.current !== node.id) event.preventDefault();
  };

  const endNodeDrag = (event: React.PointerEvent, commitIt: boolean) => {
    const held = nodeDrag.current;
    if (!held || held.pointerId !== event.pointerId) return;
    nodeDrag.current = null;
    setDragging(false);
    const carrying = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!held.moved || !carrying || !commitIt) {
      // Golf M (samen): nothing lands, and the hand says it is empty.
      if (held.moved) reportHand(commitIt ? { clientX: event.clientX, clientY: event.clientY } : null);
      return;
    }

    /*
     * §67: **one commit for the whole group, and therefore one undo.**
     *
     * Members and loose cards go in the same call — a selection is usually a
     * mix of the two, and two commits would be two documents on the wire, two
     * saves and, worst of all, two steps to walk back. A member that is being
     * pinned for the first time has no row yet, so this appends one; that is
     * the same "some ? map : push" the single drag did, once per moved card.
     */
    const now = Date.now();
    commit((prev) => {
      const members = prev.members.map((member) => {
        const at = carrying[`entry:${member.id}`];
        return at ? { ...member, x: at.x, y: at.y, pinned: true, updatedAt: now } : member;
      });
      const have = new Set(prev.members.map((member) => member.id));
      for (const [id, at] of Object.entries(carrying)) {
        if (!id.startsWith('entry:')) continue;
        const entryId = id.slice('entry:'.length);
        if (have.has(entryId)) continue;
        members.push({ id: entryId, x: at.x, y: at.y, pinned: true, updatedAt: now });
      }
      const loose = prev.loose.map((card) => {
        const at = carrying[`loose:${card.id}`];
        return at ? { ...card, x: at.x, y: at.y, pinned: true, updatedAt: now } : card;
      });
      return { members, loose };
      // Golf M (samen): a move never brings anybody back into the tree.
    }, { revive: false });
    // The carry sticks on the other screens until their document lands
    // (`useCarried`) — and golf M (samen): then the empty hand, at once. A
    // frame that names a card is a lock on every other screen, and it stayed
    // shut until this mouse next moved. The line sends the first one first.
    reportHand({ clientX: event.clientX, clientY: event.clientY }, carrying);
    reportHand({ clientX: event.clientX, clientY: event.clientY });
  };

  /* ------------------------------------------------------------- writes */

  const isMember = useCallback((entryId: string) => state.members.some((member) => member.id === entryId), [state.members]);

  const addMember = useCallback(
    (entryId: string, group?: StepGroup | null) => {
      if (stateRef.current.members.some((member) => member.id === entryId)) return;
      commit((prev) => ({ members: [...prev.members, { id: entryId, updatedAt: Date.now() }] }), { group });
    },
    [commit],
  );

  /**
   * §69: no question first; the answer is the *Ongedaan maken* in the toast.
   *
   * Cheap to undo here for a reason that predates this round: a stamboom's own
   * state is a document with tombstones (§66), and `undo()` lifts them by
   * re-stamping — so this needs no restore road of its own the way a speld and
   * a gebeurtenis do. It was already the case for a whole selection
   * (`removeChosen`); the single-card roads simply never offered it.
   *
   * Note what is *not* undone, and could not be: this takes the kaartje out of
   * the drawing, and the velden on the artikel are untouched either way. That
   * is the sentence the old confirm existed to say, and it is still said — in
   * the toast, where it does not cost a click.
   */
  const removeMember = useCallback(
    async (entryId: string, entryName: string) => {
      const lock = locksRef.current.get(`entry:${entryId}`);
      if (lock) {
        sayHeld(lock, `entry:${entryId}`);
        return;
      }
      commit((prev) => ({
        members: prev.members.filter((member) => member.id !== entryId),
        deletedMembers: [entryId],
        // A tie with nobody on one end is not a tie.
        ties: prev.ties.filter((tie) => !touchesEntry(tie, entryId)),
        deletedTies: prev.ties.filter((tie) => touchesEntry(tie, entryId)).map((tie) => tie.id),
      }));
      clearSelection();
      ui.toast(
        `${entryName} is uit de ${words.familyTree} gehaald; de velden op het ${words.entry} blijven staan.`,
        { label: 'Ongedaan maken', onAction: () => undo() },
      );
    },
    [commit, ui, undo, words.entry, words.familyTree, clearSelection],
  );

  /**
   * §69: likewise no question — and here the old one said *"dit is
   * definitief"*, which was the reason to ask and is no longer true. A los
   * kaartje is tree state, so `undo()` brings it back whole, with the lijnen
   * that hung off it.
   */
  const removeLoose = useCallback(
    async (looseId: string, cardName: string) => {
      const lock = locksRef.current.get(`loose:${looseId}`);
      if (lock) {
        sayHeld(lock, `loose:${looseId}`);
        return;
      }
      commit((prev) => ({
        loose: prev.loose.filter((card) => card.id !== looseId),
        deletedLoose: [looseId],
        ties: prev.ties.filter((tie) => !touchesLoose(tie, looseId)),
        deletedTies: prev.ties.filter((tie) => touchesLoose(tie, looseId)).map((tie) => tie.id),
      }));
      clearSelection();
      setSheet(null);
      ui.toast(`${cardName || `Het ${words.looseCard}`} is weggehaald.`, {
        label: 'Ongedaan maken',
        onAction: () => undo(),
      });
    },
    [commit, ui, undo, words.looseCard, clearSelection],
  );

  /**
   * §67 — **een hele selectie eruit halen: één vraag, één commit, één toast.**
   *
   * The two kinds in a selection are not the same kind of removal and the
   * question has to say so: an artikel goes on existing, with every field on it
   * untouched, and only this stamboom forgets it (§66, and the whole reason a
   * tree is a window); a los kaartje exists nowhere else and is gone for good.
   * So the body counts them separately and the confirm is asked *once* for
   * both — six sheets in a row is not six questions, it is a person clicking
   * "ja" without reading.
   *
   * One commit for the same reason the group drag has one: one document on the
   * wire and one step to walk back. The toast carries that step, the way the
   * prikbord's `removeCards` does.
   */
  const removeChosen = useCallback(
    async (asked: readonly GraphNodeId[]) => {
      // Golf M (samen): niet wat een ander nu sleept.
      const lockedNow = asked.find((id) => locksRef.current.has(id));
      if (lockedNow) sayHeld(locksRef.current.get(lockedNow)!, lockedNow);
      const ids = asked.filter((id) => !locksRef.current.has(id));
      const nodes = graphRef.current.nodes.filter(
        (node) => ids.includes(node.id) && node.standing !== 'ghost',
      );
      const memberIds = nodes.filter((node) => node.kind === 'entry').map((node) => (node as { entryId: string }).entryId);
      const looseIds = nodes.filter((node) => node.kind === 'loose').map((node) => (node as { looseId: string }).looseId);
      const total = memberIds.length + looseIds.length;
      if (!total) return;
      if (total === 1) {
        // One card keeps its own words: they name the person, which is worth
        // more than a count of one.
        const only = nodes[0];
        if (only.kind === 'loose') await removeLoose(only.looseId, only.name);
        else await removeMember(only.entryId, only.name);
        return;
      }

      /*
       * Each half is counted and worded on its own, and a renameable word
       * (`artikel`, `los kaartje`) is only ever used in the singular — the
       * Keeper may have called it something whose plural this file cannot
       * guess.
       */
      const parts: string[] = [];
      const m = memberIds.length;
      const l = looseIds.length;
      if (m) {
        parts.push(
          `${m} ${m === 1 ? 'kaartje hoort' : 'kaartjes horen'} bij een ${words.entry}: ` +
            `${m === 1 ? 'dat blijft' : 'die blijven'} bestaan, met alle velden erop — alleen deze ` +
            `${words.familyTree} vergeet ${m === 1 ? 'het' : 'ze'}.`,
        );
      }
      if (l) {
        parts.push(
          `${l} ${l === 1 ? 'kaartje heeft' : 'kaartjes hebben'} geen ${words.entry} (een ${words.looseCard}): ` +
            `${l === 1 ? 'dat bestaat' : 'die bestaan'} nergens anders, dus ` +
            `${l === 1 ? 'dat is' : 'die zijn'} definitief weg.`,
        );
      }
      const goneMembers = new Set(memberIds);
      const goneLoose = new Set(looseIds);
      // A tie with nobody on one end is not a tie — and a selection can take
      // both ends of one, so this is asked once over the whole set.
      const touched = (tie: TreeTie) =>
        [tie.from, tie.to].some((end) =>
          end.kind === 'entry' ? goneMembers.has(end.id) : goneLoose.has(end.id),
        );
      commit((prev) => ({
        members: prev.members.filter((member) => !goneMembers.has(member.id)),
        deletedMembers: memberIds,
        loose: prev.loose.filter((card) => !goneLoose.has(card.id)),
        deletedLoose: looseIds,
        ties: prev.ties.filter((tie) => !touched(tie)),
        deletedTies: prev.ties.filter(touched).map((tie) => tie.id),
      }));
      clearSelection();
      setSheet(null);
      /*
       * §69: the sentence the confirm used to carry is still said — it is just
       * said *after*, where it costs nothing. `parts` is the same wording, and
       * it matters most exactly here: a sweep can take a kaartje that is an
       * artikel (which keeps every field it has) and a los kaartje (which
       * exists nowhere else) in the same gesture, and those are not the same
       * loss. The undo covers both.
       */
      ui.toast(`${total} kaartjes uit de ${words.familyTree} gehaald. ${parts.join(' ')}`, {
        label: 'Ongedaan maken',
        onAction: () => undo(),
      });
    },
    [commit, ui, undo, words, clearSelection, removeLoose, removeMember],
  );

  /** A new los kaartje in the middle of the glass, ready to be named. */
  /**
   * §69: bare glass makes a los kaartje — a double-click on a desk, a
   * half-second press on a phone.
   *
   * A stamboom is the surface where this reads most naturally: half of drawing
   * a family is putting down a person nobody has written an artikel for yet,
   * and until round 35 the only road to one was the toolbar. It goes down where
   * the hand is, `pinned: true` like every card `addLoose` makes, so the layout
   * leaves it exactly there (§66 — a stamboom stores no layout, only the pins).
   */
  const makeOnEmpty = useMakeOnEmpty({
    // §73: making on bare paper is editing.
    enabled: editOn && !inkActive,
    ignore: '.tree-node, .tree-handle, .tree-menu, .tree-menu-anchor, .tree-line-menu, .tree-picker, .tree-line-hit',
    busy: () => pressTravelled.current,
    onMake: ({ clientX, clientY }) => {
      const el = stageRef.current;
      const current = viewRef.current ?? { x: 0, y: 0, zoom: 1 };
      const rect = el?.getBoundingClientRect();
      const at = rect
        ? toWorld(current, clientX - rect.left, clientY - rect.top)
        : toWorld(current, clientX, clientY);
      addLoose('', at);
    },
  });

  /*
   * §72: the knijp. This file multiplied the zoom by the change since the last
   * frame and never panned with the hand, so two fingers that slid while they
   * spread left the tree behind them; and a finger whose up was lost stayed in
   * its list and turned the next single finger into a knijp against a ghost.
   */
  const pinchHand = usePinch({
    stageRef,
    read: () => viewRef.current ?? { x: 0, y: 0, zoom: 1 },
    write: (next) => {
      viewRef.current = next;
      moveView(() => next);
    },
    onStart: () => {
      makeOnEmpty.cancel();
      cancelConnect();
      pan.current = null;
      setGrabbing(false);
      if (nodeDrag.current) {
        // A kaartje half-way somewhere goes back: the hand became a knijp, not a drop.
        nodeDrag.current = null;
        setDragging(false);
        dragRef.current = null;
        setDrag(null);
      }
    },
  });

  const addLoose = useCallback(
    (
      cardName: string,
      at?: { x: number; y: number },
      // §67: *ties*, plural — the shared handle hangs one new card off two.
      ties?: readonly { handle: HandleRole; other: GraphNodeId }[],
    ) => {
      const id = newLooseId();
      const centre = at ?? toWorld(viewRef.current ?? { x: 0, y: 0, zoom: 1 }, size.width / 2, size.height / 2);
      const now = Date.now();
      const card: LooseCard = {
        id,
        name: cardName.trim(),
        frame: 'unknown',
        x: centre.x - NODE_SIZE.unknown.width / 2,
        y: centre.y - NODE_SIZE.unknown.height / 2,
        pinned: true,
        updatedAt: now,
      };
      commit((prev) => ({
        loose: [...prev.loose, card],
        // The new card is the *target* of the handle that was pressed on
        // `other`, so each tie runs the way `tieFor` says it does.
        ...(ties?.length
          ? { ties: [...prev.ties, ...ties.map((one) => tieFor(one.handle, one.other, `loose:${id}`, now))] }
          : {}),
      }));
      selectOne(`loose:${id}`);
      return id;
    },
    [commit, size, selectOne],
  );

  const saveLoose = useCallback(
    (looseId: string, patch: { name?: string; text?: string; frame?: FrameKind }) => {
      commit((prev) => ({
        loose: prev.loose.map((card) =>
          card.id === looseId ? { ...card, ...patch, updatedAt: Date.now() } : card,
        ),
      }));
    },
    [commit],
  );

  /**
   * §66: the one road that writes a **field on an artikel**. Everything the
   * gate, the mirroring, the mentions, the revision and the voorstel road do
   * happens on the far side of this; the tree's own state is not touched.
   */
  const writeRelation = useCallback(
    async (
      entryId: string,
      fieldKey: string,
      targetId: string,
      remove = false,
      /** Golf M (herstel): the gesture this line is part of, if any (`runStep`). */
      group?: StepGroup | null,
    ): Promise<OpOutcome> => {
      const op: RelationOp = { entryId, fieldKey, targetId, add: !remove };
      const { outcome, error, replaced } = await postRelation(op);
      if (outcome === 'refused') ui.toast(error ?? 'Dat is niet gelukt.');
      if (outcome === 'proposed') ui.toast('Als voorstel ingediend.');
      /*
       * Golf M: a ref that really changed goes on the stack — in the gesture
       * it belongs to, or as a step of its own. A voorstel changed nothing yet
       * (the Keeper decides) and an `unchanged` changed nothing at all, so
       * neither is anything to take back.
       */
      if (outcome === 'landed') {
        // Golf M (herstel): a `+` that replaced somebody in a one-box field is
        // two ops — the old ref out, then the new one in (`landedOps`).
        const ops = landedOps(op, replaced);
        if (group) group.relations.push(...ops);
        else pushStep({ relations: ops });
      }
      return outcome;
    },
    [postRelation, ui, pushStep],
  );

  const promoteLoose = useCallback(
    async (looseId: string, entryId: string) => {
      try {
        const response = await fetch(`/api/family-trees/${tree.id}/promote`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ looseId, entryId, clientId }),
        });
        const data = (await response.json()) as {
          state?: FamilyTreeState;
          graph?: FamilyGraph;
          dropped?: number;
          error?: string;
        };
        if (!response.ok || !data.state || !data.graph) {
          ui.toast(data.error ?? 'Dat is niet gelukt.');
          return;
        }
        applyDocument(data.state, data.graph, sync.pending());
        setSheet(null);
        selectOne(`entry:${entryId}`);
        if (data.dropped) {
          ui.toast(`${data.dropped} ${data.dropped === 1 ? 'lijn is' : 'lijnen zijn'} niet overgezet.`);
        }
        refreshArchive();
      } catch {
        ui.toast('Geen verbinding.');
      }
    },
    [tree.id, clientId, ui, applyDocument, sync, refreshArchive, selectOne],
  );

  /*
   * §34/§66: the name is not this component's any more. It is the page's §34
   * heading (`components/families/TreeTitle.tsx`), which PATCHes the same route
   * — printing it here as well gave a telephone two rows saying one thing.
   */

  /* ------------------------------------------------------------- handles */

  const nodeById = useCallback(
    (id: GraphNodeId | null): GraphNode | null => (id ? (graph.nodes.find((node) => node.id === id) ?? null) : null),
    [graph.nodes],
  );
  const selectedNode = nodeById(onlySelected);
  /** Everything chosen that is really on the paper — a ghost is in no selection. */
  const chosenNodes = useMemo(
    () => graph.nodes.filter((node) => selected.has(node.id) && node.standing !== 'ghost'),
    [graph.nodes, selected],
  );

  /** Which field a handle would write, or null when the soort has none. */
  const fieldFor = useCallback(
    (node: GraphNode, role: HandleRole): RoleFieldInfo | null => {
      if (node.kind !== 'entry') return null;
      const fields = graph.roleFields[node.entryId] ?? [];
      return fields.find((field) => field.role === role) ?? null;
    },
    [graph.roleFields],
  );

  /*
   * §67: four now, one per side of the card. `sibling` writes the
   * `Broers en zussen` field exactly the way the other three write theirs, and
   * is disabled with the same sentence when the soort has no field of that
   * role — a missing handle is a mystery, a disabled one with an instruction is
   * an instruction.
   */
  const offersFor = useCallback(
    (node: GraphNode): HandleOffer[] =>
      (['parent', 'child', 'partner', 'sibling'] as HandleRole[]).map((role) => {
        const label = `${ROLE_LABELS[role]} toevoegen`;
        if (node.kind === 'loose') return { role, enabled: true, label };
        const field = fieldFor(node, role);
        return field
          ? { role, enabled: true, label: `${field.label} toevoegen` }
          : {
              role,
              enabled: false,
              label,
              hint: `Deze soort heeft geen veld met de rol ${ROLE_LABELS[role]} — voeg het toe in Beheer → Soorten.`,
            };
      }),
    [fieldFor],
  );

  /** The ghosts of this role hanging off this node — the cheapest way in. */
  const ghostsFor = useCallback(
    (node: GraphNode, role: HandleRole): GraphNode[] => {
      const out: GraphNode[] = [];
      for (const edge of graph.edges) {
        const wants =
          role === 'parent'
            ? edge.role === 'parent' && edge.to === node.id
            : role === 'child'
              ? edge.role === 'parent' && edge.from === node.id
              : // partner and sibling are both undirected: either end will do.
                edge.role === role && (edge.from === node.id || edge.to === node.id);
        if (!wants) continue;
        const otherId = edge.from === node.id ? edge.to : edge.from;
        const other = graph.nodes.find((item) => item.id === otherId);
        if (other && other.standing === 'ghost' && !out.includes(other)) out.push(other);
      }
      return out;
    },
    [graph],
  );

  const openPicker = useCallback(
    (node: GraphNode, role: HandleRole) => {
      const at = layout.positions[node.id];
      const size2 = sizes[node.id] ?? NODE_SIZE.mortal;
      if (!at) return;
      // The box opens under the handle that was pressed, so it is obvious which
      // of the four sides asked the question. §67 added the left one.
      const anchor =
        role === 'parent'
          ? { x: at.x + size2.width / 2, y: at.y }
          : role === 'child'
            ? { x: at.x + size2.width / 2, y: at.y + size2.height }
            : role === 'sibling'
              ? { x: at.x, y: at.y + size2.height / 2 }
              : { x: at.x + size2.width, y: at.y + size2.height / 2 };
      setMenuOpen(false);
      setPicker({ nodeId: node.id, role, at: toScreen(anchor) });
    },
    [layout.positions, sizes, toScreen],
  );

  /**
   * §67 — de gedeelde handgreep: één kind, twee ouders, één gebaar.
   *
   * Offered when exactly two artikelen are chosen and both soorten carry a
   * field with the role Kind. It opens the same picker, marked `both`, and the
   * picker then skips the second-parent step: it has both already.
   */
  const bothParents = useMemo<[GraphNode, GraphNode] | null>(() => {
    if (chosenNodes.length !== 2) return null;
    const [a, b] = chosenNodes;
    if (a.kind !== 'entry' || b.kind !== 'entry') return null;
    if (a.standing !== 'member' || b.standing !== 'member') return null;
    return [a, b];
  }, [chosenNodes]);

  const openBothPicker = useCallback(() => {
    if (!bothParents) return;
    const [a, b] = bothParents;
    const boxA = boxOf(a.id);
    const boxB = boxOf(b.id);
    if (!boxA || !boxB) return;
    setMenuOpen(false);
    setPicker({
      nodeId: a.id,
      role: 'child',
      at: toScreen(betweenBoxes(boxA, boxB)),
      both: [a.id, b.id],
    });
  }, [bothParents, boxOf, toScreen]);

  /**
   * §67 — één ouder aan één kind, welke weg er ook open ligt.
   *
   * Three roads, in this order, and the order is the point:
   *
   *  1. the **parent's own** field with the role Kind — the one the `+ kind`
   *     handle is named after, and the one the mirror fills the other side of;
   *  2. failing that, the **child's** field with the role Ouder, written from
   *     the other end. The mirror then puts it on the parent's page if that
   *     soort has anywhere for it to go;
   *  3. and if the two ends are not both artikelen, a **tie** the tree owns —
   *     because a los kaartje has no page to write a field on (§66).
   *
   * When neither soort has a field for it, nothing is written and the toast
   * says which one is missing, in the same words the disabled handles use.
   */
  const linkParent = useCallback(
    async (
      parent: { nodeId: GraphNodeId; entryId?: string; name: string },
      child: { nodeId: GraphNodeId; entryId?: string; name: string },
      group?: StepGroup | null,
    ): Promise<boolean> => {
      if (parent.entryId && child.entryId) {
        const onParent = (graphRef.current.roleFields[parent.entryId] ?? []).find((f) => f.role === 'child');
        if (onParent) return (await writeRelation(parent.entryId, onParent.key, child.entryId, false, group)) !== 'refused';
        const onChild = (graphRef.current.roleFields[child.entryId] ?? []).find((f) => f.role === 'parent');
        if (onChild) return (await writeRelation(child.entryId, onChild.key, parent.entryId, false, group)) !== 'refused';
        ui.toast(`${child.name} heeft geen veld met de rol ${ROLE_LABELS.parent}.`);
        return false;
      }
      const now = Date.now();
      commit((prev) => ({
        ties: [
          ...prev.ties,
          {
            id: newTieId(),
            from: parseRef(parent.nodeId),
            to: parseRef(child.nodeId),
            role: 'parent' as FieldRole,
            updatedAt: now,
          },
        ],
      }), { group });
      return true;
    },
    [writeRelation, commit, ui],
  );

  /**
   * Somebody chosen in the picker, hung on the node the picker opened for.
   *
   * §67: a `+ kind` does **not** close on the answer. A child usually has two
   * parents, and the second one is a question this box can ask in the same
   * breath — the alternative is walking to the other artikel and typing it
   * there, which is exactly the walk a stamboom exists to save. The other three
   * handles close as they always did: a parent, a partner and a sibling are one
   * fact each.
   */
  const attachNow = useCallback(
    async (source: GraphNode, role: HandleRole, target: { id: string; name: string }, group: StepGroup) => {
      const childId: GraphNodeId = `entry:${target.id}`;
      /* §101: waar we stonden, vóór de tekening opnieuw uitgerekend wordt. */
      markPlace(source.id, childId);
      // Solid straight away: the person is in the tree, then the field is
      // written. The other order leaves them a ghost for a round trip.
      addMember(target.id, group);

      const both = pickerRef.current?.both;
      if (role === 'child' && both) {
        setPicker(null);
        for (const parentId of both) {
          const parent = graphRef.current.nodes.find((node) => node.id === parentId);
          if (!parent) continue;
          await linkParent(
            {
              nodeId: parentId,
              entryId: parent.kind === 'entry' ? parent.entryId : undefined,
              name: parent.name,
            },
            { nodeId: childId, entryId: target.id, name: target.name },
            group,
          );
        }
        selectOne(childId);
        return;
      }

      if (source.kind === 'entry') {
        const field = fieldFor(source, role);
        if (!field) {
          setPicker(null);
          return;
        }
        await writeRelation(source.entryId, field.key, target.id, false, group);
      } else {
        // A los kaartje has no page to write a field on, so the line is the
        // tree's own (§66: a tie with at least one loose end).
        const now = Date.now();
        commit((prev) => ({ ties: [...prev.ties, tieFor(role, source.id, childId, now)] }), { group });
      }
      selectOne(childId);
      if (role === 'child') {
        setPicker((current) =>
          current ? { ...current, child: { id: childId, name: target.name } } : current,
        );
      } else {
        setPicker(null);
      }
    },
    [fieldFor, addMember, writeRelation, commit, selectOne, linkParent, markPlace],
  );
  /** Golf M: the card coming in and the field that joins it are one step. */
  const attach = useCallback(
    (source: GraphNode, role: HandleRole, target: { id: string; name: string }, outer?: StepGroup | null) =>
      runStep((group) => attachNow(source, role, target, group), outer),
    [runStep, attachNow],
  );

  /** And a los kaartje hung on whatever the picker opened for. */
  const attachLoose = useCallback(
    (source: GraphNode, role: HandleRole, cardName: string) => {
      const at = layout.positions[source.id];
      const size2 = sizes[source.id] ?? NODE_SIZE.mortal;
      const spot = at
        ? {
            x:
              at.x +
              size2.width / 2 +
              (role === 'partner' ? size2.width + 60 : role === 'sibling' ? -(size2.width + 60) : 0),
            y:
              at.y +
              size2.height / 2 +
              (role === 'parent' ? -(size2.height + 110) : role === 'child' ? size2.height + 110 : 0),
          }
        : undefined;
      const both = pickerRef.current?.both;
      if (role === 'child' && both) {
        setPicker(null);
        // One commit, two ties: the card and both its parents in one step of
        // the undo stack.
        const made = addLoose(cardName, spot, both.map((other) => ({ handle: role, other })));
        markPlace(source.id, `loose:${made}`);
        return;
      }
      const id = addLoose(cardName, spot, [{ handle: role, other: source.id }]);
      /* §101: de tekening schuift ook van een los kaartje — dus ook hier. */
      markPlace(source.id, `loose:${id}`);
      if (role === 'child') {
        setPicker((current) =>
          current ? { ...current, child: { id: `loose:${id}`, name: cardName.trim() } } : current,
        );
      } else {
        setPicker(null);
      }
    },
    [layout.positions, sizes, addLoose, markPlace],
  );

  /**
   * §67 — de tweede ouder, als er een is.
   *
   * Nothing is preselected and "Overslaan" is one keystroke away, because the
   * suggestions are the source's *partners* and **a partner is not a parent**.
   * Two people standing side by side in a stamboom are a couple, which is a
   * fact about the two of them and says nothing at all about whose child this
   * is; offering the partner already ticked would write that guess onto two
   * artikelen every time somebody pressed Enter.
   */
  const addSecondParent = useCallback(
    async (
      child: { id: GraphNodeId; name: string },
      pick: { nodeId?: GraphNodeId; entryId?: string; name: string },
    ) => {
      setPicker(null);
      /* §101: de tweede ouder schuift de tekening nog een keer; het kind is
         waar je naar keek, dus dat blijft staan waar het stond. */
      markPlace(child.id, pick.nodeId ?? (pick.entryId ? `entry:${pick.entryId}` : null));
      // Golf M: the second parent is an answer of its own, and one step.
      await runStep(async (group) => {
        if (pick.entryId) addMember(pick.entryId, group);
        const childEntryId = child.id.startsWith('entry:') ? child.id.slice('entry:'.length) : undefined;
        await linkParent(
          {
            nodeId: pick.nodeId ?? (pick.entryId ? `entry:${pick.entryId}` : child.id),
            entryId: pick.entryId,
            name: pick.name,
          },
          { nodeId: child.id, entryId: childEntryId, name: child.name },
          group,
        );
      });
    },
    [addMember, linkParent, markPlace, runStep],
  );

  /** The people this node is drawn beside — the second-parent suggestions. */
  const partnersOf = useCallback(
    (nodeId: GraphNodeId): GraphNode[] => {
      const out: GraphNode[] = [];
      for (const edge of graph.edges) {
        if (edge.role !== 'partner') continue;
        if (edge.from !== nodeId && edge.to !== nodeId) continue;
        const otherId = edge.from === nodeId ? edge.to : edge.from;
        const other = graph.nodes.find((node) => node.id === otherId);
        if (other && !out.includes(other)) out.push(other);
      }
      return out;
    },
    [graph],
  );

  /* ------------------------------------------------------- a line's fate */

  /**
   * Golf M: and since then it can be taken back. A field line is rubbed out
   * through `writeRelation` like before, but the ref it removed goes on the
   * undo stack; a tie was always tree state. Either way a toast says so and
   * carries the *Ongedaan maken* — the same step Ctrl+Z would take.
   */
  const removeLine = useCallback(
    async (edge: GraphEdge) => {
      setSelectedEdge(null);
      setContextMenu(null);
      const source = edge.source;
      let step: TreeStep | undefined;
      if (source.kind === 'field') {
        // A line read off a field is unwritten on the *artikel* — the same road
        // in reverse, so the mirror, the gate and the voorstel all apply.
        const outcome = await writeRelation(source.entryId, source.fieldKey, source.targetId, true);
        if (outcome !== 'landed') return;
        step = undoStack.current.peek();
      } else {
        // §67: a derived line is nobody's to remove — it follows from two fields.
        if (source.kind !== 'tie') return;
        commit((prev) => ({
          ties: prev.ties.filter((tie) => tie.id !== source.tieId),
          deletedTies: [source.tieId],
        }));
        step = undoStack.current.peek();
      }
      ui.toast(
        fill(words.treeLineRemoved, { Lijn: capitalise(words.treeLine), lijn: words.treeLine }),
        { label: words.treeUndoAction, onAction: () => undoIfLast(step) },
        { key: 'tree-line-removed' },
      );
    },
    [writeRelation, commit, ui, words, undoIfLast],
  );

  /* ------------------------------------------ golf M: a child on the line */

  /**
   * Golf M — the `+` on a line between two parents, and under a bar that hangs
   * from one. Which parents, where the `+` stands, and whether it can work:
   * a card that is only a schim has no place in this tree to be a parent from,
   * and an artikel whose soort has no field with the role Kind is disabled
   * with the sentence the shared handle uses. A los kaartje always can: it
   * writes a tie.
   */
  const childLineFor = useCallback(
    (edgeId: string | null) => {
      if (!edgeId) return null;
      const line = lines.find((one) => one.edge.id === edgeId);
      if (!line) return null;
      const edge = line.edge;
      let parentIds: GraphNodeId[];
      let at: Point;
      if (edge.role === 'partner') {
        parentIds = [edge.from, edge.to];
        at = line.at;
      } else if (edge.role === 'parent' || edge.role === 'child') {
        const parent = edge.role === 'child' ? edge.to : edge.from;
        const child = edge.role === 'child' ? edge.from : edge.to;
        const union = layout.unions.find((item) => item.children.includes(child) && item.parents.includes(parent));
        if (!union) return null;
        parentIds = union.parents;
        at = line.at;
      } else {
        return null;
      }
      const parents = parentIds.map((id) => graph.nodes.find((node) => node.id === id));
      if (!parents.length || parents.length > 2) return null;
      if (parents.some((node) => !node || node.standing === 'ghost')) return null;
      const nodes = parents as GraphNode[];
      const without = nodes.find((node) => node.kind === 'entry' && !fieldFor(node, 'child')) ?? null;
      const label =
        nodes.length === 2
          ? fill(words.treeLineChildOf, { a: nodes[0].name, b: nodes[1].name })
          : fill(words.treeLineChildOfOne, { a: nodes[0].name });
      return {
        edgeId,
        parents: nodes,
        at,
        label,
        enabled: !without,
        hint: without
          ? `De soort van ${without.name} heeft geen veld met de rol ${ROLE_LABELS.child} — voeg het toe in Beheer → Soorten.`
          : undefined,
      };
    },
    [lines, layout.unions, graph.nodes, fieldFor, words],
  );

  /** The picker, opened for a child of these parents — both fixed when there are two. */
  const openChildOf = useCallback(
    (parents: GraphNode[], at: Point) => {
      setContextMenu(null);
      setMenuOpen(false);
      if (parents.length === 1) {
        selectOne(parents[0].id);
        openPicker(parents[0], 'child');
        return;
      }
      const [a, b] = parents;
      setSelectedEdge(null);
      setPicker({ nodeId: a.id, role: 'child', at: toScreen(at), both: [a.id, b.id] });
    },
    [openPicker, selectOne, toScreen],
  );

  /** The line under the pointer, kept a beat after it leaves so the `+` can be reached. */
  const hoverLine = useCallback((edgeId: string | null) => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (edgeId) {
      setHoverEdge(edgeId);
      return;
    }
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      setHoverEdge(null);
    }, 350);
  }, []);
  useEffect(
    () => () => {
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    },
    [],
  );

  /* ---------------------------------------------- golf M: the right button */

  const stagePoint = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : { x: event.clientX, y: event.clientY };
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  /* ------------------------------------------- golf M: drag to connect */

  const cancelConnect = useCallback(() => {
    connectRef.current = null;
    if (connectFrame.current !== null) cancelAnimationFrame(connectFrame.current);
    connectFrame.current = null;
    setConnect(null);
  }, []);

  /**
   * A press on an enabled `+`, with a mouse or a pen. Nothing happens until
   * the press passes the slop: a plain click is still the kiezer. A finger
   * keeps today's tap — on a phone a drag across the glass is a pan, and a
   * line pulled out of a `+` would fight it.
   */
  const onHandlePress = useCallback(
    (role: HandleRole, event: React.PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0 || !editOn || inkActive) return;
      const sourceId = onlySelected;
      const box = sourceId ? boxOf(sourceId) : null;
      if (!sourceId || !box) return;
      const from: Point =
        role === 'parent'
          ? { x: box.x + box.width / 2, y: box.y }
          : role === 'child'
            ? { x: box.x + box.width / 2, y: box.y + box.height }
            : role === 'partner'
              ? { x: box.x + box.width, y: box.y + box.height / 2 }
              : { x: box.x, y: box.y + box.height / 2 };
      connectSwallow.current = false;
      connectRef.current = {
        pointerId: event.pointerId,
        role,
        sourceId,
        from,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        target: null,
        clientX: event.clientX,
        clientY: event.clientY,
      };
    },
    [editOn, inkActive, onlySelected, boxOf],
  );

  const onConnectMove = (event: React.PointerEvent) => {
    const held = connectRef.current;
    if (!held || held.pointerId !== event.pointerId) return;
    if (!held.moved) {
      if (!passedSlop(event.clientX - held.startX, event.clientY - held.startY)) return;
      held.moved = true;
      connectSwallow.current = true;
      setMenuOpen(false);
      try {
        stageRef.current?.setPointerCapture(event.pointerId);
      } catch {
        /* a pointer that has already gone cannot be captured */
      }
    }
    held.clientX = event.clientX;
    held.clientY = event.clientY;
    /*
     * Golf M (herstel): a pointer reports more often than the screen draws,
     * and every move used to render the whole stamboom and ask
     * `elementFromPoint` and `connectVerdict` again. Now: one look per frame.
     */
    if (connectFrame.current === null) {
      connectFrame.current = requestAnimationFrame(() => {
        connectFrame.current = null;
        placeConnect();
      });
    }
  };

  /** Golf M (herstel): where the pulled line's end is, and what it would land on — once per frame. */
  const placeConnect = () => {
    const held = connectRef.current;
    if (!held || !held.moved) return;
    const rect = stageRef.current?.getBoundingClientRect();
    const point = rect ? { x: held.clientX - rect.left, y: held.clientY - rect.top } : { x: held.clientX, y: held.clientY };
    const to = toWorld(viewRef.current ?? { x: 0, y: 0, zoom: 1 }, point.x, point.y);
    const under = document.elementFromPoint(held.clientX, held.clientY)?.closest('.tree-node');
    const candidate = under?.getAttribute('data-node-id') ?? null;
    const target =
      candidate &&
      graphRef.current.nodes.some((node) => node.id === candidate) &&
      connectVerdict({ source: held.sourceId, target: candidate, role: held.role, edges: graphRef.current.edges }) === 'ok'
        ? (candidate as GraphNodeId)
        : null;
    const line = connectLineRef.current;
    if (line) {
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y));
    }
    // React only for a line that is not drawn yet, or that lands somewhere else.
    if (!line || target !== held.target) {
      held.target = target;
      setConnect({ from: held.from, to, target });
    }
  };

  /** Golf M: let go on a card and the line is drawn; anywhere else, nothing is. */
  const connectTo = useCallback(
    (source: GraphNode, role: HandleRole, target: GraphNode) =>
      runStep(async (group) => {
        if (target.kind === 'entry') {
          await attach(source, role, { id: target.entryId, name: target.name }, group);
          return;
        }
        markPlace(source.id, target.id);
        const now = Date.now();
        commit((prev) => ({ ties: [...prev.ties, tieFor(role, source.id, target.id, now)] }), { group });
        selectOne(target.id);
      }),
    [runStep, attach, markPlace, commit, selectOne],
  );

  const endConnect = (event: React.PointerEvent, land: boolean) => {
    const held = connectRef.current;
    if (!held || held.pointerId !== event.pointerId) return;
    // Golf M (herstel): the last move may still be waiting for its frame.
    if (connectFrame.current !== null && land) {
      held.clientX = event.clientX;
      held.clientY = event.clientY;
      placeConnect();
    }
    cancelConnect();
    // A click on the `+` that never became a drag: the click opens the kiezer.
    if (!held.moved) return;
    // The click the drag ends with belongs to no button; let it go by, then forget.
    window.setTimeout(() => {
      connectSwallow.current = false;
    }, 0);
    if (!land || !held.target) return;
    const source = graphRef.current.nodes.find((node) => node.id === held.sourceId);
    const target = graphRef.current.nodes.find((node) => node.id === held.target);
    if (!source || !target) return;
    askThen(() => void connectTo(source, held.role, target));
  };

  /* ---------------------------------------------- golf M: the line of one */

  /**
   * Golf M: with exactly one card chosen, the people outside its line are
   * dimmed (`lib/families/lineage.ts`). Nothing is dimmed while a card with
   * no relatives at all is chosen — a picture where everybody but one person
   * fades says nothing about that person.
   */
  const lineage = useMemo(() => {
    if (!onlySelected) return null;
    const node = graph.nodes.find((one) => one.id === onlySelected);
    if (!node || node.standing === 'ghost') return null;
    const set = lineageOf(graph.edges, onlySelected);
    return set.size > 1 ? set : null;
  }, [onlySelected, graph.nodes, graph.edges]);

  /* ------------------------------------------------------------ toolbar */

  const ghosts = useMemo(() => graph.nodes.filter((node) => node.standing === 'ghost'), [graph.nodes]);

  const adoptAll = useCallback(() => {
    const ids = ghosts.filter((node) => node.kind === 'entry').map((node) => (node as { entryId: string }).entryId);
    if (!ids.length) return;
    const now = Date.now();
    commit((prev) => {
      const have = new Set(prev.members.map((member) => member.id));
      return {
        members: [...prev.members, ...ids.filter((id) => !have.has(id)).map((id) => ({ id, updatedAt: now }))],
      };
    });
  }, [ghosts, commit]);

  const rearrange = useCallback(() => {
    const now = Date.now();
    commit((prev) => ({
      members: prev.members.map((member) =>
        member.pinned ? ({ id: member.id, updatedAt: now } as TreeMember) : member,
      ),
      loose: prev.loose.map((card) =>
        card.pinned
          ? ({ id: card.id, name: card.name, text: card.text, frame: card.frame, updatedAt: now } as LooseCard)
          : card,
      ),
    }));
  }, [commit]);

  /* ------------------------------------------------------------ keyboard */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        if (event.key !== 'Escape') return;
      }
      if (event.key === 'Escape') {
        if (onInkKey(event)) return;
        // Golf M: the newest layers first — a line being pulled, the menu the
        // right button opened.
        if (connectRef.current) {
          cancelConnect();
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (picker) {
          setPicker(null);
          return;
        }
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        if (selectedEdge) {
          setSelectedEdge(null);
          return;
        }
        clearSelection();
        return;
      }
      // §33/§67: in the tekenmodus Ctrl+Z lifts your own last streek; outside
      // it, the tree's own undo.
      if (onInkKey(event)) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.altKey && (key === 'z' || key === 'y')) {
        // §73: in Lezen there is nothing of this hand's to take back.
        if (!editOn) return;
        event.preventDefault();
        // Golf M: Ctrl/⌘+Shift+Z and Ctrl+Y walk forward again.
        if (key === 'y' || event.shiftKey) void redo();
        else void undo();
        return;
      }
      /*
       * §69: `+`, `−` and `0` move the camera, the way the tijdlijn has always
       * let them. A reader may press them too — they change nothing anybody
       * else can see — so they sit above the `canEdit` gate.
       */
      const camera = cameraKey(event);
      if (camera) {
        event.preventDefault();
        if (camera === 'fit') fitAll();
        else zoomBy(camera === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP);
        return;
      }
      // §73: Delete and Backspace take something away, so they wait for Bewerken.
      if (!editOn || sheet) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // A key that lands while a kiezer or a menu is open is theirs.
        if (picker || contextMenu) return;
        if (selected.size) {
          event.preventDefault();
          // §67: one or six, the same road — `removeChosen` asks the one question
          // that fits what is chosen and makes the one commit that undoes it.
          void removeChosen([...selected]);
          return;
        }
        // Golf M: a chosen line goes the way *Lijn verwijderen* sends it — and
        // a derived one is nobody's to take away, from the keyboard either.
        const line = selectedEdge ? lines.find((one) => one.edge.id === selectedEdge) : undefined;
        if (!line || line.edge.source.kind === 'derived') return;
        event.preventDefault();
        askThen(() => void removeLine(line.edge));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    onInkKey,
    picker,
    menuOpen,
    selectedEdge,
    selected,
    editOn,
    sheet,
    undo,
    redo,
    removeChosen,
    removeLine,
    lines,
    askThen,
    contextMenu,
    cancelConnect,
    clearSelection,
    fitAll,
    zoomBy,
  ]);

  /* ------------------------------------------------------------ the e2e seam */

  useEffect(() => {
    // The web does the same (`window.__web`): a spec running against a
    // production build has no other honest way to find a card on the glass.
    (window as unknown as { __tree?: unknown }).__tree = {
      positions: layout.positions,
      view: glass,
      nodes: () => graphRef.current.nodes,
      // §67: and which of them are chosen, for the same reason.
      selected: () => [...selected],
    };
  }, [layout.positions, glass, selected]);

  /* --------------------------------------------------------------- render */

  const pickerNode = picker ? nodeById(picker.nodeId) : null;
  const pickerField = pickerNode && picker ? fieldFor(pickerNode, picker.role) : null;
  const editing = sheet ? (state.loose.find((card) => card.id === sheet.looseId) ?? null) : null;
  const selectedLine = selectedEdge ? (lines.find((line) => line.edge.id === selectedEdge) ?? null) : null;
  const empty = !state.members.length && !state.loose.length;

  /**
   * §67: where the `…` for a whole selection sits — the top-right corner of
   * everything chosen, so it never lands on top of one of the cards.
   */
  const selectionBounds = useMemo(() => {
    if (chosenNodes.length < 2) return null;
    let minY = Infinity;
    let maxX = -Infinity;
    for (const node of chosenNodes) {
      const box = boxOf(node.id);
      if (!box) continue;
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
    }
    if (!Number.isFinite(minY) || !Number.isFinite(maxX)) return null;
    return { x: maxX, y: minY };
  }, [chosenNodes, boxOf]);

  /** The shared handle's field, and why it might not be offered. */
  const bothField = bothParents
    ? {
        a: fieldFor(bothParents[0], 'child'),
        b: fieldFor(bothParents[1], 'child'),
      }
    : null;

  const menuFor = (node: GraphNode): TreeMenuItem[] => {
    const items: TreeMenuItem[] = [];
    if (node.kind === 'entry') {
      items.push({
        key: 'open',
        label: 'Openen',
        icon: 'file',
        onSelect: () => router.push(`/e/${node.slug}`),
      });
      // §73: `Openen` is reading and stays; the rest changes the drawing.
      // §101: en alles wat de tekening verandert vraagt eerst met wie je
      // schrijft, want het lijstje zelf vraagt sinds deze ronde niets meer.
      if (editOn && node.standing === 'member') {
        items.push({
          key: 'out',
          label: `Uit de ${words.familyTree}`,
          icon: 'close',
          danger: true,
          onSelect: () => askThen(() => void removeMember(node.entryId, node.name)),
        });
      }
      if (editOn && node.standing === 'ghost') {
        items.push({
          key: 'in',
          label: 'Erbij',
          icon: 'plus',
          onSelect: () => askThen(() => addMember(node.entryId)),
        });
      }
      return items;
    }
    if (editOn) {
      items.push({
        key: 'edit',
        label: 'Bewerken',
        icon: 'edit',
        onSelect: () => askThen(() => setSheet({ looseId: node.looseId })),
      });
      items.push({
        key: 'promote',
        label: `${capitalise(words.entry)} aanmaken`,
        icon: 'plus',
        onSelect: () =>
          askThen(() => {
            ui.openNewEntry({
              name: node.name,
              shortDescription: node.text,
              caseId: tree.caseId ?? undefined,
              onCreated: (created) => void promoteLoose(node.looseId, created.id),
            });
          }),
      });
      items.push({
        key: 'remove',
        label: 'Weghalen',
        icon: 'trash',
        danger: true,
        onSelect: () => askThen(() => void removeLoose(node.looseId, node.name)),
      });
    }
    return items;
  };

  /**
   * Golf M — de rechtermuisknop op een kaartje: its own `…`, at the pointer.
   *
   * §68 still holds where it was about: a *link* is the browser's, so a right
   * press on the name (the `<a>` to the artikel) opens the browser's menu with
   * "open in a new tab" on it, and so does a press on a card this hand has
   * nothing to offer for. Only where the canvas has a menu does it take the
   * button, and only there is `preventDefault` called. A card inside a group
   * that is chosen gets the group's menu, as its `…` would.
   */
  const onNodeContextMenu = (event: React.MouseEvent, node: GraphNode) => {
    if (inkActive || connectRef.current) return;
    if ((event.target as HTMLElement).closest('a')) return;
    let items: TreeMenuItem[];
    let label: string;
    if (editOn && chosenNodes.length > 1 && selected.has(node.id)) {
      items = [
        {
          key: 'out',
          label: `${chosenNodes.length} uit de ${words.familyTree}`,
          icon: 'close',
          danger: true,
          onSelect: () => askThen(() => void removeChosen(chosenNodes.map((one) => one.id))),
        },
      ];
      label = `Meer bij ${chosenNodes.length} kaartjes`;
    } else {
      items = menuFor(node);
      label = fill(words.treeMenuOf, { naam: node.name || capitalise(words.looseCard) });
      if (!items.length) return;
      if (node.standing === 'ghost') clearSelection();
      else selectOne(node.id);
    }
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(false);
    setPicker(null);
    setSelectedEdge(null);
    setContextMenu({ at: stagePoint(event), label, items });
  };

  /** Golf M — and on a line: *Kind toevoegen* where a child can hang, and the line's own fate. */
  const onLineContextMenu = (event: React.MouseEvent, edge: GraphEdge) => {
    if (inkActive || !editOn || !canEdit) return;
    const items: TreeMenuItem[] = [];
    const child = childLineFor(edge.id);
    if (child?.enabled) {
      items.push({
        key: 'child',
        label: words.treeMenuAddChild,
        icon: 'plus',
        onSelect: () => askThen(() => openChildOf(child.parents, child.at)),
      });
    }
    if (edge.source.kind !== 'derived') {
      items.push({
        key: 'remove',
        label: `${capitalise(words.treeLine)} verwijderen`,
        icon: 'close',
        danger: true,
        onSelect: () => askThen(() => void removeLine(edge)),
      });
    }
    if (!items.length) return;
    event.preventDefault();
    event.stopPropagation();
    clearSelection();
    setMenuOpen(false);
    setPicker(null);
    // Not chosen: the line's own menu and its `+` would stand beside this one
    // and say the same things twice.
    setSelectedEdge(null);
    setContextMenu({ at: stagePoint(event), label: fill(words.treeMenuOf, { naam: edge.label || words.treeLine }), items });
  };

  return (
    <div className="tree-page" data-tree-id={tree.id} {...gate}>
      {/*
        ------------------------------------------------------------ toolbar

        §34/§64: **one row above the stage**, and on a telephone at most two.
        The name of the tree and the dossier it hangs in are the *page's* — the
        §34 heading (`TreeTitle`) and the eyebrow print both — and printing them
        again here cost a 390 px screen about 330 px before the stage got any.
        What is left is what belongs to the canvas: how you put somebody in it,
        what to do with what is in it, who else is on it, whether it is saved,
        and the glass.

        Every button carries a constant `aria-label` and hides only its *word*
        below 600 px (`.tree-tool-word`): §64 forbids changing a control's
        accessible name on a condition, not hiding the letters — a spec that
        finds "Opnieuw schikken" by name finds it on a phone too.
      */}
      {/* §101: de balk vraagt niets op de weg naar beneden — wat maakt vraagt
          zichzelf, vooraf (`maker`/`askThen`), en wat alleen kijkt vraagt
          niets. Zie de noot in `MapCanvas` voor waaróm een klik anders
          verdween. Het zoekvak dat iemand *erbij* zet is de uitzondering: dat
          is een vak waar je in typt, en het vraagt op zijn eigen keuze. */}
      <div className="tree-tools" data-testid="tree-tools" {...AUTHOR_GATE_OFF}>
        {/* §73: the switch first, where a thumb looks for it; nothing for a
            hand that may not edit at all. */}
        <CanvasModeToggle mode={mode} />
        {/* §73: every control in this group makes, arranges or takes back, so
            in Lezen the group is not there. Switching is a deliberate press,
            so the row changing under it is the answer to that press — not the
            §64 kind of change that happens to a hand already working. */}
        {editOn && (
          <>
            <div className="tree-tools-find">
              <label className="visually-hidden" htmlFor="tree-add-person">
                {capitalise(words.entry)} toevoegen aan deze {words.familyTree}
              </label>
              <EntryPicker
                id="tree-add-person"
                value={null}
                placeholder={`Zoek een ${words.entry} om erbij te zetten…`}
                onPick={(entry) =>
                  askThen(() => {
                    addMember(entry.id);
                    selectOne(`entry:${entry.id}`);
                  })
                }
                onClear={() => undefined}
              />
            </div>
            <button
              type="button"
              /* §105: `canvas-make` — the stamboom's own `+` on a phone. */
              className="btn btn-small canvas-make"
              {...maker(() => addLoose(''))}
              data-testid="tree-add-loose"
              aria-label={capitalise(words.looseCard)}
              title={capitalise(words.looseCard)}
            >
              <Icon name="plus" size={14} />
              {/* §99 (C8-restant): the loose card's maker keeps its word on a
                  phone — a bare `+` beside the finder read as "add anybody". */}
              <span className="tree-tool-word tree-tool-word-keep">{capitalise(words.looseCard)}</span>
            </button>
            {/* §64: the count is inside the name, and the button is always here —
                a control that appears when there are ghosts would grow the bar and
                push the whole stage down under the hand that is working. The
                count stays *visible* on a phone; only the words go. */}
            <button
              type="button"
              className="btn btn-small"
              {...maker(adoptAll)}
              disabled={!ghosts.length}
              data-testid="tree-adopt-all"
              aria-label={`Verwanten erbij (${ghosts.length})`}
              title={`Verwanten erbij (${ghosts.length})`}
            >
              <Icon name="person" size={14} />
              <span className="tree-tool-word">Verwanten erbij&nbsp;</span>({ghosts.length})
            </button>
            <button
              type="button"
              className="btn btn-small btn-ghost"
              {...maker(rearrange)}
              data-testid="tree-rearrange"
              aria-label="Opnieuw schikken"
              title="Opnieuw schikken"
            >
              {/* §90: its own icon — `fit` is "Alles in beeld", in the same row. */}
              <Icon name="arrange" size={14} />
              <span className="tree-tool-word">Opnieuw schikken</span>
            </button>
          </>
        )}
        {/* §69: the shared button. This one was already the right shape —
            icon, name, title, and the word hidden on a phone — so what it
            gains is the grey: it was pressable with an empty stack.
            §90: and it stays in Lezen, grey, like on the other three — it went
            with the whole making group, which was r37's third answer. */}
        {canEdit && <CanvasUndoButton onUndo={() => void undo()} canUndo={editOn && undoDepth > 0} testId="tree-undo" />}
        {/* Golf M: and back again. The undo's own shape, turned round; on a
            phone it is not in the bar (the `+` and *Ongedaan maken* share the
            thumb's corner there, §105) — Ctrl+Shift+Z is a keyboard's. */}
        {canEdit && (
          <button
            type="button"
            className="btn btn-small btn-ghost tree-redo"
            {...maker(() => void redo())}
            disabled={!(editOn && redoDepth > 0)}
            aria-label={words.treeRedo}
            title={`${words.treeRedo} (Ctrl+Shift+Z)`}
            data-testid="tree-redo"
          >
            {/* Icon only: the bar is one row (§64), and the undo beside it
                already carries the word for the pair. */}
            <Icon name="undo" size={16} />
          </button>
        )}
        {!canEdit && (
          <span className="chip" title={`Je kunt deze ${words.familyTree} bekijken, niet bewerken.`}>
            <Icon name="lock" size={12} />
            Alleen kijken
          </span>
        )}
        {/* §94 (C4): always in the row — in Lezen too, where finding is what
            a reader does; it writes nothing, so it never asks §18b. */}
        <CanvasFind
          items={findable}
          onFind={findNode}
          group={fill(words.findOnTree, { stamboom: words.familyTree })}
          testId="tree-find"
          /* In Bewerken the row already has a box — the one that *adds*
             somebody — so finding is a loep beside it, never a second box. */
          compact={editOn}
        />

        <span className="spacer" />

        {/* §64: the roster is always in the flow, so nobody arriving moves the
            stage down under a hand that is already working. */}
        <span
          className="tree-people"
          aria-label={
            others.length
              ? `Ook op deze ${words.familyTree}: ${others.map((p) => p.name).join(', ')}`
              : undefined
          }
        >
          {others.slice(0, 5).map((person) => (
            <span key={person.clientId} className="tree-person" style={{ background: person.colour }} title={person.name}>
              {person.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
          {others.length > 5 && <span className="tree-person tree-person-more">+{others.length - 5}</span>}
        </span>

        {/* §100 (B14): the save word is the shell's now, beside the live dot
            (`useReportSave` inside the sync hook) — §61's own reason included. */}

        {/* §69: the shared block. Its buttons are `.btn.btn-small` like every
            other control in this row — these were 26×24 px, the only ones on
            the page that were not. */}
        <CanvasZoomControls
          percent={glass.zoom * 100}
          onOut={() => zoomBy(1 / ZOOM_STEP)}
          onIn={() => zoomBy(ZOOM_STEP)}
          onFit={fitAll}
          fitTestId="tree-fit"
        />
      </div>

      {/* ---------------------------------------------------------- stage */}
      <div
        ref={stageRef}
        className={`tree-stage${grabbing ? ' is-grabbing' : ''}`}
        data-testid="tree-stage"
        role="group"
        tabIndex={0}
        aria-label={`${capitalise(words.familyTree)} ${tree.name} — sleep om te schuiven, scroll om te zoomen`}
        onDoubleClick={makeOnEmpty.onDoubleClick}
        onPointerDownCapture={(event) => {
          // §72: a second finger is a knijp, before a kaartje under it can start a drag.
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
        onPointerCancel={(event) => onStagePointerUp(event, true)}
        onPointerLeave={() => reportHand(null)}
      >
        {/* §33: the tekenlaag, under everything, in screen pixels. */}
        <InkCanvas
          className="ink-layer"
          {...ink.layerProps}
          viewKey={`${glass.x},${glass.y},${glass.zoom},${size.width},${size.height}`}
          width={size.width}
          height={size.height}
        />

        <div
          className="tree-world"
          style={{ transform: `translate(${glass.x}px, ${glass.y}px) scale(${glass.zoom})` }}
        >
          {/* The lines. `overflow: visible` (in the stylesheet) is what lets a
              1×1 svg draw the whole world, negative coordinates included. */}
          <svg className="tree-lines" width={1} height={1} aria-hidden="true">
            {lines.map((line) => {
              const chosen = selectedEdge === line.edge.id;
              const kin = line.edge.role === 'kin';
              const sibling = line.edge.role === 'sibling';
              // Golf M: outside the chosen person's line, gently dimmed.
              const dim = lineage !== null && !edgeInLineage(line.edge, lineage);
              return (
                <g
                  key={line.edge.id}
                  className={`tree-edge tree-edge-${line.edge.role}${chosen ? ' is-selected' : ''}${
                    line.edge.contested ? ' is-contested' : ''
                  }${dim ? ' is-dimmed' : ''}`}
                >
                  <path
                    className={`tree-line tree-line-${line.edge.role}`}
                    d={line.d}
                    data-edge-id={line.edge.id}
                    data-edge-d={line.edge.id}
                    {...(sibling ? { 'data-sibling-kind': line.edge.sibling ?? 'explicit' } : {})}
                  >
                    <title>{line.word}</title>
                  </path>
                  {/* A partner line is a *double* line: the second stroke is the
                      same path, nudged, which is what says "these two are one
                      thing" without a second geometry. */}
                  {line.edge.role === 'partner' && (
                    <path className="tree-line tree-line-partner tree-line-partner-second" d={line.d} data-edge-d={line.edge.id} />
                  )}
                  {/*
                    §67: an explicit sibling the recorded parents contradict.
                    Kept and drawn — a Keeper's typed field is never silently
                    dropped — with a small mark on it that says the two halves of
                    the archive do not agree.
                  */}
                  {line.edge.contested && (
                    <circle
                      className="tree-line-contested is-contested"
                      data-edge-dot={line.edge.id}
                      cx={line.at.x}
                      cy={line.at.y}
                      r={4}
                    >
                      <title>De ouders zeggen iets anders</title>
                    </circle>
                  )}
                  <path
                    className="tree-line-hit"
                    d={line.d}
                    data-edge-id={line.edge.id}
                    data-edge-d={line.edge.id}
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== 'touch') hoverLine(line.edge.id);
                    }}
                    onPointerLeave={() => hoverLine(null)}
                    onClick={() => {
                      setSelectedEdge(line.edge.id);
                      clearSelection();
                      setMenuOpen(false);
                      setContextMenu(null);
                    }}
                    onContextMenu={(event) => onLineContextMenu(event, line.edge)}
                  />
                  {/* §67: a sibling line's word is in the list of ones that show
                      on hover — "half" is the whole reason the line is drawn at
                      all, so it must be readable without a click. */}
                  {(kin || chosen || sibling) && line.word && (
                    <text className="tree-line-label" data-edge-at={line.edge.id} x={line.at.x} y={line.at.y - 4} textAnchor="middle">
                      {line.word}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Golf M: the line a hand is pulling out of a `+`. */}
            {connect && (
              <line
                ref={connectLineRef}
                className={`tree-connect-line${connect.target ? ' is-landing' : ''}`}
                data-testid="tree-connect-line"
                x1={connect.from.x}
                y1={connect.from.y}
                x2={connect.to.x}
                y2={connect.to.y}
              />
            )}
          </svg>

          {/* The cards. */}
          {graph.nodes.map((node) => {
            const box = boxOf(node.id);
            if (!box) return null;
            const held = carried.get(node.id);
            /*
             * Golf M: dimmed outside the chosen person's line — never a card
             * somebody else is carrying or holding, and never one this hand
             * is carrying: whatever is moving is what the eye should follow.
             */
            const dimmed =
              lineage !== null &&
              !lineage.has(node.id) &&
              !held &&
              !drag?.[node.id] &&
              !heldAll.has(node.id);
            return (
              <TreeNode
                key={node.id}
                node={node}
                box={box}
                selected={selected.has(node.id)}
                dragging={Boolean(drag?.[node.id])}
                carried={Boolean(held) && !drag?.[node.id]}
                carriedColour={held?.colour ?? null}
                canEdit={editOn}
                dimmed={dimmed}
                connectTarget={connect?.target === node.id}
                words={{ looseCard: words.looseCard }}
                onContextMenu={(event) => onNodeContextMenu(event, node)}
                onPointerDown={(event) => {
                  onNodePointerDown(event, node);
                }}
                onNameClick={(event) => openFromName(event, node)}
                onAdopt={node.kind === 'entry' ? () => addMember(node.entryId) : undefined}
                onEdit={node.kind === 'loose' ? () => setSheet({ looseId: node.looseId }) : undefined}
              />
            );
          })}

          {/*
            §8/§67: whose hand is on what. The same coloured outline the
            prikbord draws (`.board-held`), in *world* coordinates and as a
            layer of its own — a card's own markup and its own selected state
            stay exactly what they were.
          */}
          {[...heldAll].map(([id, holder]) => {
            const box = boxOf(id);
            if (!box) return null;
            return (
              <div
                key={`held-${id}`}
                className={`tree-held${locks.has(id) ? ' is-locked' : ''}`}
                data-follow={id}
                data-held-by={holder.name}
                data-testid="tree-held"
                aria-hidden="true"
                style={{
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                  ['--held-colour' as string]: holder.colour,
                }}
              >
                <span className="tree-held-name">{holder.name}</span>
              </div>
            );
          })}

          {/* The handles, on the card a hand has chosen — and only when it is
              exactly one. Two chosen cards get the shared handle below; six get
              a `…` and nothing else, because there is no single card for a `+`
              to hang off. */}
          {canEdit && selectedNode && selectedNode.standing === 'member' && !inkActive && (() => {
            const box = boxOf(selectedNode.id);
            if (!box) return null;
            return (
              <TreeHandles
                box={box}
                zoom={glass.zoom}
                nodeName={selectedNode.name}
                // §73: in Lezen no `+`, and the `…` keeps only `Openen`.
                offers={editOn ? offersFor(selectedNode) : []}
                menu={menuFor(selectedNode)}
                menuOpen={menuOpen}
                onMenu={setMenuOpen}
                onAdd={(role) => {
                  // Golf M: the click a drag out of the `+` ended with opens nothing.
                  if (connectSwallow.current) {
                    connectSwallow.current = false;
                    return;
                  }
                  openPicker(selectedNode, role);
                }}
                onHandlePointerDown={onHandlePress}
              />
            );
          })()}

          {/* Golf M: a `+` on the line between two parents — on the line the
              pointer is on, or the one that is chosen. */}
          {canEdit && editOn && !inkActive && !picker && !connect && (() => {
            const offer = childLineFor(selectedEdge ?? hoverEdge);
            if (!offer) return null;
            return (
              <TreeLineHandle
                key={offer.edgeId}
                at={offer.at}
                zoom={glass.zoom}
                label={offer.label}
                hint={offer.hint}
                enabled={offer.enabled}
                onHover={(over) => hoverLine(over ? offer.edgeId : null)}
                onAdd={() => openChildOf(offer.parents, offer.at)}
              />
            );
          })()}

          {/* §67: two chosen, and one `+` between them. */}
          {editOn && bothParents && bothField && !inkActive && (() => {
            const boxA = boxOf(bothParents[0].id);
            const boxB = boxOf(bothParents[1].id);
            if (!boxA || !boxB) return null;
            const enabled = Boolean(bothField.a && bothField.b);
            const without = !bothField.a ? bothParents[0] : bothParents[1];
            return (
              <TreeSharedHandle
                at={betweenBoxes(boxA, boxB)}
                zoom={glass.zoom}
                enabled={enabled}
                label={`Kind van beide toevoegen: ${bothParents[0].name} en ${bothParents[1].name}`}
                hint={
                  enabled
                    ? undefined
                    : `De soort van ${without.name} heeft geen veld met de rol ${ROLE_LABELS.child} — voeg het toe in Beheer → Soorten.`
                }
                onAdd={openBothPicker}
              />
            );
          })()}

          {/* §67: the `…` for a whole selection. */}
          {editOn && selectionBounds && !inkActive && (
            <TreeSelectionMenu
              at={selectionBounds}
              zoom={glass.zoom}
              count={chosenNodes.length}
              menuOpen={menuOpen}
              onMenu={setMenuOpen}
              menu={[
                {
                  key: 'out',
                  label: `${chosenNodes.length} uit de ${words.familyTree}`,
                  icon: 'close',
                  danger: true,
                  onSelect: () => void removeChosen(chosenNodes.map((node) => node.id)),
                },
              ]}
            />
          )}

          {/* §67: the box this hand is sweeping, and everybody else's. Both in
              world coordinates, so each viewer sees them under their own glass.
              Never `--link`: a stamboom's ink is `--tree-line` and its gold is
              `--tree-accent` (§45/§66). */}
          {selection.marquee && (
            <div
              className="tree-marquee"
              data-testid="tree-marquee"
              aria-hidden="true"
              style={{
                left: Math.min(selection.marquee.x0, selection.marquee.x1),
                top: Math.min(selection.marquee.y0, selection.marquee.y1),
                width: Math.abs(selection.marquee.x1 - selection.marquee.x0),
                height: Math.abs(selection.marquee.y1 - selection.marquee.y0),
              }}
            />
          )}
          {marquees.map((box) => (
            <div
              key={`marquee-${box.clientId}`}
              className="tree-marquee tree-marquee-other"
              aria-hidden="true"
              style={{
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                ['--marquee-colour' as string]: box.colour,
              }}
            >
              <span className="tree-marquee-name">{box.name}</span>
            </div>
          ))}

        </div>

        {/* ------------------------------------------------------- hands */}
        {live.pointers.map((pointer) =>
          pointer.x === null || pointer.y === null ? null : (
            <div
              key={pointer.clientId}
              className="board-cursor tree-hand"
              data-follow={`hand:${pointer.clientId}`}
              aria-hidden="true"
              style={{
                left: glass.x + pointer.x * glass.zoom,
                top: glass.y + pointer.y * glass.zoom,
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

        {/* -------------------------------------------------- a line's fate */}
        {selectedLine && editOn && (
          <div
            className="tree-line-menu"
            style={{ left: toScreen(selectedLine.at).x, top: toScreen(selectedLine.at).y }}
          >
            {selectedLine.edge.source.kind === 'derived' ? (
              /*
               * §67: a derived line is nobody's to take away. It is not written
               * down anywhere — it *follows* from the parents on the two
               * artikelen — so there is no field to unwrite and no tie to
               * delete, and a "verwijderen" that quietly did nothing would be
               * worse than no button. The sentence says where the line actually
               * comes from, which is also where to go and change it.
               */
              <p className="tiny muted tree-line-note" data-testid="tree-line-derived">
                Volgt uit de ouders
              </p>
            ) : (
              <button
                type="button"
                className="btn btn-small"
                data-testid="tree-remove-line"
                onClick={() => void removeLine(selectedLine.edge)}
              >
                <Icon name="close" size={13} />
                {capitalise(words.treeLine)} verwijderen
              </button>
            )}
          </div>
        )}

        {/* Golf M: the right button's menu, at the pointer. */}
        {contextMenu && (
          <TreeContextMenu
            at={contextMenu.at}
            stage={size}
            label={contextMenu.label}
            menu={contextMenu.items}
            onClose={closeContextMenu}
          />
        )}
        {connect && (
          <p className="visually-hidden" role="status">
            {words.treeConnectHint}
          </p>
        )}

        {/* ------------------------------------------------------- picker */}
        {picker && pickerNode && (
          <TreePickerBox
            at={picker.at}
            stage={size}
            role={picker.role}
            field={pickerField}
            node={pickerNode}
            both={picker.both ? (picker.both.map((id) => nodeById(id)).filter(Boolean) as GraphNode[]) : null}
            child={picker.child ?? null}
            partners={picker.child ? partnersOf(picker.nodeId) : []}
            ghosts={ghostsFor(pickerNode, picker.role)}
            words={words}
            onCancel={() => setPicker(null)}
            onPickGhost={(ghost) => {
              setPicker(null);
              if (ghost.kind === 'entry') addMember(ghost.entryId);
            }}
            onPickEntry={(entry) => void attach(pickerNode, picker.role, entry)}
            onLoose={(cardName) => attachLoose(pickerNode, picker.role, cardName)}
            onSecondParent={(pick) => {
              if (picker.child) void addSecondParent(picker.child, pick);
            }}
            onSkip={() => setPicker(null)}
          />
        )}

        {/* §33: the potlood is offered to everybody who may *look*, so it lives
            on the stage rather than in the toolbar an editor gets. §67: the
            sheet first and the bar after it, bottom-right like the prikbord —
            the bar was rendered first here once, under a rule of this file's
            own with a z-index below the sheet, and every press on the gum drew
            a line. */}
        {/* §73: and put away in Lezen. A hand with no right to edit has no
            switch and keeps the potlood §33 gave everybody who may look. */}
        <InkShell shell={ink} corner="bottom-right" toolbar={editOn || !canEdit} />

        {/* §105 (golf i1): één zin, één werkwoord, drie kaartjes met een haak
            (`CanvasEmpty`). In Bewerken brengt de knop de caret naar het
            zoekvak dat iemand erbij zet — de weg die een stamboom het eerst
            neemt; *Los kaartje* is de `+`. In Lezen zet *Beginnen* het vlak in
            Bewerken. */}
        {empty && !inkActive && (
          <CanvasEmpty
            kind="tree"
            className="tree-empty"
            sentence={fill(words.vlakLeegStamboom, { stamboom: words.familyTree })}
            action={
              !canEdit
                ? undefined
                : !editOn
                  ? { label: words.vlakLeegBegin, icon: 'pencil', primary: true, props: { ...AUTHOR_GATE_OFF, onClick: () => mode.setMode('edit') } }
                  : {
                      label: words.vlakLeegStamboomDoe,
                      icon: 'search',
                      props: {
                        ...AUTHOR_GATE_OFF,
                        onClick: () => document.getElementById('tree-add-person')?.focus(),
                      },
                    }
            }
          />
        )}
      </div>

      <p className="tiny muted tree-count canvas-count">
        {state.members.length + state.loose.length}{' '}
        {state.members.length + state.loose.length === 1 ? 'kaartje' : 'kaartjes'}
        {ghosts.length > 0 && <> · {ghosts.length} verwant{ghosts.length === 1 ? '' : 'en'} erbuiten</>}
        {/* §102, golf h1 (T18): a pointer's sentence and a finger's; the stylesheet
            shows one (`app/navigatie.css`, `pointer: coarse`). */}
        <span className="hint-wijzer">
          {' · '}sleep om te schuiven, scroll of knijp om te zoomen
        </span>
        {/* Golf H: the finger's sentence in the same line, so the glass keeps its height. */}
        <span className="hint-vinger">
          {' · '}
          {words.canvasHintTouch}
        </span>
        {editOn && !isPhone && (
          <>
            {' '}· sleep een kaartje om het vast te zetten · shift-klik of shift-sleep om er meer te kiezen
          </>
        )}
      </p>

      {/* ------------------------------------------------- the loose sheet */}
      {editing && (
        <Sheet onClose={() => setSheet(null)} labelledBy="tree-loose-title">
          <LooseSheet
            card={editing}
            words={words}
            onSave={(patch) => saveLoose(editing.id, patch)}
            onClose={() => setSheet(null)}
            onRemove={() => void removeLoose(editing.id, editing.name)}
            onPromote={() =>
              ui.openNewEntry({
                name: editing.name,
                shortDescription: editing.text,
                caseId: tree.caseId ?? undefined,
                onCreated: (created) => void promoteLoose(editing.id, created.id),
              })
            }
          />
        </Sheet>
      )}

      {isKeeper && <UnderFold slotId={UNDER_FOLD_ID}>{ink.keeperControls}</UnderFold>}
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

/**
 * The empty div a stamboom's page leaves below the canvas (`UnderFold` in
 * `components/ink/UnderFold.tsx` — §34: the Keeper's tekenlaag switch is a
 * tool, and on a telephone 132 px of tool is a third of the stage).
 */
const UNDER_FOLD_ID = 'tree-underfold';

function touchesEntry(tie: TreeTie, entryId: string): boolean {
  return (
    (tie.from.kind === 'entry' && tie.from.id === entryId) || (tie.to.kind === 'entry' && tie.to.id === entryId)
  );
}
function touchesLoose(tie: TreeTie, looseId: string): boolean {
  return (tie.from.kind === 'loose' && tie.from.id === looseId) || (tie.to.kind === 'loose' && tie.to.id === looseId);
}

/**
 * A tie the tree owns, made by a handle.
 *
 * `role: 'parent'` always runs parent → child, whichever handle was pressed:
 * **boven** makes the *new* card the parent of the one that was chosen,
 * **onder** makes it the child, and **rechts** (partner) and **links**
 * (sibling, §67) are undirected. That is the same normalisation
 * `edgesFromFields` does for a field, one layer along, so a tie and a field
 * describe a line the same way round.
 */
function tieFor(handle: HandleRole, sourceId: GraphNodeId, targetId: GraphNodeId, now: number): TreeTie {
  const source = parseRef(sourceId);
  const target = parseRef(targetId);
  const role: FieldRole =
    handle === 'partner' ? 'partner' : handle === 'sibling' ? 'sibling' : 'parent';
  const [from, to] = handle === 'parent' ? [target, source] : [source, target];
  return { id: newTieId(), from, to, role, updatedAt: now };
}

function parseRef(id: GraphNodeId): NodeRef {
  const at = id.indexOf(':');
  const rest = id.slice(at + 1);
  return id.slice(0, at) === 'loose' ? { kind: 'loose', id: rest } : { kind: 'entry', id: rest };
}

/**
 * The floating box a handle opens: the ghosts of that role first (they are the
 * cheapest answer and the commonest), then the archive, then a los kaartje for
 * the person who has no artikel to point at.
 *
 * §67 — **and, for a child, a second question.** Once the child is chosen the
 * box does not close: it becomes "Tweede ouder (optioneel)", with the source's
 * partners as quick rows, the archive under them, and "Overslaan" — which has
 * the focus, so Enter is a skip and so is Escape. Nothing is preselected;
 * a partner is not a parent. The shared handle (`both`) skips the question
 * altogether, because it was asked and answered by the selection.
 */
function TreePickerBox({
  at,
  stage,
  role,
  field,
  node,
  both,
  child,
  partners,
  ghosts,
  words,
  onCancel,
  onPickGhost,
  onPickEntry,
  onLoose,
  onSecondParent,
  onSkip,
}: {
  at: { x: number; y: number };
  stage: { width: number; height: number };
  role: HandleRole;
  field: RoleFieldInfo | null;
  node: GraphNode;
  /** §67: the two cards a shared handle was pressed between, or null. */
  both: GraphNode[] | null;
  /** §67: step two — the child that was just attached. */
  child: { id: GraphNodeId; name: string } | null;
  /** §67: the source's partners, as suggestions for the second parent. */
  partners: GraphNode[];
  ghosts: GraphNode[];
  words: Record<string, string>;
  onCancel: () => void;
  onPickGhost: (ghost: GraphNode) => void;
  onPickEntry: (entry: EntryRef) => void;
  onLoose: (name: string) => void;
  onSecondParent: (pick: { nodeId?: GraphNodeId; entryId?: string; name: string }) => void;
  onSkip: () => void;
}) {
  const [looseName, setLooseName] = useState('');
  const skipRef = useRef<HTMLButtonElement>(null);
  const width = 280;
  /*
   * §69 (3.4): clamped on the height it **has**, not on a guessed 200.
   *
   * Round 31 left this as a named leftover, and the guess is why: a kiezer with
   * two ghosts, a search box and a "los kaartje" field is well past 200 px, so
   * near the bottom of the glass it was clamped to a spot it still did not fit
   * in and `.tree-stage`'s `overflow: hidden` took the rest. `boxRef` is
   * measured after the first paint (`useFloatBox`), and until then the guess
   * below stands — one frame, in the place the old code would have put it
   * anyway, so nothing jumps that was not already wrong.
   */
  const boxRef = useRef<HTMLDivElement>(null);
  const size = useFloatBox(boxRef, { width, height: 200 });
  const { left, top } = clampFloat(at, size, stage);
  const heading = field ? field.label : ROLE_LABELS[role === 'child' ? 'child' : role];

  /*
   * Enter is a skip, and this is how: the button takes the focus the moment the
   * second step opens, so the key that closes a box everywhere else closes this
   * one too — without a keydown handler that would have to guess whether the
   * hand was typing in the search box at the time.
   */
  useEffect(() => {
    if (child) skipRef.current?.focus();
  }, [child]);
  /*
   * §105 (golf J, stuk 9): *Ouders bij …* is a search, and nothing else is
   * asked of the hand — so the caret is in its box, as in every other kiezer.
   * It asked a tap first, on both sizes. Not scrolled: the kiezer is placed.
   */
  useEffect(() => {
    if (child) return;
    const box = boxRef.current?.querySelector<HTMLInputElement>('#tree-picker-search');
    box?.focus({ preventScroll: true });
  }, [child]);

  if (child) {
    return (
      <div
        ref={boxRef}
        className="tree-picker"
        data-testid="tree-picker-second-parent"
        /*
         * §69: the kiezer floats over the glass, takes the keyboard and answers
         * Escape — that is a dialog, whatever it is made of, and a reader that
         * is told so knows it may leave it. `aria-labelledby` points at the
         * line it already prints rather than a second name nobody sees.
         */
        role="dialog"
        aria-labelledby="tree-picker-second-parent-head"
        style={{ left, top, width }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          onSkip();
        }}
      >
        <p className="tiny muted tree-picker-head" id="tree-picker-second-parent-head">
          Tweede ouder (optioneel) bij <strong>{child.name}</strong>
        </p>
        {partners.length > 0 && (
          <ul className="suggest-list tree-picker-ghosts" role="list">
            {partners.map((partner) => (
              <li key={partner.id}>
                <button
                  type="button"
                  className="suggest-item"
                  onClick={() =>
                    onSecondParent({
                      nodeId: partner.id,
                      entryId: partner.kind === 'entry' ? partner.entryId : undefined,
                      name: partner.name,
                    })
                  }
                >
                  <Icon name="person" size={15} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{partner.name}</strong>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      Partner van {node.name}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="visually-hidden" htmlFor="tree-second-parent-search">
          Tweede ouder zoeken
        </label>
        <EntryPicker
          id="tree-second-parent-search"
          value={null}
          ofType={field?.ofType}
          placeholder={`Zoek een ${words.entry}…`}
          onPick={(entry) => onSecondParent({ entryId: entry.id, name: entry.name })}
          onClear={onSkip}
        />
        <div className="row" style={{ gap: '0.3rem' }}>
          <button
            ref={skipRef}
            type="button"
            className="btn btn-small"
            data-testid="tree-second-parent-skip"
            onClick={onSkip}
          >
            Overslaan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      className="tree-picker"
      data-testid="tree-picker"
      /* §69: a dialog, as above. */
      role="dialog"
      aria-labelledby="tree-picker-head"
      style={{ left, top, width }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onCancel();
      }}
    >
      <p className="tiny muted tree-picker-head" id="tree-picker-head">
        {both && both.length === 2 ? (
          <>
            {heading} van <strong>{both[0].name}</strong> en <strong>{both[1].name}</strong>
          </>
        ) : (
          <>
            {heading} bij <strong>{node.name}</strong>
          </>
        )}
      </p>
      {ghosts.length > 0 && (
        <ul className="suggest-list tree-picker-ghosts" role="list">
          {ghosts.map((ghost) => (
            <li key={ghost.id}>
              <button type="button" className="suggest-item" onClick={() => onPickGhost(ghost)}>
                <Icon name="person" size={15} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{ghost.name}</strong>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    Staat er al bij, maar niet in deze {words.familyTree}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="visually-hidden" htmlFor="tree-picker-search">
        {heading} zoeken
      </label>
      <EntryPicker
        id="tree-picker-search"
        value={null}
        ofType={field?.ofType}
        placeholder={`Zoek een ${words.entry}…`}
        onPick={onPickEntry}
        onClear={onCancel}
      />
      <div className="tree-picker-loose">
        <label className="tiny muted" htmlFor="tree-picker-loose-name">
          Of een {words.looseCard}
        </label>
        <div className="row" style={{ gap: '0.3rem' }}>
          <input
            id="tree-picker-loose-name"
            className="input"
            value={looseName}
            placeholder="Onbekende vader"
            onChange={(event) => setLooseName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              onLoose(looseName);
            }}
          />
          <button type="button" className="btn btn-small" onClick={() => onLoose(looseName)}>
            <Icon name="plus" size={13} />
            Erbij
          </button>
        </div>
      </div>
    </div>
  );
}

/** The small sheet behind a los kaartje: a name, a line or two, and a frame. */
function LooseSheet({
  card,
  words,
  onSave,
  onClose,
  onRemove,
  onPromote,
}: {
  card: LooseCard;
  words: Record<string, string>;
  onSave: (patch: { name?: string; text?: string; frame?: FrameKind }) => void;
  onClose: () => void;
  onRemove: () => void;
  onPromote: () => void;
}) {
  const [name, setName] = useState(card.name);
  const [text, setText] = useState(card.text ?? '');
  // §98: the blur of the editor fires before React has the last keystroke's
  // state in this closure; the ref always has it.
  const textRef = useRef(text);
  textRef.current = text;
  const [frame, setFrame] = useState<FrameKind>(card.frame);

  return (
    <div className="stack">
      <h2 id="tree-loose-title" style={{ marginTop: 0 }}>
        {capitalise(words.looseCard)}
      </h2>
      <p className="small muted" style={{ margin: 0 }}>
        Een kaartje zonder {words.entry}. Zodra er een {words.entry} van gemaakt wordt, worden de lijnen eromheen
        velden op dat {words.entry}.
      </p>
      <label className="field">
        <span>Naam</span>
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => onSave({ name })}
        />
      </label>
      {/* §98: a los kaartje's line or two holds chips (`ShortField`). No
          room: a kaartje lives in the tree's own state, saved on blur like the
          name above it. Not a `<label>` around it — a label wrapping an editor
          sends every click on the chip to the box's start. */}
      <div className="field">
        <span id="tree-loose-text-label">Tekst</span>
        <ShortField
          noRoom
          ungated
          multiline
          field="text"
          id="tree-loose-text"
          className="input short-editor-sheet"
          ariaLabelledBy="tree-loose-text-label"
          value={text}
          onValue={(next) => setText(next)}
          onBlur={() => onSave({ text: textRef.current })}
        />
      </div>
      <label className="field">
        <span>Vorm</span>
        <select
          className="select"
          value={frame}
          onChange={(event) => {
            const next = event.target.value as FrameKind;
            setFrame(next);
            onSave({ frame: next });
          }}
        >
          {FRAME_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {FRAME_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      <div className="row-wrap" style={{ gap: '0.3rem' }}>
        <button
          type="button"
          className="btn btn-small btn-primary"
          onClick={() => {
            onSave({ name, text, frame });
            onClose();
          }}
        >
          <Icon name="check" size={13} />
          Klaar
        </button>
        <button type="button" className="btn btn-small" onClick={onPromote} data-testid="tree-promote">
          <Icon name="plus" size={13} />
          {capitalise(words.entry)} aanmaken
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn-small btn-ghost" onClick={onRemove}>
          <Icon name="trash" size={13} />
          Weghalen
        </button>
      </div>
    </div>
  );
}
