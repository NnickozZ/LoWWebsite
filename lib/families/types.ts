import type { AccessMode } from '@/lib/db/schema';

/**
 * §66 — de stamboom.
 *
 * A stamboom is a *window* onto the archive's kinship, not a second place where
 * kinship is written down. Who is whose parent, child or partner is a fact
 * about a person and lives on the artikel, in koppelingsvelden that carry a
 * `role` (`lib/families/roles.ts`): fill in "Ouders" on the meer-details face
 * of an artikel and every stamboom that person stands in draws the line. The
 * tree itself remembers only what is *its own*: who stands in it, where a hand
 * put them, the loose cards that are not artikelen (yet), and the lines that
 * touch a loose card — because a loose card has no page to write a field on.
 *
 * This file is the contract between the pure layer (`merge.ts`, `layout.ts`,
 * `roles.ts`), the server (`service.ts`, `graph.ts`, the API routes) and the
 * canvas (`components/families/FamilyTreeCanvas.tsx`). It imports nothing that
 * touches a database, so a client component may import it.
 */

// ---------------------------------------------------------------------------
// Roles on a koppelingsveld (lib/families/roles.ts owns the logic)
// ---------------------------------------------------------------------------

/**
 * What a koppelingsveld *means* in a stamboom. Only `entry_link` / `entry_links`
 * fields may carry one. The role decides the layout — `parent`/`child` are
 * generational, `partner` makes a union, `kin` is a side tie with no
 * generation implied (an aspect, an oath) — and the field's *label* is the word
 * printed on the line, so "Geschapen door" is a `parent` role with a god's
 * vocabulary and needs no code of its own.
 */
export type FieldRole = 'parent' | 'child' | 'partner' | 'kin';

// ---------------------------------------------------------------------------
// The tree's own state — one JSON blob in `family_trees.state`, normalised on
// every read by `normaliseTreeState` (lib/families/merge.ts). A new field gets
// a default there; that *is* the migration (CLAUDE.md §5, board state rule).
// ---------------------------------------------------------------------------

/**
 * How a node is drawn. Decided per soort by `frameForType()` in
 * `lib/families/frames.ts`, and settable by hand on a loose card.
 *   mortal   – an index card with a portrait: personen, onderzoekers
 *   divine   – a round frame with a double ring: the four pantheon soorten
 *   house    – a wide banner with the sigil: a Familie-artikel standing in the
 *              tree as the head of its branch
 *   creature – a torn, asymmetric frame: abnormaliteiten
 *   unknown  – a dashed frame at reduced opacity: a loose card whose existence
 *              nobody has confirmed
 */
export type FrameKind = 'mortal' | 'divine' | 'house' | 'creature' | 'unknown';
export const FRAME_KINDS: readonly FrameKind[] = ['mortal', 'divine', 'house', 'creature', 'unknown'];

/** A node in a tree is either an artikel or a loose card. */
export type NodeRef = { kind: 'entry'; id: string } | { kind: 'loose'; id: string };

/** An artikel that stands in this tree. Position only when a hand put it there (`pinned`). */
export type TreeMember = {
  /** The entry id. Members are keyed on it: one artikel stands in a tree once. */
  id: string;
  x?: number;
  y?: number;
  /** §66: a hand placed it; the layout leaves it where it is until "Opnieuw schikken". */
  pinned?: boolean;
  updatedAt: number;
};

/** A card that is not an artikel: "Onbekende vader", "Iets uit de diepte". */
export type LooseCard = {
  id: string;
  name: string;
  /** A line or two under the name. */
  text?: string;
  frame: FrameKind;
  x?: number;
  y?: number;
  pinned?: boolean;
  updatedAt: number;
};

/**
 * A line the tree owns. Only lines with at least one loose end live here;
 * a line between two artikelen is a field on one of them and is never stored
 * in the tree (the server refuses it — `mergeTreeState` drops such a tie).
 * `role: 'parent'` means `from` is the parent of `to`. `partner` and `kin`
 * are undirected; `partner` is stored with the two ends sorted so a duplicate
 * from the other side collapses.
 */
export type TreeTie = {
  id: string;
  from: NodeRef;
  to: NodeRef;
  role: FieldRole;
  /** The word on the line; empty means the role's own word. */
  label?: string;
  updatedAt: number;
};

export type TreeTombstones = {
  members: Record<string, number>;
  loose: Record<string, number>;
  ties: Record<string, number>;
};

export type FamilyTreeState = {
  v: 1;
  members: TreeMember[];
  loose: LooseCard[];
  ties: TreeTie[];
  deleted: TreeTombstones;
};

/**
 * What one autosave sends (`POST /api/family-trees/[id]`). Absence is never a
 * deletion; a tombstone is (§61). Ids in `deleted*` become tombstones.
 */
export type FamilyTreePatch = {
  members?: TreeMember[];
  loose?: LooseCard[];
  ties?: TreeTie[];
  deletedMembers?: string[];
  deletedLoose?: string[];
  deletedTies?: string[];
  /** The tab that wrote it, so its own echo can be told apart. */
  clientId?: string;
};

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export type FamilyTreeSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  caseId: string | null;
  caseName: string | null;
  caseSlug: string | null;
  /** §43: drawn in the web. */
  inWeb: boolean;
  /** §17 */
  viewMode: AccessMode;
  editMode: AccessMode;
  accessLocked: boolean;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  /** How many people this viewer may see in it — only the shelf asks. */
  memberCount?: number;
};

export type FamilyTree = FamilyTreeSummary & { state: FamilyTreeState };

// ---------------------------------------------------------------------------
// The graph the server builds per viewer (lib/families/graph.ts) and the canvas
// lays out (lib/families/layout.ts). Every entry node has already passed
// `visibleEntryCondition(viewer)`; an artikel the viewer may not see is
// *absent* — never a MISSING stamp, because "X has a parent you may not see"
// is itself a secret (rule 1).
// ---------------------------------------------------------------------------

export type GraphNodeId = string; // `entry:${id}` | `loose:${id}` — see nodeId()

export function nodeId(ref: NodeRef): GraphNodeId {
  return `${ref.kind}:${ref.id}`;
}

export function parseNodeId(id: GraphNodeId): NodeRef | null {
  const i = id.indexOf(':');
  if (i < 0) return null;
  const kind = id.slice(0, i);
  const rest = id.slice(i + 1);
  if (!rest) return null;
  if (kind === 'entry' || kind === 'loose') return { kind, id: rest };
  return null;
}

export type GraphNodeBase = {
  id: GraphNodeId;
  name: string;
  frame: FrameKind;
  x?: number;
  y?: number;
  pinned?: boolean;
};

export type EntryGraphNode = GraphNodeBase & {
  kind: 'entry';
  entryId: string;
  slug: string;
  typeSlug: string;
  typeLabel: string;
  icon: string | null;
  colour: string | null;
  /** The cover picture, if any: `/api/assets/{coverAssetId}?s=thumb` … */
  coverAssetId: string | null;
  /** §19 three crops; the canvas wears the vierkant one. Already normalised. */
  coverCrop: unknown;
  /** The `achternaam` field when the soort has one — printed under the name. */
  surname: string | null;
  /** The `familie` link when the soort has one — colours the frame, names the branch. */
  house: { id: string; name: string; colour: string | null } | null;
  /** Any short "status"/"toestand" field, for the small line under the name. */
  status: string | null;
  /**
   * `member`: stands in the tree. `ghost`: related to a member through a role
   * field but not (yet) in the tree — drawn faint at the edge with a "+".
   */
  standing: 'member' | 'ghost';
};

export type LooseGraphNode = GraphNodeBase & {
  kind: 'loose';
  looseId: string;
  text: string;
  standing: 'member';
};

export type GraphNode = EntryGraphNode | LooseGraphNode;

/**
 * One line. `source` says where it came from: a field on an artikel (so the
 * canvas knows which artikel to PATCH to remove it, and which field) or the
 * tree's own `ties`. For `parent` the line runs parent → child.
 */
export type GraphEdge = {
  id: string;
  from: GraphNodeId;
  to: GraphNodeId;
  role: FieldRole;
  label: string;
  source:
    | { kind: 'field'; entryId: string; fieldKey: string; targetId: string }
    | { kind: 'tie'; tieId: string };
};

export type FamilyGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /**
   * Which role fields each entry node's soort offers, so the "+ ouder" handle
   * knows which field to write and whether the soort has one at all.
   * Keyed on entry id; each entry lists `{ key, label, role, ofType }`.
   */
  roleFields: Record<string, RoleFieldInfo[]>;
};

export type RoleFieldInfo = {
  key: string;
  label: string;
  role: FieldRole;
  ofType?: string[];
};

// ---------------------------------------------------------------------------
// Layout (lib/families/layout.ts) — pure
// ---------------------------------------------------------------------------

export type LayoutNodeInput = {
  id: GraphNodeId;
  width: number;
  height: number;
  /** A pinned node keeps exactly this position. */
  pinned?: { x: number; y: number };
};

export type LayoutEdgeInput = {
  from: GraphNodeId;
  to: GraphNodeId;
  role: FieldRole;
};

export type Placed = { x: number; y: number; generation: number };

/** A union is one or two parents with the children they share; the bar the lines hang from. */
export type LayoutUnion = {
  id: string;
  parents: GraphNodeId[];
  children: GraphNodeId[];
  /** Centre of the bar in world coordinates. */
  x: number;
  y: number;
};

export type LayoutResult = {
  positions: Record<GraphNodeId, Placed>;
  unions: LayoutUnion[];
  /** World-space bounding box of everything placed. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export const NODE_SIZE: Record<FrameKind, { width: number; height: number }> = {
  mortal: { width: 150, height: 190 },
  divine: { width: 160, height: 200 },
  house: { width: 220, height: 120 },
  creature: { width: 150, height: 190 },
  unknown: { width: 140, height: 120 },
};

/** Gap between generations (rows) and between neighbours in a row, in world px. */
export const ROW_GAP = 110;
export const COL_GAP = 40;
/** Partners stand this close, so a union reads as one thing. */
export const PARTNER_GAP = 24;
