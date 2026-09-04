import { asc } from 'drizzle-orm';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Names only. Used by `user_link` fields and, later, case assignment. */
export async function GET() {
  try {
    await requireUser();
    const users = db
      .select({ id: schema.users.id, username: schema.users.username })
      .from(schema.users)
      .orderBy(asc(schema.users.usernameLower))
      .all();
    return json({ users });
  } catch (err) {
    return apiError(err);
  }
}
