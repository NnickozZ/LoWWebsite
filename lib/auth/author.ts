import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { listCharacters } from '@/lib/characters';

/**
 * §18b: who is writing, in this window.
 *
 * A person may hold several onderzoekers. Which one they are writing as is a
 * property of the *browser window*, not of the account: two windows of one
 * account are two investigators at the same table, and the archive has to be
 * able to tell them apart. So the choice travels on every request as the
 * `X-Character` header, and the window remembers it (sessionStorage) rather
 * than the database.
 *
 * The header is never believed. Anything that arrives here is resolved against
 * the fiches that account actually holds — the same tie `setActiveCharacter`
 * insists on — and an id the person does not hold resolves to `null`, not to
 * an error: a forged header simply writes as nobody in particular, and falls
 * back to the account's own `active_character_id`.
 *
 * A Keeper never has one. `refuseKeeper` in `lib/characters.ts` already makes
 * that true of the wardrobe; this makes it true of the wire as well, so no
 * header can put a Keeper's act under an onderzoeker's name.
 */

/** The header a browser window puts its chosen onderzoeker in. */
export const CHARACTER_HEADER = 'x-character';

/**
 * Whoever is doing something, and the onderzoeker they are doing it as. The
 * shape every service's `actor` / `user` parameter now takes; `characterId` is
 * optional so a Keeper-only path, a test or a migration script may leave it
 * out and get the honest `null`.
 */
export type Author = { id: string; isKeeper: boolean; characterId?: string | null };

/** The recorded karakter of an actor-shaped value — `null` when there is none. */
export function characterOf(actor: { characterId?: string | null } | null | undefined): string | null {
  return actor?.characterId ?? null;
}

/** What this request says. Not to be trusted until `resolveCharacter` has seen it. */
export async function readCharacterHeader(): Promise<string | null> {
  const jar = await headers();
  const raw = (jar.get(CHARACTER_HEADER) ?? '').trim();
  // Ids are the archive's own (`lib/ids.ts`); anything else is not worth a query.
  if (!raw || raw.length > 64 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  return raw;
}

/**
 * The one check that matters: is this fiche tied to this account? Mirrors
 * `setActiveCharacter` — the tie, not the visibility, because a person may be
 * given a fiche they cannot yet read and should still be able to write as it.
 * A Keeper always resolves to `null`: a Keeper is always the Keeper.
 */
export function resolveCharacter(userId: string, characterId: string | null | undefined): string | null {
  if (!characterId) return null;
  const account = db
    .select({ isKeeper: schema.users.isKeeper })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!account || account.isKeeper) return null;
  const tied = db
    .select({ entryId: schema.userCharacters.entryId })
    .from(schema.userCharacters)
    .where(
      and(eq(schema.userCharacters.userId, userId), eq(schema.userCharacters.entryId, characterId)),
    )
    .get();
  return tied ? characterId : null;
}

/**
 * A player who has not said who they are writing as does not write. Thrown at
 * the top of every mutating route handler, and answered as a plain 400 with
 * `needsAuthor` set, which is the browser's cue to ask the question (§18b).
 *
 * Deliberately *not* part of `lib/access.ts`: rights there are per account, and
 * a Keeper — who never has a karakter — must pass this every time.
 */
export class NoAuthorError extends Error {
  constructor() {
    super('Kies eerst met wie je schrijft.');
  }
}

export function requireAuthor(user: { isKeeper: boolean; characterId?: string | null }): void {
  if (!user.isKeeper && !user.characterId) throw new NoAuthorError();
}

/**
 * The one door in that wall, and the reason there has to be one.
 *
 * An onderzoeker *is* an artikel that somebody has tied to their account. So
 * the rule above, applied to `POST /api/entries` as well, closes a circle
 * round every new speler: they may not write until they have an onderzoeker,
 * and they cannot have one until somebody writes the artikel that becomes it.
 * Until now the Keeper wrote it for them, which made the first evening of a
 * campaign wait on one person's keyboard.
 *
 * So: **a speler who holds no onderzoeker at all may make an artikel, and
 * nothing else.** Making one (here) and tying one on (`/api/characters`, which
 * was never gated) are the whole of the exception; editing an existing artikel,
 * a dossier, a prikbord, a landkaart, a tijdlijn and a streek all stay behind
 * `requireAuthor` exactly as they were. And the exception closes behind them:
 * with one onderzoeker on the peg the ordinary rule applies to the *next*
 * artikel too, which costs them nothing, because by then there is a name to
 * write under and the window is asked for it at the first keystroke.
 *
 * An artikel made this way records `character_id` NULL — the same thing every
 * row from before the archive asked records, and the right thing: it was
 * written before there was a name to put on it.
 *
 * `listCharacters` rather than a bare count of the ties, because it is the
 * list the browser itself is shown. A fiche in the prullenbak leaves its knot
 * behind, and a knot to a fiche nobody can see must not be the thing that goes
 * on locking somebody out of the only road they have. (`resolveCharacter`
 * above still counts that knot, deliberately: writing *as* a fiche you may not
 * read is a different question from having one at all.)
 *
 * The import that makes this possible only goes one way: `lib/characters.ts`
 * knows nothing of sessions or of this file, so nothing here closes a loop.
 */
export function requireAuthorOrFirstCharacter(user: {
  id: string;
  isKeeper: boolean;
  characterId?: string | null;
}): void {
  if (user.isKeeper || user.characterId) return;
  if (listCharacters(user.id).length === 0) return;
  throw new NoAuthorError();
}

/** True when this person may write at all — the read-only banner's question. */
export function hasAuthor(user: { isKeeper: boolean; characterId?: string | null } | null): boolean {
  return Boolean(user && (user.isKeeper || user.characterId));
}
