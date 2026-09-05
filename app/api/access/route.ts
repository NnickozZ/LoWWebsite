import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import {
  accessSettings,
  canManageAccess,
  isAccessMode,
  listGrantableUsers,
  loadAccessRow,
  updateAccess,
  type AccessPatch,
} from '@/lib/access';
import type { AccessTargetType } from '@/lib/db/schema';
import { activeCharacterNames } from '@/lib/characters';

export const dynamic = 'force-dynamic';

const TARGETS: AccessTargetType[] = ['entry', 'case', 'board'];

function parseTarget(url: URL): { target: AccessTargetType; id: string } {
  const target = url.searchParams.get('target') ?? '';
  const id = url.searchParams.get('id') ?? '';
  if (!(TARGETS as string[]).includes(target) || !id) throw new Error('Onbekend doel.');
  return { target: target as AccessTargetType, id };
}

/**
 * §17: the settings panel's read. Only whoever may turn the dials gets the
 * lists — the names of who may see a private thing are themselves a fact
 * about it that a stranger has no business reading.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { target, id } = parseTarget(new URL(request.url));
    const row = loadAccessRow(target, id);
    if (!row) return json({ error: 'Niet gevonden.' }, { status: 404 });
    if (!canManageAccess(row, user) && !(row.accessLocked && row.createdBy === user.id)) {
      return json({ error: 'Alleen voor de eigenaar of een Keeper.' }, { status: 403 });
    }
    const users = listGrantableUsers();
    const characters = activeCharacterNames(users.map((u) => u.id));
    return json({
      settings: accessSettings(row, target, id),
      users: users.map((u) => ({ ...u, character: characters.get(u.id) ?? null })),
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const { target, id } = parseTarget(new URL(request.url));
    const body = (await request.json()) as AccessPatch;
    const patch: AccessPatch = {};
    if (isAccessMode(body.viewMode)) patch.viewMode = body.viewMode;
    if (isAccessMode(body.editMode)) patch.editMode = body.editMode;
    if (Array.isArray(body.viewers)) patch.viewers = body.viewers.map(String).slice(0, 200);
    if (Array.isArray(body.editors)) patch.editors = body.editors.map(String).slice(0, 200);
    if (typeof body.locked === 'boolean') patch.locked = body.locked;
    return json({ settings: updateAccess(target, id, patch, user) });
  } catch (err) {
    return apiError(err);
  }
}
