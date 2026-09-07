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
import { cleanReadingFont, type ReadingFont } from '@/lib/readingFont';
import { cleanColourScheme, type ColourScheme } from '@/lib/theme/schemes';

export type AccountState = { error?: string; ok?: string };

/** The font form answers with the choice that landed, so no reload is needed. */
export type ReadingFontState = AccountState & { font?: ReadingFont };

/** The same shape for §45's three chips: the choice that landed comes back. */
export type ColourSchemeState = AccountState & { scheme?: ColourScheme };

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

/**
 * §45: "Kleuren" in Jouw account — light, dark, or whatever the device says.
 *
 * Per account and not per device, for §29's reason: the person who reads in
 * the dark reads in the dark on the phone in the tent too. The empty string is
 * "follow the system", which is the default and the only one of the three that
 * writes no attribute at all.
 *
 * Which *side's* colours these are is not this setting's business: a
 * keeper-only page (§44) is Keeper-coloured for whoever is looking at it. This
 * chooses the half of the light, nothing else.
 */
export async function setColourSchemeAction(
  _prev: ColourSchemeState,
  formData: FormData,
): Promise<ColourSchemeState> {
  const user = await requireUser();
  const scheme = cleanColourScheme(formData.get('scheme'));

  db.update(schema.users).set({ colourScheme: scheme }).where(eq(schema.users.id, user.id)).run();

  return { ok: 'Opgeslagen.', scheme };
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
