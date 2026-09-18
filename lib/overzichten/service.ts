import { and, asc, eq, isNull, isNotNull, sql, type SQL } from 'drizzle-orm';
import { viewableCondition, viewerCanEdit } from '@/lib/access';
import type { Author } from '@/lib/auth/author';
import { db, schema } from '@/lib/db';
import { logActivity, logAudit } from '@/lib/entries/service';
import type { Viewer } from '@/lib/entries/visibility';
import { newId } from '@/lib/ids';
import { bornSide, keeperOnlyForNew, placeNewOnSide, sideCondition } from '@/lib/keeper/side';
import { countHiddenSections } from '@/lib/sections/service';
import { RESERVED_WIKI_SLUGS, slugify, uniqueSlug } from '@/lib/slug';

/**
 * §75, round 38: het overzicht.
 *
 * A page of the wiki that is about the wiki: the front door players write
 * themselves. `lib/db/schema.ts` carries the long argument for why this is a
 * table of its own; the short version is that everything an overzicht must
 * *not* appear in — the web, "Genoemd in", a stamboom, a landkaart, a dossier —
 * it stays out of by not being a row in `entries`.
 *
 * Three rules this file is the keeper of:
 *
 *  1. **A list filters by side; a lookup never does** (§46). `listOverzichten`
 *     carries `sideCondition`; `getOverzicht`, `getOverzichtBySlug` and
 *     `getHomeOverzicht` do not, because a Keeper walks into one from either
 *     side and the page has to be there — `sideDetour` then turns the archive
 *     over around them, exactly as it does for an artikel.
 *  2. **The home overzicht cannot be binned or unmade.** It is the address
 *     `/wiki` resolves to, and a wiki with no front door is a 404 where the
 *     front page should be. `deleteOverzicht` refuses it, and nothing here can
 *     clear `is_home` — the migration set it once.
 *  3. **Anybody may edit, and that is a dial and not a hard-coded yes.** The
 *     table ships `edit_mode = 'all'`, so `viewerCanEdit` answers true for
 *     every signed-in person until somebody turns it down; a Keeper who wants
 *     one held still uses `access_locked` (§17's bolt). Nothing in this file
 *     asks `isKeeper` for the right to write.
 */

const NAME_MAX = 120;
const LEAD_MAX = 2000;

export type Overzicht = {
  id: string;
  name: string;
  slug: string;
  lead: string;
  isHome: boolean;
  icon: string;
  sortOrder: number;
  keeperOnly: boolean;
  createdBy: string | null;
  updatedAt: number;
  /** Keeper-only hint: how many secties on it this viewer would not see. */
  hiddenSections?: number;
};

const COLUMNS = {
  id: schema.overzichten.id,
  name: schema.overzichten.name,
  slug: schema.overzichten.slug,
  lead: schema.overzichten.lead,
  isHome: schema.overzichten.isHome,
  icon: schema.overzichten.icon,
  sortOrder: schema.overzichten.sortOrder,
  keeperOnly: schema.overzichten.keeperOnly,
  createdBy: schema.overzichten.createdBy,
  updatedAt: schema.overzichten.updatedAt,
};

/**
 * §40: the dials, on every read, with a viewer that is required rather than
 * optional. The bin is part of it — a binned overzicht is gone for everyone,
 * the Keeper's prullenbak aside.
 */
export function visibleOverzichtCondition(viewer: Viewer): SQL {
  return and(
    isNull(schema.overzichten.deletedAt),
    viewableCondition('overzicht', viewer),
  ) as SQL;
}

/** Where this overzicht lives. The home one *is* `/wiki`; the rest hang under it. */
export function overzichtHref(row: { slug: string; isHome: boolean }): string {
  return row.isHome ? '/wiki' : `/wiki/overzicht/${row.slug}`;
}

/** §46: a list, so it is read from one side at a time. */
export function listOverzichten(viewer: Viewer, options: { bothSides?: boolean } = {}): Overzicht[] {
  const where = options.bothSides
    ? visibleOverzichtCondition(viewer)
    : (and(visibleOverzichtCondition(viewer), sideCondition('overzicht', viewer)) as SQL);
  return db
    .select(COLUMNS)
    .from(schema.overzichten)
    .where(where)
    .orderBy(
      // The front door first, then whatever order a Keeper gave them, then by
      // name so two overzichten with the same rank never swap places between
      // two readers of the same page.
      sql`${schema.overzichten.isHome} DESC`,
      asc(schema.overzichten.sortOrder),
      asc(schema.overzichten.name),
    )
    .all();
}

/** §46: a lookup, so no side filter. Null means "gone, or not for you". */
export function getOverzicht(id: string, viewer: Viewer): Overzicht | null {
  const row = db
    .select(COLUMNS)
    .from(schema.overzichten)
    .where(and(eq(schema.overzichten.id, id), visibleOverzichtCondition(viewer)))
    .get();
  return row ? withHidden(row, viewer) : null;
}

export function getOverzichtBySlug(slug: string, viewer: Viewer): Overzicht | null {
  const row = db
    .select(COLUMNS)
    .from(schema.overzichten)
    .where(and(eq(schema.overzichten.slug, slug), visibleOverzichtCondition(viewer)))
    .get();
  return row ? withHidden(row, viewer) : null;
}

/**
 * The front door. A lookup by definition, and the one read in the archive that
 * is allowed to answer null without that being a 404: `/wiki` falls back to the
 * list when the home overzicht is the Keeper's and the reader is not a Keeper.
 */
export function getHomeOverzicht(viewer: Viewer): Overzicht | null {
  const row = db
    .select(COLUMNS)
    .from(schema.overzichten)
    .where(and(eq(schema.overzichten.isHome, true), visibleOverzichtCondition(viewer)))
    .get();
  return row ? withHidden(row, viewer) : null;
}

function withHidden(row: Overzicht, viewer: Viewer): Overzicht {
  if (!viewer?.isKeeper) return row;
  return { ...row, hiddenSections: countHiddenSections('overzicht', row.id) };
}

function slugTaken(candidate: string): boolean {
  return Boolean(
    db
      .select({ id: schema.overzichten.id })
      .from(schema.overzichten)
      .where(eq(schema.overzichten.slug, candidate))
      .get(),
  );
}

function freeSlug(name: string): string {
  const wanted = slugify(name);
  const base = RESERVED_WIKI_SLUGS.includes(wanted) ? `${wanted}-overzicht` : name;
  return uniqueSlug(base, (candidate) => RESERVED_WIKI_SLUGS.includes(candidate) || slugTaken(candidate));
}

/**
 * §48: born on the side it was made on. An overzicht hangs in no container, so
 * there is only the second of §48's two facts to ask — the side the browser is
 * standing on, which a Keeper may overrule with `keeperOnly`.
 */
export function createOverzicht(input: { name: string; keeperOnly?: boolean }, actor: Author): Overzicht {
  const name = input.name.trim().slice(0, NAME_MAX) || 'Naamloos overzicht';
  const id = newId();
  db.insert(schema.overzichten)
    .values({ id, name, slug: freeSlug(name), createdBy: actor.id })
    .run();
  placeNewOnSide(
    'overzicht',
    id,
    keeperOnlyForNew(actor as Viewer, null, input.keeperOnly),
    actor.isKeeper ? actor.id : null,
  );
  logActivity({
    actorId: actor.id,
    characterId: actor.characterId ?? null,
    verb: 'overzicht.created',
    meta: { overzichtId: id, name },
  });
  return getOverzicht(id, actor)!;
}

/** The side a new overzicht would land on, for the sheet that offers the switch. */
export function newOverzichtSide(viewer: Viewer) {
  return bornSide(viewer, null);
}

export type OverzichtPatch = Partial<{ name: string; lead: string; icon: string; sortOrder: number }>;

export const NOT_YOURS = 'Je mag dit overzicht niet bewerken.';

export function updateOverzicht(id: string, patch: OverzichtPatch, actor: Author): Overzicht {
  if (!viewerCanEdit('overzicht', id, actor)) throw new Error(NOT_YOURS);
  const values: Partial<typeof schema.overzichten.$inferInsert> = {
    updatedAt: Math.floor(Date.now() / 1000),
  };
  if (typeof patch.name === 'string') {
    const name = patch.name.trim().slice(0, NAME_MAX);
    if (!name) throw new Error('Een overzicht heeft een naam nodig.');
    values.name = name;
  }
  if (typeof patch.lead === 'string') values.lead = patch.lead.slice(0, LEAD_MAX);
  if (typeof patch.icon === 'string' && patch.icon.trim()) values.icon = patch.icon.trim().slice(0, 40);
  if (typeof patch.sortOrder === 'number' && Number.isFinite(patch.sortOrder)) {
    values.sortOrder = Math.trunc(patch.sortOrder);
  }
  /*
   * The slug deliberately does not follow the name. An overzicht is linked to
   * by hand, from other overzichten and from whatever a player pasted into a
   * dossier, and a rename that silently moved the address would break every one
   * of those links. The same choice the rest of the archive makes (§7's note
   * about Relieken keeping the slug `object`).
   */
  db.update(schema.overzichten).set(values).where(eq(schema.overzichten.id, id)).run();
  return getOverzicht(id, actor)!;
}

/**
 * Into the Keeper's bin (§43's soft delete), never straight out. The home
 * overzicht is refused: it is the address `/wiki` resolves to.
 */
export function deleteOverzicht(id: string, actor: Author): void {
  if (!viewerCanEdit('overzicht', id, actor)) throw new Error(NOT_YOURS);
  const row = db
    .select({ isHome: schema.overzichten.isHome, name: schema.overzichten.name })
    .from(schema.overzichten)
    .where(eq(schema.overzichten.id, id))
    .get();
  if (!row) return;
  if (row.isHome) throw new Error('De voorpagina van de wiki kan niet weg.');
  db.update(schema.overzichten)
    .set({ deletedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.overzichten.id, id))
    .run();
  logAudit({ actorId: actor.id, action: 'overzicht.deleted', targetType: 'overzicht', targetId: id });
  logActivity({
    actorId: actor.id,
    characterId: actor.characterId ?? null,
    verb: 'overzicht.deleted',
    meta: { overzichtId: id, name: row.name },
  });
}

/** Keeper-only, from the prullenbak. */
export function restoreOverzicht(id: string): void {
  db.update(schema.overzichten)
    .set({ deletedAt: null })
    .where(and(eq(schema.overzichten.id, id), isNotNull(schema.overzichten.deletedAt)))
    .run();
}
