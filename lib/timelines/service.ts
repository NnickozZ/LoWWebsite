import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { viewableCondition, viewerCanEdit } from '@/lib/access';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { db, schema } from '@/lib/db';
import type { AccessMode, TimelineScale } from '@/lib/db/schema';
import type { CoverCrops } from '@/lib/images/shapes';
import { recomputeTimelineMentions } from '@/lib/entries/mentions';
import type { Author } from '@/lib/auth/author';
import { logActivity } from '@/lib/entries/service';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { newId } from '@/lib/ids';
import { resetFieldsInRoom } from '@/lib/live/docs';
import { eventFieldsRoomKey } from '@/lib/live/keys';
import { uniqueSlug } from '@/lib/slug';
import { moveEntryEvents, momentOnTimeline, writeEntryDate } from './moment';
import {
  anchorUnitsFor,
  applyAnchor,
  clampPrecision,
  clampToAnchor,
  isAnchorUnit,
  isScale,
  type AnchorUnit,
  type Precision,
  type Scale,
} from './time';

/**
 * §32: tijdlijnen.
 *
 * A tijdlijn is a ruled axis — in years, months, days, hours, minutes or
 * seconds, the Keeper's choice per tijdlijn — with gebeurtenissen on it. A
 * gebeurtenis is either an *artikel* (any soort, though the archive has a
 * Gebeurtenissen soort for the ones that are nothing else) or a *note* that
 * exists here and nowhere else: it cannot be pinned on a wall, put on a map or
 * named in a field, because it is not a thing in the archive — it is a mark on
 * this axis. A note that turns out to matter becomes an artikel in place
 * (`convertEventToEntry`), exactly as a notitie on a prikbord or a speld on a
 * landkaart does.
 *
 * Who may do what is the prikbord's rule, not the landkaart's: a tijdlijn has
 * an owner and the two §17 dials, and whoever may edit the tijdlijn may add,
 * move, rewrite and remove every gebeurtenis on it. A tijdlijn inside a
 * dossier is also behind the dossier's own view rule, like a board.
 *
 * What the tijdlijn *says* about a moment is the tijdlijn's own (rule 8 for
 * cards on a wall): the text under an artikel gebeurtenis is curated here and
 * never written back to the artikel, and the picture is the artikel's cover —
 * a note gebeurtenis can be given one of its own.
 */

export type TimelineSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  caseId: string | null;
  caseName: string | null;
  caseSlug: string | null;
  scale: Scale;
  /**
   * §35: "deze tijdlijn speelt op 3 oktober 1931" — the moment this tijdlijn
   * is *of*, and how much of it is meant. Null together when it is of nothing
   * in particular, which is every tijdlijn until somebody says otherwise.
   */
  anchorAt: number | null;
  anchorUnit: AnchorUnit | null;
  /** §17 */
  viewMode: AccessMode;
  editMode: AccessMode;
  accessLocked: boolean;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  /** How many gebeurtenissen this viewer may see on it — only the shelf asks. */
  eventCount?: number;
};

export type EventKind = 'entry' | 'note';

export type TimelineEvent = {
  id: string;
  timelineId: string;
  kind: EventKind;
  at: number;
  /** Already clamped to the tijdlijn's scale. */
  precision: Precision;
  /** A note's own name; for an artikel gebeurtenis the artikel's name. */
  name: string;
  /** The tijdlijn's own words about the moment, whatever kind it is. */
  text: string;
  /** A note's own picture. An artikel gebeurtenis has none of its own: see `entry.coverAssetId`. */
  assetId: string | null;
  showImage: boolean;
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
    coverCrop: CoverCrops | null;
  } | null;
};

const TIMELINE_COLUMNS = {
  id: schema.timelines.id,
  name: schema.timelines.name,
  slug: schema.timelines.slug,
  description: schema.timelines.description,
  caseId: schema.timelines.caseId,
  caseName: schema.cases.name,
  caseSlug: schema.cases.slug,
  scale: schema.timelines.scale,
  anchorAt: schema.timelines.anchorAt,
  anchorUnit: schema.timelines.anchorUnit,
  viewMode: schema.timelines.viewMode,
  editMode: schema.timelines.editMode,
  accessLocked: schema.timelines.accessLocked,
  createdBy: schema.timelines.createdBy,
  createdAt: schema.timelines.createdAt,
  updatedAt: schema.timelines.updatedAt,
} as const;

const now = () => Math.floor(Date.now() / 1000);

/** §18b: whoever is acting, and the onderzoeker they are acting as. */
type Actor = Author;

const NAME_MAX = 120;
const TEXT_MAX = 4000;

/* ------------------------------------------------------------ tijdlijnen */

export type TimelineListOptions = {
  sort?: 'recent' | 'name' | 'created' | 'size';
  /** 'loose' = no dossier; 'case' = inside one; a case id = that one. */
  where?: 'loose' | 'case' | string;
  mine?: string;
  privateOnly?: boolean;
};

/**
 * §17: a tijdlijn is visible when its own view dial allows the viewer AND, if
 * it sits in a dossier, that dossier is visible — the same two-step
 * `listBoards` makes, one condition per table.
 */
export function listTimelines(viewer: Viewer, options: TimelineListOptions = {}): TimelineSummary[] {
  const conditions = [isNull(schema.timelines.deletedAt), viewableCondition('timeline', viewer)];
  if (options.where === 'loose') conditions.push(isNull(schema.timelines.caseId));
  else if (options.where === 'case') conditions.push(sql`${schema.timelines.caseId} IS NOT NULL`);
  else if (options.where) conditions.push(eq(schema.timelines.caseId, options.where));
  if (options.mine) conditions.push(eq(schema.timelines.createdBy, options.mine));
  if (options.privateOnly) conditions.push(sql`${schema.timelines.viewMode} <> 'all'`);

  const order =
    options.sort === 'name'
      ? sql`${schema.timelines.name} COLLATE NOCASE ASC`
      : options.sort === 'created'
        ? desc(schema.timelines.createdAt)
        : desc(schema.timelines.updatedAt);

  const rows = db
    .select(TIMELINE_COLUMNS)
    .from(schema.timelines)
    .leftJoin(schema.cases, eq(schema.cases.id, schema.timelines.caseId))
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

  // Gebeurtenissen the viewer may see, counted per tijdlijn: every note, and
  // the artikel gebeurtenissen whose artikel is visible to them.
  const counts = new Map<string, number>();
  const ids = kept.map((t) => t.id);
  for (const row of db
    .select({ timelineId: schema.timelineEvents.timelineId, n: sql<number>`count(*)` })
    .from(schema.timelineEvents)
    .where(and(inArray(schema.timelineEvents.timelineId, ids), eq(schema.timelineEvents.kind, 'note')))
    .groupBy(schema.timelineEvents.timelineId)
    .all()) {
    counts.set(row.timelineId, Number(row.n));
  }
  for (const row of db
    .select({ timelineId: schema.timelineEvents.timelineId, n: sql<number>`count(*)` })
    .from(schema.timelineEvents)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.timelineEvents.entryId))
    .where(
      and(
        inArray(schema.timelineEvents.timelineId, ids),
        eq(schema.timelineEvents.kind, 'entry'),
        visibleEntryCondition(viewer),
      ),
    )
    .groupBy(schema.timelineEvents.timelineId)
    .all()) {
    counts.set(row.timelineId, (counts.get(row.timelineId) ?? 0) + Number(row.n));
  }

  const shaped = kept.map((row) => ({
    ...row,
    scale: asScale(row.scale),
    ...readAnchor(row),
    eventCount: counts.get(row.id) ?? 0,
  }));
  if (options.sort === 'size') shaped.sort((a, b) => (b.eventCount ?? 0) - (a.eventCount ?? 0));
  return shaped;
}

/** The tijdlijnen inside a dossier that this viewer may open. */
export function listTimelinesForCase(caseId: string, viewer: Viewer): TimelineSummary[] {
  return listTimelines(viewer, { where: caseId });
}

function asScale(value: unknown): Scale {
  return isScale(value) ? value : 'day';
}

/**
 * §35: the two anchor columns are one fact, so they are read as one: an
 * unknown unit, or a unit without a moment, is no anchor at all.
 */
function readAnchor(row: { anchorAt: number | null; anchorUnit: string | null }): {
  anchorAt: number | null;
  anchorUnit: AnchorUnit | null;
} {
  if (!isAnchorUnit(row.anchorUnit) || typeof row.anchorAt !== 'number' || !Number.isFinite(row.anchorAt)) {
    return { anchorAt: null, anchorUnit: null };
  }
  return { anchorAt: Math.trunc(row.anchorAt), anchorUnit: row.anchorUnit };
}

function loadTimeline(where: ReturnType<typeof eq>, viewer: Viewer): TimelineSummary | undefined {
  const row = db
    .select(TIMELINE_COLUMNS)
    .from(schema.timelines)
    .leftJoin(schema.cases, eq(schema.cases.id, schema.timelines.caseId))
    .where(and(where, isNull(schema.timelines.deletedAt), viewableCondition('timeline', viewer)))
    .get();
  if (!row) return undefined;
  if (row.caseId) {
    const parent = db
      .select({ id: schema.cases.id })
      .from(schema.cases)
      .where(and(eq(schema.cases.id, row.caseId), visibleCaseCondition(viewer)))
      .get();
    if (!parent) return undefined;
  }
  return { ...row, scale: asScale(row.scale), ...readAnchor(row) };
}

/** The tijdlijn, if this viewer may see it. There is no other way to load one. */
export function getTimelineById(id: string, viewer: Viewer): TimelineSummary | undefined {
  return loadTimeline(eq(schema.timelines.id, id), viewer);
}

export function getTimelineBySlug(slug: string, viewer: Viewer): TimelineSummary | undefined {
  return loadTimeline(eq(schema.timelines.slug, slug), viewer);
}

/**
 * §10 as a question: may this person change the tijdlijn and what is on it?
 * The dials say who may type; seeing it at all is the tijdlijn's and its
 * dossier's view rule, which `viewerCanEdit` knows nothing of.
 */
export function viewerCanEditTimeline(id: string, viewer: Viewer): boolean {
  if (!viewer) return false;
  if (!getTimelineById(id, viewer)) return false;
  return viewerCanEdit('timeline', id, viewer);
}

function slugTaken(candidate: string) {
  return Boolean(
    db.select({ id: schema.timelines.id }).from(schema.timelines).where(eq(schema.timelines.slug, candidate)).get(),
  );
}

/**
 * §35: the anchor, checked. It is one fact in two columns, so both or neither;
 * and it must be *coarser* than the measure — a tijdlijn of days that is "of"
 * one day would have nothing left to show.
 */
export function readAnchorInput(
  anchorAt: unknown,
  anchorUnit: unknown,
  scale: Scale,
): { anchorAt: number | null; anchorUnit: AnchorUnit | null } {
  if (anchorAt === null || anchorAt === undefined || anchorUnit === null || anchorUnit === undefined) {
    if ((anchorAt ?? null) !== null || (anchorUnit ?? null) !== null) {
      throw new Error('Een vast moment heeft een tijdstip én een maat nodig.');
    }
    return { anchorAt: null, anchorUnit: null };
  }
  if (!isAnchorUnit(anchorUnit)) throw new Error('Onbekende maat voor het vaste moment.');
  if (typeof anchorAt !== 'number' || !Number.isFinite(anchorAt)) throw new Error('Wanneer speelt deze tijdlijn?');
  if (!anchorUnitsFor(scale).includes(anchorUnit)) {
    throw new Error('Het vaste moment moet grover zijn dan de maat van de tijdlijn.');
  }
  return { anchorAt: Math.trunc(anchorAt), anchorUnit };
}

export function createTimeline(
  input: {
    name: string;
    caseId?: string | null;
    scale?: Scale;
    description?: string;
    isPrivate?: boolean;
    anchorAt?: number | null;
    anchorUnit?: AnchorUnit | null;
  },
  actor: Actor,
): TimelineSummary {
  const name = input.name.trim().slice(0, NAME_MAX) || 'Naamloze tijdlijn';
  const id = newId();
  const scale = isScale(input.scale) ? input.scale : 'day';
  const anchor = readAnchorInput(input.anchorAt ?? null, input.anchorUnit ?? null, scale);
  db.insert(schema.timelines)
    .values({
      id,
      name,
      slug: uniqueSlug(name, slugTaken),
      description: (input.description ?? '').trim().slice(0, 2000),
      caseId: input.caseId ?? null,
      scale,
      anchorAt: anchor.anchorAt,
      anchorUnit: anchor.anchorUnit,
      viewMode: input.isPrivate ? 'private' : 'all',
      editMode: input.isPrivate ? 'private' : 'all',
      createdBy: actor.id,
    })
    .run();
  logActivity({ actorId: actor.id, characterId: actor.characterId ?? null, verb: 'timeline.created', caseId: input.caseId ?? null, meta: { timelineId: id, name } });
  return getTimelineById(id, actor)!;
}

export type TimelinePatch = {
  name?: string;
  description?: string;
  scale?: Scale;
  /** §35: both together, or both null to take the anchor away. */
  anchorAt?: number | null;
  anchorUnit?: AnchorUnit | null;
};

export function updateTimeline(id: string, patch: TimelinePatch, actor: Actor): TimelineSummary {
  if (!viewerCanEditTimeline(id, actor)) throw new Error('Je mag deze tijdlijn niet bewerken.');
  const before = getTimelineById(id, actor)!;
  const values: Partial<typeof schema.timelines.$inferInsert> = { updatedAt: now() };
  if (typeof patch.name === 'string') {
    const name = patch.name.trim().slice(0, NAME_MAX);
    if (!name) throw new Error('Een tijdlijn heeft een naam nodig.');
    values.name = name;
  }
  if (typeof patch.description === 'string') values.description = patch.description.trim().slice(0, 2000);
  if (patch.scale !== undefined) {
    if (!isScale(patch.scale)) throw new Error('Onbekende maat.');
    values.scale = patch.scale as TimelineScale;
  }
  /*
   * §35: the anchor is read against the measure this tijdlijn will *have* —
   * a sheet that makes the axis finer and pins it to a day in one save is one
   * act, not two. A re-measure that leaves the old anchor no longer coarser
   * than the scale drops it rather than refusing: the measure is what the
   * Keeper just asked for.
   */
  const scaleAfter = (values.scale as Scale | undefined) ?? before.scale;
  if (patch.anchorAt !== undefined || patch.anchorUnit !== undefined) {
    const anchor = readAnchorInput(patch.anchorAt ?? null, patch.anchorUnit ?? null, scaleAfter);
    values.anchorAt = anchor.anchorAt;
    values.anchorUnit = anchor.anchorUnit;
  } else if (before.anchorUnit && !anchorUnitsFor(scaleAfter).includes(before.anchorUnit)) {
    values.anchorAt = null;
    values.anchorUnit = null;
  }
  db.update(schema.timelines).set(values).where(eq(schema.timelines.id, id)).run();
  return getTimelineById(id, actor)!;
}

/** Soft: into the bin, gebeurtenissen and all. `lib/admin/trash.ts` brings it back or ends it. */
export function softDeleteTimeline(id: string, actor: Actor) {
  if (!viewerCanEditTimeline(id, actor)) throw new Error('Je mag deze tijdlijn niet verwijderen.');
  const row = getTimelineById(id, actor);
  db.update(schema.timelines).set({ deletedAt: now(), updatedAt: now() }).where(eq(schema.timelines.id, id)).run();
  logActivity({ actorId: actor.id, characterId: actor.characterId ?? null, verb: 'timeline.deleted', caseId: row?.caseId ?? null, meta: { timelineId: id } });
}

/** The ids among these this viewer may open — for a wall's tijdlijn cards (rule 19). */
export function visibleTimelineIds(ids: string[], viewer: Viewer): Set<string> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return new Set();
  return new Set(
    listTimelines(viewer)
      .filter((t) => wanted.includes(t.id))
      .map((t) => t.id),
  );
}

/* ------------------------------------------------------ gebeurtenissen */

const EVENT_COLUMNS = {
  id: schema.timelineEvents.id,
  timelineId: schema.timelineEvents.timelineId,
  kind: schema.timelineEvents.kind,
  at: schema.timelineEvents.at,
  precision: schema.timelineEvents.precision,
  name: schema.timelineEvents.name,
  text: schema.timelineEvents.text,
  assetId: schema.timelineEvents.assetId,
  showImage: schema.timelineEvents.showImage,
  createdBy: schema.timelineEvents.createdBy,
  createdAt: schema.timelineEvents.createdAt,
  updatedAt: schema.timelineEvents.updatedAt,
  scale: schema.timelines.scale,
  entryId: schema.entries.id,
  entrySlug: schema.entries.slug,
  entryName: schema.entries.name,
  entryShort: schema.entries.shortDescription,
  entryCover: schema.entries.coverAssetId,
  entryCrop: schema.entries.coverCrop,
  typeSlug: schema.entryTypes.slug,
  typeLabel: schema.entryTypes.label,
  typeIcon: schema.entryTypes.icon,
  typeColour: schema.entryTypes.colour,
} as const;

type EventRow = {
  id: string;
  timelineId: string;
  kind: EventKind;
  at: number;
  precision: string;
  name: string;
  text: string;
  assetId: string | null;
  showImage: boolean;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  scale: string;
  entryId: string | null;
  entrySlug: string | null;
  entryName: string | null;
  entryShort: string | null;
  entryCover: string | null;
  entryCrop: CoverCrops | null;
  typeSlug: string | null;
  typeLabel: string | null;
  typeIcon: string | null;
  typeColour: string | null;
};

function shapeEvent(row: EventRow): TimelineEvent {
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
          coverCrop: row.entryCrop ?? null,
        }
      : null;
  const scale = asScale(row.scale);
  return {
    id: row.id,
    timelineId: row.timelineId,
    kind: row.kind,
    at: row.at,
    precision: clampPrecision(isScale(row.precision) ? row.precision : scale, scale),
    name: entry ? entry.name : row.name,
    text: row.text,
    assetId: row.kind === 'note' ? row.assetId : null,
    showImage: row.showImage,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    entry,
  };
}

/** A note is shown to whoever sees the tijdlijn; an artikel gebeurtenis only to whoever may see the artikel (rule 1). */
function visibleEventCondition(viewer: Viewer) {
  return sql`(${schema.timelineEvents.kind} = 'note' OR (${schema.entries.id} IS NOT NULL AND ${visibleEntryCondition(viewer)}))`;
}

function eventQuery() {
  return db
    .select(EVENT_COLUMNS)
    .from(schema.timelineEvents)
    .innerJoin(schema.timelines, eq(schema.timelines.id, schema.timelineEvents.timelineId))
    .leftJoin(schema.entries, eq(schema.entries.id, schema.timelineEvents.entryId))
    .leftJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId));
}

/** Every gebeurtenis this viewer may see on the tijdlijn, in time order. The tijdlijn itself must already have passed `getTimelineById`. */
export function listEvents(timelineId: string, viewer: Viewer): TimelineEvent[] {
  return eventQuery()
    .where(and(eq(schema.timelineEvents.timelineId, timelineId), visibleEventCondition(viewer)))
    .orderBy(asc(schema.timelineEvents.at), asc(schema.timelineEvents.createdAt))
    .all()
    .map(shapeEvent);
}

/** One gebeurtenis, behind its tijdlijn's rule and its own. */
export function getEvent(eventId: string, viewer: Viewer): TimelineEvent | undefined {
  const row = eventQuery()
    .where(and(eq(schema.timelineEvents.id, eventId), visibleEventCondition(viewer)))
    .get();
  if (!row) return undefined;
  if (!getTimelineById(row.timelineId, viewer)) return undefined;
  return shapeEvent(row);
}

function asMoment(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Wanneer was dit?');
  // Ten thousand years either side of now is more than any calendar the
  // archive will keep; anything beyond it is a number that went wrong.
  return Math.max(-4e11, Math.min(4e11, Math.trunc(value)));
}

export type NewEvent =
  | { kind: 'entry'; entryId: string; at: number; precision?: Precision; text?: string }
  | { kind: 'note'; name: string; text?: string; at: number; precision?: Precision };

export function addEvent(timelineId: string, input: NewEvent, actor: Actor): TimelineEvent {
  const timeline = getTimelineById(timelineId, actor);
  if (!timeline) throw new Error('Tijdlijn niet gevonden');
  if (!viewerCanEdit('timeline', timelineId, actor)) throw new Error('Je mag deze tijdlijn niet bewerken.');

  const id = newId();
  const precision = clampPrecision(isScale(input.precision) ? input.precision : timeline.scale, timeline.scale);
  // §35: an anchored tijdlijn is *of* its day; nothing lands outside it, even
  // if a client asks. The moment itself is taken as given (the date form
  // already builds it out of whole parts) — only the drag snaps.
  const at = clampToAnchor(
    applyAnchor(asMoment(input.at), timeline.anchorAt, timeline.anchorUnit),
    precision,
    timeline.anchorAt,
    timeline.anchorUnit,
  );
  const text = (input.text ?? '').trim().slice(0, TEXT_MAX);

  if (input.kind === 'entry') {
    const entry = db
      .select({ id: schema.entries.id, cover: schema.entries.coverAssetId })
      .from(schema.entries)
      .where(and(eq(schema.entries.id, input.entryId), visibleEntryCondition(actor)))
      .get();
    if (!entry) throw new Error('Artikel niet gevonden');
    db.insert(schema.timelineEvents)
      .values({
        id,
        timelineId,
        kind: 'entry',
        entryId: entry.id,
        at,
        precision,
        text,
        // The frame opens when there is a picture to put in it; otherwise the
        // soort's icon waits behind a button (Nick, 6 Sep 2026).
        showImage: Boolean(entry.cover),
        createdBy: actor.id,
        characterId: actor.characterId ?? null,
      })
      .run();
    logActivity({ actorId: actor.id, characterId: actor.characterId ?? null, verb: 'timeline.event_added', entryId: entry.id, caseId: timeline.caseId, meta: { timelineId, eventId: id } });
  } else {
    const name = (input.name ?? '').trim().slice(0, NAME_MAX);
    if (!name) throw new Error('Geef de gebeurtenis een naam.');
    db.insert(schema.timelineEvents)
      .values({
        id,
        timelineId,
        kind: 'note',
        name,
        text,
        at,
        precision,
        showImage: false,
        createdBy: actor.id,
        characterId: actor.characterId ?? null,
      })
      .run();
    logActivity({ actorId: actor.id, characterId: actor.characterId ?? null, verb: 'timeline.event_added', caseId: timeline.caseId, meta: { timelineId, eventId: id, name } });
  }
  db.update(schema.timelines).set({ updatedAt: now() }).where(eq(schema.timelines.id, timelineId)).run();
  // §27: what this tijdlijn's gebeurtenissen name.
  recomputeTimelineMentions(timelineId);
  return getEvent(id, actor)!;
}

export const TIMELINE_NOT_YOURS = 'Je mag deze tijdlijn niet bewerken.';

function ownEvent(eventId: string, actor: Actor) {
  const event = db
    .select({
      id: schema.timelineEvents.id,
      timelineId: schema.timelineEvents.timelineId,
      kind: schema.timelineEvents.kind,
      entryId: schema.timelineEvents.entryId,
      at: schema.timelineEvents.at,
      precision: schema.timelineEvents.precision,
      assetId: schema.timelineEvents.assetId,
    })
    .from(schema.timelineEvents)
    .where(eq(schema.timelineEvents.id, eventId))
    .get();
  if (!event) throw new Error('Gebeurtenis niet gevonden');
  if (!viewerCanEditTimeline(event.timelineId, actor)) throw new Error(TIMELINE_NOT_YOURS);
  return event;
}

/** The same question as a boolean, so a route can answer 403 before doing anything. */
export function viewerCanEditEvent(eventId: string, actor: Actor): boolean {
  const event = db
    .select({ timelineId: schema.timelineEvents.timelineId })
    .from(schema.timelineEvents)
    .where(eq(schema.timelineEvents.id, eventId))
    .get();
  return Boolean(event && viewerCanEditTimeline(event.timelineId, actor));
}

export type EventPatch = {
  at?: number;
  precision?: Precision;
  name?: string;
  text?: string;
  /** A note's own picture; `null` takes it away. */
  assetId?: string | null;
  showImage?: boolean;
};

export function updateEvent(eventId: string, patch: EventPatch, actor: Actor, options: { live?: boolean } = {}): TimelineEvent {
  const event = ownEvent(eventId, actor);
  const timeline = getTimelineById(event.timelineId, actor)!;
  const values: Partial<typeof schema.timelineEvents.$inferInsert> = { updatedAt: now() };
  if (patch.precision !== undefined) {
    if (!isScale(patch.precision)) throw new Error('Onbekende precisie.');
    values.precision = clampPrecision(patch.precision, timeline.scale);
  }
  /*
   * §35: a moved gebeurtenis lands on a whole unit of *its own* precision —
   * an artikel known only as "1931" stays on its year however far the axis is
   * zoomed in — and never outside an anchored tijdlijn's day. The client does
   * the same sum while the hand is moving; this is the one that counts.
   */
  const shownPrecision = clampPrecision(
    (values.precision as Precision | undefined) ?? (isScale(event.precision) ? event.precision : timeline.scale),
    timeline.scale,
  );
  if (patch.at !== undefined) values.at = momentOnTimeline(asMoment(patch.at), shownPrecision, timeline);
  if (typeof patch.name === 'string' && event.kind === 'note') {
    const name = patch.name.trim().slice(0, NAME_MAX);
    if (!name) throw new Error('Een gebeurtenis heeft een naam nodig.');
    values.name = name;
  }
  if (typeof patch.text === 'string') values.text = patch.text.trim().slice(0, TEXT_MAX);
  if (patch.assetId !== undefined && event.kind === 'note') {
    if (patch.assetId === null || patch.assetId === '') {
      values.assetId = null;
      // A frame with nothing in it closes; §22's sentence, once more.
      if (patch.showImage === undefined) values.showImage = false;
    } else {
      const asset = db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.id, patch.assetId)).get();
      if (!asset) throw new Error('Die afbeelding bestaat niet.');
      values.assetId = asset.id;
      if (patch.showImage === undefined) values.showImage = true;
    }
  }
  if (typeof patch.showImage === 'boolean') values.showImage = patch.showImage;

  db.update(schema.timelineEvents).set(values).where(eq(schema.timelineEvents.id, eventId)).run();
  db.update(schema.timelines).set({ updatedAt: now() }).where(eq(schema.timelines.id, event.timelineId)).run();
  // §21: a note's name and text are shared fields; a plain write brings the room into line.
  if (!options.live && (values.name !== undefined || values.text !== undefined)) {
    const fields: Record<string, string> = {};
    if (typeof values.name === 'string') fields.name = values.name;
    if (typeof values.text === 'string') fields.text = values.text;
    resetFieldsInRoom(eventFieldsRoomKey(eventId), fields);
  }
  // §27: a renamed or rewritten gebeurtenis says something else about the artikelen.
  if (values.name !== undefined || values.text !== undefined) recomputeTimelineMentions(event.timelineId);
  /*
   * §35: moving an artikel gebeurtenis moves the artikel. The date in its
   * infobox is rewritten to the moment it was dropped on — through
   * `lib/timelines/moment.ts`, never through `updateEntry`, so a drag by
   * somebody who may edit this tijdlijn is a move and not a proposal — and
   * because "the last drag wins", the same artikel's gebeurtenissen on every
   * other tijdlijn follow, each re-snapped and re-anchored to its own.
   */
  if (values.at !== undefined && event.kind === 'entry' && event.entryId) {
    writeEntryDate(event.entryId, values.at as number, shownPrecision);
    moveEntryEvents(event.entryId, values.at as number, { except: eventId });
  }
  return getEvent(eventId, actor)!;
}

/**
 * A note gebeurtenis becomes the gebeurtenis of an artikel, in place — the
 * same move a notitie on a prikbord and a speld on a landkaart have. The
 * moment, the tijdlijn's own text and the picture frame stay; the name is
 * cleared because an artikel gebeurtenis carries an id and nothing else
 * (rule 19), and the note's own picture goes because the artikel's cover is
 * what the frame shows from now on.
 */
export function convertEventToEntry(eventId: string, entryId: string, actor: Actor): TimelineEvent {
  const event = ownEvent(eventId, actor);
  if (event.kind !== 'note') throw new Error('Deze gebeurtenis is al een artikel.');
  const entry = db
    .select({ id: schema.entries.id, cover: schema.entries.coverAssetId })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, entryId), visibleEntryCondition(actor)))
    .get();
  if (!entry) throw new Error('Artikel niet gevonden');

  db.update(schema.timelineEvents)
    .set({ kind: 'entry', entryId: entry.id, name: '', assetId: null, showImage: Boolean(entry.cover), updatedAt: now() })
    .where(eq(schema.timelineEvents.id, eventId))
    .run();
  db.update(schema.timelines).set({ updatedAt: now() }).where(eq(schema.timelines.id, event.timelineId)).run();
  // §21: somebody may still have the note's sheet open; the row is the truth.
  resetFieldsInRoom(eventFieldsRoomKey(eventId), { name: '' });
  recomputeTimelineMentions(event.timelineId);
  logActivity({ actorId: actor.id, characterId: actor.characterId ?? null, verb: 'timeline.event_added', entryId: entry.id, meta: { timelineId: event.timelineId, eventId, from: 'note' } });
  return getEvent(eventId, actor)!;
}

export function removeEvent(eventId: string, actor: Actor) {
  const event = ownEvent(eventId, actor);
  db.delete(schema.timelineEvents).where(eq(schema.timelineEvents.id, eventId)).run();
  db.update(schema.timelines).set({ updatedAt: now() }).where(eq(schema.timelines.id, event.timelineId)).run();
  recomputeTimelineMentions(event.timelineId);
}

/**
 * Where an artikel is on the tijdlijnen — for the "Op de tijdlijn" block on its
 * page. Behind the tijdlijn's own rule, so a tijdlijn this reader may not open
 * is not named on a page they can.
 */
export function listEventsForEntry(
  entryId: string,
  viewer: Viewer,
): { eventId: string; timelineId: string; timelineName: string; timelineSlug: string; at: number; precision: Precision }[] {
  const rows = db
    .select({
      eventId: schema.timelineEvents.id,
      timelineId: schema.timelines.id,
      timelineName: schema.timelines.name,
      timelineSlug: schema.timelines.slug,
      scale: schema.timelines.scale,
      at: schema.timelineEvents.at,
      precision: schema.timelineEvents.precision,
    })
    .from(schema.timelineEvents)
    .innerJoin(schema.timelines, eq(schema.timelines.id, schema.timelineEvents.timelineId))
    .where(and(eq(schema.timelineEvents.entryId, entryId), isNull(schema.timelines.deletedAt)))
    .orderBy(asc(schema.timelineEvents.at))
    .all();
  if (!rows.length) return [];
  const allowed = visibleTimelineIds(rows.map((row) => row.timelineId), viewer);
  return rows
    .filter((row) => allowed.has(row.timelineId))
    .map((row) => {
      const scale = asScale(row.scale);
      return {
        eventId: row.eventId,
        timelineId: row.timelineId,
        timelineName: row.timelineName,
        timelineSlug: row.timelineSlug,
        at: row.at,
        precision: clampPrecision(isScale(row.precision) ? row.precision : scale, scale),
      };
    });
}
