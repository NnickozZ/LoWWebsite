import { and, eq, isNull } from 'drizzle-orm';
import { canEdit, canView, grantFor, viewerCanEdit } from '@/lib/access';
import { updateCase } from '@/lib/cases/service';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { db, schema } from '@/lib/db';
import { liveFieldValues, updateEntry } from '@/lib/entries/service';
import { updateSection } from '@/lib/entries/secrets';
import { canSeeSection, visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { getPin, updateMap, updatePin } from '@/lib/maps/service';
import type { FieldValues, RoomSpec } from './docs';
import { caseFieldsRoomKey, entryFieldsRoomKey, mapFieldsRoomKey, pinFieldsRoomKey } from './keys';

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
 *   map:{id}:fields    name, description (Keepers write; everyone reads)
 *   pin:{id}:fields    name, text of a note pin (its owner or a Keeper writes)
 *
 * The gate is the *same* rule the page uses to decide whether to render the
 * text at all — `visibleEntryCondition` and `canSeeSection` for looking,
 * `canEdit` (§17) and the §10 lock for typing. A player who may not see a
 * section is not merely refused its updates: they never learn the room exists.
 * That is what lets one CRDT document be fanned out to everyone in a room
 * while README rule 1 still holds — the room's membership *is* the visibility
 * rule.
 *
 * Keeper notes are deliberately not a room: a private scratch field one
 * person edits does not need a CRDT, and a room for it would be one more
 * Keeper-only channel to audit.
 */

export type Admission = {
  spec: RoomSpec;
  canEdit: boolean;
};

const ENTRY_KEY = /^entry:([A-Za-z0-9_-]{1,64}):body$/;
const SECTION_KEY = /^section:([A-Za-z0-9_-]{1,64})$/;
const CASE_KEY = /^case:([A-Za-z0-9_-]{1,64}):notes$/;
const ENTRY_FIELDS_KEY = /^entry:([A-Za-z0-9_-]{1,64}):fields$/;
const CASE_FIELDS_KEY = /^case:([A-Za-z0-9_-]{1,64}):fields$/;
const MAP_FIELDS_KEY = /^map:([A-Za-z0-9_-]{1,64}):fields$/;
const PIN_FIELDS_KEY = /^pin:([A-Za-z0-9_-]{1,64}):fields$/;

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
  const map = db
    .select({ id: schema.maps.id, name: schema.maps.name, description: schema.maps.description })
    .from(schema.maps)
    .where(and(eq(schema.maps.id, mapId), isNull(schema.maps.deletedAt)))
    .get();
  if (!map) return null;
  return {
    // §19: only a Keeper hangs or relabels a landkaart.
    canEdit: Boolean(viewer.isKeeper),
    spec: {
      key: mapFieldsRoomKey(mapId),
      kind: 'fields',
      seed: () => ({ name: map.name, description: map.description }),
      persist: (value, actor) => {
        if (!actor.isKeeper) return;
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
export function admit(key: string, viewer: Viewer): Admission | null {
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
  const sectionMatch = SECTION_KEY.exec(key);
  if (sectionMatch) return sectionAdmission(sectionMatch[1], viewer);
  const caseMatch = CASE_KEY.exec(key);
  if (caseMatch) return caseAdmission(caseMatch[1], viewer);
  return null;
}
