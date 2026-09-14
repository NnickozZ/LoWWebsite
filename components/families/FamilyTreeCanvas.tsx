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
import { useAuthorGate, useMayType } from '@/components/you/AuthorProvider';

import { useMarqueeSelect } from '@/components/canvas/useMarqueeSelect';
import type { AccessSettings } from '@/lib/access';
import { groupDelta, pressSelection } from '@/lib/canvas/select';
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
import { capitalise } from '@/lib/words';
import {
  TreeHandles,
  TreeSelectionMenu,
  TreeSharedHandle,
  type HandleOffer,
  type HandleRole,
  type TreeMenuItem,
} from './TreeHandles';
import { TreeNode } from './TreeNode';
import { createUndoStack, UNDO_LIMIT } from './treeUndo';
import { useTreeHolding } from './useTreeHolding';
import { syncLabel, useTreeSync, type PendingIds } from './useTreeSync';

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
 *    membership — and never for a field on an artikel. See `treeUndo.ts`.
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

/** How far a pointer may travel before a press on a card is a drag. */
const DRAG_SLOP = 4;
/**
 * §67: how many carried cards one live frame may name. The site line takes the
 * first forty keys of `m` (`pointerFrame`, `app/api/live/site/route.ts`) and
 * drops the rest without a word, so the cut is made here where it can be seen.
 */
const POINTER_CARD_LIMIT = 40;
/** The stage before it has been measured; the floor lives in `.tree-stage`. */
const UNMEASURED = { width: 900, height: 520 };

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

export function FamilyTreeCanvas({
  tree,
  initialGraph,
  canEdit: allowed,
  isKeeper,
  liveUser,
  initialInk,
}: FamilyTreeCanvasProps) {
  /*
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
  const gate = useAuthorGate();
  const canEdit = allowed && mayType;

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

  const undoStack = useRef(createUndoStack<FamilyTreeState>(UNDO_LIMIT));

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
    },
    stopPropagation: true,
  });
  const inkActive = ink.inkActive;
  const onInkKey = ink.onKeyDown;

  /* ---------------------------------------------------------------- save */

  /** §59/§61: a box being swept is a hand on the page like any other. */
  const busy = dragging || ink.busy || picker !== null || sheet !== null || selection.busy;
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
    (make: (prev: FamilyTreeState) => TreeChange, options: { undo?: boolean; now?: boolean } = {}) => {
      if (!canEdit) return;
      const prev = stateRef.current;
      const change = make(prev);
      if (options.undo !== false) undoStack.current.push(prev);

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
    [canEdit, setState, refreshArchive],
  );

  const undo = useCallback(() => {
    if (!canEdit) return;
    const previous = undoStack.current.pop();
    if (!previous) return;
    setState(previous);
    clearSelection();
    setSelectedEdge(null);
    // The whole document goes: an undo can move anything, and working out what
    // it put back is exactly the bookkeeping `all` exists to avoid.
    syncRef.current.saveNow();
    refreshArchive();
  }, [canEdit, setState, refreshArchive, clearSelection]);

  /** Every viewer's own glass, in their own browser. Never state (rule 20). */
  const viewKey = `tree:${tree.id}:view`;
  const rememberView = useCallback(
    (next: TreeView) => {
      try {
        window.localStorage.setItem(viewKey, JSON.stringify(next));
      } catch {
        /* a browser without storage still pans */
      }
    },
    [viewKey],
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
  const [carried, setCarried] = useState<Map<GraphNodeId, { x: number; y: number; colour: string }>>(new Map());

  const layout = useMemo(() => {
    const moved = new Map<GraphNodeId, { x: number; y: number }>();
    if (drag) for (const [id, at] of Object.entries(drag)) moved.set(id, at);
    for (const [id, at] of carried) if (!drag?.[id]) moved.set(id, { x: at.x, y: at.y });
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
  const lines = useMemo<DrawnLine[]>(() => {
    const geomById = new Map(geometry.unions.map((union) => [union.unionId, union]));
    const siblingGeom = new Map(
      geometry.siblings.map((item) => [[item.a, item.b].sort().join('|'), item]),
    );
    const out: DrawnLine[] = [];
    const polyline = (points: Point[]) =>
      points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    for (const edge of graph.edges) {
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
  }, [graph.edges, geometry, layout.unions, boxOf]);

  /* ------------------------------------------------------ the first view */

  const fitAll = useCallback(() => {
    const next = fitViewport(base.bounds, size);
    setView(next);
    rememberView(next);
  }, [base.bounds, size, rememberView]);

  const startedView = useRef(false);
  useEffect(() => {
    if (startedView.current || size.width <= 0 || !graph.nodes.length) return;
    startedView.current = true;
    let stored: unknown = null;
    try {
      const raw = window.localStorage.getItem(viewKey);
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      stored = null;
    }
    if (isTreeView(stored)) setView({ ...stored, zoom: clampZoom(stored.zoom) });
    else setView(fitViewport(base.bounds, size));
  }, [size, graph.nodes.length, base.bounds, viewKey]);
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
      zoomBy(Math.exp(-event.deltaY * 0.0015), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    // Not passive: the page must not scroll under the tree.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

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

  /** Where somebody else's hand has a card right now. It sticks until a pull lands. */
  useEffect(() => {
    setCarried((current) => {
      let changed = false;
      const next = new Map(current);
      for (const pointer of live.pointers) {
        for (const [id, at] of Object.entries(pointer.m)) {
          const was = next.get(id);
          if (!was || was.x !== at[0] || was.y !== at[1] || was.colour !== pointer.colour) {
            next.set(id, { x: at[0], y: at[1], colour: pointer.colour });
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }, [live.pointers]);
  /*
   * What the archive last said is what a carried card falls back to. Without
   * this the card snaps home for the length of one round trip and then jumps to
   * where it was actually dropped — the landkaart's rule for a carried speld.
   */
  useEffect(() => {
    setCarried((current) => {
      if (!current.size) return current;
      const next = new Map(current);
      let changed = false;
      for (const [id, held] of current) {
        const pin = pins.get(id);
        if (pin && pin.x === held.x && pin.y === held.y) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [pins]);

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

  const pan = useRef<{ pointerId: number; startX: number; startY: number; from: TreeView; moved: boolean } | null>(null);
  /** §67: which pointer is sweeping a box, so the up that closes it is the right one. */
  const marqueePointer = useRef<number | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const pinch = useRef<{ distance: number } | null>(null);
  const touches = useRef<Map<number, { x: number; y: number }>>(new Map());

  const onStagePointerDown = (event: React.PointerEvent) => {
    if (inkActive) return;
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
    const rect = el.getBoundingClientRect();
    touches.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
      pan.current = null;
      return;
    }
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
    if (el && touches.current.has(event.pointerId)) {
      const rect = el.getBoundingClientRect();
      touches.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    }
    if (pinch.current && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.distance > 0 && distance > 0) {
        zoomBy(distance / pinch.current.distance, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
      pinch.current = { distance };
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
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) gesture.moved = true;
    moveView(() => ({ ...gesture.from, x: gesture.from.x + dx, y: gesture.from.y + dy }));
  };

  const onStagePointerUp = (event: React.PointerEvent, cancelled = false) => {
    touches.current.delete(event.pointerId);
    if (touches.current.size < 2) pinch.current = null;
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
    // A press on bare paper that went nowhere lets everything go.
    if (!gesture.moved) {
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
    /*
     * §67: shift toggles; a plain press on a card that is not chosen chooses
     * only it; a plain press on one that already is leaves the whole group
     * standing, because the next thing that press does is drag the group.
     */
    selection.select(node.id, additive, alreadySelected);
    setSelectedEdge(null);
    setMenuOpen(false);
    if (!canEdit || node.standing === 'ghost') return;
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
      if (!chosen.has(other.id) || other.standing === 'ghost') continue;
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
    if (Math.hypot(event.clientX - held.startX, event.clientY - held.startY) > DRAG_SLOP) {
      /*
       * Recorded before anything asks whether this hand may *move* a card: a
       * reader who cannot edit still drags a finger across the paper, and the
       * click that press ends with is no more a click than an editor's — so it
       * must not walk to the artikel either.
       */
      pressTravelled.current = true;
    }
    if (!held.moved && Math.hypot(event.clientX - held.startX, event.clientY - held.startY) <= DRAG_SLOP) return;
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
    if (!held.moved || !carrying || !commitIt) return;

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
    });
    // The carry sticks on the other screens until their pull lands.
    reportHand({ clientX: event.clientX, clientY: event.clientY }, carrying);
  };

  /* ------------------------------------------------------------- writes */

  const isMember = useCallback((entryId: string) => state.members.some((member) => member.id === entryId), [state.members]);

  const addMember = useCallback(
    (entryId: string) => {
      if (stateRef.current.members.some((member) => member.id === entryId)) return;
      commit((prev) => ({ members: [...prev.members, { id: entryId, updatedAt: Date.now() }] }));
    },
    [commit],
  );

  const removeMember = useCallback(
    async (entryId: string, entryName: string) => {
      const yes = await ui.confirm({
        title: `${entryName} uit deze ${words.familyTree} halen?`,
        message: `Het ${words.entry} zelf blijft bestaan, en de velden erop ook — alleen deze ${words.familyTree} vergeet ${entryName}.`,
        confirmLabel: 'Uit de stamboom',
        danger: true,
      });
      if (!yes) return;
      commit((prev) => ({
        members: prev.members.filter((member) => member.id !== entryId),
        deletedMembers: [entryId],
        // A tie with nobody on one end is not a tie.
        ties: prev.ties.filter((tie) => !touchesEntry(tie, entryId)),
        deletedTies: prev.ties.filter((tie) => touchesEntry(tie, entryId)).map((tie) => tie.id),
      }));
      clearSelection();
      ui.toast(`Uit de ${words.familyTree} gehaald; de velden op het ${words.entry} blijven staan.`);
    },
    [commit, ui, words.entry, words.familyTree, clearSelection],
  );

  const removeLoose = useCallback(
    async (looseId: string, cardName: string) => {
      const yes = await ui.confirm({
        title: `${cardName || `Dit ${words.looseCard}`} weghalen?`,
        message: `Een ${words.looseCard} bestaat nergens anders; dit is definitief.`,
        confirmLabel: 'Weghalen',
        danger: true,
      });
      if (!yes) return;
      commit((prev) => ({
        loose: prev.loose.filter((card) => card.id !== looseId),
        deletedLoose: [looseId],
        ties: prev.ties.filter((tie) => !touchesLoose(tie, looseId)),
        deletedTies: prev.ties.filter((tie) => touchesLoose(tie, looseId)).map((tie) => tie.id),
      }));
      clearSelection();
      setSheet(null);
    },
    [commit, ui, words.looseCard, clearSelection],
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
    async (ids: readonly GraphNodeId[]) => {
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
      const yes = await ui.confirm({
        title: `${total} kaartjes uit deze ${words.familyTree} halen?`,
        message: parts.join(' '),
        confirmLabel: 'Weghalen',
        danger: true,
      });
      if (!yes) return;

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
      ui.toast(`${total} kaartjes uit de ${words.familyTree} gehaald.`, {
        label: 'Ongedaan maken',
        onAction: () => undo(),
      });
    },
    [commit, ui, undo, words, clearSelection, removeLoose, removeMember],
  );

  /** A new los kaartje in the middle of the glass, ready to be named. */
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
    async (entryId: string, fieldKey: string, targetId: string, remove = false) => {
      try {
        const response = await fetch(`/api/family-trees/${tree.id}/relations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entryId, fieldKey, targetId, ...(remove ? { remove: true } : {}) }),
        });
        const data = (await response.json()) as { status?: string; graph?: FamilyGraph; error?: string };
        if (!response.ok) {
          ui.toast(data.error ?? 'Dat is niet gelukt.');
          return false;
        }
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
        if (data.status === 'pending') ui.toast('Als voorstel ingediend.');
        refreshArchive();
        return true;
      } catch {
        ui.toast('Geen verbinding.');
        return false;
      }
    },
    [tree.id, ui, refreshArchive],
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
    ): Promise<boolean> => {
      if (parent.entryId && child.entryId) {
        const onParent = (graphRef.current.roleFields[parent.entryId] ?? []).find((f) => f.role === 'child');
        if (onParent) return writeRelation(parent.entryId, onParent.key, child.entryId);
        const onChild = (graphRef.current.roleFields[child.entryId] ?? []).find((f) => f.role === 'parent');
        if (onChild) return writeRelation(child.entryId, onChild.key, parent.entryId);
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
      }));
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
  const attach = useCallback(
    async (source: GraphNode, role: HandleRole, target: { id: string; name: string }) => {
      const childId: GraphNodeId = `entry:${target.id}`;
      // Solid straight away: the person is in the tree, then the field is
      // written. The other order leaves them a ghost for a round trip.
      addMember(target.id);

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
        await writeRelation(source.entryId, field.key, target.id);
      } else {
        // A los kaartje has no page to write a field on, so the line is the
        // tree's own (§66: a tie with at least one loose end).
        const now = Date.now();
        commit((prev) => ({ ties: [...prev.ties, tieFor(role, source.id, childId, now)] }));
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
    [fieldFor, addMember, writeRelation, commit, selectOne, linkParent],
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
        addLoose(cardName, spot, both.map((other) => ({ handle: role, other })));
        return;
      }
      const id = addLoose(cardName, spot, [{ handle: role, other: source.id }]);
      if (role === 'child') {
        setPicker((current) =>
          current ? { ...current, child: { id: `loose:${id}`, name: cardName.trim() } } : current,
        );
      } else {
        setPicker(null);
      }
    },
    [layout.positions, sizes, addLoose],
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
      if (pick.entryId) addMember(pick.entryId);
      const childEntryId = child.id.startsWith('entry:') ? child.id.slice('entry:'.length) : undefined;
      await linkParent(
        {
          nodeId: pick.nodeId ?? (pick.entryId ? `entry:${pick.entryId}` : child.id),
          entryId: pick.entryId,
          name: pick.name,
        },
        { nodeId: child.id, entryId: childEntryId, name: child.name },
      );
    },
    [addMember, linkParent],
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

  const removeLine = useCallback(
    async (edge: GraphEdge) => {
      setSelectedEdge(null);
      const source = edge.source;
      if (source.kind === 'field') {
        // A line read off a field is unwritten on the *artikel* — the same road
        // in reverse, so the mirror, the gate and the voorstel all apply.
        await writeRelation(source.entryId, source.fieldKey, source.targetId, true);
        return;
      }
      // §67: a derived line is nobody's to remove — it follows from two fields.
      if (source.kind !== 'tie') return;
      commit((prev) => ({
        ties: prev.ties.filter((tie) => tie.id !== source.tieId),
        deletedTies: [source.tieId],
      }));
    },
    [writeRelation, commit],
  );

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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
        return;
      }
      if (!canEdit || sheet) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!selected.size) return;
        event.preventDefault();
        // §67: one or six, the same road — `removeChosen` asks the one question
        // that fits what is chosen and makes the one commit that undoes it.
        void removeChosen([...selected]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onInkKey, picker, menuOpen, selectedEdge, selected, canEdit, sheet, undo, removeChosen, clearSelection]);

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
      if (canEdit && node.standing === 'member') {
        items.push({
          key: 'out',
          label: `Uit de ${words.familyTree}`,
          icon: 'close',
          danger: true,
          onSelect: () => void removeMember(node.entryId, node.name),
        });
      }
      if (canEdit && node.standing === 'ghost') {
        items.push({ key: 'in', label: 'Erbij', icon: 'plus', onSelect: () => addMember(node.entryId) });
      }
      return items;
    }
    if (canEdit) {
      items.push({ key: 'edit', label: 'Bewerken', icon: 'edit', onSelect: () => setSheet({ looseId: node.looseId }) });
      items.push({
        key: 'promote',
        label: `${capitalise(words.entry)} aanmaken`,
        icon: 'plus',
        onSelect: () => {
          ui.openNewEntry({
            name: node.name,
            shortDescription: node.text,
            caseId: tree.caseId ?? undefined,
            onCreated: (created) => void promoteLoose(node.looseId, created.id),
          });
        },
      });
      items.push({
        key: 'remove',
        label: 'Weghalen',
        icon: 'trash',
        danger: true,
        onSelect: () => void removeLoose(node.looseId, node.name),
      });
    }
    return items;
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
      <div className="tree-tools" data-testid="tree-tools">
        {canEdit && (
          <>
            <div className="tree-tools-find">
              <label className="visually-hidden" htmlFor="tree-add-person">
                {capitalise(words.entry)} toevoegen aan deze {words.familyTree}
              </label>
              <EntryPicker
                id="tree-add-person"
                value={null}
                placeholder={`Zoek een ${words.entry} om erbij te zetten…`}
                onPick={(entry) => {
                  addMember(entry.id);
                  selectOne(`entry:${entry.id}`);
                }}
                onClear={() => undefined}
              />
            </div>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => addLoose('')}
              data-testid="tree-add-loose"
              aria-label={capitalise(words.looseCard)}
              title={capitalise(words.looseCard)}
            >
              <Icon name="plus" size={14} />
              <span className="tree-tool-word">{capitalise(words.looseCard)}</span>
            </button>
            {/* §64: the count is inside the name, and the button is always here —
                a control that appears when there are ghosts would grow the bar and
                push the whole stage down under the hand that is working. The
                count stays *visible* on a phone; only the words go. */}
            <button
              type="button"
              className="btn btn-small"
              onClick={adoptAll}
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
              onClick={rearrange}
              data-testid="tree-rearrange"
              aria-label="Opnieuw schikken"
              title="Opnieuw schikken"
            >
              <Icon name="fit" size={14} />
              <span className="tree-tool-word">Opnieuw schikken</span>
            </button>
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={undo}
              data-testid="tree-undo"
              aria-label="Ongedaan maken"
              title="Ongedaan maken (Ctrl+Z)"
            >
              <Icon name="undo" size={14} />
              <span className="tree-tool-word">Ongedaan maken</span>
            </button>
          </>
        )}
        {!canEdit && (
          <span className="chip" title={`Je kunt deze ${words.familyTree} bekijken, niet bewerken.`}>
            <Icon name="lock" size={12} />
            Alleen kijken
          </span>
        )}

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
          {liveUser && (
            <span className="tree-person tree-person-me" style={{ background: liveUser.colour }} title={`${liveUser.name} (jij)`}>
              {liveUser.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          {others.slice(0, 5).map((person) => (
            <span key={person.clientId} className="tree-person" style={{ background: person.colour }} title={person.name}>
              {person.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
          {others.length > 5 && <span className="tree-person tree-person-more">+{others.length - 5}</span>}
        </span>

        <span className="save-state">{syncLabel(sync.state, sync.error)}</span>

        <span className="tree-zoom" role="group" aria-label="Zoomen">
          <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Uitzoomen" title="Uitzoomen">
            &minus;
          </button>
          <span className="tree-zoom-level">{Math.round(glass.zoom * 100)}%</span>
          <button type="button" onClick={() => zoomBy(1.25)} aria-label="Inzoomen" title="Inzoomen">
            +
          </button>
        </span>
        <button
          type="button"
          className="btn btn-small"
          onClick={fitAll}
          data-testid="tree-fit"
          aria-label="Alles in beeld"
          title="Alles in beeld"
        >
          <Icon name="crosshair" size={14} />
          <span className="tree-tool-word">Alles in beeld</span>
        </button>
      </div>

      {/* ---------------------------------------------------------- stage */}
      <div
        ref={stageRef}
        className={`tree-stage${grabbing ? ' is-grabbing' : ''}`}
        data-testid="tree-stage"
        role="group"
        tabIndex={0}
        aria-label={`${capitalise(words.familyTree)} ${tree.name} — sleep om te schuiven, scroll om te zoomen`}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={(event) => onStagePointerUp(event)}
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
              return (
                <g
                  key={line.edge.id}
                  className={`tree-edge tree-edge-${line.edge.role}${chosen ? ' is-selected' : ''}${
                    line.edge.contested ? ' is-contested' : ''
                  }`}
                >
                  <path
                    className={`tree-line tree-line-${line.edge.role}`}
                    d={line.d}
                    data-edge-id={line.edge.id}
                    {...(sibling ? { 'data-sibling-kind': line.edge.sibling ?? 'explicit' } : {})}
                  >
                    <title>{line.word}</title>
                  </path>
                  {/* A partner line is a *double* line: the second stroke is the
                      same path, nudged, which is what says "these two are one
                      thing" without a second geometry. */}
                  {line.edge.role === 'partner' && (
                    <path className="tree-line tree-line-partner tree-line-partner-second" d={line.d} />
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
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      setSelectedEdge(line.edge.id);
                      clearSelection();
                      setMenuOpen(false);
                    }}
                  />
                  {/* §67: a sibling line's word is in the list of ones that show
                      on hover — "half" is the whole reason the line is drawn at
                      all, so it must be readable without a click. */}
                  {(kin || chosen || sibling) && line.word && (
                    <text className="tree-line-label" x={line.at.x} y={line.at.y - 4} textAnchor="middle">
                      {line.word}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* The cards. */}
          {graph.nodes.map((node) => {
            const box = boxOf(node.id);
            if (!box) return null;
            const held = carried.get(node.id);
            return (
              <TreeNode
                key={node.id}
                node={node}
                box={box}
                selected={selected.has(node.id)}
                dragging={Boolean(drag?.[node.id])}
                carried={Boolean(held) && !drag?.[node.id]}
                carriedColour={held?.colour ?? null}
                canEdit={canEdit}
                words={{ looseCard: words.looseCard }}
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
          {[...heldByOthers].map(([id, holder]) => {
            const box = boxOf(id);
            if (!box) return null;
            return (
              <div
                key={`held-${id}`}
                className="tree-held"
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
                offers={offersFor(selectedNode)}
                menu={menuFor(selectedNode)}
                menuOpen={menuOpen}
                onMenu={setMenuOpen}
                onAdd={(role) => openPicker(selectedNode, role)}
              />
            );
          })()}

          {/* §67: two chosen, and one `+` between them. */}
          {canEdit && bothParents && bothField && !inkActive && (() => {
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
          {canEdit && selectionBounds && !inkActive && (
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
        {selectedLine && canEdit && (
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
        <InkShell shell={ink} corner="bottom-right" />

        {empty && !inkActive && (
          <div className="tree-empty">
            <p className="small muted">
              {canEdit
                ? `Nog niemand in deze ${words.familyTree}. Zoek een ${words.entry} hierboven, of maak een ${words.looseCard}.`
                : `Deze ${words.familyTree} is nog leeg.`}
            </p>
          </div>
        )}
      </div>

      <p className="tiny muted tree-count">
        {state.members.length + state.loose.length}{' '}
        {state.members.length + state.loose.length === 1 ? 'kaartje' : 'kaartjes'}
        {ghosts.length > 0 && <> · {ghosts.length} verwant{ghosts.length === 1 ? '' : 'en'} erbuiten</>}
        {' · '}sleep om te schuiven, scroll of knijp om te zoomen
        {canEdit && !isPhone && (
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
  const left = Math.max(8, Math.min(stage.width - width - 8, at.x - width / 2));
  const top = Math.max(8, Math.min(Math.max(8, stage.height - 200), at.y + 12));
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

  if (child) {
    return (
      <div
        className="tree-picker"
        data-testid="tree-picker-second-parent"
        style={{ left, top, width }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          onSkip();
        }}
      >
        <p className="tiny muted tree-picker-head">
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
      className="tree-picker"
      data-testid="tree-picker"
      style={{ left, top, width }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onCancel();
      }}
    >
      <p className="tiny muted tree-picker-head">
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
      <label className="field">
        <span>Tekst</span>
        <textarea
          className="input"
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => onSave({ text })}
        />
      </label>
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
