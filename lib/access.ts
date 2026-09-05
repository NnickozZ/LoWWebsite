import { and, eq } from 'drizzle-orm';
import { sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { AccessMode, AccessTargetType } from '@/lib/db/schema';
import type { Viewer } from '@/lib/entries/visibility';

/**
 * §17: who may look, and who may touch.
 *
 * Every fiche, dossier and prikbord has an owner — whoever made it — and two
 * dials that owner turns: `view_mode` and `edit_mode`, each one of
 *
 *   'all'      everyone who is signed in. The default, because the archive is
 *              built on trust and a dial nobody touches must change nothing.
 *   'some'     the people in `access_grants` for that thing.
 *   'private'  the owner, and the Keepers.
 *
 * Three rules hold everything together:
 *
 *   1. **Keepers see and edit everything.** Not a permission, a property.
 *   2. **The owner always may.** A dial cannot lock its own owner out.
 *   3. **Editing implies viewing.** Nobody may change what they cannot see, so
 *      every edit check is a view check first.
 *
 * And one that is easy to get wrong: this is a layer *beside* the Keeper's
 * secrecy (`visibility` on an entry, §9), not a replacement for it. A player
 * sees a fiche only when the Keeper allows it AND the owner allows it. The
 * SQL below is therefore always AND-ed onto `visibleEntryCondition`, never
 * substituted for it.
 *
 * Rights are per ACCOUNT. A character (§18) is a name a person wears; it
 * changes nothing here.
 *
 * `access_locked` is the Keeper's bolt: with it set, the owner can no longer
 * turn the dials. For the wall the whole camp is supposed to be served from.
 */

export const ACCESS_MODES: AccessMode[] = ['all', 'some', 'private'];

export function isAccessMode(value: unknown): value is AccessMode {
  return typeof value === 'string' && (ACCESS_MODES as string[]).includes(value);
}

export type AccessRow = {
  createdBy: string | null;
  viewMode: AccessMode;
  editMode: AccessMode;
  accessLocked?: boolean;
};

export type Grant = { userId: string; canView: boolean; canEdit: boolean };

/* ------------------------------------------------------------------ SQL */

const TABLES = {
  entry: schema.entries,
  case: schema.cases,
  board: schema.boards,
} as const;

/**
 * The view rule as a WHERE fragment for one of the three tables. Keepers get
 * `1 = 1`; a signed-out viewer only ever sees 'all'.
 */
export function viewableCondition(target: AccessTargetType, viewer: Viewer): SQL {
  const t = TABLES[target];
  if (viewer?.isKeeper) return sql`1 = 1`;
  if (!viewer) return sql`${t.viewMode} = 'all'`;
  return sql`(
    ${t.viewMode} = 'all'
    OR ${t.createdBy} = ${viewer.id}
    OR (${t.viewMode} = 'some' AND EXISTS (
      SELECT 1 FROM access_grants g
      WHERE g.target_type = ${target} AND g.target_id = ${t.id}
        AND g.user_id = ${viewer.id} AND g.can_view = 1
    ))
  )`;
}

/* ------------------------------------------------------------- predicates */

/** The same rule as a plain predicate, for in-memory checks and tests. */
export function canView(row: AccessRow, viewer: Viewer, grant?: Grant | null): boolean {
  if (viewer?.isKeeper) return true;
  if (row.viewMode === 'all') return true;
  if (!viewer) return false;
  if (row.createdBy === viewer.id) return true;
  if (row.viewMode === 'some') return Boolean(grant?.canView);
  return false;
}

export function canEdit(row: AccessRow, viewer: Viewer, grant?: Grant | null): boolean {
  if (viewer?.isKeeper) return true;
  if (!viewer) return false;
  if (!canView(row, viewer, grant)) return false;
  if (row.createdBy === viewer.id) return true;
  if (row.editMode === 'all') return true;
  if (row.editMode === 'some') return Boolean(grant?.canEdit);
  return false;
}

/** Who may turn the dials: the owner, unless the Keeper bolted them; Keepers always. */
export function canManageAccess(row: AccessRow, viewer: Viewer): boolean {
  if (viewer?.isKeeper) return true;
  if (!viewer) return false;
  if (row.accessLocked) return false;
  return row.createdBy === viewer.id;
}

/* ----------------------------------------------------------------- reads */

export function grantFor(
  target: AccessTargetType,
  targetId: string,
  userId: string,
): Grant | null {
  const row = db
    .select({
      userId: schema.accessGrants.userId,
      canView: schema.accessGrants.canView,
      canEdit: schema.accessGrants.canEdit,
    })
    .from(schema.accessGrants)
    .where(
      and(
        eq(schema.accessGrants.targetType, target),
        eq(schema.accessGrants.targetId, targetId),
        eq(schema.accessGrants.userId, userId),
      ),
    )
    .get();
  return row ?? null;
}

export function listGrants(target: AccessTargetType, targetId: string): Grant[] {
  return db
    .select({
      userId: schema.accessGrants.userId,
      canView: schema.accessGrants.canView,
      canEdit: schema.accessGrants.canEdit,
    })
    .from(schema.accessGrants)
    .where(
      and(eq(schema.accessGrants.targetType, target), eq(schema.accessGrants.targetId, targetId)),
    )
    .all();
}

/** The full picture a settings panel needs, in one shape for all three kinds. */
export type AccessSettings = {
  ownerId: string | null;
  viewMode: AccessMode;
  editMode: AccessMode;
  locked: boolean;
  viewers: string[];
  editors: string[];
};

export function accessSettings(row: AccessRow, target: AccessTargetType, id: string): AccessSettings {
  const grants = listGrants(target, id);
  return {
    ownerId: row.createdBy,
    viewMode: row.viewMode,
    editMode: row.editMode,
    locked: Boolean(row.accessLocked),
    viewers: grants.filter((g) => g.canView).map((g) => g.userId),
    editors: grants.filter((g) => g.canEdit).map((g) => g.userId),
  };
}

/** The one thing a per-row check needs and every table has. */
export function loadAccessRow(target: AccessTargetType, id: string): AccessRow | undefined {
  const t = TABLES[target];
  return db
    .select({
      createdBy: t.createdBy,
      viewMode: t.viewMode,
      editMode: t.editMode,
      accessLocked: t.accessLocked,
    })
    .from(t)
    .where(eq(t.id, id))
    .get();
}

/** True when this viewer may change the thing. Loads what it needs; one query or two. */
export function viewerCanEdit(target: AccessTargetType, id: string, viewer: Viewer): boolean {
  if (viewer?.isKeeper) return true;
  if (!viewer) return false;
  const row = loadAccessRow(target, id);
  if (!row) return false;
  const grant = row.editMode === 'some' || row.viewMode === 'some' ? grantFor(target, id, viewer.id) : null;
  return canEdit(row, viewer, grant);
}

/* ---------------------------------------------------------------- writes */

export type AccessPatch = Partial<{
  viewMode: AccessMode;
  editMode: AccessMode;
  viewers: string[];
  editors: string[];
  /** Keeper only. */
  locked: boolean;
}>;

/**
 * Turns the dials. Refuses for anyone who is not the owner or a Keeper, and
 * for an owner whose dials the Keeper has bolted. Lists are replaced whole:
 * "these people, and nobody else" is the only thing a checkbox list can mean.
 */
export function updateAccess(
  target: AccessTargetType,
  id: string,
  patch: AccessPatch,
  actor: { id: string; isKeeper: boolean },
): AccessSettings {
  const t = TABLES[target];
  const row = loadAccessRow(target, id);
  if (!row) throw new Error('Niet gevonden');
  if (!canManageAccess(row, actor)) {
    throw new Error(
      row.accessLocked && row.createdBy === actor.id
        ? 'De Keeper heeft de rechten hiervan vastgezet.'
        : 'Alleen de eigenaar of een Keeper kan de rechten aanpassen.',
    );
  }

  const values: Record<string, unknown> = {};
  if (isAccessMode(patch.viewMode)) values.viewMode = patch.viewMode;
  if (isAccessMode(patch.editMode)) values.editMode = patch.editMode;
  if (typeof patch.locked === 'boolean' && actor.isKeeper) values.accessLocked = patch.locked;
  if (Object.keys(values).length) db.update(t).set(values).where(eq(t.id, id)).run();

  if (patch.viewers !== undefined || patch.editors !== undefined) {
    const current = listGrants(target, id);
    const viewers = new Set(
      patch.viewers !== undefined
        ? patch.viewers
        : current.filter((g) => g.canView).map((g) => g.userId),
    );
    const editors = new Set(
      patch.editors !== undefined
        ? patch.editors
        : current.filter((g) => g.canEdit).map((g) => g.userId),
    );
    // The owner needs no grant, and a grant for them would only confuse the
    // list; the same for anyone who does not exist or is switched off.
    const known = new Set(
      db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.isDisabled, false))
        .all()
        .map((u) => u.id),
    );
    const everyone = [...new Set([...viewers, ...editors])].filter(
      (userId) => known.has(userId) && userId !== row.createdBy,
    );

    db.delete(schema.accessGrants)
      .where(and(eq(schema.accessGrants.targetType, target), eq(schema.accessGrants.targetId, id)))
      .run();
    if (everyone.length) {
      db.insert(schema.accessGrants)
        .values(
          everyone.map((userId) => ({
            targetType: target,
            targetId: id,
            userId,
            // Editing implies viewing (rule 3), so an editor is a viewer too.
            canView: viewers.has(userId) || editors.has(userId),
            canEdit: editors.has(userId),
          })),
        )
        .run();
    }
  }

  return accessSettings(loadAccessRow(target, id)!, target, id);
}

/** Everyone a picker may list: signed-up, not switched off. Keepers are marked so the UI can grey them. */
export function listGrantableUsers(): { id: string; username: string; isKeeper: boolean }[] {
  return db
    .select({ id: schema.users.id, username: schema.users.username, isKeeper: schema.users.isKeeper })
    .from(schema.users)
    .where(eq(schema.users.isDisabled, false))
    .orderBy(schema.users.usernameLower)
    .all();
}
