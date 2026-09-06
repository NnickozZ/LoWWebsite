import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq, gt } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { cleanArticleModePref, type ArticleModePref } from '@/lib/entries/mode';
import { cleanReadingFont, type ReadingFont } from '@/lib/readingFont';
import { newId, randomToken } from '@/lib/ids';
import { readCharacterHeader, resolveCharacter } from '@/lib/auth/author';

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
  /** §22: which face an artikel opens in for this person; '' follows their role. */
  articleMode: ArticleModePref;
  /** §29: the face they read in; '' is the archive's own. */
  readingFont: ReadingFont;
  /**
   * §18b: the onderzoeker this *window* is writing as — the validated
   * `X-Character` header, or the account's own `active_character_id` when the
   * window has not said. Always `null` for a Keeper: a Keeper is always the
   * Keeper. Everything a person writes is recorded under this, and a player
   * with `null` here may not write at all (`requireAuthor`).
   */
  characterId: string | null;
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
      articleMode: schema.users.articleMode,
      readingFont: schema.users.readingFont,
      activeCharacterId: schema.users.activeCharacterId,
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

  /*
   * §18b: who this *window* is writing as. The header is the window's answer to
   * "Met wie ben je nu aan het schrijven?", checked against the fiches this
   * account holds; a header naming anyone else falls through to the account's
   * own choice, which is what every window used before there was a question.
   * A Keeper is asked nothing and gets nothing.
   */
  let characterId: string | null = null;
  if (!row.isKeeper) {
    const asked = await readCharacterHeader();
    characterId = (asked ? resolveCharacter(row.id, asked) : null) ?? row.activeCharacterId ?? null;
  }

  return {
    id: row.id,
    username: row.username,
    isKeeper: row.isKeeper,
    characterId,
    // The value from *before* this visit — that is what "since you were last here" means.
    lastSeenAt: previousLastSeen,
    // A row written before migration 0008 has no value; read it defensively.
    articleMode: cleanArticleModePref(row.articleMode),
    // Same defensiveness: a row written before this column existed has null.
    readingFont: cleanReadingFont(row.readingFont),
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
