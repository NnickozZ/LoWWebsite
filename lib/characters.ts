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
 * **Attribution is recorded, not re-derived** (§18b). It used to be the other
 * way: every label was looked up from whoever was active *now*, so switching
 * character re-labelled a person's past as well. That was defensible while one
 * account meant one investigator at a time. It stopped being defensible when
 * the archive started asking each browser window "Met wie ben je nu aan het
 * schrijven?" — a player who plays two onderzoekers in two windows would have
 * seen both windows' work collapse under whichever name they last picked, and
 * the log would have lied about who found what. So the karakter is written into
 * the row at the moment of the act (`character_id`, migration 0015) and read
 * back from there.
 *
 * The old behaviour is not gone, it is the *fallback*. A row with a NULL
 * `character_id` was written before the archive asked, and is still labelled
 * from the account's karakter of the day — nothing was backfilled, so a feed
 * from last month reads exactly as it read last month. `attributed()` and
 * `displayNames()` prefer the recorded id and fall through to the live lookup
 * when there is none.
 *
 * The account name is always one tooltip away, either way.
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
  if (!entry) throw new Error('Artikel niet gevonden');

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

/**
 * §18b: the names of these fiches, by entry id — for a row that recorded which
 * karakter wrote it. No visibility rule and no tie check: it is a name that was
 * printed once already, and looking it up again must not turn it into a blank.
 * A fiche in the bin has no name here, and the caller falls back to the account.
 */
export function characterNames(entryIds: (string | null | undefined)[]): Map<string, string> {
  const ids = [...new Set(entryIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const rows = db
    .select({ id: schema.entries.id, name: schema.entries.name })
    .from(schema.entries)
    .where(and(inArray(schema.entries.id, ids), isNull(schema.entries.deletedAt)))
    .all();
  return new Map(rows.map((row) => [row.id, row.name]));
}

/**
 * One person as a feed prints them. `characterId` is the karakter *this row*
 * recorded (§18b); leave it out and the label falls back to whoever the person
 * is wearing now, which is what every row written before §18b gets.
 */
export type Named = {
  id: string;
  username: string;
  isKeeper: boolean;
  characterId?: string | null;
};

/**
 * `displayName(...)` for a list: the shape every feed and log wants — what to
 * print, and the account behind it for the tooltip.
 */
export function displayNames(
  people: Named[],
  keeperWord = 'Keeper',
): Map<string, { label: string; account: string }> {
  const worn = activeCharacterNames(people.map((p) => p.id));
  // §18b: the karakter each row recorded, resolved in one more query.
  const recorded = characterNames(people.map((p) => p.characterId));
  const out = new Map<string, { label: string; account: string }>();
  for (const person of people) {
    const written = person.characterId ? recorded.get(person.characterId) : undefined;
    out.set(person.id, {
      // A Keeper is always the Keeper's word, whatever a row happens to carry.
      label: person.isKeeper ? keeperWord : (written ?? worn.get(person.id) ?? person.username),
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

/**
 * The same pair again, for the live layer only — ghost cursors, the "ook hier"
 * strip, the caret in a shared text, the hand on a card, the ink someone is
 * drawing. A player is unchanged: they are the Onderzoeker they are wearing.
 * A Keeper is their account name, not the Keeper's word.
 *
 * The split is deliberate. A log says what the Keeper *did* — one voice, one
 * word, §11 — and a Keeper is always the Keeper there. A presence strip says
 * *who is here*, and a room full of identical "Keeper" arrows is not a name:
 * two Keepers at one prikbord could not tell each other apart, and neither
 * could anyone watching them. So `displayNames` stays exactly as it is, and
 * only the live layer calls these.
 *
 * §18b changes nothing here either: a `characterId` on a `Named` is what a row
 * once recorded, and presence is not about a row — it is about who is standing
 * in this room *now*. These two deliberately ignore it. What the live line does
 * do is resolve the name from the *window's* karakter before it ever gets here
 * (`app/api/live/site/route.ts`), so two windows of one account show as two
 * investigators.
 */
export function presenceNames(
  people: Named[],
  keeperWord = 'Keeper',
): Map<string, { label: string; account: string }> {
  const characters = activeCharacterNames(people.map((p) => p.id));
  const out = new Map<string, { label: string; account: string }>();
  for (const person of people) {
    out.set(person.id, {
      // `username` is notNull, so this only falls back for a blank one.
      label: person.isKeeper
        ? person.username.trim() || keeperWord
        : (characters.get(person.id) ?? person.username),
      account: person.username,
    });
  }
  return out;
}

/** One person's presence label, for the places that only ever have one. */
export function presenceNameOf(
  userId: string | null,
  keeperWord = 'Keeper',
): { label: string; account: string } | null {
  if (!userId) return null;
  const user = db
    .select({ id: schema.users.id, username: schema.users.username, isKeeper: schema.users.isKeeper })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user) return null;
  return presenceNames([user], keeperWord).get(userId) ?? null;
}

/**
 * §18b: the name the live layer shows for *this browser window*.
 *
 * `presenceNameOf` answers per account — the karakter that account is wearing
 * now. That was the same thing while a person had one window; it is not, now
 * that each window chooses. This is the one the live line, the strip, the
 * ghost cursors and the carets use, so a person playing two onderzoekers in
 * two tabs is two people on the wall rather than one name twice.
 *
 * A Keeper is their account name, exactly as `presenceNames` has it: on a
 * strip the Keeper's word is not a name.
 */
export function windowPresenceName(
  user: { id: string; username: string; isKeeper: boolean; characterId?: string | null } | null,
  keeperWord = 'Keeper',
): string {
  if (!user) return '';
  if (!user.isKeeper && user.characterId) {
    const worn = characterNames([user.characterId]).get(user.characterId);
    if (worn) return worn;
  }
  return (
    presenceNames([{ id: user.id, username: user.username, isKeeper: user.isKeeper }], keeperWord).get(user.id)
      ?.label ?? user.username
  );
}

/**
 * The shape every log row already carries: an account, its name, its Keeper
 * flag — and, since §18b, the karakter the row was written as. A row with
 * `characterId` null was written before the archive asked, and falls back to
 * the account's karakter of the day.
 */
export type Actor = {
  actorId: string | null;
  actorName: string | null;
  actorIsKeeper: boolean;
  characterId?: string | null;
};

/** What a log row prints for its actor, and the account behind it for the tooltip. */
export type Attributed = { actorLabel: string | null; actorAccount: string | null };

/**
 * Re-labels a feed: `actorName` stays the account, `actorLabel` becomes the
 * karakter the row was *written as* — or, for a row from before §18b, the one
 * that person is wearing right now. Two queries for the whole list, so a page
 * can call this on every feed it shows.
 *
 * Note that the fallback is per account and the recorded name is per row: one
 * account may appear twice in one feed under two names, which is the whole
 * point — that is two investigators at the same table.
 */
export function attributed<T extends Actor>(items: T[], keeperWord = 'Keeper'): (T & Attributed)[] {
  const people: Named[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.actorId || seen.has(item.actorId)) continue;
    seen.add(item.actorId);
    people.push({ id: item.actorId, username: item.actorName ?? '', isKeeper: item.actorIsKeeper });
  }
  // Whoever they are wearing now, for the rows that recorded nothing…
  const names = displayNames(people, keeperWord);
  // …and the names of the karakters the rows themselves name.
  const recorded = characterNames(items.map((item) => item.characterId));
  return items.map((item) => {
    const named = item.actorId ? names.get(item.actorId) : undefined;
    const written = item.characterId ? recorded.get(item.characterId) : undefined;
    return {
      ...item,
      // A Keeper is always the Keeper's word, whatever a row happens to carry.
      actorLabel: (item.actorIsKeeper ? undefined : written) ?? named?.label ?? item.actorName,
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
