import { asc, eq } from 'drizzle-orm';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { charactersWorn } from '@/lib/characters';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Names only — the account, and (§18) the character it is wearing. Used by
 * `user_link` fields.
 */
export async function GET() {
  try {
    await requireUser();
    const accounts = db
      .select({ id: schema.users.id, username: schema.users.username })
      .from(schema.users)
      .where(eq(schema.users.isDisabled, false))
      .orderBy(asc(schema.users.usernameLower))
      .all();
    const worn = charactersWorn(accounts.map((a) => a.id));
    const users = accounts.map((a) => ({ ...a, character: worn.get(a.id) ?? null }));
    return json({ users });
  } catch (err) {
    return apiError(err);
  }
}
