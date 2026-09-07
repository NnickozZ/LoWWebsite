import { and, eq, isNull } from 'drizzle-orm';
import { canEdit, canView, grantFor, viewerCanEdit } from '@/lib/access';
import { updateCase } from '@/lib/cases/service';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { db, schema } from '@/lib/db';
import { liveFieldValues, updateEntry } from '@/lib/entries/service';
import { updateSection } from '@/lib/entries/secrets';
import { canSeeSection, visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { getPin, updateMap, updatePin, viewerCanEditMap } from '@/lib/maps/service';
import { visibleMapCondition } from '@/lib/maps/visibility';
import { getEvent, updateEvent, viewerCanEditTimeline } from '@/lib/timelines/service';
import type { FieldValues, RoomSpec } from './docs';
import { isKeeperKind, type KeeperKind } from '@/lib/keeper/kinds';
import { keeperNotesForRoom, notesTarget, writeKeeperNotes } from '@/lib/keeper/notes';
import { keeperRef } from '@/lib/keeper/side';
import { caseFieldsRoomKey, entryFieldsRoomKey, eventFieldsRoomKey, keeperNotesRoomKey, mapFieldsRoomKey, pinFieldsRoomKey } from './keys';

/**
 * §20: which rooms exist, and who gets in.
 *
 * A room key names one piece of shared text:
 *
 *   entry:{id}:body   a fiche's main text
 *   section:{id}      one titled section of a fiche (§9), with its own gate
 *   case:{id}:notes   a dossier's working notes — the theory of the case
 *
 * and, since §21, the *fields* rooms — the short texts of one record, each a
 * Y.Text under its own name, with the same gate as the record's prose:
 *
 *   entry:{id}:fields  name, shortDescription, field.<key> (string fields)
 *   case:{id}:fields   name, summary
 *   map:{id}:fields    name, description (the map's own dials, §17: everyone
 *                      who may see it reads, its editors write)
 *   pin:{id}:fields    name, text of a note pin (its owner or a Keeper writes)
 *   event:{id}:fields  name and text of a gebeurtenis on a tijdlijn (§32; a note's
 *                      name, and the tijdlijn's own text under either kind —
 *                      whoever may edit the tijdlijn writes)
 *
 * The gate is the *same* rule the page uses to decide whether to render the
 * text at all — `visibleEntryCondition` and `canSeeSection` for looking,
 * `canEdit` (§17) and the §10 lock for typing. A player who may not see a
 * section is not merely refused its updates: they never learn the room exists.
 * That is what lets one CRDT document be fanned out to everyone in a room
 * while README rule 1 still holds — the room's membership *is* the visibility
 * rule.
 *
 * Keeper notes *were* deliberately not a room — "a private scratch field one
 * person edits does not need a CRDT". §44 reverses that, and says why: they
 * are no longer one person's scratch field. A thing and its Keeper twin share
 * one text (`lib/keeper/notes.ts`), so the same note is open on two pages at
 * once, and two Keepers preparing a session are two people typing. Without a
 * room, the second save silently threw the first away.
 *
 *   keeper:{kind}:{id}:notes   the Keeper's notes about one thing
 *
 * Its gate is the only one in this file that is not a visibility rule but a
 * role: a Keeper, and nobody else, ever. It is also the only key a page must
 * *resolve* before asking for — a twin's two faces both address the pair's
 * Keeper side, which is what makes one text out of two pages.
 */

export type Admission = {
  spec: RoomSpec;
  canEdit: boolean;
};

/**
 * §18b: the same viewer every gate here already took, plus the onderzoeker the
 * *window* is writing as. Optional, so a test or a page that only asks "is
 * there a room?" can pass a plain viewer; a player who has not chosen is
 * refused the pen below, not the room.
 */
export type RoomViewer = (NonNullable<Viewer> & { characterId?: string | null }) | null;

const ENTRY_KEY = /^entry:([A-Za-z0-9_-]{1,64}):body$/;
const SECTION_KEY = /^section:([A-Za-z0-9_-]{1,64})$/;
const CASE_KEY = /^case:([A-Za-z0-9_-]{1,64}):notes$/;
const ENTRY_FIELDS_KEY = /^entry:([A-Za-z0-9_-]{1,64}):fields$/;
const CASE_FIELDS_KEY = /^case:([A-Za-z0-9_-]{1,64}):fields$/;
const MAP_FIELDS_KEY = /^map:([A-Za-z0-9_-]{1,64}):fields$/;
const PIN_FIELDS_KEY = /^pin:([A-Za-z0-9_-]{1,64}):fields$/;
const EVENT_FIELDS_KEY = /^event:([A-Za-z0-9_-]{1,64}):fields$/;
const KEEPER_NOTES_KEY = /^keeper:([a-z]+):([A-Za-z0-9_-]{1,64}):notes$/;

const asFields = (value: unknown): FieldValues =>
  value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as FieldValues
    : {};

export const entryRoomKey = (entryId: string) => `entry:${entryId}:body`;
export const sectionRoomKey = (sectionId: string) => `section:${sectionId}`;
export const caseRoomKey = (caseId: string) => `case:${caseId}:notes`;

function caseAdmission(caseId: string, viewer: Viewer, fields = false): Admission | null {
  if (!viewer) return null;
  const record = db
    .select({ id: schema.cases.id, notes: schema.cases.notes, name: schema.cases.name, summary: schema.cases.summary })
    .from(schema.cases)
    .where(and(eq(schema.cases.id, caseId), visibleCaseCondition(viewer)))
    .get();
  if (!record) return null;
  const mayEdit = viewerCanEdit('case', caseId, viewer);
  if (fields) {
    return {
      canEdit: mayEdit,
      spec: {
        key: caseFieldsRoomKey(caseId),
        kind: 'fields',
        seed: () => ({ name: record.name, summary: record.summary }),
        persist: (value, actor) => {
          const texts = asFields(value);
          updateCase(caseId, { name: texts.name, summary: texts.summary }, actor, { live: true });
        },
      },
    };
  }
  return {
    canEdit: mayEdit,
    spec: {
      key: caseRoomKey(caseId),
      seed: () => record.notes,
      persist: (json, actor) => {
        updateCase(caseId, { notes: json }, actor, { live: true });
      },
    },
  };
}

function mapFieldsAdmission(mapId: string, viewer: Viewer): Admission | null {
  if (!viewer) return null;
  // §40: the room's gate is the landkaart's own view rule — a map this viewer
  // may not see has no room for them to stand in.
  const map = db
    .select({ id: schema.maps.id, name: schema.maps.name, description: schema.maps.description })
    .from(schema.maps)
    .where(and(eq(schema.maps.id, mapId), visibleMapCondition(viewer)))
    .get();
  if (!map) return null;
  const mayEdit = viewerCanEditMap(mapId, viewer);
  return {
    // §19 under §17: the landkaart's edit dial, which starts at 'private' —
    // so unless a Keeper has turned it up this is still "only a Keeper".
    canEdit: mayEdit,
    spec: {
      key: mapFieldsRoomKey(mapId),
      kind: 'fields',
      seed: () => ({ name: map.name, description: map.description }),
      persist: (value, actor) => {
        if (!viewerCanEditMap(mapId, actor)) return;
        const texts = asFields(value);
        updateMap(mapId, { name: texts.name, description: texts.description }, actor, { live: true });
      },
    },
  };
}

function pinFieldsAdmission(pinId: string, viewer: Viewer): Admission | null {
  if (!viewer) return null;
  // `getPin` applies the pin's own visibility rule (a fiche pin follows its fiche).
  const pin = getPin(pinId, viewer);
  if (!pin || pin.kind !== 'note') return null;
  return {
    canEdit: Boolean(viewer.isKeeper || pin.createdBy === viewer.id),
    spec: {
      key: pinFieldsRoomKey(pinId),
      kind: 'fields',
      seed: () => ({ name: pin.name, text: pin.text }),
      persist: (value, actor) => {
        const texts = asFields(value);
        try {
          updatePin(pinId, { name: texts.name, text: texts.text }, actor, { live: true });
        } catch {
          // An empty name is refused by the service; the room keeps it until it is filled in.
        }
      },
    },
  };
}

/**
 * §32: a gebeurtenis's own words — a note's name and text, an artikel
 * gebeurtenis's text only (its name is the artikel's). The gate is the
 * tijdlijn's: `getEvent` applies the tijdlijn's view dial (and its dossier's),
 * and typing is the tijdlijn's edit dial — a gebeurtenis on a tijdlijn is
 * everyone's who may work on that tijdlijn, like a card on a wall.
 */
function eventFieldsAdmission(eventId: string, viewer: Viewer): Admission | null {
  if (!viewer) return null;
  const event = getEvent(eventId, viewer);
  if (!event) return null;
  return {
    canEdit: viewerCanEditTimeline(event.timelineId, viewer),
    spec: {
      key: eventFieldsRoomKey(eventId),
      kind: 'fields',
      seed: () => (event.kind === 'note' ? { name: event.name, text: event.text } : { text: event.text }),
      persist: (value, actor) => {
        const texts = asFields(value);
        try {
          updateEvent(eventId, { name: texts.name, text: texts.text }, actor, { live: true });
        } catch {
          // An empty name is refused by the service; the room keeps it until it is filled in.
        }
      },
    },
  };
}

function entryAdmission(entryId: string, viewer: Viewer, fields = false): Admission | null {
  if (!viewer) return null;
  const entry = db
    .select({
      id: schema.entries.id,
      body: schema.entries.body,
      name: schema.entries.name,
      shortDescription: schema.entries.shortDescription,
      fields: schema.entries.fields,
      isLocked: schema.entries.isLocked,
      createdBy: schema.entries.createdBy,
      viewMode: schema.entries.viewMode,
      editMode: schema.entries.editMode,
      accessLocked: schema.entries.accessLocked,
    })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, entryId), visibleEntryCondition(viewer)))
    .get();
  if (!entry) return null;

  const grant = viewer.isKeeper ? null : grantFor('entry', entryId, viewer.id);
  const mayEdit =
    canView(entry, viewer, grant) && canEdit(entry, viewer, grant) && (!entry.isLocked || viewer.isKeeper);

  if (fields) {
    return {
      canEdit: mayEdit,
      spec: {
        key: entryFieldsRoomKey(entryId),
        kind: 'fields',
        seed: () => liveFieldValues(entry, entry.fields ?? {}),
        persist: (value, actor) => {
          const texts = asFields(value);
          const patch: Parameters<typeof updateEntry>[1] = {};
          if (texts.name !== undefined && texts.name.trim()) patch.name = texts.name;
          if (texts.shortDescription !== undefined) patch.shortDescription = texts.shortDescription;
          /*
           * §38: this sweep takes *every* `field.<key>` name out of the Yjs
           * document, and a client in a room it may write in can put any name
           * it likes in there. That is fine, and stays fine, because the keys
           * are settled where every other write to `entries.fields` is settled
           * — in `updateEntry`, against the soort's own fields and its
           * hand-filled list blocks. A key nobody configured never reaches the
           * row. The room is told nothing about it: `{ live: true }` means the
           * rejects are dropped in silence, because a CRDT handed an error
           * would send the same keystroke again for ever.
           */
          const infobox: Record<string, unknown> = {};
          for (const [name, text] of Object.entries(texts)) {
            if (name.startsWith('field.')) infobox[name.slice('field.'.length)] = text;
          }
          if (Object.keys(infobox).length) patch.fields = infobox;
          if (Object.keys(patch).length) updateEntry(entryId, patch, actor, { live: true });
        },
      },
    };
  }

  return {
    canEdit: mayEdit,
    spec: {
      key: entryRoomKey(entryId),
      seed: () => entry.body,
      persist: (json, actor) => {
        updateEntry(entryId, { body: json }, actor, { live: true });
      },
    },
  };
}

function sectionAdmission(sectionId: string, viewer: Viewer): Admission | null {
  if (!viewer) return null;
  const section = db
    .select({
      id: schema.entrySections.id,
      entryId: schema.entrySections.entryId,
      body: schema.entrySections.body,
      visibility: schema.entrySections.visibility,
    })
    .from(schema.entrySections)
    .where(eq(schema.entrySections.id, sectionId))
    .get();
  if (!section) return null;

  // The section's fiche has to be visible first; then the section's own rule.
  const entry = db
    .select({ id: schema.entries.id })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, section.entryId), isNull(schema.entries.deletedAt), visibleEntryCondition(viewer)))
    .get();
  if (!entry) return null;

  const revealed = new Set(
    db
      .select({ sectionId: schema.entrySectionReveals.sectionId })
      .from(schema.entrySectionReveals)
      .where(eq(schema.entrySectionReveals.userId, viewer.id))
      .all()
      .map((row) => row.sectionId),
  );
  if (!canSeeSection(section, viewer, revealed, section.id)) return null;

  return {
    // §9: a section is the Keeper's to write; a player only ever reads one.
    canEdit: Boolean(viewer.isKeeper),
    spec: {
      key: sectionRoomKey(sectionId),
      seed: () => section.body,
      persist: (json, actor) => {
        if (actor.isKeeper) updateSection(sectionId, { body: json }, actor.id, { live: true });
      },
    },
  };
}

/** The room behind a key, if this viewer may be in it. Null is "no such room" — never "no". */
export function admit(key: string, viewer: RoomViewer): Admission | null {
  const admission = roomFor(key, viewer);
  if (!admission) return null;
  /*
   * §18b: a player who has not said who they are writing as may read the room
   * and watch other people's carets, but may not type in it. One line, here,
   * rather than in every branch — and deliberately *not* in `lib/access.ts`,
   * whose `canEdit` is per account and would lock out every Keeper, none of
   * whom ever has a karakter.
   *
   * The editors already honour `canEdit`, so this alone makes them read-only.
   */
  if (viewer && !viewer.isKeeper && !viewer.characterId) return { ...admission, canEdit: false };
  return admission;
}

/**
 * §44: the Keeper's notes about one thing. Three refusals, in order: not a
 * Keeper, not a thing you can see, and not the side the pair keeps its text on
 * — the last so that a twin can never open a second room and split the note in
 * two. A page always asks with `notesTarget()` already applied.
 */
function keeperNotesAdmission(kind: KeeperKind, id: string, viewer: Viewer): Admission | null {
  if (!viewer?.isKeeper) return null;
  if (!keeperRef(kind, id, viewer)) return null;
  const target = notesTarget(kind, id);
  if (target.kind !== kind || target.id !== id) return null;
  return {
    canEdit: true,
    spec: {
      key: keeperNotesRoomKey(kind, id),
      kind: 'fields',
      seed: () => ({ notes: keeperNotesForRoom(target) }),
      persist: (value, actor) => {
        if (!actor.isKeeper) return;
        const texts = asFields(value);
        if (texts.notes === undefined) return;
        writeKeeperNotes(kind, id, texts.notes, actor);
      },
    },
  };
}

function roomFor(key: string, viewer: Viewer): Admission | null {
  const entryMatch = ENTRY_KEY.exec(key);
  if (entryMatch) return entryAdmission(entryMatch[1], viewer);
  const entryFieldsMatch = ENTRY_FIELDS_KEY.exec(key);
  if (entryFieldsMatch) return entryAdmission(entryFieldsMatch[1], viewer, true);
  const caseFieldsMatch = CASE_FIELDS_KEY.exec(key);
  if (caseFieldsMatch) return caseAdmission(caseFieldsMatch[1], viewer, true);
  const mapFieldsMatch = MAP_FIELDS_KEY.exec(key);
  if (mapFieldsMatch) return mapFieldsAdmission(mapFieldsMatch[1], viewer);
  const pinFieldsMatch = PIN_FIELDS_KEY.exec(key);
  if (pinFieldsMatch) return pinFieldsAdmission(pinFieldsMatch[1], viewer);
  const eventFieldsMatch = EVENT_FIELDS_KEY.exec(key);
  if (eventFieldsMatch) return eventFieldsAdmission(eventFieldsMatch[1], viewer);
  const sectionMatch = SECTION_KEY.exec(key);
  if (sectionMatch) return sectionAdmission(sectionMatch[1], viewer);
  const caseMatch = CASE_KEY.exec(key);
  if (caseMatch) return caseAdmission(caseMatch[1], viewer);
  const keeperNotesMatch = KEEPER_NOTES_KEY.exec(key);
  if (keeperNotesMatch && isKeeperKind(keeperNotesMatch[1])) {
    return keeperNotesAdmission(keeperNotesMatch[1], keeperNotesMatch[2], viewer);
  }
  return null;
}
