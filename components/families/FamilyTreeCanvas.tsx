'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { EntryPicker, type EntryRef } from '@/components/entry/EntryPicker';
import { InkCanvas } from '@/components/ink/InkCanvas';
import { InkCapture, InkKeeperControls, InkToolbar, useInkTool } from '@/components/ink/InkTools';
import { useInk } from '@/components/ink/useInk';
import { OWN_WRITE_MUTE_MS, useLive, useLiveChanges } from '@/components/live/LiveProvider';
import { useHoldRefresh } from '@/components/live/refreshHold';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { useIsPhone } from '@/components/useIsPhone';
import { useAuthorGate, useMayType } from '@/components/you/AuthorProvider';

import type { AccessSettings } from '@/lib/access';
import { FRAME_LABELS } from '@/lib/families/frames';
import {
  boxCentre,
  clampZoom,
  curvePath,
  edgeGeometry,
  fitViewport,
  isTreeView,
  layoutTree,
  partnerLine,
  toWorld,
  zoomAbout,
  type Box,
  type Point,
  type TreeView,
} from '@/lib/families/layout';
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
import { TreeHandles, type HandleOffer, type HandleRole, type TreeMenuItem } from './TreeHandles';
import { TreeNode } from './TreeNode';
import { createUndoStack, UNDO_LIMIT } from './treeUndo';
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

  const [selected, setSelected] = useState<GraphNodeId | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [picker, setPicker] = useState<{ nodeId: GraphNodeId; role: HandleRole; at: { x: number; y: number } } | null>(null);
  const [sheet, setSheet] = useState<{ looseId: string } | null>(null);
  const [inkDrawing, setInkDrawing] = useState(false);
  const [dragging, setDragging] = useState(false);

  /**
   * §8, live: this tab. One person with the tree open twice is two hands on it,
   * which is what they will see. Generated once, never re-generated.
   */
  const clientIdRef = useRef('');
  if (!clientIdRef.current) clientIdRef.current = `t_${Math.random().toString(36).slice(2, 12)}`;
  const clientId = clientIdRef.current;

  const undoStack = useRef(createUndoStack<FamilyTreeState>(UNDO_LIMIT));

  /* ---------------------------------------------------------------- save */

  const busy = dragging || inkDrawing || picker !== null || sheet !== null;
  useHoldRefresh(busy);

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
    setSelected(null);
    setSelectedEdge(null);
    // The whole document goes: an undo can move anything, and working out what
    // it put back is exactly the bookkeeping `all` exists to avoid.
    syncRef.current.saveNow();
    refreshArchive();
  }, [canEdit, setState, refreshArchive]);

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
   * The card this hand is carrying, and everybody else's. A drag does not
   * re-run the layout — the positions are patched, and the union bars that
   * depend on the moved card are recentred, which is the only part of the
   * geometry a move can change.
   */
  const [drag, setDrag] = useState<{ id: GraphNodeId; x: number; y: number } | null>(null);
  const [carried, setCarried] = useState<Map<GraphNodeId, { x: number; y: number; colour: string }>>(new Map());

  const layout = useMemo(() => {
    const moved = new Map<GraphNodeId, { x: number; y: number }>();
    if (drag) moved.set(drag.id, { x: drag.x, y: drag.y });
    for (const [id, at] of carried) if (!drag || drag.id !== id) moved.set(id, { x: at.x, y: at.y });
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

  const geometry = useMemo(() => edgeGeometry(layout, sizes), [layout, sizes]);

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
   */
  const lines = useMemo<DrawnLine[]>(() => {
    const geomById = new Map(geometry.unions.map((union) => [union.unionId, union]));
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
      if (role === 'parent') {
        const union = layout.unions.find(
          (item) => item.children.includes(to) && item.parents.includes(from),
        );
        const geom = union ? geomById.get(union.id) : undefined;
        const parent = geom?.parents.find((item) => item.id === from);
        const child = geom?.children.find((item) => item.id === to);
        if (geom && parent && child) {
          out.push({ edge, d: polyline([...parent.points, ...child.points]), at: geom.bar });
          continue;
        }
        // A back edge of a cycle has no union to hang from: a straight line, so
        // it is still drawn and still clickable (`layoutTree` keeps it out of
        // the generations, never out of the picture).
        const a = boxCentre(boxA);
        const b = boxCentre(boxB);
        out.push({ edge, d: polyline([a, b]), at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
        continue;
      }
      if (role === 'partner') {
        const link = partnerLine(boxA, boxB);
        out.push({
          edge,
          d: `M ${link.x1} ${link.y1} L ${link.x2} ${link.y2}`,
          at: { x: (link.x1 + link.x2) / 2, y: link.y1 },
        });
        continue;
      }
      const a = boxCentre(boxA);
      const b = boxCentre(boxB);
      out.push({ edge, d: curvePath(a.x, a.y, b.x, b.y), at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
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

  const glass = view ?? { x: 0, y: 0, zoom: 1 };
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
  const reportHand = useCallback(
    (point: { clientX: number; clientY: number } | null, moving?: { id: GraphNodeId; x: number; y: number }) => {
      const el = stageRef.current;
      const current = viewRef.current;
      if (!point || !el || !current) {
        reportLivePointer(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const x = point.clientX - rect.left;
      const y = point.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        reportLivePointer(null);
        return;
      }
      const world = toWorld(current, x, y);
      reportLivePointer({
        x: world.x,
        y: world.y,
        m: moving ? { [moving.id]: [moving.x, moving.y] } : {},
      });
    },
    [reportLivePointer],
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

  /* ----------------------------------------------------------------- ink */

  /*
   * §33: the tekenlaag, in *world* units like a prikbord's — `useInk` stores
   * `screenWidth / zoom`, so a brush is as thick as it looked at the zoom it
   * was drawn at and grows and shrinks with the tree.
   */
  const ink = useInk({
    kind: 'family_tree',
    id: tree.id,
    initial: initialInk,
    onError: (message) => ui.toast(message),
  });
  const inkTool = useInkTool();
  const inkActive = inkTool.active && ink.enabled;
  const inkProject = useCallback(
    (x: number, y: number) => ({ x: glass.x + x * glass.zoom, y: glass.y + y * glass.zoom }),
    [glass],
  );
  const inkToContent = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const current = viewRef.current ?? { x: 0, y: 0, zoom: 1 };
    return toWorld(current, clientX - (rect?.left ?? 0), clientY - (rect?.top ?? 0));
  }, []);
  useEffect(() => {
    if (!ink.enabled && inkTool.active) inkTool.setActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink.enabled]);

  /* ---------------------------------------------------------------- pan */

  const pan = useRef<{ pointerId: number; startX: number; startY: number; from: TreeView; moved: boolean } | null>(null);
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
        '.tree-node, .tree-handle, .tree-menu, .tree-line-menu, .tree-picker, .tree-line-hit, .ink-toolbar',
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
    const gesture = pan.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    pan.current = null;
    setGrabbing(false);
    // A press on bare paper that went nowhere lets everything go.
    if (!gesture.moved) {
      setSelected(null);
      setSelectedEdge(null);
      setMenuOpen(false);
      setPicker(null);
    }
  };

  /* --------------------------------------------------------------- drag */

  const nodeDrag = useRef<{
    id: GraphNodeId;
    pointerId: number;
    startX: number;
    startY: number;
    origin: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  /** Where this hand has the card right now, readable from a plain handler. */
  const dragRef = useRef<{ id: GraphNodeId; x: number; y: number } | null>(null);
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
    pressWasSelected.current = selected;
    pressTravelled.current = false;
    setSelected(node.id);
    setSelectedEdge(null);
    setMenuOpen(false);
    if (!canEdit || node.standing === 'ghost') return;
    const at = layout.positions[node.id];
    if (!at) return;
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
      origin: { x: at.x, y: at.y },
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
    const at = { x: held.origin.x + dx, y: held.origin.y + dy };
    dragRef.current = { id: held.id, ...at };
    setDrag({ id: held.id, ...at });
    reportHand({ clientX: event.clientX, clientY: event.clientY }, { id: held.id, ...at });
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
    const at = carrying && carrying.id === held.id ? { x: carrying.x, y: carrying.y } : null;
    dragRef.current = null;
    setDrag(null);
    if (!held.moved || !at || !commitIt) return;
    const ref = held.id.startsWith('loose:') ? 'loose' : 'entry';
    const rawId = held.id.slice(held.id.indexOf(':') + 1);
    const now = Date.now();
    commit((prev) =>
      ref === 'loose'
        ? {
            loose: prev.loose.map((card) =>
              card.id === rawId ? { ...card, x: at.x, y: at.y, pinned: true, updatedAt: now } : card,
            ),
          }
        : {
            members: prev.members.some((member) => member.id === rawId)
              ? prev.members.map((member) =>
                  member.id === rawId ? { ...member, x: at.x, y: at.y, pinned: true, updatedAt: now } : member,
                )
              : [...prev.members, { id: rawId, x: at.x, y: at.y, pinned: true, updatedAt: now }],
          },
    );
    // The carry sticks on the other screens until their pull lands.
    reportHand({ clientX: event.clientX, clientY: event.clientY }, { id: held.id, ...at });
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
      setSelected(null);
      ui.toast(`Uit de ${words.familyTree} gehaald; de velden op het ${words.entry} blijven staan.`);
    },
    [commit, ui, words.entry, words.familyTree],
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
      setSelected(null);
      setSheet(null);
    },
    [commit, ui, words.looseCard],
  );

  /** A new los kaartje in the middle of the glass, ready to be named. */
  const addLoose = useCallback(
    (cardName: string, at?: { x: number; y: number }, tie?: { handle: HandleRole; other: GraphNodeId }) => {
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
        // `other`, so the tie runs the way `tieFor` says it does.
        ...(tie ? { ties: [...prev.ties, tieFor(tie.handle, tie.other, `loose:${id}`, now)] } : {}),
      }));
      setSelected(`loose:${id}`);
      return id;
    },
    [commit, size],
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
        if (data.graph) setGraph(data.graph);
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
        setSelected(`entry:${entryId}`);
        if (data.dropped) {
          ui.toast(`${data.dropped} ${data.dropped === 1 ? 'lijn is' : 'lijnen zijn'} niet overgezet.`);
        }
        refreshArchive();
      } catch {
        ui.toast('Geen verbinding.');
      }
    },
    [tree.id, clientId, ui, applyDocument, sync, refreshArchive],
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
  const selectedNode = nodeById(selected);

  /** Which field a handle would write, or null when the soort has none. */
  const fieldFor = useCallback(
    (node: GraphNode, role: HandleRole): RoleFieldInfo | null => {
      if (node.kind !== 'entry') return null;
      const fields = graph.roleFields[node.entryId] ?? [];
      return fields.find((field) => field.role === role) ?? null;
    },
    [graph.roleFields],
  );

  const offersFor = useCallback(
    (node: GraphNode): HandleOffer[] =>
      (['parent', 'child', 'partner'] as HandleRole[]).map((role) => {
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
              : edge.role === 'partner' && (edge.from === node.id || edge.to === node.id);
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
      const anchor =
        role === 'parent'
          ? { x: at.x + size2.width / 2, y: at.y }
          : role === 'child'
            ? { x: at.x + size2.width / 2, y: at.y + size2.height }
            : { x: at.x + size2.width, y: at.y + size2.height / 2 };
      setMenuOpen(false);
      setPicker({ nodeId: node.id, role, at: toScreen(anchor) });
    },
    [layout.positions, sizes, toScreen],
  );

  /** Somebody chosen in the picker, hung on the node the picker opened for. */
  const attach = useCallback(
    async (source: GraphNode, role: HandleRole, target: { id: string; name: string }) => {
      setPicker(null);
      if (source.kind === 'entry') {
        const field = fieldFor(source, role);
        if (!field) return;
        // Solid straight away: the person is in the tree, then the field is
        // written. The other order leaves them a ghost for a round trip.
        addMember(target.id);
        await writeRelation(source.entryId, field.key, target.id);
        setSelected(`entry:${target.id}`);
        return;
      }
      // A los kaartje has no page to write a field on, so the line is the
      // tree's own (§66: a tie with at least one loose end).
      addMember(target.id);
      const now = Date.now();
      commit((prev) => ({ ties: [...prev.ties, tieFor(role, source.id, `entry:${target.id}`, now)] }));
      setSelected(`entry:${target.id}`);
    },
    [fieldFor, addMember, writeRelation, commit],
  );

  /** And a los kaartje hung on whatever the picker opened for. */
  const attachLoose = useCallback(
    (source: GraphNode, role: HandleRole, cardName: string) => {
      setPicker(null);
      const at = layout.positions[source.id];
      const size2 = sizes[source.id] ?? NODE_SIZE.mortal;
      const spot = at
        ? {
            x: at.x + size2.width / 2 + (role === 'partner' ? size2.width + 60 : 0),
            y:
              at.y +
              size2.height / 2 +
              (role === 'parent' ? -(size2.height + 110) : role === 'child' ? size2.height + 110 : 0),
          }
        : undefined;
      addLoose(cardName, spot, { handle: role, other: source.id });
    },
    [layout.positions, sizes, addLoose],
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
        if (inkActive) {
          inkTool.setActive(false);
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
        setSelected(null);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (inkActive) ink.undo();
        else undo();
        return;
      }
      if (!canEdit || sheet) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const node = selected ? graphRef.current.nodes.find((item) => item.id === selected) : null;
        if (!node || node.standing === 'ghost') return;
        event.preventDefault();
        if (node.kind === 'loose') void removeLoose(node.looseId, node.name);
        else void removeMember(node.entryId, node.name);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inkActive, inkTool, ink, picker, menuOpen, selectedEdge, selected, canEdit, sheet, undo, removeLoose, removeMember]);

  /* ------------------------------------------------------------ the e2e seam */

  useEffect(() => {
    // The web does the same (`window.__web`): a spec running against a
    // production build has no other honest way to find a card on the glass.
    (window as unknown as { __tree?: unknown }).__tree = {
      positions: layout.positions,
      view: glass,
      nodes: () => graphRef.current.nodes,
    };
  }, [layout.positions, glass]);

  /* --------------------------------------------------------------- render */

  const pickerNode = picker ? nodeById(picker.nodeId) : null;
  const pickerField = pickerNode && picker ? fieldFor(pickerNode, picker.role) : null;
  const editing = sheet ? (state.loose.find((card) => card.id === sheet.looseId) ?? null) : null;
  const selectedLine = selectedEdge ? (lines.find((line) => line.edge.id === selectedEdge) ?? null) : null;
  const empty = !state.members.length && !state.loose.length;

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
                  setSelected(`entry:${entry.id}`);
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
          strokes={ink.strokes}
          stableCount={ink.stableCount}
          project={inkProject}
          widthScale={glass.zoom}
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
              return (
                <g key={line.edge.id} className={`tree-edge tree-edge-${line.edge.role}${chosen ? ' is-selected' : ''}`}>
                  <path className={`tree-line tree-line-${line.edge.role}`} d={line.d} data-edge-id={line.edge.id}>
                    <title>{line.edge.label}</title>
                  </path>
                  {/* A partner line is a *double* line: the second stroke is the
                      same path, nudged, which is what says "these two are one
                      thing" without a second geometry. */}
                  {line.edge.role === 'partner' && (
                    <path className="tree-line tree-line-partner tree-line-partner-second" d={line.d} />
                  )}
                  <path
                    className="tree-line-hit"
                    d={line.d}
                    data-edge-id={line.edge.id}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      setSelectedEdge(line.edge.id);
                      setSelected(null);
                      setMenuOpen(false);
                    }}
                  />
                  {(kin || chosen) && line.edge.label && (
                    <text className="tree-line-label" x={line.at.x} y={line.at.y - 4} textAnchor="middle">
                      {line.edge.label}
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
                selected={selected === node.id}
                dragging={drag?.id === node.id}
                carried={Boolean(held) && drag?.id !== node.id}
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

          {/* The handles, on the card a hand has chosen. */}
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
            <button
              type="button"
              className="btn btn-small"
              data-testid="tree-remove-line"
              onClick={() => void removeLine(selectedLine.edge)}
            >
              <Icon name="close" size={13} />
              {capitalise(words.treeLine)} verwijderen
            </button>
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
            ghosts={ghostsFor(pickerNode, picker.role)}
            words={words}
            onCancel={() => setPicker(null)}
            onPickGhost={(ghost) => {
              setPicker(null);
              if (ghost.kind === 'entry') addMember(ghost.entryId);
            }}
            onPickEntry={(entry) => void attach(pickerNode, picker.role, entry)}
            onLoose={(cardName) => attachLoose(pickerNode, picker.role, cardName)}
          />
        )}

        {/* §33: the potlood is offered to everybody who may *look*, so it lives
            on the stage rather than in the toolbar an editor gets. */}
        {ink.enabled && (
          <InkToolbar
            className="tree-ink-toolbar"
            active={inkTool.active}
            tool={inkTool.tool}
            onActive={(next) => {
              inkTool.setActive(next);
              if (next) {
                setSelected(null);
                setSelectedEdge(null);
                setPicker(null);
              }
            }}
            onTool={inkTool.setTool}
            canUndo={ink.canUndo}
            onUndo={ink.undo}
            saving={ink.saving}
          />
        )}

        {inkActive && (
          <InkCapture
            tool={inkTool.tool}
            toContent={inkToContent}
            widthScale={glass.zoom}
            onBegin={(...args) => {
              setInkDrawing(true);
              return ink.begin(...args);
            }}
            onExtend={ink.extend}
            onEnd={(...args) => {
              setInkDrawing(false);
              return ink.end(...args);
            }}
            onAbort={(...args) => {
              setInkDrawing(false);
              return ink.abort(...args);
            }}
            stopPropagation
          />
        )}

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
        {canEdit && !isPhone && <> · sleep een kaartje om het vast te zetten</>}
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

      {isKeeper && (
        <UnderFold>
          <InkKeeperControls
            enabled={ink.enabled}
            strokeCount={ink.layer.strokes.length}
            noun={`deze ${words.familyTree}`}
            onSetEnabled={(enabled) => void ink.keeper({ enabled })}
            onClear={() =>
              void ui
                .confirm({
                  title: 'Tekenlaag wissen?',
                  message: `Alle streken op deze ${words.familyTree} gaan weg, voor iedereen. Dit is niet terug te draaien.`,
                  confirmLabel: 'Wissen',
                  danger: true,
                })
                .then((yes) => yes && ink.keeper({ clear: true }))
            }
          />
        </UnderFold>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

/** The empty div a stamboom's page leaves below the canvas, for `UnderFold`. */
const UNDER_FOLD_ID = 'tree-underfold';

/**
 * §34: the stamboom takes the screen, so anything in the canvas column that is
 * neither the bar, the toolbar nor the stage is a line taken off the drawing.
 * The Keeper's tekenlaag switch is a *tool* — 132 px of one on a telephone,
 * which was the difference between a stage that fills three-quarters of the
 * screen and one that fills under half, and only for a Keeper, so nobody sees
 * it until somebody measures it. The landkaart met this exact question and
 * answered it exactly this way (`UnderFold` in `MapCanvas`); the tijdlijn's
 * answer is its Instellingen sheet, which a stamboom has not got.
 *
 * Placed after mount rather than rendered where it stands, so the block never
 * shows in the column and then jumps out of it. No slot — a player's page,
 * where there is nothing below the fold — means nothing to place.
 */
function UnderFold({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(UNDER_FOLD_ID)), []);
  return slot ? createPortal(children, slot) : null;
}

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
 * **onder** makes it the child, and **opzij** is undirected. That is the same
 * normalisation `edgesFromFields` does for a field, one layer along, so a tie
 * and a field describe a line the same way round.
 */
function tieFor(handle: HandleRole, sourceId: GraphNodeId, targetId: GraphNodeId, now: number): TreeTie {
  const source = parseRef(sourceId);
  const target = parseRef(targetId);
  const role: FieldRole = handle === 'partner' ? 'partner' : 'parent';
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
 */
function TreePickerBox({
  at,
  stage,
  role,
  field,
  node,
  ghosts,
  words,
  onCancel,
  onPickGhost,
  onPickEntry,
  onLoose,
}: {
  at: { x: number; y: number };
  stage: { width: number; height: number };
  role: HandleRole;
  field: RoleFieldInfo | null;
  node: GraphNode;
  ghosts: GraphNode[];
  words: Record<string, string>;
  onCancel: () => void;
  onPickGhost: (ghost: GraphNode) => void;
  onPickEntry: (entry: EntryRef) => void;
  onLoose: (name: string) => void;
}) {
  const [looseName, setLooseName] = useState('');
  const width = 280;
  const left = Math.max(8, Math.min(stage.width - width - 8, at.x - width / 2));
  const top = Math.max(8, Math.min(Math.max(8, stage.height - 200), at.y + 12));
  const heading = field ? field.label : ROLE_LABELS[role === 'child' ? 'child' : role];

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
        {heading} bij <strong>{node.name}</strong>
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
