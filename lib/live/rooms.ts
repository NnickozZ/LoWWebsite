import { and, eq, isNull } from 'drizzle-orm';
import { canEdit, canView, grantFor, viewerCanEdit } from '@/lib/access';
import { updateCase } from '@/lib/cases/service';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { db, schema } from '@/lib/db';
import { updateEntry } from '@/lib/entries/service';
import { updateSection } from '@/lib/entries/secrets';
import { canSeeSection, visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import type { RoomSpec } from './docs';

/**
 * §20: which rooms exist, and who gets in.
 *
 * A room key names one piece of shared text:
 *
 *   entry:{id}:body   a fiche's main text
 *   section:{id}      one titled section of a fiche (§9), with its own gate
 *   case:{id}:notes   a dossier's working notes — the theory of the case
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

export const entryRoomKey = (entryId: string) => `entry:${entryId}:body`;
export const sectionRoomKey = (sectionId: string) => `section:${sectionId}`;
export const caseRoomKey = (caseId: string) => `case:${caseId}:notes`;

function caseAdmission(caseId: string, viewer: Viewer): Admission | null {
  if (!viewer) return null;
  const record = db
    .select({ id: schema.cases.id, notes: schema.cases.notes })
    .from(schema.cases)
    .where(and(eq(schema.cases.id, caseId), visibleCaseCondition(viewer)))
    .get();
  if (!record) return null;
  return {
    canEdit: viewerCanEdit('case', caseId, viewer),
    spec: {
      key: caseRoomKey(caseId),
      seed: () => record.notes,
      persist: (json, actor) => {
        updateCase(caseId, { notes: json }, actor, { live: true });
      },
    },
  };
}

function entryAdmission(entryId: string, viewer: Viewer): Admission | null {
  if (!viewer) return null;
  const entry = db
    .select({
      id: schema.entries.id,
      body: schema.entries.body,
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
  const sectionMatch = SECTION_KEY.exec(key);
  if (sectionMatch) return sectionAdmission(sectionMatch[1], viewer);
  const caseMatch = CASE_KEY.exec(key);
  if (caseMatch) return caseAdmission(caseMatch[1], viewer);
  return null;
}
