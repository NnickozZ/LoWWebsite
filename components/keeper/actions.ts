'use server';

import { redirect } from 'next/navigation';
import { requireKeeper } from '@/lib/auth/session';
import { isKeeperKind } from '@/lib/keeper/kinds';
import { createTwin } from '@/lib/keeper/ties';

/**
 * §44: "Keeperversie maken".
 *
 * A server action rather than a fetch, for one reason: the answer to this
 * button is a *different page*, and a redirect is what a browser does with
 * that. `createTwin` makes the second face, moves the notes onto it and ties
 * the pair; everything it needs to refuse — already a Keeper page, already has
 * a twin, not visible to this viewer — it refuses itself, so nothing is
 * decided twice.
 *
 * It lives beside the button rather than under one route group because five
 * pages press it.
 */
export async function createTwinAction(formData: FormData) {
  const keeper = await requireKeeper();
  const kind = String(formData.get('kind') ?? '');
  const id = String(formData.get('id') ?? '');
  if (!isKeeperKind(kind) || !id) throw new Error('Niet gevonden.');
  const made = createTwin(kind, id, keeper);
  redirect(made.href);
}
