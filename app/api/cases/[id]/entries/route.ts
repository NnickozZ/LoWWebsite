import { viewerCanEdit } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import {
  addEntryToCase,
  cleanCrop,
  getCaseById,
  getCaseBySlug,
  removeEntryFromCase,
  setCaseEntryCrop,
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

/** Add an entry to the case, or change its case note or its crop of the cover. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    assertEditable(id, user);

    const body = (await request.json()) as {
      entryId?: string;
      note?: string;
      noteOnly?: boolean;
      /** Set with cropOnly to change how this case squares off the cover. */
      crop?: unknown;
      cropOnly?: boolean;
    };
    if (!body.entryId) return json({ error: 'Geen fiche opgegeven.' }, { status: 400 });

    if (body.cropOnly) setCaseEntryCrop(id, body.entryId, cleanCrop(body.crop));
    else if (body.noteOnly) setCaseEntryNote(id, body.entryId, body.note ?? '', user.id);
    else addEntryToCase(id, body.entryId, user.id, body.note ?? '');

    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    assertEditable(id, user);

    const entryId = new URL(request.url).searchParams.get('entryId');
    if (!entryId) return json({ error: 'Geen fiche opgegeven.' }, { status: 400 });

    removeEntryFromCase(id, entryId, user.id);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
