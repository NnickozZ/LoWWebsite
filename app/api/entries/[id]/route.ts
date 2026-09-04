import { eq } from 'drizzle-orm';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { db, schema } from '@/lib/db';
import { setEntryReveals } from '@/lib/entries/secrets';
import { softDeleteEntry, updateEntry, type EntryPatch } from '@/lib/entries/service';

export const dynamic = 'force-dynamic';

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

    // §6: "Bram also edited this — refreshed".
    let previousEditorName: string | null = null;
    if (result.updatedBy && result.updatedBy !== user.id) {
      previousEditorName =
        db
          .select({ username: schema.users.username })
          .from(schema.users)
          .where(eq(schema.users.id, result.updatedBy))
          .get()?.username ?? null;
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
