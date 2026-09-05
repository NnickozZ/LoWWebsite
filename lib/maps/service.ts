import { resetFieldsInRoom } from '@/lib/live/docs';
import { mapFieldsRoomKey, pinFieldsRoomKey } from '@/lib/live/keys';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { newId } from '@/lib/ids';
import { logActivity } from '@/lib/entries/service';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
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
 *   - Everyone signed in may look at every map and every note pin.
 *   - A fiche pin is only shown to someone who may see that fiche (§9, §17):
 *     a secret fiche on the map would give the secret away by its icon alone.
 *   - Anyone may set a pin. Only whoever set it, or a Keeper, may move, edit
 *     or pull it — a map with a hundred spelden is a shared thing, and
 *     someone else's speld is someone else's.
 *   - Only a Keeper hangs, renames, replaces or takes down a map.
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
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  /** How many pins this viewer may see on it — only the index page asks. */
  pinCount?: number;
};

export type PinKind = 'entry' | 'note';

export type MapPin = {
  id: string;
  mapId: string;
  kind: PinKind;
  x: number;
  y: number;
  /** A note's own name and text; for a fiche pin the fiche's name (text empty). */
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
  createdBy: schema.maps.createdBy,
  createdAt: schema.maps.createdAt,
  updatedAt: schema.maps.updatedAt,
} as const;

const now = () => Math.floor(Date.now() / 1000);

function requireKeeper(actor: { id: string; isKeeper: boolean }) {
  if (!actor.isKeeper) throw new Error('Alleen een Keeper hangt landkaarten op.');
}

export type MapListOptions = {
  sort?: 'order' | 'name' | 'recent' | 'created';
  /** Only maps with at least one pin set by this account. */
  mine?: string;
};

export function listMaps(viewer: Viewer, options: MapListOptions = {}): MapSummary[] {
  const conditions = [isNull(schema.maps.deletedAt)];
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

  return maps.map((m) => ({ ...m, pinCount: counts.get(m.id) ?? 0 }));
}

export function getMapBySlug(slug: string): MapSummary | undefined {
  return db
    .select(MAP_COLUMNS)
    .from(schema.maps)
    .where(and(eq(schema.maps.slug, slug), isNull(schema.maps.deletedAt)))
    .get();
}

export function getMapById(id: string): MapSummary | undefined {
  return db
    .select(MAP_COLUMNS)
    .from(schema.maps)
    .where(and(eq(schema.maps.id, id), isNull(schema.maps.deletedAt)))
    .get();
}

function slugTaken(candidate: string) {
  return Boolean(
    db.select({ id: schema.maps.id }).from(schema.maps).where(eq(schema.maps.slug, candidate)).get(),
  );
}

export function createMap(
  input: { name: string; assetId: string; width: number; height: number; description?: string },
  actor: { id: string; isKeeper: boolean },
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
      createdBy: actor.id,
    })
    .run();
  logActivity({ actorId: actor.id, verb: 'map.created', meta: { mapId: id, name } });
  return getMapById(id)!;
}

export type MapPatch = {
  name?: string;
  description?: string;
  sortOrder?: number;
  /** A redrawn map: new picture, same pins. */
  assetId?: string;
  width?: number;
  height?: number;
};

export function updateMap(
  id: string,
  patch: MapPatch,
  actor: { id: string; isKeeper: boolean },
  options: { live?: boolean } = {},
): MapSummary {
  requireKeeper(actor);
  const current = getMapById(id);
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
  db.update(schema.maps).set(values).where(eq(schema.maps.id, id)).run();
  // §21: the name and description are shared fields; a plain write brings the room into line.
  if (!options.live && (values.name !== undefined || values.description !== undefined)) {
    const fields: Record<string, string> = {};
    if (typeof values.name === 'string') fields.name = values.name;
    if (typeof values.description === 'string') fields.description = values.description;
    resetFieldsInRoom(mapFieldsRoomKey(id), fields);
  }
  return getMapById(id)!;
}

/** Soft: the picture and the pins stay on disk, the map leaves the shelf. */
export function deleteMap(id: string, actor: { id: string; isKeeper: boolean }) {
  requireKeeper(actor);
  db.update(schema.maps).set({ deletedAt: now(), updatedAt: now() }).where(eq(schema.maps.id, id)).run();
  logActivity({ actorId: actor.id, verb: 'map.deleted', meta: { mapId: id } });
}

/* ------------------------------------------------------------------ pins */

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
  return {
    id: row.id,
    mapId: row.mapId,
    kind: row.kind,
    x: row.x,
    y: row.y,
    name: entry ? entry.name : row.name,
    text: row.text,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    entry,
  };
}

/** The condition a pin must meet to be shown to this viewer. */
function visiblePinCondition(viewer: Viewer) {
  return sql`(${schema.mapPins.kind} = 'note' OR (${schema.entries.id} IS NOT NULL AND ${visibleEntryCondition(viewer)}))`;
}

export function listPins(mapId: string, viewer: Viewer): MapPin[] {
  return db
    .select(PIN_COLUMNS)
    .from(schema.mapPins)
    .leftJoin(schema.entries, eq(schema.entries.id, schema.mapPins.entryId))
    .leftJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(eq(schema.mapPins.mapId, mapId), visiblePinCondition(viewer)))
    .orderBy(asc(schema.mapPins.createdAt))
    .all()
    .map(shapePin);
}

export function getPin(pinId: string, viewer: Viewer): MapPin | undefined {
  const row = db
    .select(PIN_COLUMNS)
    .from(schema.mapPins)
    .leftJoin(schema.entries, eq(schema.entries.id, schema.mapPins.entryId))
    .leftJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
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
  | { kind: 'note'; name: string; text?: string; x: number; y: number };

export function addPin(mapId: string, input: NewPin, actor: { id: string; isKeeper: boolean }): MapPin {
  if (!getMapById(mapId)) throw new Error('Landkaart niet gevonden');
  const id = newId();
  if (input.kind === 'entry') {
    const entry = db
      .select({ id: schema.entries.id, name: schema.entries.name })
      .from(schema.entries)
      .where(and(eq(schema.entries.id, input.entryId), visibleEntryCondition(actor)))
      .get();
    if (!entry) throw new Error('Artikel niet gevonden');
    db.insert(schema.mapPins)
      .values({ id, mapId, kind: 'entry', entryId: entry.id, x: clamp01(input.x), y: clamp01(input.y), createdBy: actor.id })
      .run();
    logActivity({ actorId: actor.id, verb: 'map.pinned', entryId: entry.id, meta: { mapId, pinId: id } });
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
      })
      .run();
    logActivity({ actorId: actor.id, verb: 'map.pinned', meta: { mapId, pinId: id, name } });
  }
  db.update(schema.maps).set({ updatedAt: now() }).where(eq(schema.maps.id, mapId)).run();
  return getPin(id, actor)!;
}

function ownPin(pinId: string, actor: { id: string; isKeeper: boolean }) {
  const pin = db
    .select({ id: schema.mapPins.id, mapId: schema.mapPins.mapId, createdBy: schema.mapPins.createdBy })
    .from(schema.mapPins)
    .where(eq(schema.mapPins.id, pinId))
    .get();
  if (!pin) throw new Error('Speld niet gevonden');
  if (!actor.isKeeper && pin.createdBy !== actor.id) {
    throw new Error('Die speld is van iemand anders. Alleen wie hem zette, of een Keeper, mag eraan.');
  }
  return pin;
}

export function updatePin(
  pinId: string,
  patch: { x?: number; y?: number; name?: string; text?: string },
  actor: { id: string; isKeeper: boolean },
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
  return getPin(pinId, actor)!;
}

export function removePin(pinId: string, actor: { id: string; isKeeper: boolean }) {
  const pin = ownPin(pinId, actor);
  db.delete(schema.mapPins).where(eq(schema.mapPins.id, pinId)).run();
  db.update(schema.maps).set({ updatedAt: now() }).where(eq(schema.maps.id, pin.mapId)).run();
}

/** Where a fiche is on the maps — for the "Op de landkaart" block on its page. */
export function listPinsForEntry(entryId: string): {
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
    .where(and(eq(schema.mapPins.entryId, entryId), isNull(schema.maps.deletedAt)))
    .orderBy(asc(schema.maps.sortOrder))
    .all();
}
