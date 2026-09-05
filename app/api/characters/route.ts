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
 */

function whose(user: { id: string; isKeeper: boolean }, body: { userId?: unknown }): string {
  const asked = typeof body.userId === 'string' && body.userId ? body.userId : user.id;
  if (asked !== user.id && !user.isKeeper) throw new Error('Alleen voor jezelf, of voor een Keeper.');
  return asked;
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

/** Tie a fiche on. The first one tied is worn at once. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { entryId?: unknown; userId?: unknown };
    if (typeof body.entryId !== 'string' || !body.entryId) throw new Error('Welke fiche?');
    const userId = whose(user, body);
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

/** Untie a fiche. The fiche itself is untouched; only the knot goes. */
export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { entryId?: unknown; userId?: unknown };
    if (typeof body.entryId !== 'string' || !body.entryId) throw new Error('Welke fiche?');
    const userId = whose(user, body);
    removeCharacter(userId, body.entryId, user);
    return json(state(userId));
  } catch (err) {
    return apiError(err);
  }
}
