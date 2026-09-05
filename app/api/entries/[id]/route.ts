import { getWords } from '@/lib/admin/words';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { displayNameOf } from '@/lib/characters';
import { setEntryReveals } from '@/lib/entries/secrets';
import { getEntryFieldsForViewer, softDeleteEntry, updateEntry, type EntryPatch } from '@/lib/entries/service';

export const dynamic = 'force-dynamic';

/** §20: the fields around the shared text, for a page catching up live. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const entry = getEntryFieldsForViewer(id, user);
    if (!entry) return json({ error: 'Fiche niet gevonden' }, { status: 404 });
    return json({ ...entry, tags: entry.tags ?? [], fields: entry.fields ?? {} });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const patch = (await request.json()) as EntryPatch & { revealedTo?: string[] };

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
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    softDeleteEntry(id, user.id);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
