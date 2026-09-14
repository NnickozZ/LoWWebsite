import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { viewableCondition, viewerCanEdit } from '@/lib/access';
import type { Author } from '@/lib/auth/author';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { db, schema } from '@/lib/db';
import type { FieldDef } from '@/lib/db/schema';
import { recomputeFamilyTreeMentions } from '@/lib/entries/mentions';
import { logActivity, updateEntry, type SaveResult } from '@/lib/entries/service';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { newId } from '@/lib/ids';
import { isKeeperSide, setKeeperSide, sideCondition } from '@/lib/keeper/side';
import { isFieldKey } from '@/lib/pageBlocks';
import { uniqueSlug } from '@/lib/slug';
import { mergeTreeState, normaliseTreeState } from './merge';
import { refIdsIn, roleFieldsOf } from './roles';
import {
  classifySiblings,
  primaryParentField,
  type DerivedSiblingKind,
} from './siblings';
import type {
  FamilyTree,
  FamilyTreePatch,
  FamilyTreeState,
  FamilyTreeSummary,
  FieldRole,
  NodeRef,
  TreeTie,
} from './types';

/**
 * §66 — de stamboom, the archive's half.
 *
 * A stamboom is a *window* onto kinship that lives on the artikelen, so this
 * file is thinner than it looks: everything about who is whose parent is a
 * field on an artikel and is written through `updateEntry` (`writeRelation`
 * below), and what this table owns is only who stands in the tree, where a
 * hand put them, and the loose cards that are not artikelen yet.
 *
 * The idioms are the prikbord's and the tijdlijn's, on purpose and line for
 * line: the **viewer is the first argument and it is required** (§40); a *list*
 * AND-s `sideCondition` after the visibility rule and a *lookup* never does
 * (§46); a row whose dossier this viewer may not open is dropped in a second
 * pass; filing into a Keeper-only dossier takes the tree along and never the
 * other way round (§48).
 */

export const FAMILY_TREE_COLUMNS = {
  id: schema.familyTrees.id,
  name: schema.familyTrees.name,
  slug: schema.familyTrees.slug,
  description: schema.familyTrees.description,
  caseId: schema.familyTrees.caseId,
  caseName: schema.cases.name,
  caseSlug: schema.cases.slug,
  inWeb: schema.familyTrees.inWeb,
  viewMode: schema.familyTrees.viewMode,
  editMode: schema.familyTrees.editMode,
  accessLocked: schema.familyTrees.accessLocked,
  createdBy: schema.familyTrees.createdBy,
  createdAt: schema.familyTrees.createdAt,
  updatedAt: schema.familyTrees.updatedAt,
} as const;

/** §46: the sentence a refusal says when a hand may look but not draw. */
export const FAMILY_TREE_NOT_YOURS = 'Je mag deze stamboom niet bewerken.';

const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;

const seconds = () => Math.floor(Date.now() / 1000);

export type FamilyTreeListOptions = {
  sort?: 'recent' | 'name' | 'created';
  /** 'loose' = no dossier; 'case' = inside one; a case id = that one. */
  where?: 'loose' | 'case' | string;
  mine?: string;
  privateOnly?: boolean;
  /**
   * §46: read both sides of the archive, not the one the viewer stands on.
   * For pickers and record pages only — see `sideCondition`.
   */
  bothSides?: boolean;
};

/**
 * §17: a stamboom is visible when its own view dial allows the viewer AND, if
 * it hangs in a dossier, that dossier is visible — the same two-step
 * `listBoards` and `listTimelines` make, one condition per table.
 *
 * `memberCount` is *this viewer's* count: the people standing in the tree that
 * they may see. It is one extra query for the whole page rather than one per
 * tree, and it is deliberately not `state.members.length` — a shelf that said
 * "12 personen" about a tree holding eleven secrets would count the secrets
 * out loud.
 */
export function listFamilyTrees(viewer: Viewer, options: FamilyTreeListOptions = {}): FamilyTreeSummary[] {
  const conditions = [isNull(schema.familyTrees.deletedAt), viewableCondition('family_tree', viewer)];
  // §46: one side at a time, AND-ed after the visibility rule, never instead of it.
  if (!options.bothSides) conditions.push(sideCondition('family_tree', viewer));
  if (options.where === 'loose') conditions.push(isNull(schema.familyTrees.caseId));
  else if (options.where === 'case') conditions.push(sql`${schema.familyTrees.caseId} IS NOT NULL`);
  else if (options.where) conditions.push(eq(schema.familyTrees.caseId, options.where));
  if (options.mine) conditions.push(eq(schema.familyTrees.createdBy, options.mine));
  if (options.privateOnly) conditions.push(sql`${schema.familyTrees.viewMode} <> 'all'`);

  const order =
    options.sort === 'name'
      ? sql`${schema.familyTrees.name} COLLATE NOCASE ASC`
      : options.sort === 'created'
        ? desc(schema.familyTrees.createdAt)
        : desc(schema.familyTrees.updatedAt);

  const rows = db
    .select({ ...FAMILY_TREE_COLUMNS, state: schema.familyTrees.state })
    .from(schema.familyTrees)
    .leftJoin(schema.cases, eq(schema.cases.id, schema.familyTrees.caseId))
    .where(and(...conditions))
    .orderBy(order)
    .limit(200)
    .all();
  if (!rows.length) return [];

  const visibleCaseIds = new Set(
    db.select({ id: schema.cases.id }).from(schema.cases).where(visibleCaseCondition(viewer)).all().map((r) => r.id),
  );
  const kept = rows.filter((row) => !row.caseId || visibleCaseIds.has(row.caseId));
  if (!kept.length) return [];

  // Every member id on the shelf, asked once. A tree of four hundred people is
  // the cap (`MAX_MEMBERS`), so this is one `IN (…)` and not a walk.
  const states = new Map(kept.map((row) => [row.id, normaliseTreeState(row.state)]));
  const allIds = [...new Set([...states.values()].flatMap((state) => state.members.map((m) => m.id)))];
  const visibleEntryIds = allIds.length
    ? new Set(
        db
          .select({ id: schema.entries.id })
          .from(schema.entries)
          .where(and(inArray(schema.entries.id, allIds), visibleEntryCondition(viewer)))
          .all()
          .map((row) => row.id),
      )
    : new Set<string>();

  return kept.map(({ state: _state, ...row }) => ({
    ...row,
    memberCount: (states.get(row.id)?.members ?? []).filter((member) => visibleEntryIds.has(member.id)).length,
  }));
}

/** The stambomen inside a dossier that this viewer may open. */
export function listFamilyTreesForCase(caseId: string, viewer: Viewer): FamilyTreeSummary[] {
  /*
   * §46: a lookup in a list's clothes — the dossier is named by id, so there is
   * only ever one drawer being read. It keeps the side filter anyway, for the
   * reason `listTimelinesForCase` does: since §50 the dossier's page turns the
   * reader over to its own side before it renders, and §48 keeps a dossier and
   * its stambomen on one side, so "the side the reader stands on" and "this
   * dossier's side" are one question here.
   */
  return listFamilyTrees(viewer, { where: caseId });
}

function loadTree(where: ReturnType<typeof eq>, viewer: Viewer): FamilyTree | undefined {
  const row = db
    .select({ ...FAMILY_TREE_COLUMNS, state: schema.familyTrees.state })
    .from(schema.familyTrees)
    .leftJoin(schema.cases, eq(schema.cases.id, schema.familyTrees.caseId))
    .where(and(where, isNull(schema.familyTrees.deletedAt), viewableCondition('family_tree', viewer)))
    .get();
  if (!row) return undefined;
  // §17: and the dossier it hangs in, if any — a tree behind a closed drawer is
  // behind that drawer's view dial too.
  if (row.caseId) {
    const parent = db
      .select({ id: schema.cases.id })
      .from(schema.cases)
      .where(and(eq(schema.cases.id, row.caseId), visibleCaseCondition(viewer)))
      .get();
    if (!parent) return undefined;
  }
  // The blob is normalised on every read; that *is* the migration (CLAUDE.md §5).
  return { ...row, state: normaliseTreeState(row.state) };
}

/** The stamboom, if this viewer may see it. There is no other way to load one. */
export function getFamilyTreeById(id: string, viewer: Viewer): FamilyTree | undefined {
  return loadTree(eq(schema.familyTrees.id, id), viewer);
}

export function getFamilyTreeBySlug(slug: string, viewer: Viewer): FamilyTree | undefined {
  return loadTree(eq(schema.familyTrees.slug, slug), viewer);
}

/**
 * §10 as a question: may this person draw in this stamboom? The dials say who
 * may type; seeing it at all is the tree's and its dossier's view rule, which
 * `viewerCanEdit` knows nothing of — so it is asked first.
 */
export function viewerCanEditFamilyTree(id: string, viewer: Viewer): boolean {
  if (!viewer) return false;
  if (!getFamilyTreeById(id, viewer)) return false;
  return viewerCanEdit('family_tree', id, viewer);
}

function slugTaken(candidate: string) {
  return Boolean(
    db.select({ id: schema.familyTrees.id }).from(schema.familyTrees).where(eq(schema.familyTrees.slug, candidate)).get(),
  );
}

export function createFamilyTree(
  input: { name: string; description?: string; caseId?: string | null; isPrivate?: boolean },
  actor: Author,
): FamilyTree {
  const name = input.name.trim().slice(0, NAME_MAX) || 'Naamloze stamboom';
  const id = newId();
  db.insert(schema.familyTrees)
    .values({
      id,
      name,
      slug: uniqueSlug(name, slugTaken),
      description: (input.description ?? '').trim().slice(0, DESCRIPTION_MAX),
      caseId: input.caseId ?? null,
      // §17: "Privé stamboom" — both dials private from the first second.
      viewMode: input.isPrivate ? 'private' : 'all',
      editMode: input.isPrivate ? 'private' : 'all',
      createdBy: actor.id,
    })
    .run();
  logActivity({
    actorId: actor.id,
    characterId: actor.characterId ?? null,
    verb: 'family_tree.created',
    caseId: input.caseId ?? null,
    meta: { familyTreeId: id, name },
  });
  return getFamilyTreeById(id, actor)!;
}

export type FamilyTreeTextPatch = { name?: string; description?: string };

export function updateFamilyTree(id: string, patch: FamilyTreeTextPatch, actor: Author): FamilyTree {
  if (!viewerCanEditFamilyTree(id, actor)) throw new Error(FAMILY_TREE_NOT_YOURS);
  const values: Partial<typeof schema.familyTrees.$inferInsert> = { updatedAt: seconds() };
  if (typeof patch.name === 'string') {
    const name = patch.name.trim().slice(0, NAME_MAX);
    if (!name) throw new Error('Een stamboom heeft een naam nodig.');
    values.name = name;
  }
  if (typeof patch.description === 'string') {
    values.description = patch.description.trim().slice(0, DESCRIPTION_MAX);
  }
  db.update(schema.familyTrees).set(values).where(eq(schema.familyTrees.id, id)).run();
  return getFamilyTreeById(id, actor)!;
}

/*
 * §66: how often a save of the same tree by the same hand writes a feed row.
 *
 * A prikbord ties `board.changed` to its revision snapshot and rests ten
 * seconds between two of them; a stamboom keeps no revisions, so it keeps the
 * clock and drops the snapshot. Without it a minute of dragging would be two
 * hundred rows in the dossier's activity list saying the same thing.
 */
const CHANGED_EVERY_MS = 60_000;
const changedAt = new Map<string, number>();
/** Test seam: how many trees the clock is holding. Never called by the app. */
export function changedClockCount(): number {
  return changedAt.size;
}

function noteChanged(treeId: string, caseId: string | null, actor: Author) {
  const key = `${treeId}|${actor.id}|${actor.characterId ?? ''}`;
  const now = Date.now();
  // The same sweep the prikbord's clocks get: a tree nobody has touched for ten
  // minutes decides nothing, so holding its entry is memory and nothing else.
  for (const [held, at] of [...changedAt]) if (now - at >= 10 * 60_000) changedAt.delete(held);
  if (now - (changedAt.get(key) ?? 0) < CHANGED_EVERY_MS) return;
  changedAt.set(key, now);
  logActivity({
    actorId: actor.id,
    characterId: actor.characterId ?? null,
    verb: 'family_tree.changed',
    caseId,
    meta: { familyTreeId: treeId },
  });
}

/**
 * §66, autosave: merge the patch into the stored document and hand the merged
 * one back, exactly as a prikbord does (§8, §61). Absence is never a deletion;
 * a tombstone is.
 */
export function saveFamilyTreeState(
  id: string,
  patch: FamilyTreePatch,
  actor: Author,
): { state: FamilyTreeState; changed: { members: string[]; loose: string[]; ties: string[] } } {
  const row = db.select().from(schema.familyTrees).where(eq(schema.familyTrees.id, id)).get();
  if (!row || row.deletedAt) throw new Error('Stamboom niet gevonden.');

  const { state, changed } = mergeTreeState(row.state, patch);
  db.update(schema.familyTrees).set({ state, updatedAt: seconds() }).where(eq(schema.familyTrees.id, id)).run();

  // §27: who stands in this tree is a mention of them. Read off the merged
  // document, never the patch — the patch is one client's half of the tree.
  recomputeFamilyTreeMentions(id);
  if (changed.members.length || changed.loose.length || changed.ties.length) {
    noteChanged(id, row.caseId ?? null, actor);
    if (row.caseId) db.update(schema.cases).set({ updatedAt: seconds() }).where(eq(schema.cases.id, row.caseId)).run();
  }
  return { state, changed };
}

/**
 * §47/§48: hang this stamboom in a dossier, or take it out of one.
 *
 * `setBoardCase`'s twin, and for its reasons: filing puts the tree behind the
 * dossier's view dial as well (§17, checked by the caller), both dossiers are
 * touched so their "laatst gewijzigd" is honest, and — §48 — a tree filed in a
 * Keeper-only dossier is the Keeper's too, because the dossier's *name* travels
 * with it into every list that shows it. Only that direction: taking it out
 * again leaves it where it is, because nothing here may be the write that
 * reveals something.
 */
export function setFamilyTreeCase(id: string, caseId: string | null, by: Author) {
  const row = db
    .select({ caseId: schema.familyTrees.caseId })
    .from(schema.familyTrees)
    .where(eq(schema.familyTrees.id, id))
    .get();
  const was = row?.caseId ?? null;
  if (was === caseId) return;
  const now = seconds();
  db.update(schema.familyTrees).set({ caseId, updatedAt: now }).where(eq(schema.familyTrees.id, id)).run();
  for (const other of [was, caseId]) {
    if (other) db.update(schema.cases).set({ updatedAt: now }).where(eq(schema.cases.id, other)).run();
  }
  logActivity({
    actorId: by.id,
    characterId: by.characterId ?? null,
    verb: caseId ? 'family_tree.filed' : 'family_tree.unfiled',
    caseId: caseId ?? was,
    meta: { familyTreeId: id },
  });
  if (caseId && isKeeperSide('case', caseId) && !isKeeperSide('family_tree', id)) {
    setKeeperSide('family_tree', id, true, by.id);
  }
}

/** §43: whether this tree counts in the web and under "Genoemd in". */
export function setFamilyTreeInWeb(id: string, inWeb: boolean) {
  db.update(schema.familyTrees).set({ inWeb, updatedAt: seconds() }).where(eq(schema.familyTrees.id, id)).run();
}

/** Soft: into the bin. `lib/admin/trash.ts` brings it back or ends it. */
export function softDeleteFamilyTree(id: string, by: Author) {
  const row = db
    .select({ caseId: schema.familyTrees.caseId })
    .from(schema.familyTrees)
    .where(eq(schema.familyTrees.id, id))
    .get();
  db.update(schema.familyTrees).set({ deletedAt: seconds(), updatedAt: seconds() }).where(eq(schema.familyTrees.id, id)).run();
  logActivity({
    actorId: by.id,
    characterId: by.characterId ?? null,
    verb: 'family_tree.deleted',
    caseId: row?.caseId ?? null,
    meta: { familyTreeId: id },
  });
}

/** The ids among these this viewer may open — for a wall's stamboom cards (rule 19). */
export function visibleFamilyTreeIds(ids: string[], viewer: Viewer): Set<string> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return new Set();
  return new Set(
    listFamilyTrees(viewer)
      .filter((tree) => wanted.includes(tree.id))
      .map((tree) => tree.id),
  );
}

/**
 * §52: what a stamboom card on a prikbord shows. The same rule and the same
 * shape as `resolveBoardTimelines` — a `Map`, which the caller turns into a
 * `Record` with `Object.fromEntries` — because a stamboom has the same two
 * dials and a dossier of its own to hide behind: one this viewer may not open
 * comes back absent, and the card is stamped MISSING rather than named.
 *
 * It goes through `listFamilyTrees`, which is the only reader carrying §17's
 * view dial *and* the parent-dossier rule. A select of its own would quietly
 * skip both.
 */
export type FamilyTreeFacts = {
  id: string;
  name: string;
  slug: string;
  caseName: string | null;
  missing: boolean;
};

export function resolveFamilyTrees(ids: string[], viewer: Viewer): Map<string, FamilyTreeFacts> {
  const out = new Map<string, FamilyTreeFacts>();
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return out;
  for (const tree of listFamilyTrees(viewer)) {
    if (wanted.includes(tree.id)) {
      out.set(tree.id, {
        id: tree.id,
        name: tree.name,
        slug: tree.slug,
        caseName: tree.caseName,
        missing: false,
      });
    }
  }
  return out;
}

/* -------------------------------------------------- the other way round */

/**
 * §66 (round 32): the artikelen that point *at* this stamboom — "Stamboom van
 * Het huis Den Hollander", printed under the tree's own description.
 *
 * The link is a `family_tree_link` field on an artikel (seeded on Families, but
 * a Keeper may put one on any soort), so this is the reverse of a value the
 * archive stores on the other page. Three things it is careful about:
 *
 *  - **Rule 1, as everywhere**: `visibleEntryCondition(viewer)` is AND-ed in,
 *    so a Keeper-only familie pointing here is absent from a player's page —
 *    not greyed out, not counted. It is a *lookup* by tree, not a shelf, so it
 *    asks no `sideCondition` (§46): a Keeper walking in from either side must
 *    find the head of the page they are standing on intact.
 *  - **The key is never interpolated.** It comes off `entry_types.fields`,
 *    which is the Keeper's typing, so it is checked with `isFieldKey` and bound
 *    as a parameter — the rule `listDerivedEntries` was written to (see
 *    `lib/entries/derived.ts`).
 *  - **Both stored shapes are asked for**: the `{ id, name, slug }` the picker
 *    writes, and the bare id `coerceFieldValue` still accepts.
 */
export type LinkedFamily = { id: string; name: string; slug: string; icon: string; colour: string };

export function linkedFamiliesOf(treeId: string, viewer: Viewer, limit = 20): LinkedFamily[] {
  if (!treeId) return [];

  // One query over the soorten: which of them has a field aimed at a stamboom,
  // and under which key. An archive has a dozen soorten, so this is cheap.
  const aimed: { typeId: string; key: string }[] = [];
  for (const type of db
    .select({ id: schema.entryTypes.id, fields: schema.entryTypes.fields })
    .from(schema.entryTypes)
    .all()) {
    for (const field of (type.fields ?? []) as FieldDef[]) {
      if (field?.kind === 'family_tree_link' && isFieldKey(field.key)) {
        aimed.push({ typeId: type.id, key: field.key });
      }
    }
  }
  if (!aimed.length) return [];

  const out: LinkedFamily[] = [];
  const seen = new Set<string>();
  for (const { typeId, key } of aimed) {
    if (out.length >= limit) break;
    const at = `$.${key}`;
    const atId = `$.${key}.id`;
    const fields = schema.entries.fields;
    const rows = db
      .select({
        id: schema.entries.id,
        name: schema.entries.name,
        slug: schema.entries.slug,
        icon: schema.entryTypes.icon,
        colour: schema.entryTypes.colour,
      })
      .from(schema.entries)
      .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
      .where(
        and(
          isNull(schema.entries.deletedAt),
          visibleEntryCondition(viewer),
          eq(schema.entries.typeId, typeId),
          sql`(
            (json_type(${fields}, ${at}) = 'object' AND json_extract(${fields}, ${atId}) = ${treeId})
            OR (json_type(${fields}, ${at}) = 'text' AND json_extract(${fields}, ${at}) = ${treeId})
          )`,
        ),
      )
      .orderBy(sql`${schema.entries.name} COLLATE NOCASE ASC`)
      .limit(limit)
      .all();
    for (const row of rows) {
      if (seen.has(row.id) || out.length >= limit) continue;
      seen.add(row.id);
      out.push({ id: row.id, name: row.name, slug: row.slug, icon: row.icon, colour: row.colour });
    }
  }
  return out;
}

/* ------------------------------------------------------------- kinship */

/** The one shape a koppelingsveld's value is stored in (`lib/entries/fieldValues.ts`). */
type StoredRef = { id: string; name: string; slug: string; icon: string | null; colour: string | null };

function defsOfEntry(entryId: string): { defs: FieldDef[]; typeSlug: string } | null {
  const row = db
    .select({
      deletedAt: schema.entries.deletedAt,
      defs: schema.entryTypes.fields,
      typeSlug: schema.entryTypes.slug,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(eq(schema.entries.id, entryId))
    .get();
  if (!row || row.deletedAt) return null;
  return { defs: (row.defs ?? []) as FieldDef[], typeSlug: row.typeSlug };
}

function refOf(entryId: string): StoredRef | null {
  const row = db
    .select({
      id: schema.entries.id,
      name: schema.entries.name,
      slug: schema.entries.slug,
      icon: schema.entryTypes.icon,
      colour: schema.entryTypes.colour,
      deletedAt: schema.entries.deletedAt,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(eq(schema.entries.id, entryId))
    .get();
  if (!row || row.deletedAt) return null;
  return { id: row.id, name: row.name, slug: row.slug, icon: row.icon, colour: row.colour };
}

/**
 * §66: write one kinship, on the artikel it belongs to.
 *
 * This is the *only* road a stamboom takes to change a line between two
 * artikelen, and it deliberately goes the long way round: it builds the field's
 * whole new value and hands it to `updateEntry`, so the §38 gate, the mirror
 * onto the other page, `recomputeFieldMentions`, the revision and — for a hand
 * that may see the artikel but not edit it — the *voorstel* all happen exactly
 * as they do when somebody types the name into the infobox by hand. A direct
 * `db.update` here would skip all five, and a stamboom would be a second place
 * where kinship is written down.
 *
 * The whole array, never a delta: §5's `mergeKeys` rule says `fields` is a bag
 * of independent answers and merges one level deep, and no deeper — a list
 * *inside* the bag replaces, which is what makes removing the last ref work at
 * all.
 *
 * Returns `updateEntry`'s own result, so the caller can tell a save from a
 * voorstel (`status`) — plus one status of its own, `unchanged`, for the line
 * that was already there or already gone. That is not a save: writing it again
 * would file a revision, a feed row and a voorstel for a change nobody made.
 */
export type RelationResult = SaveResult | { status: 'unchanged' };

export function writeRelation(
  entryId: string,
  fieldKey: string,
  targetId: string,
  add: boolean,
  actor: Author,
): RelationResult {
  if (entryId === targetId) throw new Error('Een artikel is geen familie van zichzelf.');
  const spec = defsOfEntry(entryId);
  if (!spec) throw new Error('Artikel niet gevonden.');
  const field = roleFieldsOf(spec.defs).find((one) => one.key === fieldKey);
  if (!field) throw new Error('Dat veld is geen koppelingsveld met een rol in de stamboom.');
  const def = spec.defs.find((one) => one.key === fieldKey)!;

  const target = refOf(targetId);
  if (add && !target) throw new Error('Artikel niet gevonden.');

  const held = (db.select({ fields: schema.entries.fields }).from(schema.entries).where(eq(schema.entries.id, entryId)).get()
    ?.fields ?? {}) as Record<string, unknown>;
  const standing = refIdsIn(held[fieldKey]);

  let value: unknown;
  if (def.kind === 'entry_link') {
    // One box, one answer. Removing only empties it when it is *this* artikel
    // standing there, the same rule the mirror follows.
    if (add && standing[0] === targetId) return { status: 'unchanged' };
    if (!add && standing[0] !== targetId) return { status: 'unchanged' };
    value = add ? target : null;
  } else {
    const current = Array.isArray(held[fieldKey]) ? (held[fieldKey] as unknown[]) : [];
    const without = current.filter((item) => refIdsIn(item)[0] !== targetId);
    if (add) {
      if (without.length !== current.length) return { status: 'unchanged' };
      value = [...current, target];
    } else {
      if (without.length === current.length) return { status: 'unchanged' };
      value = without;
    }
  }

  return updateEntry(entryId, { fields: { [fieldKey]: value } }, actor);
}

/**
 * The first field of a soort carrying this role, or null. "First" is the order
 * the soort lists its fields in, which is the Keeper's order in Beheer — so a
 * soort with both "Ouders" and "Geschapen door" writes into whichever the
 * Keeper put at the top, and can be made to prefer the other by moving it.
 */
function firstRoleField(defs: FieldDef[], role: FieldRole): string | null {
  return roleFieldsOf(defs).find((field) => field.role === role)?.key ?? null;
}

/**
 * §66: a los kaartje becomes an artikel.
 *
 * The card's *place* survives (same x, y and pin), its lines are turned into
 * the thing they were always standing in for, and the card itself is
 * tombstoned. Three shapes of line, and only the first is interesting:
 *
 *   - the other end is an **artikel**: the line becomes a field on one of the
 *     two, written through `writeRelation` — so the mirror puts the other half
 *     on the other page — and the tie is dropped. Which of the two carries it
 *     is decided in favour of the *new* artikel, because that is the page the
 *     hand just made and the one they are about to look at; the other end is
 *     the fallback for a soort with no such field.
 *   - the other end is another **los kaartje**: the tie stays a tie and only
 *     its end is rewritten to the new artikel.
 *   - **neither soort has a field for it**: there is nowhere to put it.
 *     `mergeTreeState` refuses a tie between two artikelen (two places to write
 *     one fact is how two places start to disagree), so the line is dropped and
 *     counted — the API hands the count back as `dropped` and the canvas says
 *     so, rather than letting a line disappear in silence.
 */
export function promoteLooseCard(
  treeId: string,
  looseId: string,
  entryId: string,
  actor: Author,
): { state: FamilyTreeState; dropped: number } {
  const tree = getFamilyTreeById(treeId, actor);
  if (!tree) throw new Error('Stamboom niet gevonden.');
  if (!viewerCanEditFamilyTree(treeId, actor)) throw new Error(FAMILY_TREE_NOT_YOURS);
  const card = tree.state.loose.find((one) => one.id === looseId);
  if (!card) throw new Error('Dat losse kaartje staat niet in deze stamboom.');
  const mine = defsOfEntry(entryId);
  if (!mine) throw new Error('Artikel niet gevonden.');

  const now = Date.now();
  const isCard = (ref: NodeRef) => ref.kind === 'loose' && ref.id === looseId;
  const rewritten: TreeTie[] = [];
  const dropTies: string[] = [];
  let dropped = 0;

  for (const tie of tree.state.ties) {
    const touchesFrom = isCard(tie.from);
    const touchesTo = isCard(tie.to);
    if (!touchesFrom && !touchesTo) continue;
    const other = touchesFrom ? tie.to : tie.from;

    if (other.kind === 'loose') {
      const end: NodeRef = { kind: 'entry', id: entryId };
      rewritten.push({ ...tie, ...(touchesFrom ? { from: end } : { to: end }), updatedAt: now });
      continue;
    }

    /*
     * What the line says, read from the new artikel's seat. `role: 'parent'`
     * means `from` is the parent of `to`, so the card standing at `from` is the
     * parent and the role the *new* artikel needs on its own page is `child`.
     */
    const roleHere: FieldRole =
      tie.role === 'parent' ? (touchesFrom ? 'child' : 'parent') : tie.role;
    const roleThere: FieldRole =
      tie.role === 'parent' ? (touchesFrom ? 'parent' : 'child') : tie.role;

    const here = firstRoleField(mine.defs, roleHere);
    const theirs = defsOfEntry(other.id);
    const there = theirs ? firstRoleField(theirs.defs, roleThere) : null;

    try {
      if (here) writeRelation(entryId, here, other.id, true, actor);
      else if (there) writeRelation(other.id, there, entryId, true, actor);
      else {
        // Nowhere to write it, and the tree may not keep a line between two
        // artikelen — see `normaliseTie`. So it goes, out loud.
        console.warn(
          `[§66] lijn ${tie.id} in stamboom ${treeId} verdwijnt: geen ${roleHere}-veld op de soort van ${entryId} en geen ${roleThere}-veld op die van ${other.id}`,
        );
        dropped += 1;
      }
    } catch (error) {
      console.warn('[§66] de lijn van een los kaartje kon niet worden weggeschreven', error);
      dropped += 1;
    }
    dropTies.push(tie.id);
  }

  const { state } = saveFamilyTreeState(
    treeId,
    {
      members: [
        {
          id: entryId,
          ...(card.x === undefined ? {} : { x: card.x }),
          ...(card.y === undefined ? {} : { y: card.y }),
          ...(card.pinned ? { pinned: true } : {}),
          updatedAt: now,
        },
      ],
      ties: rewritten,
      deletedLoose: [looseId],
      deletedTies: dropTies,
    },
    actor,
  );

  logActivity({
    actorId: actor.id,
    characterId: actor.characterId ?? null,
    verb: 'family_tree.promoted',
    entryId,
    caseId: tree.caseId,
    meta: { familyTreeId: treeId, looseId },
  });

  return { state, dropped };
}

// ---------------------------------------------------------------------------
// §67 — broers en zussen, voor één artikel
// ---------------------------------------------------------------------------

/** One derived brother or sister, as the artikel page prints it. */
export type DerivedSibling = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  colour: string | null;
  /** What the recorded parents say: `vol`, `half` or `onbekend` on the page. */
  kind: DerivedSiblingKind;
};

/** How many the page will ever print. Past this it is a list, not a family. */
const MAX_DERIVED_SIBLINGS = 100;

/**
 * §67: the brothers and sisters of one artikel, worked out from the parents.
 *
 * The road, and every step of it goes through `visibleEntryCondition`, because
 * a sibling is a read of the archive and rule 1 does not bend for a derived
 * list — a half-sibling through a parent this reader may not see is simply not
 * there, and the two read as full siblings on their screen:
 *
 *   1. this artikel's **primary parent field** (`primaryParentField`) — the one
 *      the mirror writes into, never `geschapen_door`;
 *   2. those parents, resolved per viewer;
 *   3. everybody who names one of them in *their* primary parent field (a JSON
 *      query in the shape of `listDerivedEntries`, so nothing here depends on
 *      the mirror having run) **and** everybody those parents name in their own
 *      primary child field (the other direction, for the same reason);
 *   4. each candidate's own recorded parents, and `classifySiblings` on the lot.
 *
 * Never the tree's `ties`: a los kaartje is not an artikel and has no page to
 * be a sibling on.
 */
export function siblingsOf(entryId: string, viewer: Viewer): DerivedSibling[] {
  if (!entryId) return [];

  /* --------------------------------- which key holds a soort's parents/children */

  const parentKeyOf = new Map<string, string>();
  const childKeyOf = new Map<string, string>();
  for (const type of db
    .select({ id: schema.entryTypes.id, fields: schema.entryTypes.fields })
    .from(schema.entryTypes)
    .all()) {
    const defs = (type.fields ?? []) as FieldDef[];
    const parentKey = primaryParentField(defs);
    if (parentKey && isFieldKey(parentKey)) parentKeyOf.set(type.id, parentKey);
    const childKey = roleFieldsOf(defs).find((field) => field.role === 'child')?.key;
    if (childKey && isFieldKey(childKey)) childKeyOf.set(type.id, childKey);
  }
  if (!parentKeyOf.size) return [];

  /* ------------------------------------------------------------------ the self */

  const self = db
    .select({
      id: schema.entries.id,
      typeId: schema.entries.typeId,
      fields: schema.entries.fields,
    })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, entryId), visibleEntryCondition(viewer)))
    .get();
  if (!self) return [];
  const selfKey = parentKeyOf.get(self.typeId);
  if (!selfKey) return [];

  const wanted = refIdsIn((self.fields ?? {})[selfKey]).filter((id) => id && id !== entryId);
  if (!wanted.length) return [];

  const parentRows = db
    .select({
      id: schema.entries.id,
      typeId: schema.entries.typeId,
      fields: schema.entries.fields,
    })
    .from(schema.entries)
    .where(and(inArray(schema.entries.id, wanted.slice(0, 20)), visibleEntryCondition(viewer)))
    .all();
  if (!parentRows.length) return [];
  const parentIds = parentRows.map((row) => row.id);

  /* ------------------------------------------------------------ the candidates */

  /**
   * "Whose `<key>` names one of these parents?" — the same two shapes
   * `listDerivedEntries` asks about, an object ref and a list of them, with the
   * `json_type` guards that keep `json_each` away from a bare string.
   */
  const namesAParent = (key: string) => {
    const at = `$.${key}`;
    const atId = `$.${key}.id`;
    const fields = schema.entries.fields;
    const anyOf = (column: ReturnType<typeof sql>) =>
      sql.join(
        parentIds.map((id) => sql`${column} = ${id}`),
        sql` OR `,
      );
    return sql`(
      (json_type(${fields}, ${at}) = 'object' AND (${anyOf(sql`json_extract(${fields}, ${atId})`)}))
      OR EXISTS (
        SELECT 1 FROM json_each(
          CASE WHEN json_type(${fields}, ${at}) = 'array'
               THEN json_extract(${fields}, ${at})
               ELSE '[]' END
        ) AS je
        WHERE json_valid(je.value) AND (${anyOf(sql`json_extract(je.value, '$.id')`)})
      )
    )`;
  };

  const candidateIds = new Set<string>();
  // The parents' own "Kinderen": the direction the mirror would have filled in.
  for (const parent of parentRows) {
    const key = childKeyOf.get(parent.typeId);
    if (!key) continue;
    for (const id of refIdsIn((parent.fields ?? {})[key])) {
      if (id && id !== entryId) candidateIds.add(id);
    }
  }
  const pointing = db
    .select({ id: schema.entries.id })
    .from(schema.entries)
    .where(
      and(
        visibleEntryCondition(viewer),
        sql`${schema.entries.id} <> ${entryId}`,
        sql.join(
          [...new Set(parentKeyOf.values())].map((key) => namesAParent(key)),
          sql` OR `,
        ),
      ),
    )
    .limit(MAX_DERIVED_SIBLINGS * 2)
    .all();
  for (const row of pointing) candidateIds.add(row.id);
  if (!candidateIds.size) return [];

  const candidates = db
    .select({
      id: schema.entries.id,
      name: schema.entries.name,
      slug: schema.entries.slug,
      typeId: schema.entries.typeId,
      fields: schema.entries.fields,
      icon: schema.entryTypes.icon,
      colour: schema.entryTypes.colour,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(
      and(
        inArray(schema.entries.id, [...candidateIds].slice(0, MAX_DERIVED_SIBLINGS * 2)),
        visibleEntryCondition(viewer),
      ),
    )
    .orderBy(sql`${schema.entries.name} COLLATE NOCASE ASC`)
    .limit(MAX_DERIVED_SIBLINGS)
    .all();
  if (!candidates.length) return [];

  /* -------------------------------------------------- everybody's parents, seen */

  const rawParents = new Map<string, string[]>();
  rawParents.set(entryId, wanted);
  for (const row of candidates) {
    const key = parentKeyOf.get(row.typeId);
    rawParents.set(row.id, key ? refIdsIn((row.fields ?? {})[key]) : []);
  }
  // The other direction, so a sibling recorded only on the parent's page still
  // counts: a parent that names somebody in its "Kinderen" is that person's
  // parent whether or not the mirror has run.
  for (const parent of parentRows) {
    const key = childKeyOf.get(parent.typeId);
    if (!key) continue;
    for (const childId of refIdsIn((parent.fields ?? {})[key])) {
      const held = rawParents.get(childId);
      if (held && !held.includes(parent.id)) held.push(parent.id);
    }
  }

  // Rule 1: a parent this reader may not see is absent, not a secret hinted at.
  const everyParent = [...new Set([...rawParents.values()].flat())].filter(Boolean);
  const visibleParents = new Set(
    everyParent.length
      ? db
          .select({ id: schema.entries.id })
          .from(schema.entries)
          .where(and(inArray(schema.entries.id, everyParent.slice(0, 500)), visibleEntryCondition(viewer)))
          .all()
          .map((row) => row.id)
      : [],
  );

  const parentsOf = new Map<string, Set<string>>();
  for (const [id, ids] of rawParents) {
    const kept = new Set(ids.filter((one) => one !== id && visibleParents.has(one)));
    if (kept.size) parentsOf.set(id, kept);
  }

  /* ------------------------------------------------------------- the answer */

  const verdictOf = new Map<string, DerivedSiblingKind>();
  for (const pair of classifySiblings(parentsOf)) {
    if (pair.a === entryId) verdictOf.set(pair.b, pair.kind);
    else if (pair.b === entryId) verdictOf.set(pair.a, pair.kind);
  }

  const out: DerivedSibling[] = [];
  for (const row of candidates) {
    const kind = verdictOf.get(row.id);
    if (!kind || row.id === entryId) continue;
    out.push({ id: row.id, name: row.name, slug: row.slug, icon: row.icon, colour: row.colour, kind });
    if (out.length >= MAX_DERIVED_SIBLINGS) break;
  }
  return out;
}
