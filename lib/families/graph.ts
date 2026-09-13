import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { FieldDef } from '@/lib/db/schema';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { frameForType } from './frames';
import { dedupeEdges, edgesFromFields, refIdsIn, roleFieldsOf, ROLE_LABELS } from './roles';
import type {
  EntryGraphNode,
  FamilyGraph,
  FamilyTree,
  GraphEdge,
  GraphNode,
  LooseGraphNode,
  RoleFieldInfo,
} from './types';

/**
 * §66 — the drawing, built per viewer.
 *
 * A stamboom is a window: the *lines* are fields on the artikelen and the
 * *frame* is the soort, so almost nothing here comes out of `family_trees`.
 * What that table holds is who stands in the tree, where a hand put them, the
 * losse kaartjes and the lines that touch one.
 *
 * Rule 1 is the shape of the whole file: **an artikel this viewer may not see
 * is absent, never MISSING.** "X has a parent you may not see" is itself a
 * secret, so there is no faint card and no stamp — the person is not in the
 * drawing at all, and neither is any line to them.
 */

/** How many ghosts one tree may show. Past this it is a hairball, not a tree. */
export const MAX_GHOSTS = 60;

type EntryRow = {
  id: string;
  name: string;
  slug: string;
  typeId: string;
  fields: Record<string, unknown>;
  coverAssetId: string | null;
  coverCrop: unknown;
};

type SoortRow = {
  id: string;
  slug: string;
  label: string;
  icon: string;
  colour: string;
  defs: FieldDef[];
};

function readEntries(ids: string[], viewer: Viewer): EntryRow[] {
  if (!ids.length) return [];
  return db
    .select({
      id: schema.entries.id,
      name: schema.entries.name,
      slug: schema.entries.slug,
      typeId: schema.entries.typeId,
      fields: schema.entries.fields,
      // Round 19: the crop is normalised by the drizzle column type on the way
      // out, so it is passed on exactly as `lib/web/service.ts` passes it on.
      coverAssetId: schema.entries.coverAssetId,
      coverCrop: schema.entries.coverCrop,
    })
    .from(schema.entries)
    .where(and(inArray(schema.entries.id, ids), visibleEntryCondition(viewer)))
    .all()
    .map((row) => ({ ...row, fields: (row.fields ?? {}) as Record<string, unknown> }));
}

function readSoorten(typeIds: string[]): Map<string, SoortRow> {
  const out = new Map<string, SoortRow>();
  if (!typeIds.length) return out;
  for (const row of db
    .select({
      id: schema.entryTypes.id,
      slug: schema.entryTypes.slug,
      label: schema.entryTypes.label,
      icon: schema.entryTypes.icon,
      colour: schema.entryTypes.colour,
      defs: schema.entryTypes.fields,
    })
    .from(schema.entryTypes)
    .where(inArray(schema.entryTypes.id, typeIds))
    .all()) {
    out.set(row.id, { ...row, defs: (row.defs ?? []) as FieldDef[] });
  }
  return out;
}

/** The `achternaam` box, when the soort has one and somebody filled it in. */
function surnameOf(fields: Record<string, unknown>): string | null {
  const value = fields.achternaam;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The first of `status` / `toestand` that holds a word — the small line under the name. */
function statusOf(fields: Record<string, unknown>): string | null {
  for (const key of ['status', 'toestand']) {
    const value = fields[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * §66/§51: the `familie` link, resolved. It colours the frame and names the
 * branch, so it goes through `visibleEntryCondition` like everything else: a
 * Familie-artikel the viewer may not see leaves the card without a house
 * rather than naming one they were not told about.
 */
function readHouses(fields: Record<string, unknown>[], viewer: Viewer) {
  const ids = [...new Set(fields.flatMap((one) => refIdsIn(one.familie)))];
  const out = new Map<string, { id: string; name: string; colour: string | null }>();
  if (!ids.length) return out;
  for (const row of db
    .select({ id: schema.entries.id, name: schema.entries.name, colour: schema.entryTypes.colour })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(inArray(schema.entries.id, ids), visibleEntryCondition(viewer)))
    .all()) {
    out.set(row.id, { id: row.id, name: row.name, colour: row.colour });
  }
  return out;
}

/**
 * Everything the canvas draws, for one tree and one pair of eyes.
 *
 * Five reads and no more, whatever the size of the tree: the members, the
 * soorten of the members, the ghosts, the soorten of the ghosts, and the
 * families. The rest is arithmetic.
 */
export function buildFamilyGraph(tree: FamilyTree, viewer: Viewer): FamilyGraph {
  const state = tree.state;

  /* --------------------------------------------------------- the members */

  const memberIds = state.members.map((member) => member.id);
  const memberRows = readEntries(memberIds, viewer);
  const soorten = readSoorten([...new Set(memberRows.map((row) => row.typeId))]);
  const placeOf = new Map(state.members.map((member) => [member.id, member]));

  const roleFields: Record<string, RoleFieldInfo[]> = {};
  for (const row of memberRows) {
    roleFields[row.id] = roleFieldsOf(soorten.get(row.typeId)?.defs ?? []);
  }

  /*
   * --------------------------------------------------------- the ghosts
   *
   * A ghost is somebody a member's role field points at who is not in the tree.
   * Only that direction is read: the fields of the members themselves, never
   * "every artikel in the archive whose fields mention a member", which would
   * be a json scan of the whole table on every render.
   *
   * That is enough because the server mirrors (§66, `applyMirror`): a `parent`,
   * `child` or `partner` written on either page is written on both, so reading
   * one side finds every one of them. The exception is `kin`, which is not
   * mirrored — an aspect, an eed, a vermoeden is one person's claim — so "B
   * says it is an aspect of A" does not make B a ghost of a tree that holds
   * only A. Deliberate, and the cheap fix if it ever matters is to put B in the
   * tree.
   */
  const inTree = new Set(memberRows.map((row) => row.id));
  const wanted = new Set<string>();
  for (const row of memberRows) {
    for (const edge of edgesFromFields(row.id, soorten.get(row.typeId)?.defs ?? [], row.fields)) {
      if (!inTree.has(edge.targetId)) wanted.add(edge.targetId);
    }
  }
  /*
   * And the artikelen the tree's *own* lines name. A tie always has at least
   * one loose end (`mergeTreeState` refuses one between two artikelen), and the
   * other end is often somebody who is not a member — "de vader van Pier" was
   * hung on Pier before anybody put Pier in the tree, or Pier was taken out
   * again afterwards. Such a line used to be dropped in silence, which read as
   * a los kaartje that had lost its line for no reason anybody could see. The
   * artikel becomes a ghost, exactly as a relative named by a field does, and
   * the line is drawn to it.
   *
   * Rule 1 still decides: an artikel this reader may not see never comes back
   * from `readEntries`, so it is not a ghost either and the line goes with it.
   */
  for (const tie of state.ties) {
    for (const end of [tie.from, tie.to]) {
      if (end.kind === 'entry' && !inTree.has(end.id)) wanted.add(end.id);
    }
  }
  const ghostRows = readEntries([...wanted], viewer)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
    .slice(0, MAX_GHOSTS);
  const ghostSoorten = readSoorten([...new Set(ghostRows.map((row) => row.typeId))]);
  for (const [id, soort] of ghostSoorten) if (!soorten.has(id)) soorten.set(id, soort);

  const houses = readHouses([...memberRows, ...ghostRows].map((row) => row.fields), viewer);

  const entryNode = (row: EntryRow, standing: 'member' | 'ghost'): EntryGraphNode => {
    const soort = soorten.get(row.typeId);
    const place = standing === 'member' ? placeOf.get(row.id) : undefined;
    const houseId = refIdsIn(row.fields.familie)[0];
    return {
      id: `entry:${row.id}`,
      kind: 'entry',
      entryId: row.id,
      name: row.name,
      slug: row.slug,
      typeSlug: soort?.slug ?? '',
      typeLabel: soort?.label ?? '',
      icon: soort?.icon ?? null,
      colour: soort?.colour ?? null,
      frame: frameForType(soort?.slug ?? ''),
      coverAssetId: row.coverAssetId ?? null,
      coverCrop: row.coverCrop ?? null,
      surname: surnameOf(row.fields),
      house: (houseId ? houses.get(houseId) : undefined) ?? null,
      status: statusOf(row.fields),
      standing,
      ...(place?.x === undefined ? {} : { x: place.x }),
      ...(place?.y === undefined ? {} : { y: place.y }),
      ...(place?.pinned ? { pinned: true } : {}),
    };
  };

  const nodes: GraphNode[] = [
    ...memberRows.map((row) => entryNode(row, 'member')),
    ...ghostRows.map((row) => entryNode(row, 'ghost')),
  ];

  /* ------------------------------------------------------ the losse kaartjes */

  for (const card of state.loose) {
    const node: LooseGraphNode = {
      id: `loose:${card.id}`,
      kind: 'loose',
      looseId: card.id,
      name: card.name,
      text: card.text ?? '',
      frame: card.frame,
      standing: 'member',
      ...(card.x === undefined ? {} : { x: card.x }),
      ...(card.y === undefined ? {} : { y: card.y }),
      ...(card.pinned ? { pinned: true } : {}),
    };
    nodes.push(node);
  }

  /* ------------------------------------------------------------- the lines */

  /*
   * Off the fields first. Both ends must be drawn — a line to somebody who is
   * neither a member nor a ghost has nowhere to land, and a ghost's line to
   * another ghost is a family the tree is not about.
   */
  const drawn = new Set([...memberRows.map((row) => row.id), ...ghostRows.map((row) => row.id)]);
  const ghostIds = new Set(ghostRows.map((row) => row.id));
  const fieldEdges = [];
  for (const row of [...memberRows, ...ghostRows]) {
    for (const edge of edgesFromFields(row.id, soorten.get(row.typeId)?.defs ?? [], row.fields)) {
      if (!drawn.has(edge.from) || !drawn.has(edge.to)) continue;
      // A ghost is drawn for its line to the tree, not for its own family.
      if (ghostIds.has(edge.from) && ghostIds.has(edge.to)) continue;
      fieldEdges.push({ ...edge, entryId: row.id });
    }
  }

  const edges: GraphEdge[] = dedupeEdges(fieldEdges).map((edge) => ({
    id: `field:${edge.entryId}:${edge.fieldKey}:${edge.targetId}`,
    from: `entry:${edge.from}`,
    to: `entry:${edge.to}`,
    role: edge.role,
    label: edge.label,
    source: { kind: 'field', entryId: edge.entryId, fieldKey: edge.fieldKey, targetId: edge.targetId },
  }));

  /*
   * And the tree's own lines. A tie whose artikel end this viewer may not see
   * goes with the person it pointed at — the same rule the nodes follow, for
   * the same reason. The end has to be *drawn*, not to be a member: an artikel
   * a tie names is a ghost when it is not in the tree (see above), and a ghost
   * the 60-cap left out is not on the glass, so its line has nowhere to land.
   */
  const looseIds = new Set(state.loose.map((card) => card.id));
  for (const tie of state.ties) {
    const ends = [tie.from, tie.to];
    if (ends.some((end) => (end.kind === 'entry' ? !drawn.has(end.id) : !looseIds.has(end.id)))) continue;
    edges.push({
      id: `tie:${tie.id}`,
      from: `${tie.from.kind}:${tie.from.id}`,
      to: `${tie.to.kind}:${tie.to.id}`,
      role: tie.role,
      label: tie.label || ROLE_LABELS[tie.role],
      source: { kind: 'tie', tieId: tie.id },
    });
  }

  return { nodes, edges, roleFields };
}
