'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  decoyPasswordHash,
  hashPassword,
  passwordProblem,
  verifyPassword,
  constantTimeEqual,
} from '@/lib/auth/password.mjs';
import { safeReturnPath } from '@/lib/auth/paths';
import { clearRateLimit, clientIp, isLimited, rateLimit, type RateLimitResult } from '@/lib/auth/ratelimit';
import { createSession, destroyCurrentSession } from '@/lib/auth/session';
import { usernameKey, usernameProblem } from '@/lib/auth/username.mjs';
import { newId } from '@/lib/ids';
import { logAudit } from '@/lib/entries/service';

/**
 * §63: which box the sentence is about, so the form can put it under that box
 * instead of one red line under everything. `null`/absent means "nobody's box
 * in particular" — a rate limit, an archive that was never set up.
 */
export type AuthField = 'code' | 'username' | 'password' | 'password2' | null;

/**
 * §63: `values` and `seq` are written by the *client* half of this action
 * (`AuthForm.tsx`), never here — the archive has no business sending a password
 * back down the wire. They are on the type because they travel in the same bag.
 */
export type AuthState = {
  error?: string;
  field?: AuthField;
  values?: Record<'code' | 'username' | 'password' | 'password2', string>;
  seq?: number;
};

/*
 * §89: the front door's three buckets.
 *
 *   per address   only when `TRUST_PROXY` says the address is real (see
 *                 `clientIp`); otherwise every request would share one key and
 *                 ten wrong guesses by anyone would lock the whole table out.
 *   per name      login only: a guesser who changes address every try still
 *                 runs into the account they are guessing at.
 *   site-wide     a brake, counted on *failures* only, so forty people signing
 *                 in at the start of an evening never trip it.
 *
 * Failures are counted; a success clears the address and the name. The check
 * comes before any database work, so a refused request costs nothing.
 */
const NAME_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };
const LOGIN_BRAKE = { max: 300, windowMs: 15 * 60 * 1000 };
const SIGNUP_BRAKE = { max: 60, windowMs: 60 * 60 * 1000 };

function tooMany(limit: RateLimitResult): AuthState | null {
  if (limit.ok) return null;
  const minutes = Math.ceil(limit.retryAfterSeconds / 60);
  return { error: `Te veel pogingen. Probeer het over ${minutes} ${minutes === 1 ? 'minuut' : 'minuten'} opnieuw.` };
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const ip = clientIp(await headers());
  const ipKey = ip === 'direct' ? null : `signup:${ip}`;
  const refused = tooMany(isLimited('signup:all', SIGNUP_BRAKE)) ?? (ipKey ? tooMany(isLimited(ipKey)) : null);
  if (refused) return refused;
  // Every attempt at the door counts until it succeeds; a wrong code is the
  // attempt worth slowing down.
  const fail = (state: AuthState): AuthState => {
    rateLimit('signup:all', SIGNUP_BRAKE);
    if (ipKey) rateLimit(ipKey);
    return state;
  };

  const code = String(formData.get('code') ?? '').trim();
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  const password2 = String(formData.get('password2') ?? '');

  const settings = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).get();
  if (!settings) return { error: 'Het archief is nog niet ingericht. Voer `make bootstrap` uit.' };

  /*
   * §89: the first account is no longer whoever gets here first. It used to be
   * made a Keeper by signing up into an empty archive — which on a fresh
   * deploy is a race anybody with the address can win. `make bootstrap` makes
   * the first Keeper from the server's own terminal, and until it has, the
   * front door is shut.
   */
  const accounts = db.select({ n: sql<number>`count(*)` }).from(schema.users).get();
  if ((accounts?.n ?? 0) === 0) {
    return { error: 'Het archief is nog niet ingericht. Voer `make bootstrap` uit.' };
  }

  if (!constantTimeEqual(code.toUpperCase(), settings.inviteCode.toUpperCase())) {
    return fail({ error: 'Die uitnodigingscode klopt niet.', field: 'code' });
  }

  const nameProblem = usernameProblem(username);
  if (nameProblem) return { error: nameProblem, field: 'username' };

  const pwProblem = passwordProblem(password);
  if (pwProblem) return { error: pwProblem, field: 'password' };
  if (password !== password2) {
    return { error: 'De twee wachtwoorden zijn niet hetzelfde.', field: 'password2' };
  }

  const key = usernameKey(username);
  const taken = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.usernameLower, key))
    .get();
  if (taken) return { error: 'Die naam is al in gebruik.', field: 'username' };

  const id = newId();
  db.insert(schema.users)
    .values({
      id,
      username: username.trim(),
      usernameLower: key,
      passwordHash: await hashPassword(password),
      // §89: a new account is a speler. Only a Keeper (Beheer) or
      // `make bootstrap` makes a Keeper.
      isKeeper: false,
    })
    .run();

  logAudit({ actorId: id, action: 'user.signup', targetType: 'user', targetId: id });
  if (ipKey) clearRateLimit(ipKey);
  await destroyCurrentSession();
  await createSession(id);
  redirect('/');
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const ip = clientIp(await headers());
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  const nameKey = `login:name:${usernameKey(username)}`;
  const ipKey = ip === 'direct' ? null : `login:ip:${ip}`;

  const refused =
    tooMany(isLimited('login:all', LOGIN_BRAKE)) ??
    tooMany(isLimited(nameKey, NAME_LIMIT)) ??
    (ipKey ? tooMany(isLimited(ipKey)) : null);
  if (refused) return refused;

  const user = db
    .select({
      id: schema.users.id,
      passwordHash: schema.users.passwordHash,
      isDisabled: schema.users.isDisabled,
    })
    .from(schema.users)
    .where(eq(schema.users.usernameLower, usernameKey(username)))
    .get();

  /*
   * Same message either way, and on *neither* box — naming one would be the
   * account enumeration the single sentence exists to avoid.
   *
   * §89: and the same *time* either way. An unknown name used to answer before
   * argon2 ran, a known one after — tens of milliseconds apart, which is a
   * name list for anybody with a stopwatch. An unknown or switched-off name is
   * now verified against a decoy hash, so both roads cost the same.
   */
  const ok = user && !user.isDisabled
    ? await verifyPassword(user.passwordHash, password)
    : (await verifyPassword(await decoyPasswordHash(), password), false);

  if (!ok || !user) {
    rateLimit('login:all', LOGIN_BRAKE);
    rateLimit(nameKey, NAME_LIMIT);
    if (ipKey) rateLimit(ipKey);
    return { error: 'Naam of wachtwoord klopt niet.' };
  }

  clearRateLimit(nameKey);
  if (ipKey) clearRateLimit(ipKey);
  // A browser that signs in while it still holds a session leaves no row behind.
  await destroyCurrentSession();
  await createSession(user.id);
  /*
   * §90: back to where they were going. The middleware carried the address in
   * `next` (a hidden box in the form); `safeReturnPath` is §89's one answer to
   * "may we send the browser there?", so `//elders`, `/\\elders` and
   * `https://elders` all come out as `/`.
   */
  redirect(safeReturnPath(String(formData.get('next') ?? '')));
}
