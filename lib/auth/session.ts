import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq, gt } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { newId, randomToken } from '@/lib/ids';

export const COOKIE_NAME = 'zcf_session';
/** §4: 90-day rolling expiry. */
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
/** Refresh the row and cookie at most once a day, not on every request. */
const ROLL_AFTER_SECONDS = 24 * 60 * 60;

export type SessionUser = {
  id: string;
  username: string;
  isKeeper: boolean;
  lastSeenAt: number | null;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function secureCookies() {
  // §13a: plain http on a LAN address must work for phone testing.
  return (process.env.PUBLIC_URL ?? '').startsWith('https://');
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  await db.insert(schema.sessions).values({
    id: newId(),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(),
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
  }
  jar.delete(COOKIE_NAME);
}

/** "Log out everywhere" in account settings. */
export async function destroyAllSessions(userId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

/**
 * Resolves the signed-in user, or null. Also does the rolling-expiry refresh
 * and the last_seen_at bookkeeping the home feed depends on.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const row = await db
    .select({
      sessionId: schema.sessions.id,
      expiresAt: schema.sessions.expiresAt,
      id: schema.users.id,
      username: schema.users.username,
      isKeeper: schema.users.isKeeper,
      isDisabled: schema.users.isDisabled,
      lastSeenAt: schema.users.lastSeenAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(
      and(
        eq(schema.sessions.tokenHash, hashToken(token)),
        gt(schema.sessions.expiresAt, nowSeconds),
      ),
    )
    .get();

  if (!row || row.isDisabled) return null;

  const previousLastSeen = row.lastSeenAt;

  if (row.expiresAt - nowSeconds < MAX_AGE_SECONDS - ROLL_AFTER_SECONDS) {
    await db
      .update(schema.sessions)
      .set({ expiresAt: nowSeconds + MAX_AGE_SECONDS })
      .where(eq(schema.sessions.id, row.sessionId));
  }

  if (!previousLastSeen || nowSeconds - previousLastSeen > 60) {
    await db
      .update(schema.users)
      .set({ lastSeenAt: nowSeconds })
      .where(eq(schema.users.id, row.id));
  }

  return {
    id: row.id,
    username: row.username,
    isKeeper: row.isKeeper,
    // The value from *before* this visit — that is what "since you were last here" means.
    lastSeenAt: previousLastSeen,
  };
}

/** For route handlers and pages that must have a user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireKeeper(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isKeeper) throw new ForbiddenError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Niet ingelogd');
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('Alleen voor Keepers');
  }
}
