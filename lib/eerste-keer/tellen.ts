import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { ArchiveFirsts } from './stappen';

/**
 * §106: wat het archief al heeft, voor de route van de Keeper op Start. Drie
 * tellingen over het hele archief, zonder kant (§46): het is geen lijst die
 * iemand leest, maar de vraag "is dit archief al begonnen?", en die stelt
 * alleen de Keeper. Wordt dus alleen voor een Keeper aangeroepen.
 */
export function archiveFirsts(): ArchiveFirsts {
  const count = (row: { n: number } | undefined) => Number(row?.n ?? 0);
  return {
    entries: count(
      db.select({ n: sql<number>`count(*)` }).from(schema.entries).where(isNull(schema.entries.deletedAt)).get(),
    ),
    cases: count(db.select({ n: sql<number>`count(*)` }).from(schema.cases).where(isNull(schema.cases.deletedAt)).get()),
    players: count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(schema.users)
        .where(and(eq(schema.users.isKeeper, false)))
        .get(),
    ),
  };
}
