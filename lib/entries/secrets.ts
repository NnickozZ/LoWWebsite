import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { newId } from '@/lib/ids';
import { docToText } from '@/lib/entries/doc';
import { logActivity, logAudit } from '@/lib/entries/service';
import { canSeeSection, type Viewer } from '@/lib/entries/visibility';
import type { Visibility } from '@/lib/db/schema';

/**
 * §9: the Keeper's half of an entry — who may see it at all, and the extra
 * titled sections that get flipped on mid-session.
 *
 * Everything here reads through `canSeeSection` / the entry's own visibility
 * rule. A section a player may not see never leaves this file: it is dropped
 * before the props are built, so it is not in their HTML either.
 */

export type EntrySection = {
  id: string;
  entryId: string;
  title: string;
  body: unknown;
  bodyText: string;
  visibility: Visibility;
  sortOrder: number;
  /** Only ever populated for a Keeper. */
  revealedTo: string[];
};

/** Section ids this viewer has been revealed. Empty for a Keeper (they see all). */
function revealedSectionIds(viewer: Viewer): Set<string> {
  if (!viewer) return new Set();
  return new Set(
    db
      .select({ sectionId: schema.entrySectionReveals.sectionId })
      .from(schema.entrySectionReveals)
      .where(eq(schema.entrySectionReveals.userId, viewer.id))
      .all()
      .map((row) => row.sectionId),
  );
}

export function listSections(entryId: string, viewer: Viewer): EntrySection[] {
  const rows = db
    .select()
    .from(schema.entrySections)
    .where(eq(schema.entrySections.entryId, entryId))
    .orderBy(asc(schema.entrySections.sortOrder))
    .all();

  const revealed = viewer?.isKeeper ? new Set<string>() : revealedSectionIds(viewer);
  const visible = rows.filter((row) => canSeeSection(row, viewer, revealed, row.id));
  if (!visible.length) return [];

  // Who a section is revealed to is the Keeper's business only.
  const revealsBySection = new Map<string, string[]>();
  if (viewer?.isKeeper) {
    for (const row of db
      .select()
      .from(schema.entrySectionReveals)
      .where(
        inArray(
          schema.entrySectionReveals.sectionId,
          visible.map((section) => section.id),
        ),
      )
      .all()) {
      const list = revealsBySection.get(row.sectionId) ?? [];
      list.push(row.userId);
      revealsBySection.set(row.sectionId, list);
    }
  }

  return visible.map((row) => ({
    id: row.id,
    entryId: row.entryId,
    title: row.title,
    body: row.body,
    bodyText: row.bodyText,
    visibility: row.visibility,
    sortOrder: row.sortOrder,
    revealedTo: revealsBySection.get(row.id) ?? [],
  }));
}

export function createSection(entryId: string, keeperId: string): string {
  const last = db
    .select({ sortOrder: schema.entrySections.sortOrder })
    .from(schema.entrySections)
    .where(eq(schema.entrySections.entryId, entryId))
    .orderBy(asc(schema.entrySections.sortOrder))
    .all()
    .at(-1);

  const id = newId();
  db.insert(schema.entrySections)
    .values({
      id,
      entryId,
      title: '',
      body: null,
      bodyText: '',
      // §9: a section is prep until the Keeper says otherwise.
      visibility: 'keeper',
      sortOrder: (last?.sortOrder ?? 0) + 10,
    })
    .run();
  logAudit({ actorId: keeperId, action: 'section.created', targetType: 'entry', targetId: entryId });
  return id;
}

export type SectionPatch = Partial<{
  title: string;
  body: unknown;
  visibility: Visibility;
  sortOrder: number;
}>;

export function updateSection(sectionId: string, patch: SectionPatch, keeperId: string) {
  const existing = db
    .select()
    .from(schema.entrySections)
    .where(eq(schema.entrySections.id, sectionId))
    .get();
  if (!existing) throw new Error('Sectie niet gevonden');

  const values: Record<string, unknown> = {};
  if (patch.title !== undefined) values.title = patch.title.slice(0, 200);
  if (patch.body !== undefined) {
    values.body = patch.body;
    values.bodyText = docToText(patch.body);
  }
  if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
  if (patch.visibility !== undefined && patch.visibility !== existing.visibility) {
    values.visibility = patch.visibility;
    logAudit({
      actorId: keeperId,
      action: 'section.visibility_changed',
      targetType: 'entry_section',
      targetId: sectionId,
      meta: { from: existing.visibility, to: patch.visibility, title: existing.title },
    });
    // A section going live for *everyone* is news the feed can carry. A reveal
    // to named players is not: the feed has no per-section rule, so a row there
    // would tell the rest of the table that a secret exists.
    if (patch.visibility === 'all') {
      logActivity({
        actorId: keeperId,
        verb: 'entry.section_revealed',
        entryId: existing.entryId,
        meta: { title: existing.title },
      });
    }
  }
  if (!Object.keys(values).length) return;

  db.update(schema.entrySections)
    .set(values)
    .where(eq(schema.entrySections.id, sectionId))
    .run();
}

export function deleteSection(sectionId: string, keeperId: string) {
  const existing = db
    .select()
    .from(schema.entrySections)
    .where(eq(schema.entrySections.id, sectionId))
    .get();
  if (!existing) return;
  db.delete(schema.entrySectionReveals)
    .where(eq(schema.entrySectionReveals.sectionId, sectionId))
    .run();
  db.delete(schema.entrySections).where(eq(schema.entrySections.id, sectionId)).run();
  logAudit({
    actorId: keeperId,
    action: 'section.deleted',
    targetType: 'entry',
    targetId: existing.entryId,
    meta: { title: existing.title },
  });
}

export function setSectionReveals(sectionId: string, userIds: string[], keeperId: string) {
  const unique = [...new Set(userIds)].filter(Boolean);
  db.delete(schema.entrySectionReveals)
    .where(eq(schema.entrySectionReveals.sectionId, sectionId))
    .run();
  if (unique.length) {
    db.insert(schema.entrySectionReveals)
      .values(unique.map((userId) => ({ sectionId, userId })))
      .onConflictDoNothing()
      .run();
  }
  logAudit({
    actorId: keeperId,
    action: 'section.revealed',
    targetType: 'entry_section',
    targetId: sectionId,
    meta: { count: unique.length },
  });
}

/* --------------------------------------------------------- entry reveals */

export function listEntryReveals(entryId: string): string[] {
  return db
    .select({ userId: schema.entryReveals.userId })
    .from(schema.entryReveals)
    .where(eq(schema.entryReveals.entryId, entryId))
    .all()
    .map((row) => row.userId);
}

export function setEntryReveals(entryId: string, userIds: string[], keeperId: string) {
  const unique = [...new Set(userIds)].filter(Boolean);
  db.delete(schema.entryReveals).where(eq(schema.entryReveals.entryId, entryId)).run();
  if (unique.length) {
    db.insert(schema.entryReveals)
      .values(unique.map((userId) => ({ entryId, userId })))
      .onConflictDoNothing()
      .run();
  }
  logAudit({
    actorId: keeperId,
    action: 'entry.revealed',
    targetType: 'entry',
    targetId: entryId,
    meta: { count: unique.length },
  });
}

/**
 * §9's "all assigned investigators of case X": the picker offers each case the
 * Keeper can see as a shortcut that ticks everyone assigned to it.
 */
export function listCasesWithMembers(): { id: string; name: string; memberIds: string[] }[] {
  const cases = db
    .select({ id: schema.cases.id, name: schema.cases.name })
    .from(schema.cases)
    .where(isNull(schema.cases.deletedAt))
    .all();
  if (!cases.length) return [];

  const members = db
    .select()
    .from(schema.caseMembers)
    .where(
      inArray(
        schema.caseMembers.caseId,
        cases.map((item) => item.id),
      ),
    )
    .all();

  return cases
    .map((item) => ({
      ...item,
      memberIds: members.filter((row) => row.caseId === item.id).map((row) => row.userId),
    }))
    .filter((item) => item.memberIds.length > 0);
}

/** Every non-disabled player, for both pickers. */
export function listRevealableUsers(): { id: string; username: string; isKeeper: boolean }[] {
  return db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      isKeeper: schema.users.isKeeper,
    })
    .from(schema.users)
    .where(eq(schema.users.isDisabled, false))
    .orderBy(asc(schema.users.usernameLower))
    .all();
}

/** True when this entry has a section the viewer may not see. Keeper-only UI hint. */
export function countHiddenSections(entryId: string): number {
  return db
    .select()
    .from(schema.entrySections)
    .where(and(eq(schema.entrySections.entryId, entryId), eq(schema.entrySections.visibility, 'keeper')))
    .all().length;
}
