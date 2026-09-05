import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { logActivity } from '@/lib/entries/service';

/**
 * §18: characters.
 *
 * A character is a fiche — usually an Onderzoeker — that a person has tied to
 * their account. They may tie several, and wear one at a time: the *active*
 * character is the name the archive shows for everything they do. A Keeper
 * never wears one; they are the Keeper, in every log, on every wall.
 *
 * Nothing about rights lives here. §17 is per account; a character is a name
 * a person wears, and taking it off changes nothing about what they may open.
 *
 * Attribution is resolved at display time from whoever is active *now*, not
 * recorded per act. Switching character re-labels a person's past too — which,
 * for a campaign wiki, is the honest reading: the person did those things, and
 * this is who they are being. The account name is always one tooltip away.
 */

export type CharacterLite = {
  entryId: string;
  slug: string;
  name: string;
  typeSlug: string;
  typeIcon: string;
  typeColour: string;
  coverAssetId: string | null;
};

const CHARACTER_COLUMNS = {
  entryId: schema.entries.id,
  slug: schema.entries.slug,
  name: schema.entries.name,
  typeSlug: schema.entryTypes.slug,
  typeIcon: schema.entryTypes.icon,
  typeColour: schema.entryTypes.colour,
  coverAssetId: schema.entries.coverAssetId,
} as const;

/** This person, as a viewer of their own fiches. */
function selfViewer(userId: string): Viewer {
  return { id: userId, isKeeper: false };
}

/** A Keeper wears nobody: they are the Keeper, in every log, on every wall. */
function refuseKeeper(userId: string) {
  const user = db
    .select({ isKeeper: schema.users.isKeeper })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user) throw new Error('Account niet gevonden');
  if (user.isKeeper) throw new Error('Een Keeper is altijd de Keeper.');
}

/** Every character this person may wear, in the order they put them. */
export function listCharacters(userId: string): CharacterLite[] {
  return db
    .select(CHARACTER_COLUMNS)
    .from(schema.userCharacters)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.userCharacters.entryId))
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(eq(schema.userCharacters.userId, userId), visibleEntryCondition(selfViewer(userId))))
    .orderBy(asc(schema.userCharacters.sortOrder), asc(schema.userCharacters.createdAt))
    .all();
}

export function activeCharacter(userId: string): CharacterLite | null {
  const user = db
    .select({ activeCharacterId: schema.users.activeCharacterId, isKeeper: schema.users.isKeeper })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user || user.isKeeper || !user.activeCharacterId) return null;
  return (
    db
      .select(CHARACTER_COLUMNS)
      .from(schema.userCharacters)
      .innerJoin(schema.entries, eq(schema.entries.id, schema.userCharacters.entryId))
      .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
      .where(
        and(
          eq(schema.userCharacters.userId, userId),
          eq(schema.userCharacters.entryId, user.activeCharacterId),
          visibleEntryCondition(selfViewer(userId)),
        ),
      )
      .get() ?? null
  );
}

/**
 * Ties a fiche to an account. The viewer must be able to see the fiche; a
 * Keeper may tie any fiche to any account (the player who forgot, the new
 * arrival). The first character tied becomes active, so nobody has to find a
 * second button to start being someone.
 */
export function addCharacter(userId: string, entryId: string, actor: { id: string; isKeeper: boolean }) {
  if (actor.id !== userId && !actor.isKeeper) throw new Error('Alleen voor jezelf, of voor een Keeper.');
  refuseKeeper(userId);
  const entry = db
    .select({ id: schema.entries.id, name: schema.entries.name })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, entryId), visibleEntryCondition(actor as Viewer)))
    .get();
  if (!entry) throw new Error('Fiche niet gevonden');

  const count = db
    .select({ id: schema.userCharacters.entryId })
    .from(schema.userCharacters)
    .where(eq(schema.userCharacters.userId, userId))
    .all().length;

  db.insert(schema.userCharacters)
    .values({ userId, entryId, sortOrder: count })
    .onConflictDoNothing()
    .run();

  if (count === 0) setActiveCharacter(userId, entryId, actor);
  logActivity({ actorId: actor.id, verb: 'character.added', entryId, meta: { forUser: userId } });
}

export function removeCharacter(userId: string, entryId: string, actor: { id: string; isKeeper: boolean }) {
  if (actor.id !== userId && !actor.isKeeper) throw new Error('Alleen voor jezelf, of voor een Keeper.');
  db.delete(schema.userCharacters)
    .where(and(eq(schema.userCharacters.userId, userId), eq(schema.userCharacters.entryId, entryId)))
    .run();
  const user = db
    .select({ activeCharacterId: schema.users.activeCharacterId })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (user?.activeCharacterId === entryId) {
    // Fall back to whoever is left, or to nobody.
    const next = listCharacters(userId)[0]?.entryId ?? null;
    db.update(schema.users).set({ activeCharacterId: next }).where(eq(schema.users.id, userId)).run();
  }
}

/** Wear this one. `null` takes every character off: the person is just themselves. */
export function setActiveCharacter(
  userId: string,
  entryId: string | null,
  actor: { id: string; isKeeper: boolean },
) {
  if (actor.id !== userId && !actor.isKeeper) throw new Error('Alleen voor jezelf, of voor een Keeper.');
  refuseKeeper(userId);
  if (entryId) {
    const tied = db
      .select({ entryId: schema.userCharacters.entryId })
      .from(schema.userCharacters)
      .where(and(eq(schema.userCharacters.userId, userId), eq(schema.userCharacters.entryId, entryId)))
      .get();
    if (!tied) throw new Error('Dat karakter is niet aan dit account gekoppeld.');
  }
  db.update(schema.users).set({ activeCharacterId: entryId }).where(eq(schema.users.id, userId)).run();
}

/**
 * The name the archive shows for a person: their active character's, or their
 * own; the Keeper's word for a Keeper. One query for a whole feed.
 */
export function activeCharacterNames(userIds: string[]): Map<string, string> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = db
    .select({ userId: schema.users.id, name: schema.entries.name })
    .from(schema.users)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.users.activeCharacterId))
    .where(
      and(inArray(schema.users.id, ids), eq(schema.users.isKeeper, false), isNull(schema.entries.deletedAt)),
    )
    .all();
  return new Map(rows.map((row) => [row.userId, row.name]));
}

export type Named = { id: string; username: string; isKeeper: boolean };

/**
 * `displayName(...)` for a list: the shape every feed and log wants — what to
 * print, and the account behind it for the tooltip.
 */
export function displayNames(
  people: Named[],
  keeperWord = 'Keeper',
): Map<string, { label: string; account: string }> {
  const characters = activeCharacterNames(people.map((p) => p.id));
  const out = new Map<string, { label: string; account: string }>();
  for (const person of people) {
    out.set(person.id, {
      label: person.isKeeper ? keeperWord : (characters.get(person.id) ?? person.username),
      account: person.username,
    });
  }
  return out;
}

/** One person's label, for the places that only ever have one. */
export function displayNameOf(userId: string | null, keeperWord = 'Keeper'): { label: string; account: string } | null {
  if (!userId) return null;
  const user = db
    .select({ id: schema.users.id, username: schema.users.username, isKeeper: schema.users.isKeeper })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user) return null;
  return displayNames([user], keeperWord).get(userId) ?? null;
}

/** The shape every log row already carries: an account, its name, its Keeper flag. */
export type Actor = { actorId: string | null; actorName: string | null; actorIsKeeper: boolean };

/** What a log row prints for its actor, and the account behind it for the tooltip. */
export type Attributed = { actorLabel: string | null; actorAccount: string | null };

/**
 * Re-labels a feed: `actorName` stays the account, `actorLabel` becomes the
 * character the person is wearing right now (or the Keeper's word). One query
 * for the whole list, so a page can call this on every feed it shows.
 */
export function attributed<T extends Actor>(items: T[], keeperWord = 'Keeper'): (T & Attributed)[] {
  const people: Named[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.actorId || seen.has(item.actorId)) continue;
    seen.add(item.actorId);
    people.push({ id: item.actorId, username: item.actorName ?? '', isKeeper: item.actorIsKeeper });
  }
  const names = displayNames(people, keeperWord);
  return items.map((item) => {
    const named = item.actorId ? names.get(item.actorId) : undefined;
    return {
      ...item,
      actorLabel: named?.label ?? item.actorName,
      actorAccount: named?.account ?? item.actorName,
    };
  });
}

/** For a list of accounts: each one's label, or `null` when they wear nobody. */
export function charactersWorn(userIds: string[]): Map<string, string | null> {
  const names = activeCharacterNames(userIds);
  return new Map(userIds.map((id) => [id, names.get(id) ?? null]));
}

/** Who plays this fiche: every account that tied it on, and whether it is what they wear now. */
export function playersOf(entryId: string): { id: string; username: string; active: boolean }[] {
  return db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      activeCharacterId: schema.users.activeCharacterId,
    })
    .from(schema.userCharacters)
    .innerJoin(schema.users, eq(schema.users.id, schema.userCharacters.userId))
    .where(and(eq(schema.userCharacters.entryId, entryId), eq(schema.users.isDisabled, false)))
    .orderBy(asc(schema.users.usernameLower))
    .all()
    .map((row) => ({ id: row.id, username: row.username, active: row.activeCharacterId === entryId }));
}
