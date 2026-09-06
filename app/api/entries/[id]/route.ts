import { viewerCanEdit } from '@/lib/access';
import { getWords } from '@/lib/admin/words';
import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { displayNameOf } from '@/lib/characters';
import { setEntryOrigin } from '@/lib/entries/origin';
import { setEntryReveals } from '@/lib/entries/secrets';
import { getEntryFieldsForViewer, softDeleteEntry, updateEntry, type EntryPatch } from '@/lib/entries/service';

export const dynamic = 'force-dynamic';

/** §20: the fields around the shared text, for a page catching up live. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const entry = getEntryFieldsForViewer(id, user);
    if (!entry) return json({ error: 'Artikel niet gevonden' }, { status: 404 });
    return json({ ...entry, tags: entry.tags ?? [], fields: entry.fields ?? {} });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    const patch = (await request.json()) as EntryPatch & {
      revealedTo?: string[];
      /** §24: the dossier this artikel came from, chosen by hand. */
      originCaseId?: string | null;
      /** False hands it back to "volgt vanzelf" and reconciles at once. */
      originPinned?: boolean;
    };

    /*
     * §24: where an artikel came from is not one of the fields §6 patches — it
     * is a small act of its own, and §10 says a write asks `lib/access.ts`
     * first. So it is answered here, before `updateEntry`, and 403 rather than
     * quietly becoming a proposal: "dit komt uit dossier X" is not a sentence
     * for a review queue.
     */
    if (patch.originPinned !== undefined || patch.originCaseId !== undefined) {
      if (!viewerCanEdit('entry', id, user)) {
        return json({ error: 'Je mag dit artikel niet bewerken.' }, { status: 403 });
      }
      setEntryOrigin(
        id,
        { caseId: patch.originCaseId ?? null, pinned: patch.originPinned !== false },
        user,
      );
      delete patch.originCaseId;
      delete patch.originPinned;
    }

    // §9: who an entry is revealed to is a Keeper's list, not a field on the
    // entry, so it rides along on the same save but is written separately.
    if (Array.isArray(patch.revealedTo) && user.isKeeper) {
      setEntryReveals(id, patch.revealedTo.map(String), user.id);
    }

    const result = updateEntry(id, patch, user);

    if (result.status === 'pending') return json({ status: 'pending' });

    // §6: "Bram also edited this — refreshed". §18: by the name they wear.
    let previousEditorName: string | null = null;
    if (result.updatedBy && result.updatedBy !== user.id) {
      previousEditorName = displayNameOf(result.updatedBy, getWords().keeper)?.label ?? null;
    }

    return json({
      status: 'saved',
      entry: result.entry,
      previousEditorName,
      previousEditorIsSomeoneElse: Boolean(previousEditorName),
      /*
       * §38: the infobox is the Keeper's list. A key this soort does not have,
       * or a value that is not of the field's kind, is not stored — and a plain
       * save is told so by name rather than left to believe it saved. Still a
       * 200: the rest of the patch did land, and the autosave that sent it must
       * not treat a refused key as a failed save and try again for ever. The
       * §21 live room gets no such list; it drops in silence.
       */
      ...(result.rejectedFields?.length ? { rejectedFields: result.rejectedFields } : {}),
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    softDeleteEntry(id, user);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
