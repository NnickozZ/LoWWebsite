import { resetFieldsInRoom } from '@/lib/live/docs';
import { mapFieldsRoomKey, pinFieldsRoomKey } from '@/lib/live/keys';
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { viewerCanEdit } from '@/lib/access';
import { db, schema } from '@/lib/db';
import type { AccessMode } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import { recomputeMapMentions } from '@/lib/entries/mentions';
import type { Author } from '@/lib/auth/author';
import { logActivity } from '@/lib/entries/service';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { visibleMapCondition } from '@/lib/maps/visibility';
import { uniqueSlug } from '@/lib/slug';

/**
 * §19: maps.
 *
 * A map is a picture the Keeper hung on the wall — the island, the harbour,
 * a floor plan — and a pin is a place on it. A pin is either a fiche (so the
 * lighthouse on the map *is* the lighthouse's fiche) or a loose note ("the
 * boat was found here"). Pins are kept in picture coordinates, 0..1 from the
 * top-left corner, so a redrawn map keeps everyone's spelden where they were.
 *
 * Who may do what:
 *   - §40, under §17: a landkaart wears the owner's two dials, like everything
 *     else, and every read below carries the viewer. Who
 *     may *look* is `view_mode` — everyone signed in, the chosen people, or the
 *     owner and the Keepers — and every read below goes through
 *     `visibleMapCondition`. Until this existed a landkaart had no dial at all,
 *     so a plattegrond could not be kept back until the players found the house.
 *   - A fiche pin is only shown to someone who may see that fiche (§9, §17):
 *     a secret fiche on the map would give the secret away by its icon alone.
 *     That rule stacks on top of the map's own — a pin is never visible on a
 *     map the viewer may not see, whatever the pin itself is.
 *   - Anyone who may see the map may set a pin on it. Only whoever set it, or a
 *     Keeper, may move, edit or pull it — a map with a hundred spelden is a
 *     shared thing, and someone else's speld is someone else's.
 *   - Only a Keeper *hangs* a map. Renaming, redrawing and taking one down are
 *     `edit_mode`, which starts at 'private' (the owner — always a Keeper — and
 *     the Keepers), so that is the same rule as before, now turnable.
 */

export type MapSummary = {
  id: string;
  name: string;
  slug: string;
  assetId: string;
  width: number;
  height: number;
  description: string;
  sortOrder: number;
  /** §23: the artikel this map is a map *of*, if it is a map of one. */
  entryId: string | null;
  /** §17: the owner's two dials, and the Keeper's bolt on them. */
  viewMode: AccessMode;
  editMode: AccessMode;
  accessLocked: boolean;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  /** How many pins this viewer may see on it — only the index page asks. */
  pinCount?: number;
};

/**
 * §39, under §19: what a speld stands for. A fiche, a loose notitie, or —
 * since 0017 —
 * another landkaart: the speld on the town that opens the town's own map, and
 * the speld on the house that opens the plattegrond.
 */
export type PinKind = 'entry' | 'note' | 'map';

export type MapPin = {
  id: string;
  mapId: string;
  kind: PinKind;
  x: number;
  y: number;
  /**
   * A note's own name and text; for a fiche pin the fiche's name, for a
   * landkaart pin the landkaart's name (text empty for both).
   */
  name: string;
  text: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  entry: {
    id: string;
    slug: string;
    name: string;
    shortDescription: string;
    typeSlug: string;
    typeLabel: string;
    typeIcon: string;
    typeColour: string;
    coverAssetId: string | null;
  } | null;
  /**
   * The landkaart this speld opens, when it is that kind of speld — and only
   * when this viewer may see that landkaart. Read per viewer, never stored, so
   * a renamed landkaart renames its speld everywhere at once.
   */
  map: { id: string; slug: string; name: string; assetId: string } | null;
};

const MAP_COLUMNS = {
  id: schema.maps.id,
  name: schema.maps.name,
  slug: schema.maps.slug,
  assetId: schema.maps.assetId,
  width: schema.maps.width,
  height: schema.maps.height,
  description: schema.maps.description,
  sortOrder: schema.maps.sortOrder,
  entryId: schema.maps.entryId,
  viewMode: schema.maps.viewMode,
  editMode: schema.maps.editMode,
  accessLocked: schema.maps.accessLocked,
  createdBy: schema.maps.createdBy,
  createdAt: schema.maps.createdAt,
  updatedAt: schema.maps.updatedAt,
} as const;

const now = () => Math.floor(Date.now() / 1000);

function requireKeeper(actor: Author) {
  if (!actor.isKeeper) throw new Error('Alleen een Keeper hangt landkaarten op.');
}

/** One wording for "not yours", so the routes and the service cannot drift apart. */
export const MAP_IS_NOT_YOURS = 'Je mag deze landkaart niet bewerken.';

/**
 * §10 as a question: may this person change the landkaart? The dials say who
 * may type; seeing it at all is the landkaart's own view rule, which
 * `viewerCanEdit` knows nothing of — so it is asked first, exactly as
 * `viewerCanEditTimeline` does.
 *
 * `edit_mode` on a landkaart starts at 'private', so for every map hung before
 * there were dials — and every one hung since, unless a Keeper turns it up —
 * this answers what §19 always answered: the owner (a Keeper) and the Keepers.
 */
export function viewerCanEditMap(id: string, viewer: Viewer): boolean {
  if (!viewer) return false;
  if (!getMapById(id, viewer)) return false;
  return viewerCanEdit('map', id, viewer);
}

export type MapListOptions = {
  sort?: 'order' | 'name' | 'recent' | 'created';
  /** Only maps with at least one pin set by this account. */
  mine?: string;
};

export function listMaps(viewer: Viewer, options: MapListOptions = {}): MapSummary[] {
  // §17: not deleted, and the owner's view dial allows this viewer.
  const conditions = [visibleMapCondition(viewer)];
  if (options.mine) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM map_pins mp WHERE mp.map_id = ${schema.maps.id} AND mp.created_by = ${options.mine})`,
    );
  }
  const order =
    options.sort === 'name'
      ? [asc(sql`lower(${schema.maps.name})`)]
      : options.sort === 'recent'
        ? [desc(schema.maps.updatedAt)]
        : options.sort === 'created'
          ? [desc(schema.maps.createdAt)]
          : [asc(schema.maps.sortOrder), asc(sql`lower(${schema.maps.name})`)];

  const maps = db
    .select(MAP_COLUMNS)
    .from(schema.maps)
    .where(and(...conditions))
    .orderBy(...order)
    .all();
  if (!maps.length) return [];

  // Pins the viewer may see, counted per map: every note, and the fiche pins
  // whose fiche is visible to them.
  const counts = new Map<string, number>();
  const ids = maps.map((m) => m.id);
  const notes = db
    .select({ mapId: schema.mapPins.mapId, n: sql<number>`count(*)` })
    .from(schema.mapPins)
    .where(and(inArray(schema.mapPins.mapId, ids), eq(schema.mapPins.kind, 'note')))
    .groupBy(schema.mapPins.mapId)
    .all();
  for (const row of notes) counts.set(row.mapId, Number(row.n));
  const entries = db
    .select({ mapId: schema.mapPins.mapId, n: sql<number>`count(*)` })
    .from(schema.mapPins)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.mapPins.entryId))
    .where(
      and(inArray(schema.mapPins.mapId, ids), eq(schema.mapPins.kind, 'entry'), visibleEntryCondition(viewer)),
    )
    .groupBy(schema.mapPins.mapId)
    .all();
  for (const row of entries) counts.set(row.mapId, (counts.get(row.mapId) ?? 0) + Number(row.n));
  // §19: and the spelden that stand for another landkaart, each one counted
  // only for someone who may see the landkaart it opens — the same rule the
  // fiche speld above follows, one table over.
  const targets = db
    .select({ mapId: schema.mapPins.mapId, n: sql<number>`count(*)` })
    .from(schema.mapPins)
    .innerJoin(targetMap, eq(targetMap.id, schema.mapPins.targetMapId))
    .where(
      and(
        inArray(schema.mapPins.mapId, ids),
        eq(schema.mapPins.kind, 'map'),
        visibleMapCondition(viewer, targetMap),
      ),
    )
    .groupBy(schema.mapPins.mapId)
    .all();
  for (const row of targets) counts.set(row.mapId, (counts.get(row.mapId) ?? 0) + Number(row.n));

  return maps.map((m) => ({ ...m, pinCount: counts.get(m.id) ?? 0 }));
}

/**
 * The landkaart, if this viewer may see it. There is no other way to load one —
 * the viewer is required rather than optional so that a new reader cannot get
 * a map by forgetting to ask, which is how it went unguarded for four rounds.
 */
export function getMapBySlug(slug: string, viewer: Viewer): MapSummary | undefined {
  return db
    .select(MAP_COLUMNS)
    .from(schema.maps)
    .where(and(eq(schema.maps.slug, slug), visibleMapCondition(viewer)))
    .get();
}

export function getMapById(id: string, viewer: Viewer): MapSummary | undefined {
  return db
    .select(MAP_COLUMNS)
    .from(schema.maps)
    .where(and(eq(schema.maps.id, id), visibleMapCondition(viewer)))
    .get();
}

function slugTaken(candidate: string) {
  return Boolean(
    db.select({ id: schema.maps.id }).from(schema.maps).where(eq(schema.maps.slug, candidate)).get(),
  );
}

export function createMap(
  input: { name: string; assetId: string; width: number; height: number; description?: string },
  actor: Author,
): MapSummary {
  requireKeeper(actor);
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error('Geef de landkaart een naam.');
  if (!input.assetId) throw new Error('Er is geen afbeelding.');
  const id = newId();
  const last = db
    .select({ n: sql<number>`coalesce(max(${schema.maps.sortOrder}), -1)` })
    .from(schema.maps)
    .get();
  db.insert(schema.maps)
    .values({
      id,
      name,
      slug: uniqueSlug(name, slugTaken),
      assetId: input.assetId,
      width: input.width,
      height: input.height,
      description: (input.description ?? '').trim().slice(0, 2000),
      sortOrder: Number(last?.n ?? -1) + 1,
      /*
       * §40: the dials a new landkaart is hung with. 'all' to look, because a
       * map is put on the wall to be looked at and a dial nobody touched must
       * change nothing; 'private' to edit, because only a Keeper renames,
       * redraws or takes down a landkaart (§19) and the owner is a Keeper. Both
       * are written out rather than left to the column defaults, so the row
       * says what was meant even if a default ever moves. The Keeper turns the
       * kijken dial down afterwards, in Rechten under the map.
       */
      viewMode: 'all',
      editMode: 'private',
      createdBy: actor.id,
    })
    .run();
  logActivity({ actorId: actor.id, characterId: actor.characterId ?? null, verb: 'map.created', meta: { mapId: id, name } });
  return getMapById(id, actor)!;
}

export type MapPatch = {
  name?: string;
  description?: string;
  sortOrder?: number;
  /** A redrawn map: new picture, same pins. */
  assetId?: string;
  width?: number;
  height?: number;
  /** §23: the artikel this map is a map of. `null` unhooks it. */
  entryId?: string | null;
};

export function updateMap(
  id: string,
  patch: MapPatch,
  actor: Author,
  options: { live?: boolean } = {},
): MapSummary {
  // §17: the edit dial decides, and it starts at 'private' — so for a landkaart
  // nobody has re-dialled this is the old `requireKeeper`, said properly.
  if (!viewerCanEditMap(id, actor)) throw new Error(MAP_IS_NOT_YOURS);
  const current = getMapById(id, actor);
  if (!current) throw new Error('Landkaart niet gevonden');
  const values: Partial<typeof schema.maps.$inferInsert> = { updatedAt: now() };
  if (typeof patch.name === 'string') {
    const name = patch.name.trim().slice(0, 120);
    if (!name) throw new Error('Een landkaart heeft een naam nodig.');
    values.name = name;
  }
  if (typeof patch.description === 'string') values.description = patch.description.trim().slice(0, 2000);
  if (typeof patch.sortOrder === 'number' && Number.isFinite(patch.sortOrder)) values.sortOrder = patch.sortOrder;
  if (typeof patch.assetId === 'string' && patch.assetId) {
    values.assetId = patch.assetId;
    if (typeof patch.width === 'number') values.width = patch.width;
    if (typeof patch.height === 'number') values.height = patch.height;
  }
  if (patch.entryId !== undefined) {
    // The artikel has to exist and be one this writer can see; anything else
    // would leave a chip pointing at nothing on a page nobody can explain.
    // §1: whoever may now edit the map need not be a Keeper, so it is *their*
    // sight that is asked, the same road `addPin` takes.
    if (patch.entryId === null || patch.entryId === '') values.entryId = null;
    else {
      const target = db
        .select({ id: schema.entries.id })
        .from(schema.entries)
        .where(and(eq(schema.entries.id, patch.entryId), visibleEntryCondition(actor)))
        .get();
      if (!target) throw new Error('Dat artikel bestaat niet (meer).');
      values.entryId = target.id;
    }
  }
  db.update(schema.maps).set(values).where(eq(schema.maps.id, id)).run();
  // §21: the name and description are shared fields; a plain write brings the room into line.
  if (!options.live && (values.name !== undefined || values.description !== undefined)) {
    const fields: Record<string, string> = {};
    if (typeof values.name === 'string') fields.name = values.name;
    if (typeof values.description === 'string') fields.description = values.description;
    resetFieldsInRoom(mapFieldsRoomKey(id), fields);
  }
  return getMapById(id, actor)!;
}

/** Soft: the picture and the pins stay on disk, the map leaves the shelf. */
export function deleteMap(id: string, actor: Author) {
  if (!viewerCanEditMap(id, actor)) throw new Error('Je mag deze landkaart niet weghalen.');
  db.update(schema.maps).set({ deletedAt: now(), updatedAt: now() }).where(eq(schema.maps.id, id)).run();
  logActivity({ actorId: actor.id, characterId: actor.characterId ?? null, verb: 'map.deleted', meta: { mapId: id } });
}

/* ------------------------------------------------------------------ pins */

/**
 * §39: the landkaart a speld points at, as a second copy of `maps` in the same
 * query. The pin's own map is already joined in — it is what the viewer is
 * standing on — so the target needs a name of its own, and both are asked
 * their own `visibleMapCondition`.
 */
const targetMap = alias(schema.maps, 'target');

const PIN_COLUMNS = {
  id: schema.mapPins.id,
  mapId: schema.mapPins.mapId,
  kind: schema.mapPins.kind,
  x: schema.mapPins.x,
  y: schema.mapPins.y,
  name: schema.mapPins.name,
  text: schema.mapPins.text,
  createdBy: schema.mapPins.createdBy,
  createdAt: schema.mapPins.createdAt,
  updatedAt: schema.mapPins.updatedAt,
  entryId: schema.entries.id,
  entrySlug: schema.entries.slug,
  entryName: schema.entries.name,
  entryShort: schema.entries.shortDescription,
  entryCover: schema.entries.coverAssetId,
  typeSlug: schema.entryTypes.slug,
  typeLabel: schema.entryTypes.label,
  typeIcon: schema.entryTypes.icon,
  typeColour: schema.entryTypes.colour,
  targetId: targetMap.id,
  targetSlug: targetMap.slug,
  targetName: targetMap.name,
  targetAsset: targetMap.assetId,
} as const;

function shapePin(row: {
  id: string;
  mapId: string;
  kind: PinKind;
  x: number;
  y: number;
  name: string;
  text: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  entryId: string | null;
  entrySlug: string | null;
  entryName: string | null;
  entryShort: string | null;
  entryCover: string | null;
  typeSlug: string | null;
  typeLabel: string | null;
  typeIcon: string | null;
  typeColour: string | null;
  targetId: string | null;
  targetSlug: string | null;
  targetName: string | null;
  targetAsset: string | null;
}): MapPin {
  const entry =
    row.kind === 'entry' && row.entryId
      ? {
          id: row.entryId,
          slug: row.entrySlug ?? '',
          name: row.entryName ?? '',
          shortDescription: row.entryShort ?? '',
          typeSlug: row.typeSlug ?? '',
          typeLabel: row.typeLabel ?? '',
          typeIcon: row.typeIcon ?? 'file',
          typeColour: row.typeColour ?? 'var(--ink-muted)',
          coverAssetId: row.entryCover,
        }
      : null;
  /*
   * §19: the name of a landkaart speld is the landkaart's name, taken here and
   * never stored on the row — the same rule a fiche speld has followed since
   * the beginning. A Keeper who renames the plattegrond renames every speld
   * pointing at it, and there is no second, stale copy to go looking for.
   */
  const target =
    row.kind === 'map' && row.targetId
      ? {
          id: row.targetId,
          slug: row.targetSlug ?? '',
          name: row.targetName ?? '',
          assetId: row.targetAsset ?? '',
        }
      : null;
  return {
    id: row.id,
    mapId: row.mapId,
    kind: row.kind,
    x: row.x,
    y: row.y,
    name: entry ? entry.name : target ? target.name : row.name,
    text: row.text,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    entry,
    map: target,
  };
}

/**
 * The condition a pin must meet to be shown to this viewer, in two layers that
 * both have to say yes:
 *
 *   1. **The speld follows its landkaart.** §17: a map this viewer may not see
 *      has no spelden for them either — a pin that survived its map would name
 *      the very thing the dial was turned down to hide. The map is joined in
 *      below and `visibleMapCondition` is applied to it.
 *   2. **A fiche speld follows its fiche** (§9, §17), exactly as before: a note
 *      is a note, but an artikel speld is only shown to someone who may see
 *      that artikel.
 *   3. **§39: a landkaart speld follows the landkaart it points at.** The target is
 *      joined in behind its *own* `visibleMapCondition` (see `targetJoin`), so
 *      a speld on the map of the town pointing at a plattegrond the Keeper is
 *      keeping back simply is not there for a player — exactly what a speld to
 *      a Keeper-only artikel already does. Anything softer would give the
 *      hidden landkaart away by its name and its icon, which is the whole
 *      reason 0016 gave a landkaart a dial in the first place.
 */
function visiblePinCondition(viewer: Viewer) {
  return sql`${visibleMapCondition(viewer)} AND (${schema.mapPins.kind} = 'note' OR (${schema.mapPins.kind} = 'entry' AND ${schema.entries.id} IS NOT NULL AND ${visibleEntryCondition(viewer)}) OR (${schema.mapPins.kind} = 'map' AND ${targetMap.id} IS NOT NULL))`;
}

/**
 * The target landkaart, joined in per viewer. Its visibility is in the ON
 * clause rather than the WHERE: a target this viewer may not see leaves
 * `target.id` NULL, which is what `visiblePinCondition` then drops the speld
 * on. A soft-deleted landkaart goes the same way — `visibleMapCondition`
 * already answers that for everyone but a Keeper, and the explicit
 * `deleted_at IS NULL` here says it for a Keeper too: a speld pointing into
 * the bin points at nothing.
 */
function targetJoin(viewer: Viewer): SQL {
  return sql`${targetMap.id} = ${schema.mapPins.targetMapId} AND ${targetMap.deletedAt} IS NULL AND ${visibleMapCondition(viewer, targetMap)}`;
}

export function listPins(mapId: string, viewer: Viewer): MapPin[] {
  return db
    .select(PIN_COLUMNS)
    .from(schema.mapPins)
    .innerJoin(schema.maps, eq(schema.maps.id, schema.mapPins.mapId))
    .leftJoin(schema.entries, eq(schema.entries.id, schema.mapPins.entryId))
    .leftJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .leftJoin(targetMap, targetJoin(viewer))
    .where(and(eq(schema.mapPins.mapId, mapId), visiblePinCondition(viewer)))
    .orderBy(asc(schema.mapPins.createdAt))
    .all()
    .map(shapePin);
}

export function getPin(pinId: string, viewer: Viewer): MapPin | undefined {
  const row = db
    .select(PIN_COLUMNS)
    .from(schema.mapPins)
    .innerJoin(schema.maps, eq(schema.maps.id, schema.mapPins.mapId))
    .leftJoin(schema.entries, eq(schema.entries.id, schema.mapPins.entryId))
    .leftJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .leftJoin(targetMap, targetJoin(viewer))
    .where(and(eq(schema.mapPins.id, pinId), visiblePinCondition(viewer)))
    .get();
  return row ? shapePin(row) : undefined;
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0.5;
  return Math.min(1, Math.max(0, v));
}

export type NewPin =
  | { kind: 'entry'; entryId: string; x: number; y: number }
  | { kind: 'note'; name: string; text?: string; x: number; y: number }
  /** §39: the speld on the town that opens the town's own landkaart. */
  | { kind: 'map'; targetMapId: string; x: number; y: number };

/**
 * A speld may not point at the landkaart it stands on.
 *
 * The only cycle worth refusing. A→B→A is *not* a mistake — the speld on the
 * harbour map that goes back up to the island is exactly how a reader climbs
 * out of a plattegrond, and nothing here renders recursively: navigation is a
 * click and `listPins` is one level deep. A speld on its own map is different:
 * it opens the page it is already on, which is not a way anywhere.
 */
export const PIN_ON_ITSELF = 'Een speld kan niet naar de landkaart wijzen waar hij op staat.';

export function addPin(mapId: string, input: NewPin, actor: Author): MapPin {
  // §17: a landkaart this writer may not see is a landkaart that is not there.
  if (!getMapById(mapId, actor)) throw new Error('Landkaart niet gevonden');
  const id = newId();
  if (input.kind === 'map') {
    if (input.targetMapId === mapId) throw new Error(PIN_ON_ITSELF);
    /*
     * §17: resolved through the writer's own sight, the same road the artikel
     * speld takes. An id that names a landkaart this person may not see is
     * refused rather than stored — a speld that only its maker can read is
     * worse than no speld, and storing one would let a guessed id put a hidden
     * plattegrond's name on a map everyone can look at.
     */
    const target = db
      .select({ id: schema.maps.id, name: schema.maps.name })
      .from(schema.maps)
      .where(and(eq(schema.maps.id, input.targetMapId), visibleMapCondition(actor)))
      .get();
    if (!target) throw new Error('Landkaart niet gevonden');
    db.insert(schema.mapPins)
      .values({
        id,
        mapId,
        kind: 'map',
        targetMapId: target.id,
        // §19: neither, deliberately. The name comes from the target in
        // `shapePin`, so a copy stored here would be a stale second one the
        // moment the Keeper renames the landkaart.
        name: '',
        text: '',
        x: clamp01(input.x),
        y: clamp01(input.y),
        createdBy: actor.id,
        characterId: actor.characterId ?? null,
      })
      .run();
    logActivity({
      actorId: actor.id,
      characterId: actor.characterId ?? null,
      verb: 'map.pinned',
      meta: { mapId, pinId: id, targetMapId: target.id, name: target.name },
    });
  } else if (input.kind === 'entry') {
    const entry = db
      .select({ id: schema.entries.id, name: schema.entries.name })
      .from(schema.entries)
      .where(and(eq(schema.entries.id, input.entryId), visibleEntryCondition(actor)))
      .get();
    if (!entry) throw new Error('Artikel niet gevonden');
    db.insert(schema.mapPins)
      .values({
        id,
        mapId,
        kind: 'entry',
        entryId: entry.id,
        x: clamp01(input.x),
        y: clamp01(input.y),
        createdBy: actor.id,
        characterId: actor.characterId ?? null,
      })
      .run();
    logActivity({
      actorId: actor.id,
      characterId: actor.characterId ?? null,
      verb: 'map.pinned',
      entryId: entry.id,
      meta: { mapId, pinId: id },
    });
  } else {
    const name = (input.name ?? '').trim().slice(0, 120);
    if (!name) throw new Error('Geef de speld een naam.');
    db.insert(schema.mapPins)
      .values({
        id,
        mapId,
        kind: 'note',
        name,
        text: (input.text ?? '').trim().slice(0, 4000),
        x: clamp01(input.x),
        y: clamp01(input.y),
        createdBy: actor.id,
        characterId: actor.characterId ?? null,
      })
      .run();
    logActivity({
      actorId: actor.id,
      characterId: actor.characterId ?? null,
      verb: 'map.pinned',
      meta: { mapId, pinId: id, name },
    });
  }
  db.update(schema.maps).set({ updatedAt: now() }).where(eq(schema.maps.id, mapId)).run();
  // §27: what this landkaart's spelden name.
  recomputeMapMentions(mapId);
  return getPin(id, actor)!;
}

/** One wording for "not yours", so the route and the service cannot drift apart. */
export const PIN_IS_SOMEONE_ELSE_S =
  'Die speld is van iemand anders. Alleen wie hem zette, of een Keeper, mag eraan.';

function ownPin(pinId: string, actor: Author) {
  const pin = db
    .select({
      id: schema.mapPins.id,
      mapId: schema.mapPins.mapId,
      kind: schema.mapPins.kind,
      createdBy: schema.mapPins.createdBy,
    })
    .from(schema.mapPins)
    .where(eq(schema.mapPins.id, pinId))
    .get();
  if (!pin) throw new Error('Speld niet gevonden');
  // §17: the speld follows its landkaart. A map this writer may not see has no
  // spelden for them, so there is nothing here to own — and "niet gevonden"
  // rather than "van iemand anders", which would confirm the pin exists.
  if (!getMapById(pin.mapId, actor)) throw new Error('Speld niet gevonden');
  if (!actor.isKeeper && pin.createdBy !== actor.id) {
    throw new Error(PIN_IS_SOMEONE_ELSE_S);
  }
  return pin;
}

/**
 * §10 as a question rather than an exception, so a route can answer 403 before
 * it does anything.
 *
 * A landkaart now has its own `view_mode` (§17), so this asks two things: may
 * this person see the map at all, and is the speld theirs. The *edit* dial of
 * the map is deliberately not consulted — a speld is not the map. §19's rule
 * for a speld is the one this file has always had and it stands: whoever set
 * it, or a Keeper, on a map they may see. `ownPin` stays the backstop; this
 * only lets the answer be the right number.
 */
export function viewerCanEditPin(pinId: string, actor: Author): boolean {
  const pin = db
    .select({ mapId: schema.mapPins.mapId, createdBy: schema.mapPins.createdBy })
    .from(schema.mapPins)
    .where(eq(schema.mapPins.id, pinId))
    .get();
  if (!pin) return false;
  if (!getMapById(pin.mapId, actor)) return false;
  return actor.isKeeper || pin.createdBy === actor.id;
}

export function updatePin(
  pinId: string,
  patch: { x?: number; y?: number; name?: string; text?: string },
  actor: Author,
  options: { live?: boolean } = {},
): MapPin {
  const pin = ownPin(pinId, actor);
  const values: Partial<typeof schema.mapPins.$inferInsert> = { updatedAt: now() };
  if (typeof patch.x === 'number') values.x = clamp01(patch.x);
  if (typeof patch.y === 'number') values.y = clamp01(patch.y);
  if (typeof patch.name === 'string') {
    const name = patch.name.trim().slice(0, 120);
    if (!name) throw new Error('Een speld heeft een naam nodig.');
    values.name = name;
  }
  if (typeof patch.text === 'string') values.text = patch.text.trim().slice(0, 4000);
  db.update(schema.mapPins).set(values).where(eq(schema.mapPins.id, pinId)).run();
  db.update(schema.maps).set({ updatedAt: now() }).where(eq(schema.maps.id, pin.mapId)).run();
  if (!options.live && (values.name !== undefined || values.text !== undefined)) {
    const fields: Record<string, string> = {};
    if (typeof values.name === 'string') fields.name = values.name;
    if (typeof values.text === 'string') fields.text = values.text;
    resetFieldsInRoom(pinFieldsRoomKey(pinId), fields);
  }
  // §27: a renamed or rewritten speld says something else about the artikelen.
  recomputeMapMentions(pin.mapId);
  return getPin(pinId, actor)!;
}

/**
 * A note speld becomes the speld of an artikel, in place.
 *
 * The prikbord has had this since §8 (`onConvertToEntry` in `BoardCanvas`):
 * you write "de boot lag hier" on a card during a session, and afterwards the
 * card turns into the artikel it was always going to be, without moving. A
 * speld is the same thought on a landkaart, so it is the same shape — the note
 * seeds the artikel's name and one-liner, the artikel comes back, and the thing
 * on the wall keeps its place.
 *
 * Two rules meet here. §10: only whoever set the speld, or a Keeper, may touch
 * it — the route asks `viewerCanEditPin` first and answers 403. §1: the artikel
 * has to be one this writer may actually see, so it goes through
 * `visibleEntryCondition` exactly as `addPin` does; an id that resolves to
 * nothing is refused rather than stored, which would leave a speld pointing at
 * a page nobody can open.
 *
 * The name and the text are *cleared*, not kept. §19: an entry speld carries an
 * id and nothing else, and its name is looked up per viewer in `shapePin` —
 * a name left in the row would be a second, stale copy that no longer follows
 * a rename, and the text has already become the artikel's one-liner, so keeping
 * it would only be the same sentence stored twice. `addPin` writes an entry
 * speld with neither; after this one there is no way to tell the two apart.
 */
export function convertPinToEntry(
  pinId: string,
  entryId: string,
  actor: Author,
): MapPin {
  const pin = ownPin(pinId, actor);
  if (pin.kind !== 'note') throw new Error('Deze speld staat al voor een artikel.');

  const entry = db
    .select({ id: schema.entries.id })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, entryId), visibleEntryCondition(actor)))
    .get();
  if (!entry) throw new Error('Artikel niet gevonden');

  db.update(schema.mapPins)
    .set({ kind: 'entry', entryId: entry.id, name: '', text: '', updatedAt: now() })
    .where(eq(schema.mapPins.id, pinId))
    .run();
  db.update(schema.maps).set({ updatedAt: now() }).where(eq(schema.maps.id, pin.mapId)).run();

  // §21: the note's name and text were a shared field room, and somebody may
  // still have the speld open. The row is the truth, so the room is brought
  // into line with what was just written to it — empty, both of them.
  resetFieldsInRoom(pinFieldsRoomKey(pinId), { name: '', text: '' });

  // §27: the speld stopped being a note and became the artikel itself, so what
  // it says about the archive changed twice over.
  recomputeMapMentions(pin.mapId);

  logActivity({
    actorId: actor.id,
    characterId: actor.characterId ?? null,
    verb: 'map.pinned',
    entryId: entry.id,
    meta: { mapId: pin.mapId, pinId, from: 'note' },
  });
  return getPin(pinId, actor)!;
}

export function removePin(pinId: string, actor: Author) {
  const pin = ownPin(pinId, actor);
  db.delete(schema.mapPins).where(eq(schema.mapPins.id, pinId)).run();
  db.update(schema.maps).set({ updatedAt: now() }).where(eq(schema.maps.id, pin.mapId)).run();
  // §27: a speld that has been pulled names nothing.
  recomputeMapMentions(pin.mapId);
}

/** Where a fiche is on the maps — for the "Op de landkaart" block on its page. */
/**
 * §23: the landkaarten that *are* this artikel — the floor plan of the
 * lighthouse, the chart drawn for the harbour. The other direction from
 * `listPinsForEntry`, which says where the artikel is on somebody else's map.
 */
export function listMapsOfEntry(
  entryId: string,
  viewer: Viewer,
): { id: string; slug: string; name: string }[] {
  return db
    .select({ id: schema.maps.id, slug: schema.maps.slug, name: schema.maps.name })
    .from(schema.maps)
    .where(and(eq(schema.maps.entryId, entryId), visibleMapCondition(viewer)))
    .orderBy(asc(schema.maps.sortOrder), asc(sql`lower(${schema.maps.name})`))
    .all();
}

/**
 * §39: the way back up. The landkaarten that carry a speld pointing at this
 * one — "Op de grotere kaart: Zeeland".
 *
 * Derived, never stored: it appears the moment somebody pins the plattegrond
 * on the map of the town and it is gone the moment they pull the speld, so
 * there is no second record of the relation to keep in step. Without it a
 * plattegrond three levels down is a dead end — a page whose only way out is
 * the browser's Back button, which on a phone is not always there.
 *
 * Two dials are asked, and both have to say yes: the parent landkaart's own
 * `visibleMapCondition`, because naming a map somebody may not open is the
 * same leak from the other side, and the map itself is loaded by the caller
 * behind the same rule.
 */
export function listMapsPinningMap(
  mapId: string,
  viewer: Viewer,
): { id: string; slug: string; name: string }[] {
  // Grouped, not DISTINCT: one landkaart may carry two spelden to the same
  // one (a house with a front door and a back door) and is still one chip —
  // and SQLite will not order a DISTINCT by a column that is not selected.
  return db
    .select({ id: schema.maps.id, slug: schema.maps.slug, name: schema.maps.name })
    .from(schema.mapPins)
    .innerJoin(schema.maps, eq(schema.maps.id, schema.mapPins.mapId))
    .where(
      and(
        eq(schema.mapPins.targetMapId, mapId),
        eq(schema.mapPins.kind, 'map'),
        visibleMapCondition(viewer),
      ),
    )
    .groupBy(schema.maps.id)
    .orderBy(asc(schema.maps.sortOrder), asc(sql`lower(${schema.maps.name})`))
    .all();
}

export function listPinsForEntry(
  entryId: string,
  viewer: Viewer,
): {
  pinId: string;
  mapId: string;
  mapName: string;
  mapSlug: string;
  x: number;
  y: number;
}[] {
  return db
    .select({
      pinId: schema.mapPins.id,
      mapId: schema.maps.id,
      mapName: schema.maps.name,
      mapSlug: schema.maps.slug,
      x: schema.mapPins.x,
      y: schema.mapPins.y,
    })
    .from(schema.mapPins)
    .innerJoin(schema.maps, eq(schema.maps.id, schema.mapPins.mapId))
    // §17: "Op de landkaart" may only name the landkaarten this reader may open.
    .where(and(eq(schema.mapPins.entryId, entryId), visibleMapCondition(viewer)))
    .orderBy(asc(schema.maps.sortOrder))
    .all();
}
