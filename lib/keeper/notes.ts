import { and, eq, or } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { Viewer } from '@/lib/entries/visibility';
import { isKeeperKind, type KeeperKind } from './kinds';
import { isKeeperSide } from './side';

/**
 * §44: the Keeper's notes — one text, however many doors.
 *
 * They used to be a column on `entries` and on `cases`, which meant two things
 * that are the same thing had two scratchpads. Since 0021 they live in
 * `keeper_notes`, keyed by (kind, id), and a **twin shares one row**: the
 * Keeper's own face is where the text is kept, and the players' page shows and
 * writes that same text. Type on either page and the other is typing too.
 *
 * `notesTarget()` is the whole rule and the only place it is written:
 *
 *   the Keeper's own page  → itself
 *   a page with a twin     → the twin, which is by construction the Keeper's
 *   anything else          → itself
 *
 * Nothing below hands a note to anyone but a Keeper. `readKeeperNotes` takes a
 * viewer and returns '' for a player rather than trusting its caller, because
 * this is the one field in the archive whose whole purpose is that the table
 * never sees it.
 *
 * This file deliberately does not import `ties.ts` — it asks the counterparts
 * table its one small question itself, so that `ties.ts` can import *this* to
 * move the notes when a twin is made, and neither has to import the other back.
 */

export type NotesTarget = { kind: KeeperKind; id: string };

function twinEnd(kind: KeeperKind, id: string): NotesTarget | null {
  const row = db
    .select()
    .from(schema.counterparts)
    .where(
      and(
        eq(schema.counterparts.isTwin, true),
        or(
          and(eq(schema.counterparts.keeperKind, kind), eq(schema.counterparts.keeperId, id)),
          and(eq(schema.counterparts.playerKind, kind), eq(schema.counterparts.playerId, id)),
        ),
      ),
    )
    .get();
  if (!row) return null;
  const mine = row.keeperKind === kind && row.keeperId === id;
  const otherKind = mine ? row.playerKind : row.keeperKind;
  const otherId = mine ? row.playerId : row.keeperId;
  return isKeeperKind(otherKind) ? { kind: otherKind, id: otherId } : null;
}

/** Whose row holds the notes these two faces share. */
export function notesTarget(kind: KeeperKind, id: string): NotesTarget {
  if (isKeeperSide(kind, id)) return { kind, id };
  const twin = twinEnd(kind, id);
  if (twin && isKeeperSide(twin.kind, twin.id)) return twin;
  return { kind, id };
}

/** The raw row, with no viewer and no twin resolution. Only this file and the room use it. */
function rawNotes(target: NotesTarget): string {
  return (
    db
      .select({ text: schema.keeperNotes.text })
      .from(schema.keeperNotes)
      .where(
        and(eq(schema.keeperNotes.kind, target.kind), eq(schema.keeperNotes.targetId, target.id)),
      )
      .get()?.text ?? ''
  );
}

/** The notes for this page, as this viewer may have them. Empty for everyone but a Keeper. */
export function readKeeperNotes(kind: KeeperKind, id: string, viewer: Viewer): string {
  if (!viewer?.isKeeper) return '';
  return rawNotes(notesTarget(kind, id));
}

/** The same, for the live room, which has already checked the viewer at its gate. */
export function keeperNotesForRoom(target: NotesTarget): string {
  return rawNotes(target);
}

export function writeKeeperNotes(kind: KeeperKind, id: string, text: string, keeper: Viewer) {
  if (!keeper?.isKeeper) throw new Error('Alleen voor Keepers');
  const target = notesTarget(kind, id);
  const value = String(text ?? '').slice(0, 20000);
  db.insert(schema.keeperNotes)
    .values({
      kind: target.kind,
      targetId: target.id,
      text: value,
      updatedAt: Math.floor(Date.now() / 1000),
      updatedBy: keeper.id,
    })
    .onConflictDoUpdate({
      target: [schema.keeperNotes.kind, schema.keeperNotes.targetId],
      set: { text: value, updatedAt: Math.floor(Date.now() / 1000), updatedBy: keeper.id },
    })
    .run();
}

/**
 * When a twin is made, the notes the player-facing page already carried move
 * to it — they were written *about* this thing, and the pair's one text is now
 * kept on the Keeper's side. Nothing is merged: the new face has no notes yet,
 * so there is nothing to merge with.
 */
/**
 * §53: the same move, for two pages that both already existed — and may
 * therefore both already carry notes.
 *
 * `moveNotesToTwin` is written for a face that was made a second ago and is
 * empty by construction; here the Keeper's page has usually been prepped for
 * weeks. Nothing is thrown away and nothing is chosen between: the two texts
 * are stacked, the Keeper's own first, with a line saying where the second one
 * came from. A Keeper can delete a line; they cannot get back a paragraph the
 * app decided to overwrite.
 */
export function mergeNotesIntoTwin(from: NotesTarget, to: NotesTarget) {
  const incoming = rawNotes(from);
  if (!incoming) return;
  const standing = rawNotes(to);
  if (!standing) {
    moveNotesToTwin(from, to);
    return;
  }
  const joined = `${standing}\n\n— van de andere kant —\n\n${incoming}`.slice(0, 20000);
  db.insert(schema.keeperNotes)
    .values({ kind: to.kind, targetId: to.id, text: joined })
    .onConflictDoUpdate({
      target: [schema.keeperNotes.kind, schema.keeperNotes.targetId],
      set: { text: joined },
    })
    .run();
  db.delete(schema.keeperNotes)
    .where(and(eq(schema.keeperNotes.kind, from.kind), eq(schema.keeperNotes.targetId, from.id)))
    .run();
}

export function moveNotesToTwin(from: NotesTarget, to: NotesTarget) {
  const text = rawNotes(from);
  if (!text) return;
  db.insert(schema.keeperNotes)
    .values({ kind: to.kind, targetId: to.id, text })
    .onConflictDoUpdate({
      target: [schema.keeperNotes.kind, schema.keeperNotes.targetId],
      set: { text },
    })
    .run();
  db.delete(schema.keeperNotes)
    .where(and(eq(schema.keeperNotes.kind, from.kind), eq(schema.keeperNotes.targetId, from.id)))
    .run();
}
