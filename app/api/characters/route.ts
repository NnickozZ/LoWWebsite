import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import {
  activeCharacter,
  addCharacter,
  listCharacters,
  removeCharacter,
  setActiveCharacter,
} from '@/lib/characters';

export const dynamic = 'force-dynamic';

/**
 * §18: the characters an account may wear.
 *
 * Everything here is about *your own* account; a Keeper may pass `userId` to
 * tie or untie a character for someone else (the player who forgot, the new
 * arrival), never to wear one. A Keeper wears nothing — they are the Keeper.
 *
 * §18b: the one set of writes deliberately *not* behind `requireAuthor`. This
 * is where a person gets an onderzoeker in the first place; a gate here would
 * lock out exactly the people it is meant to help.
 *
 * §18c: which is not the same as ungated. Koppelen and ontkoppelen are the
 * Keeper's — except for the first onderzoeker of a speler who holds nobody,
 * which is the door §18b needs open. GET and PATCH still serve you your own
 * wardrobe and let you wear what is in it: that is the player's own choice,
 * asked per window. The service is the real gate (`lib/characters.ts`); the two
 * checks below are the early, friendly refusal, so a hand-rolled request gets
 * the same sentence the button would have given it.
 */

function whose(user: { id: string; isKeeper: boolean }, body: { userId?: unknown }): string {
  const asked = typeof body.userId === 'string' && body.userId ? body.userId : user.id;
  if (asked !== user.id && !user.isKeeper) throw new Error('Alleen voor jezelf, of voor een Keeper.');
  return asked;
}

/** §18c: a Keeper hands one out to anyone; a player only to themselves, and only their first. */
function refuseUnlessMayTie(user: { id: string; isKeeper: boolean }, userId: string) {
  if (user.isKeeper) return;
  if (userId !== user.id) throw new Error('Alleen voor jezelf, of voor een Keeper.');
  if (listCharacters(user.id).length > 0) {
    throw new Error('Alleen de Keeper koppelt een karakter aan een account.');
  }
}

function state(userId: string) {
  return { characters: listCharacters(userId), activeId: activeCharacter(userId)?.entryId ?? null };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const asked = new URL(request.url).searchParams.get('userId');
    const userId = whose(user, { userId: asked ?? undefined });
    return json(state(userId));
  } catch (err) {
    return apiError(err);
  }
}

/**
 * Tie a fiche on. The first one tied is worn at once.
 *
 * §18c: the Keeper's act, for anyone — or a speler's own first one.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { entryId?: unknown; userId?: unknown };
    if (typeof body.entryId !== 'string' || !body.entryId) throw new Error('Welk artikel?');
    const userId = whose(user, body);
    refuseUnlessMayTie(user, userId);
    addCharacter(userId, body.entryId, user);
    return json(state(userId));
  } catch (err) {
    return apiError(err);
  }
}

/** Wear this one — or, with `active: null`, nobody: just yourself. */
export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { active?: unknown; userId?: unknown };
    const userId = whose(user, body);
    if (body.active !== null && typeof body.active !== 'string') throw new Error('Welk karakter?');
    setActiveCharacter(userId, body.active, user);
    return json(state(userId));
  } catch (err) {
    return apiError(err);
  }
}

/**
 * Untie a fiche. The fiche itself is untouched; only the knot goes.
 *
 * §18c: Keeper-only. A player who could untie their last one would be back in
 * the state the door above opens for, and the road would never close.
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { entryId?: unknown; userId?: unknown };
    if (typeof body.entryId !== 'string' || !body.entryId) throw new Error('Welk artikel?');
    if (!user.isKeeper) throw new Error('Alleen de Keeper ontkoppelt een karakter van een account.');
    const userId = whose(user, body);
    removeCharacter(userId, body.entryId, user);
    return json(state(userId));
  } catch (err) {
    return apiError(err);
  }
}
