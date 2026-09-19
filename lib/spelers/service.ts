import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { slugify, uniqueSlug } from '@/lib/slug';

/**
 * §77: an account, as an address.
 *
 * A spelerspagina lives at `/spelers/<slug>`, and the slug is made from the
 * account name rather than stored beside it. That is a deliberate trade. §4
 * lets a username hold spaces, apostrophes and any unicode letter — "Jan
 * Willem", "Van 't Hoff" — none of which may appear in a path segment or in a
 * live key (`isWellFormedKey`), so *something* has to map one to the other. The
 * alternative was a column and a migration, and a stored slug then has to be
 * kept in step with every rename, which is a second thing to forget.
 *
 * The whole list is computed in one pass so that two names which slugify the
 * same ("Jan Piet" and "Jan-Piet") cannot both answer to `jan-piet`: the list
 * is ordered by the case-folded name, and `uniqueSlug` hands the second one
 * `jan-piet-2`. **Every** road in or out goes through `listSpelers`, so the
 * page, the roster and the link all agree about who `jan-piet` is; a second
 * way of computing it is a second answer.
 *
 * The table is a table of friends. A full scan is the right amount of clever.
 */

export type SpelerLite = {
  id: string;
  username: string;
  slug: string;
  isKeeper: boolean;
};

export function listSpelers(): SpelerLite[] {
  const rows = db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      isKeeper: schema.users.isKeeper,
    })
    .from(schema.users)
    .where(eq(schema.users.isDisabled, false))
    .orderBy(asc(schema.users.usernameLower))
    .all();
  const taken = new Set<string>();
  return rows.map((row) => {
    const slug = uniqueSlug(slugify(row.username), (candidate) => taken.has(candidate));
    taken.add(slug);
    return { id: row.id, username: row.username, slug, isKeeper: row.isKeeper };
  });
}

export function spelerBySlug(slug: string): SpelerLite | null {
  return listSpelers().find((speler) => speler.slug === slug) ?? null;
}

export function spelerById(id: string | null | undefined): SpelerLite | null {
  if (!id) return null;
  return listSpelers().find((speler) => speler.id === id) ?? null;
}

/** Where this account's page is, or null for an account that has none (a disabled one). */
export function spelerHref(id: string | null | undefined): string | null {
  const speler = spelerById(id);
  return speler ? `/spelers/${speler.slug}` : null;
}
