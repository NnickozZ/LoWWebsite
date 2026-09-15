import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import {
  canEditSections,
  deleteSection,
  sectionOwner,
  setSectionReveals,
  updateSection,
  type SectionActor,
} from '@/lib/sections/service';
import type { Visibility } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const VISIBILITIES: Visibility[] = ['all', 'keeper', 'players'];

/**
 * §70: a sectie belongs to a *thing*, and anyone who may edit the thing may
 * write on it. So this route no longer asks `requireKeeper()` — it asks the
 * sectie where it hangs (`sectionOwner`) and then asks that thing's own §17
 * dials (`canEditSections`).
 *
 * The geheimhouding dial and the reveals stayed the Keeper's. The service
 * throws for anybody else, which would arrive as a 400 with a sentence in it;
 * the check below is the honest 403, and it also covers `revealedTo`, which
 * goes round `updateSection` entirely.
 */
type Gate =
  | { ok: true; actor: SectionActor }
  | { ok: false; response: ReturnType<typeof json> };

async function gate(id: string): Promise<Gate> {
  const user = await requireUser();
  // §18b: a player who has not said who they are writing as does not write.
  requireAuthor(user);

  const owner = sectionOwner(id);
  if (!owner) {
    return { ok: false, response: json({ error: 'Sectie niet gevonden.' }, { status: 404 }) };
  }
  if (!canEditSections(owner.ownerKind, owner.ownerId, user)) {
    return {
      ok: false,
      response: json({ error: 'Je mag hier geen secties bewerken.' }, { status: 403 }),
    };
  }
  return {
    ok: true,
    actor: { id: user.id, isKeeper: user.isKeeper, characterId: user.characterId },
  };
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const checked = await gate(id);
    if (!checked.ok) return checked.response;
    const actor = checked.actor;

    const body = (await request.json()) as {
      title?: string;
      body?: unknown;
      visibility?: string;
      sortOrder?: number;
      revealedTo?: string[];
    };

    const visibility = VISIBILITIES.includes(body.visibility as Visibility)
      ? (body.visibility as Visibility)
      : undefined;
    const reveals = Array.isArray(body.revealedTo) ? body.revealedTo.map(String) : undefined;

    // §70: writing is the thing's right, but who at the table may *read* this
    // is prep, and prep is the Keeper's.
    if ((visibility !== undefined || reveals !== undefined) && !actor.isKeeper) {
      return json(
        { error: 'Alleen de Keeper bepaalt wie een sectie mag lezen.' },
        { status: 403 },
      );
    }

    updateSection(
      id,
      {
        title: body.title,
        body: body.body,
        sortOrder: body.sortOrder,
        visibility,
      },
      actor,
    );

    if (reveals) setSectionReveals(id, reveals, actor.id);

    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const checked = await gate(id);
    if (!checked.ok) return checked.response;
    deleteSection(id, checked.actor);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
