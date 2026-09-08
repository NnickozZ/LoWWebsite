'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { encryptPassword, hashPassword, passwordProblem } from '@/lib/auth/password.mjs';
import { requireKeeper } from '@/lib/auth/session';
import { logAudit } from '@/lib/entries/service';
import { approvePendingEdit, rejectPendingEdit } from '@/lib/entries/review';
import {
  destroyFromTrash,
  restoreBoardRevision,
  restoreCaseRevision,
  restoreFromTrash,
} from '@/lib/admin/trash';
import { saveSchemes, schemesFromForm } from '@/lib/admin/schemes';
import { createType, deleteType, purgeOrphanField, updateType } from '@/lib/admin/types';
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
  if (kind !== 'entry' && kind !== 'case' && kind !== 'board' && kind !== 'map' && kind !== 'timeline') return;
  restoreFromTrash(kind, id, keeper.id);
  revalidatePath('/admin');
  revalidatePath('/');
}

/**
 * §11: the bottom of the bin. Only a Keeper, only for something already in the
 * bin, and only when the name has been typed back exactly — the same guard
 * GitHub puts on deleting a repository, for the same reason: this is the one
 * button in the archive with nothing behind it.
 *
 * The comparison is done here rather than in the browser, because a disabled
 * button is a courtesy and a server check is a rule.
 */
export async function destroyAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const keeper = await requireKeeper();
  const kind = String(formData.get('kind') ?? '');
  const id = String(formData.get('id') ?? '');
  const typed = String(formData.get('confirmName') ?? '').trim();
  const expected = String(formData.get('name') ?? '').trim();

  if (kind !== 'entry' && kind !== 'case' && kind !== 'board' && kind !== 'map' && kind !== 'timeline') {
    return { error: 'Onbekend soort.' };
  }
  // Case-insensitive, whitespace-collapsed: this is a guard against acting
  // without thinking, not a spelling test.
  const same = (value: string) => value.replace(/\s+/g, ' ').toLocaleLowerCase('nl');
  if (!typed || same(typed) !== same(expected)) {
    return { error: 'De naam klopt nog niet. Typ hem precies over om dit definitief te wissen.' };
  }

  try {
    const name = destroyFromTrash(kind, id, keeper.id);
    revalidatePath('/admin');
    revalidatePath('/');
    return { ok: `${name} is definitief gewist.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Wissen is niet gelukt.' };
  }
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
  const intro = String(formData.get('intro') ?? '')
    .replace(/\r\n/g, '\n')
    .trim();

  if (!name) return { error: 'Het archief heeft een naam nodig.' };
  if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) {
    return { error: 'Een kleur ziet eruit als #A8321E.' };
  }

  /*
   * §45: `theme` is a bag now, not one value. It held nothing but `accent`
   * until this round, so `theme: accent ? { accent } : {}` was harmless — and
   * from the day the Kleuren pane started writing `theme.schemes` beside it,
   * saving the site's name would have thrown all four palettes away. Read,
   * merge, write; and clearing the accent box removes that one key rather
   * than emptying the bag.
   */
  const row = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).get();
  const theme = { ...(row?.theme ?? {}) };
  if (accent) theme.accent = accent;
  else delete theme.accent;

  db.update(schema.siteSettings)
    .set({
      name: name.slice(0, 80),
      tagline: tagline.slice(0, 120),
      theme,
      intro: intro.slice(0, 4000),
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
        // §11: the address. Only sent when it actually changed, so an ordinary
        // save never runs the cascade — and the sheet has already asked.
        ...(formData.get('slug') === null ? {} : { slug: String(formData.get('slug')) }),
        icon: String(formData.get('icon') ?? ''),
        colour: String(formData.get('colour') ?? ''),
        border: String(formData.get('border') ?? ''),
        // §24/§49: a checkbox is absent from the body when it is off, so the
        // empty string is the "no" — not a missing value. What it says now is
        // the soort's habit ("standaard het dossier voor de naam"), not where
        // the soort may be made: nothing gates that any more.
        prefixDefault: Boolean(String(formData.get('prefixDefault') ?? '')),
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

/* ----------------------------------------------------------- colours (§45) */

/**
 * Beheer → Kleuren. The form posts all four palettes, nineteen colours each,
 * as `<schemeKey>.<tokenKey>`; `schemesFromForm` reads them back and
 * `cleanSchemes` throws away anything that is not six hex digits, so nothing a
 * Keeper can type reaches the stylesheet but a colour.
 *
 * `revalidatePath('/', 'layout')` and not `/admin`: the palettes are rendered
 * by the signed-in layout, which is every page in the archive.
 */
export async function saveSchemesAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const keeper = await requireKeeper();
  const schemes = schemesFromForm((name) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : null;
  });

  saveSchemes(schemes, keeper.id);
  revalidatePath('/', 'layout');
  return { ok: 'Opgeslagen. De nieuwe kleuren staan op elke pagina.' };
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

/**
 * §38: the escape hatch beside the orphan count. A field taken away keeps its
 * values, on purpose; this is the one button that actually throws them away,
 * one key at a time, and only a Keeper reaches it.
 */
export async function purgeFieldValuesAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const keeper = await requireKeeper();
  const key = String(formData.get('fieldKey') ?? '');
  let wiped = 0;
  try {
    wiped = purgeOrphanField(String(formData.get('typeId') ?? ''), key, keeper.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Wissen is niet gelukt.' };
  }
  revalidatePath('/admin');
  return {
    ok: `‘${key}’ gewist bij ${wiped} ${wiped === 1 ? 'artikel' : 'artikelen'}.`,
  };
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
