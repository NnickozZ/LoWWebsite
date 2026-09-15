import { canManageAccess, grantFor, loadAccessRow } from '@/lib/access';
import { apiError, json } from '@/lib/api';
import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { deletedAtOfCase } from '@/lib/cases/service';
import { canSeeCase } from '@/lib/cases/visibility';
import { buildFamilyGraph } from '@/lib/families/graph';
import { publishChange } from '@/lib/families/live';
import {
  FAMILY_TREE_NOT_YOURS,
  getFamilyTreeById,
  saveFamilyTreeState,
  setFamilyTreeCase,
  setFamilyTreeInWeb,
  softDeleteFamilyTree,
  updateFamilyTree,
  viewerCanEditFamilyTree,
} from '@/lib/families/service';
import type { FamilyTreePatch } from '@/lib/families/types';
import { OTHER_SIDE, sameSide } from '@/lib/keeper/side';

export const dynamic = 'force-dynamic';

const NOT_FOUND = 'Stamboom niet gevonden.';

/**
 * §66, live: the pull half. A client told "this stamboom moved" asks for the
 * tree *as it may see it* — nothing about its contents travels on the wire,
 * because a member the reader may not see is absent from their drawing and
 * present in somebody else's (rule 1).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const tree = getFamilyTreeById(id, user);
    if (!tree) return json({ error: NOT_FOUND }, { status: 404 });
    return json({
      tree,
      graph: buildFamilyGraph(tree, user),
      canEdit: viewerCanEditFamilyTree(id, user),
    });
  } catch (err) {
    return apiError(err);
  }
}

/** Autosave: merge and hand the merged document back, with the drawing beside it. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    const before = getFamilyTreeById(id, user);
    if (!before) return json({ error: NOT_FOUND }, { status: 404 });
    // §17: a stamboom without edit rights is a tree to look at. No voorstel
    // queue here — there is nothing sensible to propose about somebody's x and y.
    if (!viewerCanEditFamilyTree(id, user)) return json({ error: FAMILY_TREE_NOT_YOURS }, { status: 403 });

    const patch = (await request.json()) as FamilyTreePatch;
    /*
     * §50: somebody standing in this tree may not have been fetched across the
     * border. Only members whose id is *new* to this tree are asked — an
     * autosave sends everything the browser knows, so checking them all would
     * refuse every save of a tree that has held a crossing member since before
     * this round. The refusal names them, so the canvas can take those cards
     * out and save everything else instead of being refused for ever (§61).
     */
    if (patch.members?.length) {
      const known = new Set(before.state.members.map((member) => member.id));
      const refused = patch.members
        .filter((member) => member?.id && !known.has(member.id) && !sameSide('family_tree', id, 'entry', member.id))
        .map((member) => member.id);
      if (refused.length) {
        return json({ error: OTHER_SIDE, code: 'OTHER_SIDE', memberIds: refused }, { status: 400 });
      }
    }

    const { state } = saveFamilyTreeState(id, patch, user);
    // Everyone else is told after the merge is written, never before: a client
    // that pulls on this signal must find the new document.
    publishChange(id, typeof patch.clientId === 'string' ? patch.clientId : null);

    const after = getFamilyTreeById(id, user)!;
    return json({ state, graph: buildFamilyGraph(after, user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    requireAuthor(user);
    const { id } = await ctx.params;
    if (!getFamilyTreeById(id, user)) return json({ error: NOT_FOUND }, { status: 404 });
    if (!viewerCanEditFamilyTree(id, user)) return json({ error: FAMILY_TREE_NOT_YOURS }, { status: 403 });

    const body = (await request.json()) as {
      name?: string;
      description?: string;
      inWeb?: boolean;
      caseId?: string | null;
      clientId?: string;
    };
    const by = typeof body.clientId === 'string' ? body.clientId : null;

    if (typeof body.name === 'string' || typeof body.description === 'string') {
      updateFamilyTree(id, { name: body.name, description: body.description }, user);
      publishChange(id, by);
    }
    if (typeof body.inWeb === 'boolean') {
      // §43: whoever manages the tree's rights decides whether it counts in the
      // web; an editor does not.
      const row = loadAccessRow('family_tree', id);
      if (!row || !canManageAccess(row, user)) {
        return json({ error: 'Alleen wie de rechten van deze stamboom beheert kan dit veranderen.' }, { status: 403 });
      }
      setFamilyTreeInWeb(id, body.inWeb);
      publishChange(id, by);
    }
    if (body.caseId !== undefined) {
      /*
       * §47/§48: two rights, not one. Whoever may *edit* the tree may move it —
       * that is the same hand that draws in it. But filing it puts it behind
       * the dossier's view dial as well (§17), so the dossier has to be one
       * this viewer may open. §46: this is a *lookup*, not a list — the dossier
       * is named by id and a Keeper files from either side — so it asks
       * `loadAccessRow`/`canSeeCase` and no side condition.
       */
      const wanted = typeof body.caseId === 'string' && body.caseId ? body.caseId : null;
      if (wanted) {
        const target = loadAccessRow('case', wanted);
        const deletedAt = deletedAtOfCase(wanted);
        if (
          !target ||
          deletedAt === undefined ||
          !canSeeCase({ ...target, deletedAt }, user, grantFor('case', wanted, user.id))
        ) {
          return json({ error: 'Dat dossier bestaat niet, of je mag het niet openen.' }, { status: 403 });
        }
      }
      setFamilyTreeCase(id, wanted, user);
      publishChange(id, by);
    }
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    requireAuthor(user);
    const { id } = await ctx.params;
    if (!getFamilyTreeById(id, user)) return json({ error: NOT_FOUND }, { status: 404 });
    if (!viewerCanEditFamilyTree(id, user)) return json({ error: FAMILY_TREE_NOT_YOURS }, { status: 403 });
    softDeleteFamilyTree(id, user);
    /*
     * §60/§66: tell everyone else. §21 already puts `family_tree:{id}` and
     * `family_trees` on the wire (the soft delete is an UPDATE through the
     * ORM), but a canvas that is open pulls on *this* sentence — the one its
     * saves use — so a hand that is drawing hears it at once and stops
     * autosaving into a tree that is in the bin.
     */
    publishChange(id, null);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
