import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { charactersWorn } from '@/lib/characters';
import { db, schema } from '@/lib/db';
import { logAudit } from '@/lib/entries/service';

/**
 * §9: the Keeper's half of an artikel — who may see it at all — and the two
 * pickers that both reveal dials are drawn from.
 *
 * The *sectie* half of this file moved out in round 36 (§70). A sectie is no
 * longer part of the Keeper's prep on an artikel: it belongs to a *thing*, an
 * artikel or a dossier, and anyone who may edit the thing may add one. It lives
 * in `lib/sections/service.ts`, which is the only road to one — nothing is
 * re-exported from here, because one road beats two (CLAUDE.md §5). Only the
 * reveals stayed behind, and only the *entry* ones: a sectie's reveals are
 * `setSectionReveals` over there, next to the dial they belong to.
 *
 * Everything here reads through the artikel's own visibility rule. What a
 * player may not see never leaves this file: it is dropped before the props are
 * built, so it is not in their HTML either (rule 1).
 */

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

  // §17: the people on a case are its view grants now.
  const members = db
    .select({ caseId: schema.accessGrants.targetId, userId: schema.accessGrants.userId })
    .from(schema.accessGrants)
    .where(
      and(
        eq(schema.accessGrants.targetType, 'case'),
        eq(schema.accessGrants.canView, true),
        inArray(
          schema.accessGrants.targetId,
          cases.map((item) => item.id),
        ),
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

/** Every non-disabled player, for both pickers — with (§18) the character each wears. */
export function listRevealableUsers(): {
  id: string;
  username: string;
  isKeeper: boolean;
  character: string | null;
}[] {
  const accounts = db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      isKeeper: schema.users.isKeeper,
    })
    .from(schema.users)
    .where(eq(schema.users.isDisabled, false))
    .orderBy(asc(schema.users.usernameLower))
    .all();
  const worn = charactersWorn(accounts.map((a) => a.id));
  return accounts.map((a) => ({ ...a, character: worn.get(a.id) ?? null }));
}
