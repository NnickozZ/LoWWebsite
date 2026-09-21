import { and, asc, eq, inArray } from 'drizzle-orm';
import { viewerCanEdit } from '@/lib/access';
import { db, schema } from '@/lib/db';
import { cleanDoc, docToText } from '@/lib/entries/doc';
import { recomputeCaseMentions, recomputeSectionMentions } from '@/lib/entries/mentions';
import { logActivity, logAudit } from '@/lib/entries/service';
import { canSeeSection, type Viewer } from '@/lib/entries/visibility';
import { newId } from '@/lib/ids';
import { resetRoom } from '@/lib/live/docs';
import type { SectionOwnerKind, Visibility } from '@/lib/db/schema';

/**
 * §70, round 36: a sectie belongs to a *thing*.
 *
 * This file was the section half of `lib/entries/secrets.ts` and it moved here
 * whole, because a sectie is no longer part of "the Keeper's half of an
 * artikel" — it is a titled block of shared text that an artikel *or* a dossier
 * can carry, and anyone who may edit the thing may add one.
 *
 * Two rights, not one, and they are the whole of §70's gate:
 *
 *  - **Making, writing, reordering and removing** a sectie asks
 *    `viewerCanEdit(ownerKind, ownerId, viewer)` — the thing's own §17 dials.
 *    No voorstel queue: a sectie is not a field on an artikel, there is nothing
 *    to review a heading against, and §9's road for "I may not edit this" is to
 *    not have the button.
 *  - **The geheimhouding dial and the reveals stay the Keeper's.** A player may
 *    write down what an onderzoek turned up; deciding who at the table may read
 *    it is prep, and prep is §9's.
 *
 * What a *new* sectie starts as follows from that split (`startingVisibility`):
 * a Keeper's is `keeper`, because a Keeper making one is preparing; anybody
 * else's is `all`, because a player writing in the open has no way to reveal it
 * afterwards and a note nobody can read is not a note.
 *
 * Everything here still reads through `canSeeSection`. A sectie a viewer may
 * not see never leaves this file — it is dropped before the props are built, so
 * it is not in their HTML either (rule 1).
 */

export type Section = {
  id: string;
  ownerKind: SectionOwnerKind;
  ownerId: string;
  title: string;
  body: unknown;
  bodyText: string;
  visibility: Visibility;
  sortOrder: number;
  createdBy: string | null;
  characterId: string | null;
  createdAt: number;
  /** Only ever populated for a Keeper. */
  revealedTo: string[];
};

/** Who is writing. `characterId` is §18b's "as whom", null for a Keeper at the desk. */
export type SectionActor = { id: string; isKeeper: boolean; characterId?: string | null };

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

/**
 * §70: what a brand-new sectie is for. See the note at the top — this is the
 * one place the split between prep and a player's logboek is decided, and it is
 * a pure function so the rule is testable without a database around it.
 */
export function startingVisibility(isKeeper: boolean): Visibility {
  return isKeeper ? 'keeper' : 'all';
}

/**
 * §70: may this hand make, write or remove a sectie on this thing?
 *
 * Two questions, and the second one is easy to forget. The first is the thing's
 * own §17 dials (`viewerCanEdit`). The second is **§10's lock**, and it has to
 * be asked *here* rather than inherited: an artikel's lock is enforced inside
 * `updateEntry`, and a sectie does not go through `updateEntry`, so without this
 * line a bolted artikel's secties stayed writable by anybody who could edit it
 * before it was bolted. A Keeper is past the lock, as everywhere else.
 *
 * A dossier has no lock of its own, so for `case` this is just the dials.
 */
export function canEditSections(ownerKind: SectionOwnerKind, ownerId: string, viewer: Viewer): boolean {
  if (!viewerCanEdit(ownerKind, ownerId, viewer)) return false;
  // §75: an overzicht has no lock of its own either — §10's bolt is an
  // artikel's. What holds one still is the Keeper's `access_locked` (§17),
  // which `viewerCanEdit` has already asked about.
  if (ownerKind !== 'entry' || viewer?.isKeeper) return true;
  const owner = db
    .select({ isLocked: schema.entries.isLocked })
    .from(schema.entries)
    .where(eq(schema.entries.id, ownerId))
    .get();
  return !owner?.isLocked;
}

export function listSections(
  ownerKind: SectionOwnerKind,
  ownerId: string,
  viewer: Viewer,
): Section[] {
  const rows = db
    .select()
    .from(schema.sections)
    .where(and(eq(schema.sections.ownerKind, ownerKind), eq(schema.sections.ownerId, ownerId)))
    .orderBy(asc(schema.sections.sortOrder))
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
    ownerKind: row.ownerKind,
    ownerId: row.ownerId,
    title: row.title,
    body: row.body,
    bodyText: row.bodyText,
    visibility: row.visibility,
    sortOrder: row.sortOrder,
    createdBy: row.createdBy ?? null,
    characterId: row.characterId ?? null,
    createdAt: row.createdAt,
    revealedTo: revealsBySection.get(row.id) ?? [],
  }));
}

/** Where a sectie hangs, or undefined when there is no such sectie. */
export function sectionOwner(
  sectionId: string,
): { ownerKind: SectionOwnerKind; ownerId: string } | undefined {
  const row = db
    .select({ ownerKind: schema.sections.ownerKind, ownerId: schema.sections.ownerId })
    .from(schema.sections)
    .where(eq(schema.sections.id, sectionId))
    .get();
  return row ?? undefined;
}

/**
 * §27: what this thing's secties name. An artikel recomputes the whole artikel
 * rather than the one sectie, because a mention row is filed under the artikel
 * and its title; a dossier's secties feed the dossier's own pass.
 */
function recomputeOwnerMentions(ownerKind: SectionOwnerKind, ownerId: string) {
  /*
   * §75: an overzicht names things and is never named back. This is the whole
   * of that rule in code, and it is deliberately a *return* rather than a
   * missing branch: an overzicht is about the archive, not about the world, so
   * a row under "Genoemd in" saying that *Start* mentions Middelharnis would be
   * a claim about the fiction that nobody made. Links from an overzicht go one
   * way, outward.
   *
   * Everything else follows for free, because an overzicht is not a row in
   * `entries`: `listMentions` and `recomputeCaseMentions` both ask for
   * `ownerKind` explicitly ('entry' / 'case'), and `buildWebGraph` reads
   * `entry_mentions`, which this never writes.
   */
  if (ownerKind === 'overzicht') return;
  if (ownerKind === 'case') recomputeCaseMentions(ownerId);
  else recomputeSectionMentions(ownerId);
}

export function createSection(
  ownerKind: SectionOwnerKind,
  ownerId: string,
  actor: SectionActor,
): string {
  const last = db
    .select({ sortOrder: schema.sections.sortOrder })
    .from(schema.sections)
    .where(and(eq(schema.sections.ownerKind, ownerKind), eq(schema.sections.ownerId, ownerId)))
    .orderBy(asc(schema.sections.sortOrder))
    .all()
    .at(-1);

  const id = newId();
  db.insert(schema.sections)
    .values({
      id,
      ownerKind,
      ownerId,
      title: '',
      body: null,
      bodyText: '',
      visibility: startingVisibility(actor.isKeeper),
      sortOrder: (last?.sortOrder ?? 0) + 10,
      createdBy: actor.id,
      characterId: actor.characterId ?? null,
    })
    .run();
  logAudit({
    actorId: actor.id,
    action: 'section.created',
    targetType: ownerKind,
    targetId: ownerId,
  });
  return id;
}

export type SectionPatch = Partial<{
  title: string;
  body: unknown;
  visibility: Visibility;
  sortOrder: number;
}>;

export function updateSection(
  sectionId: string,
  patch: SectionPatch,
  actor: SectionActor,
  options: { live?: boolean } = {},
) {
  const existing = db.select().from(schema.sections).where(eq(schema.sections.id, sectionId)).get();
  if (!existing) throw new Error('Sectie niet gevonden');
  // §89: cleaned where it comes in.
  if (patch.body !== undefined) patch = { ...patch, body: cleanDoc(patch.body) };

  const values: Record<string, unknown> = {};
  if (patch.title !== undefined) values.title = patch.title.slice(0, 200);
  if (patch.body !== undefined) {
    values.body = patch.body;
    values.bodyText = docToText(patch.body);
  }
  if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
  if (patch.visibility !== undefined && patch.visibility !== existing.visibility) {
    // §70: the dial stayed the Keeper's. A route gets here having checked the
    // edit right; this is the second, narrower check, and it is silent rather
    // than loud because the control is not drawn for anybody else.
    if (!actor.isKeeper) throw new Error('Alleen de Keeper bepaalt wie een sectie mag lezen.');
    values.visibility = patch.visibility;
    logAudit({
      actorId: actor.id,
      action: 'section.visibility_changed',
      targetType: 'entry_section',
      targetId: sectionId,
      meta: { from: existing.visibility, to: patch.visibility, title: existing.title },
    });
    // A section going live for *everyone* is news the feed can carry. A reveal
    // to named players is not: the feed has no per-section rule, so a row there
    // would tell the rest of the table that a secret exists.
    if (patch.visibility === 'all' && existing.ownerKind === 'entry') {
      logActivity({
        actorId: actor.id,
        verb: 'entry.section_revealed',
        entryId: existing.ownerId,
        meta: { title: existing.title },
      });
    }
  }
  if (!Object.keys(values).length) return;
  values.updatedAt = Math.floor(Date.now() / 1000);

  db.update(schema.sections).set(values).where(eq(schema.sections.id, sectionId)).run();
  // Hung off the service so a save from the room counts as much as a plain
  // PATCH (rule 13), and off a title change as much as a body one, since the
  // title is what the mention prints.
  if (patch.body !== undefined || patch.title !== undefined) {
    recomputeOwnerMentions(existing.ownerKind, existing.ownerId);
  }
  // §20: a body written around the room rewrites the shared document.
  if (patch.body !== undefined && !options.live) resetRoom(`section:${sectionId}`, patch.body);
}

export function deleteSection(sectionId: string, actor: SectionActor) {
  const existing = db.select().from(schema.sections).where(eq(schema.sections.id, sectionId)).get();
  if (!existing) return;
  db.delete(schema.entrySectionReveals)
    .where(eq(schema.entrySectionReveals.sectionId, sectionId))
    .run();
  db.delete(schema.sections).where(eq(schema.sections.id, sectionId)).run();
  // §27: a section that is gone mentions nothing.
  recomputeOwnerMentions(existing.ownerKind, existing.ownerId);
  logAudit({
    actorId: actor.id,
    action: 'section.deleted',
    targetType: existing.ownerKind,
    targetId: existing.ownerId,
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

/** True when this thing has a section the viewer may not see. Keeper-only UI hint. */
export function countHiddenSections(ownerKind: SectionOwnerKind, ownerId: string): number {
  return db
    .select()
    .from(schema.sections)
    .where(
      and(
        eq(schema.sections.ownerKind, ownerKind),
        eq(schema.sections.ownerId, ownerId),
        eq(schema.sections.visibility, 'keeper'),
      ),
    )
    .all().length;
}
