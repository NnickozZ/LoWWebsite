/**
 * §44: the five kinds of thing that have a Keeper side, and the flat facts
 * about them — what each is called, where each lives, which icon it wears.
 *
 * Deliberately pure: the switch button and the Keeperkant list are client
 * components and import this, so it never opens the database. `side.ts`,
 * `ties.ts` and `notes.ts` are the halves that do.
 */

import type { Words } from '@/lib/words';

export type KeeperKind = 'entry' | 'case' | 'board' | 'map' | 'timeline';

/**
 * §46: the two sides of the archive. Every list is read from one of them, and
 * every record *is* on one of them — the Keeper's, or the table's.
 */
export type Side = 'keeper' | 'player';

export function isSide(value: unknown): value is Side {
  return value === 'keeper' || value === 'player';
}

/** Which side a record is on, from the one fact that decides it. */
export function sideOf(keeperOnly: boolean): Side {
  return keeperOnly ? 'keeper' : 'player';
}

export const KEEPER_KINDS: KeeperKind[] = ['entry', 'case', 'board', 'map', 'timeline'];

export function isKeeperKind(value: unknown): value is KeeperKind {
  return typeof value === 'string' && (KEEPER_KINDS as string[]).includes(value);
}

/** The §11 word key each kind is named by — never a hard-coded noun. */
export const KIND_WORD: Record<KeeperKind, keyof Words> = {
  entry: 'entry',
  case: 'case',
  board: 'board',
  map: 'map',
  timeline: 'timeline',
};

export const KIND_WORD_PLURAL: Record<KeeperKind, keyof Words> = {
  entry: 'entryPlural',
  case: 'casePlural',
  board: 'boardPlural',
  map: 'mapPlural',
  timeline: 'timelinePlural',
};

export const KIND_ICON: Record<KeeperKind, string> = {
  entry: 'book',
  case: 'folder',
  board: 'board',
  map: 'map',
  timeline: 'timeline',
};

/**
 * Where a thing of this kind lives. A prikbord is the odd one out: it is
 * reached by id, everything else by slug (`app/(app)/b/[id]`).
 */
export function kindHref(kind: KeeperKind, ref: { id: string; slug?: string | null }): string {
  switch (kind) {
    case 'entry':
      return `/e/${ref.slug ?? ref.id}`;
    case 'case':
      return `/c/${ref.slug ?? ref.id}`;
    case 'board':
      return `/b/${ref.id}`;
    case 'map':
      return `/maps/${ref.slug ?? ref.id}`;
    case 'timeline':
      return `/timelines/${ref.slug ?? ref.id}`;
  }
}

/** One end of a tie, as a page prints it. Never built for a viewer who may not see it. */
export type KeeperRef = {
  kind: KeeperKind;
  id: string;
  name: string;
  slug: string | null;
  href: string;
  /** Is this end the Keeper's own side? */
  keeperOnly: boolean;
};
