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
import { cleanArticleModePref, type ArticleModePref } from '@/lib/entries/mode';
import { cleanReadingFont, type ReadingFont } from '@/lib/readingFont';

export type AccountState = { error?: string; ok?: string };

/** The mode form answers with the choice that landed, so the chips can follow. */
export type ArticleModeState = AccountState & { mode?: ArticleModePref };

/** The same trick for the letter: the answer comes back, so no reload is needed. */
export type ReadingFontState = AccountState & { font?: ReadingFont };

/**
 * §22: "hoe een artikel opengaat" in Jouw account. Everyone has this dial —
 * a Keeper who would rather read, a player who would rather write. The empty
 * string puts it back on the role's own default.
 */
export async function setArticleModeAction(
  _prev: ArticleModeState,
  formData: FormData,
): Promise<ArticleModeState> {
  const user = await requireUser();
  const mode = cleanArticleModePref(formData.get('mode'));

  db.update(schema.users).set({ articleMode: mode }).where(eq(schema.users.id, user.id)).run();

  return { ok: 'Opgeslagen.', mode };
}

/**
 * §29: "Lettertype" in Jouw account. The choice is per account, not per
 * device, because the person who needs it needs it on the phone in the tent as
 * much as on the laptop. The empty string is the archive's own letter.
 *
 * The layout reads it out of the session on the next render, so the change is
 * on every page of the archive the moment this returns.
 */
export async function setReadingFontAction(
  _prev: ReadingFontState,
  formData: FormData,
): Promise<ReadingFontState> {
  const user = await requireUser();
  const font = cleanReadingFont(formData.get('font'));

  db.update(schema.users).set({ readingFont: font }).where(eq(schema.users.id, user.id)).run();

  return { ok: 'Opgeslagen.', font };
}

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
