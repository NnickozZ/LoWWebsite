'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  encryptPassword,
  hashPassword,
  passwordProblem,
  verifyPassword,
  constantTimeEqual,
} from '@/lib/auth/password.mjs';
import { clearRateLimit, clientIp, rateLimit } from '@/lib/auth/ratelimit';
import { createSession } from '@/lib/auth/session';
import { usernameKey, usernameProblem } from '@/lib/auth/username.mjs';
import { newId } from '@/lib/ids';
import { logAudit } from '@/lib/entries/service';

export type AuthState = { error?: string };

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const ip = clientIp(await headers());
  const limit = rateLimit(`signup:${ip}`);
  if (!limit.ok) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return { error: `Te veel pogingen. Probeer het over ${minutes} ${minutes === 1 ? 'minuut' : 'minuten'} opnieuw.` };
  }

  const code = String(formData.get('code') ?? '').trim();
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  const password2 = String(formData.get('password2') ?? '');

  const settings = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).get();
  if (!settings) return { error: 'Het archief is nog niet ingericht. Voer `make bootstrap` uit.' };

  if (!constantTimeEqual(code.toUpperCase(), settings.inviteCode.toUpperCase())) {
    return { error: 'Die uitnodigingscode klopt niet.' };
  }

  const nameProblem = usernameProblem(username);
  if (nameProblem) return { error: nameProblem };

  if (password !== password2) return { error: 'De twee wachtwoorden zijn niet hetzelfde.' };
  const pwProblem = passwordProblem(password);
  if (pwProblem) return { error: pwProblem };

  const key = usernameKey(username);
  const taken = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.usernameLower, key))
    .get();
  if (taken) return { error: 'Die naam is al in gebruik.' };

  const count = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.users)
    .get();
  const isFirst = (count?.n ?? 0) === 0;

  const id = newId();
  db.insert(schema.users)
    .values({
      id,
      username: username.trim(),
      usernameLower: key,
      passwordHash: await hashPassword(password),
      passwordEnc: encryptPassword(password),
      isKeeper: isFirst,
    })
    .run();

  logAudit({ actorId: id, action: 'user.signup', targetType: 'user', targetId: id });
  clearRateLimit(`signup:${ip}`);
  await createSession(id);
  redirect('/');
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const ip = clientIp(await headers());
  const limit = rateLimit(`login:${ip}`);
  if (!limit.ok) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return { error: `Te veel pogingen. Probeer het over ${minutes} ${minutes === 1 ? 'minuut' : 'minuten'} opnieuw.` };
  }

  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');

  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.usernameLower, usernameKey(username)))
    .get();

  // Same message either way — no account enumeration.
  const wrong = { error: 'Naam of wachtwoord klopt niet.' };
  if (!user || user.isDisabled) return wrong;
  if (!(await verifyPassword(user.passwordHash, password))) return wrong;

  clearRateLimit(`login:${ip}`);
  await createSession(user.id);
  redirect('/');
}
