'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { encryptPassword, hashPassword, passwordProblem } from '@/lib/auth/password.mjs';
import { requireKeeper } from '@/lib/auth/session';
import { logAudit } from '@/lib/entries/service';
import { approvePendingEdit, rejectPendingEdit } from '@/lib/entries/review';
import {
  restoreBoardRevision,
  restoreCaseRevision,
  restoreFromTrash,
} from '@/lib/admin/trash';
import { createType, deleteType, updateType } from '@/lib/admin/types';
import { saveWords } from '@/lib/admin/words';
import { makeInviteCode } from '@/lib/db/seed.mjs';

export type AdminState = { error?: string; ok?: string };

export async function setPasswordAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const keeper = await requireKeeper();
  const userId = String(formData.get('userId') ?? '');
  const password = String(formData.get('password') ?? '');

  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  db.update(schema.users)
    .set({ passwordHash: await hashPassword(password), passwordEnc: encryptPassword(password) })
    .where(eq(schema.users.id, userId))
    .run();

  logAudit({
    actorId: keeper.id,
    action: 'password.set_by_keeper',
    targetType: 'user',
    targetId: userId,
  });
  revalidatePath('/admin');
  return { ok: 'Nieuw wachtwoord ingesteld.' };
}

export async function toggleKeeperAction(formData: FormData) {
  const keeper = await requireKeeper();
  const userId = String(formData.get('userId') ?? '');
  const row = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!row) return;

  // Never leave the archive without a Keeper.
  if (row.isKeeper) {
    const keepers = db.select().from(schema.users).where(eq(schema.users.isKeeper, true)).all();
    if (keepers.length <= 1) return;
  }

  db.update(schema.users).set({ isKeeper: !row.isKeeper }).where(eq(schema.users.id, userId)).run();
  logAudit({
    actorId: keeper.id,
    action: row.isKeeper ? 'user.demoted' : 'user.promoted',
    targetType: 'user',
    targetId: userId,
  });
  revalidatePath('/admin');
}

export async function toggleDisabledAction(formData: FormData) {
  const keeper = await requireKeeper();
  const userId = String(formData.get('userId') ?? '');
  const row = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!row || row.id === keeper.id) return;

  db.update(schema.users)
    .set({ isDisabled: !row.isDisabled })
    .where(eq(schema.users.id, userId))
    .run();
  if (!row.isDisabled) db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();

  logAudit({
    actorId: keeper.id,
    action: row.isDisabled ? 'user.enabled' : 'user.disabled',
    targetType: 'user',
    targetId: userId,
  });
  revalidatePath('/admin');
}

export async function regenerateInviteAction() {
  const keeper = await requireKeeper();
  const code = makeInviteCode();
  db.update(schema.siteSettings).set({ inviteCode: code }).where(eq(schema.siteSettings.id, 1)).run();
  logAudit({ actorId: keeper.id, action: 'invite.regenerated' });
  revalidatePath('/admin');
}

/* ------------------------------------------------------- review queue (§10) */

export async function approveEditAction(formData: FormData) {
  const keeper = await requireKeeper();
  approvePendingEdit(
    String(formData.get('pendingId') ?? ''),
    keeper,
    String(formData.get('note') ?? ''),
  );
  revalidatePath('/admin');
}

export async function rejectEditAction(formData: FormData) {
  const keeper = await requireKeeper();
  rejectPendingEdit(
    String(formData.get('pendingId') ?? ''),
    keeper,
    String(formData.get('note') ?? ''),
  );
  revalidatePath('/admin');
}

/* ------------------------------------------------------------- trash (§11) */

export async function restoreAction(formData: FormData) {
  const keeper = await requireKeeper();
  const kind = String(formData.get('kind') ?? '');
  const id = String(formData.get('id') ?? '');
  if (kind !== 'entry' && kind !== 'case' && kind !== 'board') return;
  restoreFromTrash(kind, id, keeper.id);
  revalidatePath('/admin');
  revalidatePath('/');
}

export async function restoreCaseRevisionAction(formData: FormData) {
  const keeper = await requireKeeper();
  restoreCaseRevision(String(formData.get('revisionId') ?? ''), keeper.id);
  revalidatePath('/admin');
}

export async function restoreBoardRevisionAction(formData: FormData) {
  const keeper = await requireKeeper();
  restoreBoardRevision(String(formData.get('revisionId') ?? ''), keeper.id);
  revalidatePath('/admin');
}

/* ---------------------------------------------------- site settings (§11) */

export async function saveSiteAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const keeper = await requireKeeper();
  const name = String(formData.get('name') ?? '').trim();
  const tagline = String(formData.get('tagline') ?? '').trim();
  const accent = String(formData.get('accent') ?? '').trim();

  if (!name) return { error: 'Het archief heeft een naam nodig.' };
  if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) {
    return { error: 'Een kleur ziet eruit als #A8321E.' };
  }

  db.update(schema.siteSettings)
    .set({
      name: name.slice(0, 80),
      tagline: tagline.slice(0, 120),
      theme: accent ? { accent } : {},
    })
    .where(eq(schema.siteSettings.id, 1))
    .run();

  logAudit({ actorId: keeper.id, action: 'site.settings_changed' });
  revalidatePath('/', 'layout');
  return { ok: 'Opgeslagen.' };
}

export async function setLogoAction(formData: FormData) {
  const keeper = await requireKeeper();
  const assetId = String(formData.get('assetId') ?? '') || null;
  db.update(schema.siteSettings)
    .set({ logoAssetId: assetId })
    .where(eq(schema.siteSettings.id, 1))
    .run();
  logAudit({ actorId: keeper.id, action: 'site.logo_changed' });
  revalidatePath('/', 'layout');
}

/* ------------------------------------------------- entry types (§11) */

/** The three JSON fields the type editor posts, each as its own hidden input. */
function readJson(formData: FormData, name: string): unknown {
  const raw = String(formData.get(name) ?? '');
  if (!raw) return undefined;
  return JSON.parse(raw) as unknown;
}

export async function saveTypeAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const keeper = await requireKeeper();
  const typeId = String(formData.get('typeId') ?? '');

  let fields: unknown;
  let blocks: unknown;
  let pageText: unknown;
  try {
    fields = readJson(formData, 'fields');
    blocks = readJson(formData, 'blocks');
    pageText = readJson(formData, 'pageText');
  } catch {
    return { error: 'De opmaak van deze soort kon niet worden gelezen.' };
  }

  try {
    updateType(
      typeId,
      {
        label: String(formData.get('label') ?? ''),
        icon: String(formData.get('icon') ?? ''),
        colour: String(formData.get('colour') ?? ''),
        border: String(formData.get('border') ?? ''),
        fields,
        blocks,
        pageText,
      },
      keeper.id,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Opslaan is niet gelukt.' };
  }
  revalidatePath('/admin');
  revalidatePath('/', 'layout');
  return { ok: 'Opgeslagen.' };
}

/* ------------------------------------------------------------ words (§11) */

/**
 * Beheer → Woorden. The form posts every box; `saveWords` drops the ones that
 * still say what they said by default, so clearing a box is how you undo.
 */
export async function saveWordsAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const keeper = await requireKeeper();
  const overrides: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith('word:') || typeof value !== 'string') continue;
    overrides[name.slice(5)] = value;
  }

  const changed = saveWords(overrides, keeper.id);
  revalidatePath('/', 'layout');
  return {
    ok: changed
      ? `Opgeslagen. ${changed} ${changed === 1 ? 'woord wijkt' : 'woorden wijken'} af van de standaard.`
      : 'Opgeslagen. Alles staat weer op de standaardwoorden.',
  };
}

export async function createTypeAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const keeper = await requireKeeper();
  try {
    createType({ label: String(formData.get('label') ?? '') }, keeper.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Aanmaken is niet gelukt.' };
  }
  revalidatePath('/admin');
  revalidatePath('/', 'layout');
  return { ok: 'Soort aangemaakt.' };
}

export async function deleteTypeAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const keeper = await requireKeeper();
  try {
    deleteType(String(formData.get('typeId') ?? ''), keeper.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Verwijderen is niet gelukt.' };
  }
  revalidatePath('/admin');
  revalidatePath('/', 'layout');
  return { ok: 'Soort verwijderd.' };
}
