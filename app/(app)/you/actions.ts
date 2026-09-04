'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  encryptPassword,
  hashPassword,
  passwordProblem,
  verifyPassword,
} from '@/lib/auth/password.mjs';
import {
  destroyAllSessions,
  destroyCurrentSession,
  requireUser,
} from '@/lib/auth/session';
import { logAudit } from '@/lib/entries/service';

export type AccountState = { error?: string; ok?: string };

export async function changePasswordAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUser();
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');

  const row = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
  if (!row) return { error: 'Account niet gevonden.' };
  if (!(await verifyPassword(row.passwordHash, current))) {
    return { error: 'Dat is niet je huidige wachtwoord.' };
  }
  const problem = passwordProblem(next);
  if (problem) return { error: problem };

  db.update(schema.users)
    .set({ passwordHash: await hashPassword(next), passwordEnc: encryptPassword(next) })
    .where(eq(schema.users.id, user.id))
    .run();

  logAudit({ actorId: user.id, action: 'password.changed', targetType: 'user', targetId: user.id });
  return { ok: 'Wachtwoord gewijzigd.' };
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect('/login');
}

export async function logoutEverywhereAction() {
  const user = await requireUser();
  await destroyAllSessions(user.id);
  redirect('/login');
}
