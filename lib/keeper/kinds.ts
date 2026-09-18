/**
 * §44: the six kinds of thing that have a Keeper side (§66 added the
 * stamboom), and the flat facts about them — what each is called, where each lives, which icon it wears.
 *
 * Deliberately pure: the switch button and the Keeperkant list are client
 * components and import this, so it never opens the database. `side.ts`,
 * `ties.ts` and `notes.ts` are the halves that do.
 */

import type { Words } from '@/lib/words';

export type KeeperKind =
  | 'entry'
  | 'case'
  | 'board'
  | 'map'
  | 'timeline'
  | 'family_tree'
  // §75: an overzicht has a side like everything else — a Keeper preparing a
  // front door for a part of the archive the table has not reached yet.
  | 'overzicht';

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

export const KEEPER_KINDS: KeeperKind[] = [
  'entry',
  'case',
  'board',
  'map',
  'timeline',
  'family_tree',
  // §75
  'overzicht',
];

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
  family_tree: 'familyTree',
  // §75
  overzicht: 'overzicht',
};

export const KIND_WORD_PLURAL: Record<KeeperKind, keyof Words> = {
  entry: 'entryPlural',
  case: 'casePlural',
  board: 'boardPlural',
  map: 'mapPlural',
  timeline: 'timelinePlural',
  family_tree: 'familyTreePlural',
  // §75
  overzicht: 'overzichtPlural',
};

export const KIND_ICON: Record<KeeperKind, string> = {
  entry: 'book',
  case: 'folder',
  board: 'board',
  map: 'map',
  timeline: 'timeline',
  family_tree: 'tree',
  // §75
  overzicht: 'home',
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
    // §66
    case 'family_tree':
      return `/stambomen/${ref.slug ?? ref.id}`;
    /*
     * §75: an overzicht lives inside the wiki, because that is what it is for
     * — and the home one *is* the wiki's front page, so it has no slug in its
     * address at all. `overzichtHref` in `lib/overzichten/service.ts` is the
     * one that knows about home; this asks nothing of the database, so a home
     * overzicht reached through a ref lands on its own long address, which
     * works and simply is not the short one.
     */
    case 'overzicht':
      return `/wiki/overzicht/${ref.slug ?? ref.id}`;
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
