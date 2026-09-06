import { eq } from 'drizzle-orm';
import { getBoard } from '@/lib/boards/service';
import { db, schema } from '@/lib/db';
import { logAudit } from '@/lib/entries/service';
import type { Viewer } from '@/lib/entries/visibility';
import { getMapById } from '@/lib/maps/service';
import { getTimelineById } from '@/lib/timelines/service';
import { emptyInk, inkHasRoom, mergeInk, normaliseInk } from './merge';
import type { InkKind, InkLayer, InkPatch } from './types';

/**
 * §33: reading and writing a tekenlaag.
 *
 * The one rule that is *different* here from every other write in the
 * archive: **drawing is for everyone who may look.** README rule 4 of §17
 * says writers ask `viewerCanEdit`; a stroke asks only whether the viewer may
 * *see* the wall. Nick's answer, and the reason: the layer is a shared
 * scribble over the work, not the work — it holds no archive content, and
 * "everyone may rub out everyone's lines" is the point of it. The edit dial
 * still guards the cards, the spelden and the gebeurtenissen underneath.
 *
 * What is gated: the Keeper's switch (off means 403 for every stroke and
 * every undo), and the two Keeper-only actions — the switch itself, and the
 * wipe. Both go to the audit log with the name of the thing.
 */

export type InkTarget = { kind: InkKind; id: string; name: string; caseId: string | null };

export const INK_DISABLED = 'Tekenen staat uit op dit onderdeel.';
export const INK_FULL = 'De tekenlaag is vol. Vraag een Keeper hem te wissen.';
export const INK_KEEPER_ONLY = 'Alleen een Keeper kan dit.';

/**
 * The thing a layer hangs on, *as this viewer may see it*. Undefined is the
 * same answer as "does not exist", on purpose: a layer on a private prikbord
 * must not tell a player the prikbord is there.
 */
export function inkTarget(kind: InkKind, id: string, viewer: Viewer): InkTarget | undefined {
  if (kind === 'board') {
    const board = getBoard(id, viewer);
    return board ? { kind, id: board.id, name: board.name, caseId: board.caseId } : undefined;
  }
  if (kind === 'map') {
    if (!viewer) return undefined;
    const map = getMapById(id);
    return map ? { kind, id: map.id, name: map.name, caseId: null } : undefined;
  }
  const timeline = getTimelineById(id, viewer);
  return timeline ? { kind, id: timeline.id, name: timeline.name, caseId: timeline.caseId } : undefined;
}

/** Any of the three, by id alone — for the live gate, which only has the key. */
export function inkTargetById(id: string, viewer: Viewer): InkTarget | undefined {
  return inkTarget('board', id, viewer) ?? inkTarget('map', id, viewer) ?? inkTarget('timeline', id, viewer);
}

function readRow(id: string) {
  return db.select().from(schema.inkLayers).where(eq(schema.inkLayers.targetId, id)).get();
}

/** The stored layer, or an empty, enabled one. */
export function getInk(id: string): InkLayer {
  const row = readRow(id);
  if (!row) return emptyInk();
  const layer = normaliseInk(row.layer);
  return { ...layer, enabled: row.enabled };
}

/** Just the switch — what a page needs to decide whether to show the toolbar. */
export function inkEnabled(id: string): boolean {
  const row = db
    .select({ enabled: schema.inkLayers.enabled })
    .from(schema.inkLayers)
    .where(eq(schema.inkLayers.targetId, id))
    .get();
  return row ? row.enabled : true;
}

export type InkWriteResult = { layer: InkLayer; refused: number };

/**
 * Apply a patch. Throws with a Dutch message for the API to hand back
 * (`apiError` turns an `Error` into a 400; the two refusals below carry
 * their own status).
 */
export class InkRefused extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function applyInk(
  target: InkTarget,
  patch: InkPatch,
  actor: { id: string; isKeeper: boolean },
): InkWriteResult {
  const row = readRow(target.id);
  const stored = row ? { ...normaliseInk(row.layer), enabled: row.enabled } : emptyInk();

  const wantsSwitch = typeof patch.enabled === 'boolean' && patch.enabled !== stored.enabled;
  const wantsClear = patch.clear === true;
  if ((wantsSwitch || wantsClear) && !actor.isKeeper) throw new InkRefused(INK_KEEPER_ONLY, 403);

  const drawing = (Array.isArray(patch.strokes) && patch.strokes.length > 0) || (Array.isArray(patch.undo) && patch.undo.length > 0);
  // The switch is read *before* this patch flips it: a Keeper may turn it on
  // and draw in one breath, but nobody draws on a layer that is off.
  if (drawing && !stored.enabled && !(actor.isKeeper && patch.enabled === true)) {
    throw new InkRefused(INK_DISABLED, 403);
  }
  if (Array.isArray(patch.strokes) && patch.strokes.length && !wantsClear && !inkHasRoom(stored, 1)) {
    throw new InkRefused(INK_FULL, 409);
  }

  const result = mergeInk(stored, patch, actor);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const { enabled, ...layer } = result.layer;

  db.insert(schema.inkLayers)
    .values({ targetId: target.id, kind: target.kind, layer, enabled, updatedAt: nowSeconds })
    .onConflictDoUpdate({
      target: schema.inkLayers.targetId,
      set: { layer, enabled, updatedAt: nowSeconds },
    })
    .run();

  if (wantsSwitch) {
    logAudit({
      actorId: actor.id,
      action: enabled ? 'ink.enabled' : 'ink.disabled',
      targetType: target.kind,
      targetId: target.id,
      meta: { name: target.name },
    });
  }
  if (wantsClear) {
    logAudit({
      actorId: actor.id,
      action: 'ink.cleared',
      targetType: target.kind,
      targetId: target.id,
      meta: { name: target.name, strokes: stored.strokes.length },
    });
  }

  return { layer: result.layer, refused: result.refused };
}
