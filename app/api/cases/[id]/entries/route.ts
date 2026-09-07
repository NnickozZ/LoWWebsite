import { viewerCanEdit } from '@/lib/access';
import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import {
  addEntryToCase,
  getCaseById,
  getCaseBySlug,
  removeEntryFromCase,
  setCaseEntryNote,
} from '@/lib/cases/service';

export const dynamic = 'force-dynamic';

function assertVisible(id: string, viewer: { id: string; isKeeper: boolean }) {
  const summary = getCaseById(id);
  if (!summary || !getCaseBySlug(summary.slug, viewer)) throw new Error('Dossier niet gevonden');
  return summary;
}

/** §17: seeing a case and changing it are two different rights. */
function assertEditable(id: string, viewer: { id: string; isKeeper: boolean }) {
  assertVisible(id, viewer);
  if (!viewerCanEdit('case', id, viewer)) throw new Error('Je mag dit dossier niet bewerken.');
}

/** Add an entry to the case, or change its case note. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    assertEditable(id, user);

    const body = (await request.json()) as {
      entryId?: string;
      note?: string;
      noteOnly?: boolean;
      /** Pre-round 19: a dossier's own crop. Refused — the artikel's crops are the only ones. */
      cropOnly?: boolean;
    };
    if (!body.entryId) return json({ error: 'Geen artikel opgegeven.' }, { status: 400 });
    if (body.cropOnly) {
      return json({ error: 'Een dossier heeft geen eigen uitsnede meer; snij het artikel bij.' }, { status: 400 });
    }

    if (body.noteOnly) setCaseEntryNote(id, body.entryId, body.note ?? '', user);
    else addEntryToCase(id, body.entryId, user, body.note ?? '');

    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    assertEditable(id, user);

    const entryId = new URL(request.url).searchParams.get('entryId');
    if (!entryId) return json({ error: 'Geen artikel opgegeven.' }, { status: 400 });

    removeEntryFromCase(id, entryId, user);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
