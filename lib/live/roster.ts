import { createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { getWords } from '@/lib/admin/words';
import { db, schema } from '@/lib/db';
import type { Viewer } from '@/lib/entries/visibility';
import { spelerBySlug, spelerHref } from '@/lib/spelers/service';
import { canWatch } from './gate';
import {
  connectionsOfUser,
  liveConnections,
  sendTo,
  setDepartureListener,
  setRosterDelivery,
  type Connection,
} from './hub';
import { parseRecordKey } from './keys';
import {
  NUDGE_FLOOR_MS,
  REST_TO_TAIL_MS,
  ROSTER_THROTTLE_MS,
  TAIL_MS,
  verbNow,
  type RosterFrame,
  type RosterRow,
  type RosterTailRow,
  type RosterVerb,
} from './rosterWire';

/**
 * §76: Aanwezig — who is in the archive, and where.
 *
 * The hub has always known where every tab stands; that is what the strip in
 * the corner is made of. What it has never done is say a place **out loud**.
 * The strip only ever shows people who are standing *where you already are*,
 * so there was nothing to gate: if you can see the page, you can see who else
 * is on it.
 *
 * A roster is the opposite. "Nick is op *Het dagboek van Ysbrand*" is an
 * assertion that the artikel exists, that it has that name, and — since §44 —
 * which side of the archive it lives on, made to somebody `canWatch` would have
 * refused the key to. So the rule of this file is one line long:
 *
 *   **A place is named per viewer, or not at all.**
 *
 * Which is why the frame is built *per connection* rather than once and fanned
 * out. For each viewer, every row is asked of `gate.ts` — the same function the
 * watch list goes through, never a second rule written here — and a place that
 * does not pass becomes one constant sentence. The *variation* is the leak: say
 * "op een artikel" for one and "ergens anders" for another and the difference
 * has told a player which hidden things exist.
 *
 * **This is O(people × people) and that is correct.** Ten friends at one table
 * means a hundred point lookups against a synchronous SQLite file, at most a
 * few times a second, and the memo below cuts most of those. Do not make it
 * clever. The obvious optimisation — build one roster, fan it out, let the
 * browser hide what it may not see — is precisely the leak, and it would not
 * even be a bug anybody could see.
 *
 * What lives here and nowhere else:
 *
 *   - the *windows* (§18b: a row is an account **and** the karakter it wears,
 *     so one person playing two onderzoekers in two windows is two rows, which
 *     is what the strip has said since §18b);
 *   - the verb, decided from what a POST already carries and decayed;
 *   - the resting (§60) and departed registries, which is how a tab that gave
 *     its socket back is greyed rather than vanished;
 *   - the nudge, gated on the *recipient*;
 *   - a Keeper's invisibility, which is memory and not a column.
 */

/* ------------------------------------------------------------- the state */

type Resting = { key: string; userId: string; name: string; colour: string; place: string | null; at: number };
type Gone = { key: string; userId: string; name: string; colour: string; at: number };

type State = {
  /** clientId → what that tab was last seen doing. */
  activity: Map<string, { verb: RosterVerb; at: number }>;
  /** clientId → when it said it was going to sleep (§60). */
  resting: Map<string, number>;
  /** window key → a window whose every tab has gone quiet. */
  asleep: Map<string, Resting>;
  /** window key → a window that left. The tail. */
  gone: Map<string, Gone>;
  /** userIds who are invisible. Keeper-only, and memory only — see `setGhost`. */
  ghosts: Set<string>;
  /** `${from}\n${to}` → when, so nobody can drum on somebody else's screen. */
  nudges: Map<string, number>;
  timer: ReturnType<typeof setTimeout> | null;
  again: boolean;
  ticker: ReturnType<typeof setInterval> | null;
};

const globalForRoster = globalThis as unknown as { __zcfRoster?: State };
const state: State = globalForRoster.__zcfRoster ?? {
  activity: new Map(),
  resting: new Map(),
  asleep: new Map(),
  gone: new Map(),
  ghosts: new Set(),
  nudges: new Map(),
  timer: null,
  again: false,
  ticker: null,
};
globalForRoster.__zcfRoster = state;

/**
 * §18b: a row is an account *and* the name it is wearing in that window — one
 * person playing two onderzoekers in two windows is two rows.
 *
 * The key is a hash rather than the pair itself, and that is not decoration.
 * `hub.ts` says of `Connection.userId`: *server-side only, never on the wire*,
 * and a row id is the one field of a roster that travels to every screen. It is
 * also what a nudge is addressed to (`nudge()` below), so it is the difference
 * between "you may invite the window the archive just showed you" and "you may
 * name any account id you can guess". Stable across restarts, because it is a
 * function and not a registry; opaque, because nothing outside this file needs
 * to read it back.
 */
export function windowId(userId: string, name: string): string {
  return createHash('sha256').update(`${userId}\n${name}`).digest('base64url').slice(0, 16);
}
const windowKey = windowId;

/* ------------------------------------------------------------ the labels */

/**
 * What a place is called, and where it is — before anybody's rights are
 * considered. Memoised for a few seconds: a roster is published several times a
 * second on a busy evening and none of these names change that fast. A page
 * renamed while somebody is standing on it shows its old name on somebody
 * else's roster for at most `LABEL_TTL_MS`, which is the whole cost of not
 * having an invalidation path into a cache that lives for ten seconds.
 */
const LABEL_TTL_MS = 10_000;
const labels = new Map<string, { value: PlaceLabel | null; at: number }>();

export type PlaceLabel = { label: string; href: string | null };

export function labelOfPlace(key: string, now = Date.now()): PlaceLabel | null {
  const cached = labels.get(key);
  if (cached && now - cached.at < LABEL_TTL_MS) return cached.value;
  const value = resolvePlace(key);
  labels.set(key, { value, at: now });
  return value;
}

/** Test seam, and the road back for anything that renames a page. */
export function forgetPlaceLabels() {
  labels.clear();
}

function resolvePlace(key: string): PlaceLabel | null {
  if (key.startsWith('page:')) return pageLabel(key.slice('page:'.length));
  const record = parseRecordKey(key);
  if (!record) return null;
  switch (record.kind) {
    case 'entry': {
      const row = db
        .select({ name: schema.entries.name, slug: schema.entries.slug })
        .from(schema.entries)
        .where(eq(schema.entries.id, record.id))
        .get();
      return row ? { label: row.name, href: `/e/${row.slug}` } : null;
    }
    case 'case': {
      const row = db
        .select({ name: schema.cases.name, slug: schema.cases.slug })
        .from(schema.cases)
        .where(eq(schema.cases.id, record.id))
        .get();
      return row ? { label: row.name, href: `/c/${row.slug}` } : null;
    }
    case 'board': {
      const row = db
        .select({ name: schema.boards.name })
        .from(schema.boards)
        .where(eq(schema.boards.id, record.id))
        .get();
      return row ? { label: row.name || getWords().board, href: `/b/${record.id}` } : null;
    }
    case 'map': {
      const row = db
        .select({ name: schema.maps.name, slug: schema.maps.slug })
        .from(schema.maps)
        .where(eq(schema.maps.id, record.id))
        .get();
      return row ? { label: row.name, href: `/maps/${row.slug}` } : null;
    }
    case 'timeline': {
      const row = db
        .select({ name: schema.timelines.name, slug: schema.timelines.slug })
        .from(schema.timelines)
        .where(eq(schema.timelines.id, record.id))
        .get();
      return row ? { label: row.name, href: `/timelines/${row.slug}` } : null;
    }
    case 'family_tree': {
      const row = db
        .select({ name: schema.familyTrees.name, slug: schema.familyTrees.slug })
        .from(schema.familyTrees)
        .where(eq(schema.familyTrees.id, record.id))
        .get();
      return row ? { label: row.name, href: `/stambomen/${row.slug}` } : null;
    }
    case 'overzicht': {
      const row = db
        .select({ name: schema.overzichten.name, slug: schema.overzichten.slug })
        .from(schema.overzichten)
        .where(eq(schema.overzichten.id, record.id))
        .get();
      return row ? { label: row.name, href: `/wiki/overzicht/${row.slug}` } : null;
    }
    /*
     * A speld, a gebeurtenis, a tekenlaag and a kamer are not pages: nothing
     * stands on them. An unknown kind is *not* a reason to invent a label —
     * unlabelled becomes the placeholder, which is the safe end of every road
     * in this file.
     */
    default:
      return null;
  }
}

function pageLabel(path: string): PlaceLabel | null {
  const words = getWords();
  const fixed: Record<string, string> = {
    '/': words.navHome,
    '/cases': words.navCases,
    '/wiki': words.navWiki,
    '/wiki/alles': `${words.navWiki} — alle ${words.entryPlural}`,
    '/boards': words.navBoards,
    '/maps': words.navMaps,
    '/timelines': words.navTimelines,
    '/stambomen': words.navFamilyTrees,
    '/search': words.navSearch,
    '/you': words.navYou,
    '/web': words.navWeb,
    '/admin': words.navAdmin,
  };
  if (fixed[path]) return { label: fixed[path], href: path };

  const speler = /^\/spelers\/([a-z0-9-]{1,64})$/.exec(path);
  if (speler) {
    const found = spelerBySlug(speler[1]);
    return found ? { label: `${words.spelerPage} — ${found.username}`, href: path } : null;
  }

  const overzicht = /^\/wiki\/overzicht\/([A-Za-z0-9_-]{1,64})$/.exec(path);
  if (overzicht) {
    const row = db
      .select({ name: schema.overzichten.name })
      .from(schema.overzichten)
      .where(eq(schema.overzichten.slug, overzicht[1]))
      .get();
    return row ? { label: row.name, href: path } : null;
  }

  const type = /^\/wiki\/([A-Za-z0-9_-]{1,64})$/.exec(path);
  if (type) {
    const row = db
      .select({ name: schema.entryTypes.label })
      .from(schema.entryTypes)
      .where(eq(schema.entryTypes.slug, type[1]))
      .get();
    return row ? { label: row.name, href: path } : null;
  }
  return null;
}

/* ----------------------------------------------------------- what they do */

/**
 * What this POST says somebody is doing. Derived from the body the line
 * already carries — no page reports anything for the roster's sake, which is
 * what keeps a verb from being a second source of truth about a place.
 */
export function verbOfPost(body: {
  updates?: unknown;
  ink?: unknown;
  cursor?: { m?: unknown } | undefined;
}): RosterVerb | null {
  if (Array.isArray(body.updates) && body.updates.length) return 'typt';
  if (Array.isArray(body.ink) && body.ink.length) return 'tekent';
  const carrying = body.cursor?.m;
  if (carrying && typeof carrying === 'object' && Object.keys(carrying as object).length) return 'sleept';
  return null;
}

/** Remember what a tab is doing. `null` is "still here, nothing in particular". */
export function noteActivity(clientId: string, verb: RosterVerb | null, now = Date.now()) {
  const previous = state.activity.get(clientId);
  state.activity.set(clientId, { verb: verb ?? previous?.verb ?? 'kijkt', at: verb ? now : (previous?.at ?? now) });
  if (verb) publishSoon();
}

/** §60: this tab is giving its socket back — it is resting, not leaving. */
export function markResting(clientId: string, now = Date.now()) {
  state.resting.set(clientId, now);
}

/** A Keeper's invisibility. Refused for anybody else, here rather than at the door. */
export function setGhost(user: { id: string; isKeeper: boolean }, ghost: boolean) {
  if (!user.isKeeper) return;
  if (ghost) state.ghosts.add(user.id);
  else state.ghosts.delete(user.id);
  publishSoon();
}

export function isGhost(userId: string): boolean {
  return state.ghosts.has(userId);
}

/* ------------------------------------------------------------ the leaving */

/** How long after a tab says "resting" its disconnection still counts as sleep. */
const REST_GRACE_MS = 10_000;

function noteDeparture(who: { clientId: string; userId: string; name: string; colour: string; place: string | null }) {
  const now = Date.now();
  const said = state.resting.get(who.clientId);
  state.resting.delete(who.clientId);
  state.activity.delete(who.clientId);
  const key = windowKey(who.userId, who.name);
  if (said !== undefined && now - said < REST_GRACE_MS) {
    state.asleep.set(key, { key, userId: who.userId, name: who.name, colour: who.colour, place: who.place, at: now });
    state.gone.delete(key);
    return;
  }
  state.gone.set(key, { key, userId: who.userId, name: who.name, colour: who.colour, at: now });
  state.asleep.delete(key);
}

/* ---------------------------------------------------------- the publishing */

function publishSoon() {
  if (state.timer) {
    state.again = true;
    return;
  }
  state.timer = setTimeout(() => {
    state.timer = null;
    try {
      publishNow();
    } finally {
      if (state.again) {
        state.again = false;
        publishSoon();
      }
    }
  }, ROSTER_THROTTLE_MS);
  if (typeof state.timer === 'object' && 'unref' in state.timer) state.timer.unref();
  // A resting window falls into the tail on the clock rather than on an event,
  // so something has to turn the handle while the archive is quiet.
  if (!state.ticker) {
    state.ticker = setInterval(() => publishSoon(), 30_000);
    if (typeof state.ticker === 'object' && 'unref' in state.ticker) state.ticker.unref();
  }
}

type Window = {
  key: string;
  userId: string;
  name: string;
  colour: string;
  place: string | null;
  places: Set<string>;
  verb: RosterVerb;
  freshness: number;
  resting: boolean;
};

function windowsNow(now: number): Window[] {
  for (const [key, row] of state.asleep) {
    if (now - row.at > REST_TO_TAIL_MS) {
      state.asleep.delete(key);
      state.gone.set(key, { key, userId: row.userId, name: row.name, colour: row.colour, at: row.at });
    }
  }
  for (const [key, row] of state.gone) {
    if (now - row.at > TAIL_MS) state.gone.delete(key);
  }

  const windows = new Map<string, Window>();
  for (const line of liveConnections()) {
    const key = windowKey(line.userId, line.name);
    const seen = state.activity.get(line.clientId);
    const verb = seen ? verbNow(seen.verb, seen.at, now) : 'kijkt';
    // Which tab of this window speaks for it: the one somebody last *did*
    // something in. `seenAt` alone will not do — every tab heartbeats, so the
    // freshest by that measure is whichever one's timer fired last.
    const freshness = seen?.at ?? line.seenAt;
    const existing = windows.get(key);
    if (!existing) {
      windows.set(key, {
        key,
        userId: line.userId,
        name: line.name,
        colour: line.colour,
        place: line.place,
        places: new Set(line.place ? [line.place] : []),
        verb,
        freshness,
        resting: false,
      });
      continue;
    }
    if (line.place) existing.places.add(line.place);
    if (freshness > existing.freshness) {
      existing.freshness = freshness;
      existing.place = line.place ?? existing.place;
      existing.verb = verb;
    }
  }

  // A window that is live is not asleep and has not left, whatever the
  // registries remember — a person who came back is simply here.
  for (const key of windows.keys()) {
    state.asleep.delete(key);
    state.gone.delete(key);
  }

  for (const row of state.asleep.values()) {
    windows.set(row.key, {
      key: row.key,
      userId: row.userId,
      name: row.name,
      colour: row.colour,
      place: row.place,
      places: new Set(row.place ? [row.place] : []),
      verb: 'kijkt',
      freshness: row.at,
      resting: true,
    });
  }
  return [...windows.values()];
}

type Person = { username: string; isKeeper: boolean };

function peopleById(userIds: string[]): Map<string, Person> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const rows = db
    .select({ id: schema.users.id, username: schema.users.username, isKeeper: schema.users.isKeeper })
    .from(schema.users)
    .where(inArray(schema.users.id, ids))
    .all();
  return new Map(rows.map((row) => [row.id, { username: row.username, isKeeper: row.isKeeper }]));
}

/**
 * The roster as one viewer may see it. Exported whole so a unit test can ask
 * the question the popover asks, from the other side, without a socket.
 */
export function rosterFor(
  viewer: { id: string; isKeeper: boolean; windowKey?: string },
  windows: Window[],
  people: Map<string, Person>,
  allowed: (key: string) => boolean,
  now: number,
): RosterFrame {
  const rows: RosterRow[] = [];
  for (const window of windows) {
    const person = people.get(window.userId);
    if (!person) continue;
    const ghost = state.ghosts.has(window.userId);
    // An invisible Keeper is invisible. He still sees himself, and so does any
    // other Keeper — two Keepers are one voice, never two secrets.
    if (ghost && !viewer.isKeeper) continue;

    let mode: RosterRow['mode'];
    if (person.isKeeper && !viewer.isKeeper) mode = 'quiet';
    else if (window.place && allowed(window.place)) mode = 'place';
    else mode = 'hidden';

    const named = mode === 'place' && window.place ? labelOfPlace(window.place, now) : null;
    rows.push({
      id: window.key,
      name: window.name,
      account: person.username,
      colour: window.colour,
      isKeeper: person.isKeeper,
      self: viewer.windowKey === window.key,
      // A place whose label could not be resolved at all is not a place: the
      // row falls back to the placeholder rather than to an empty line.
      mode: named ? 'place' : mode === 'place' ? 'hidden' : mode,
      label: named?.label ?? null,
      href: named?.href ?? null,
      verb: mode === 'quiet' ? 'kijkt' : window.verb,
      resting: window.resting,
      elsewhere: mode === 'quiet' ? 0 : Math.max(0, window.places.size - 1),
      speler: spelerHref(window.userId),
      ghost: ghost && viewer.isKeeper,
    });
  }

  rows.sort((a, b) => {
    if (a.self !== b.self) return a.self ? -1 : 1;
    if (a.resting !== b.resting) return a.resting ? 1 : -1;
    return a.name.localeCompare(b.name, 'nl');
  });

  const tail: RosterTailRow[] = [...state.gone.values()]
    .filter((row) => !state.ghosts.has(row.userId) || viewer.isKeeper)
    .filter((row) => {
      const person = people.get(row.userId);
      // A Keeper in the tail is still the Keeper: no place, and the tail has
      // none to give, so there is nothing further to hide.
      return Boolean(person);
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, 12)
    .map((row) => ({
      id: row.key,
      name: row.name,
      account: people.get(row.userId)?.username ?? '',
      colour: row.colour,
      at: row.at,
      speler: spelerHref(row.userId),
    }));

  return { rows, tail };
}

function publishNow() {
  const lines = liveConnections();
  if (!lines.length) return;
  const now = Date.now();
  const windows = windowsNow(now);
  const people = peopleById([
    ...windows.map((window) => window.userId),
    ...[...state.gone.values()].map((row) => row.userId),
    ...lines.map((line) => line.userId),
  ]);

  /*
   * One frame per *account*, not per connection: two tabs of one person are one
   * pair of eyes as far as rights go, and `canWatch` is the expensive half.
   * The `self` flag is the one thing that differs per window, so it is applied
   * when the frame is written rather than when it is built.
   */
  const byAccount = new Map<string, RosterFrame>();
  const memo = new Map<string, boolean>();
  for (const line of lines) {
    const person = people.get(line.userId);
    if (!person) continue;
    if (!byAccount.has(line.userId)) {
      const viewer: Viewer = { id: line.userId, isKeeper: person.isKeeper };
      const allowed = (key: string) => {
        const memoKey = `${line.userId}\n${key}`;
        const known = memo.get(memoKey);
        if (known !== undefined) return known;
        const answer = canWatch(key, viewer);
        memo.set(memoKey, answer);
        return answer;
      };
      byAccount.set(line.userId, rosterFor({ id: line.userId, isKeeper: person.isKeeper }, windows, people, allowed, now));
    }
    const frame = byAccount.get(line.userId)!;
    const mine = windowKey(line.userId, line.name);
    sendTo(line, {
      event: 'roster',
      data: { rows: frame.rows.map((row) => (row.id === mine ? { ...row, self: true } : row)), tail: frame.tail },
    });
  }
}

/** Test seam: publish immediately rather than on the throttle. */
export function publishRosterNow() {
  publishNow();
}

/* ---------------------------------------------------------------- the nudge */

export type NudgeResult = 'ok' | 'nowhere' | 'refused' | 'gone' | 'soon';

/**
 * "Kom kijken."
 *
 * Gated on the **recipient**: an invitation to a door somebody cannot open is
 * the same leak as naming the place on their roster, wearing a friendlier hat.
 * Nothing is stored, nothing is queued for somebody who is not here, and the
 * floor stops anybody drumming.
 */
export function nudge(from: Connection, toWindow: string, now = Date.now()): NudgeResult {
  const place = from.place;
  if (!place) return 'nowhere';

  /*
   * A nudge is addressed to a *window* — the id the roster handed out — and
   * never to an account. Two things follow from that, and both are the point:
   *
   *   - you can only invite somebody the archive has already shown you. An
   *     invisible Keeper has no row anywhere, so there is no id to address, and
   *     "is he really offline?" cannot be answered by trying. (The explicit
   *     ghost check below is the second lock on the same door: he could have
   *     turned invisible between the frame and the click.)
   *   - no account id is ever on the wire, which is what `hub.ts` promises of
   *     `userId` and what the roster would otherwise have broken for every row
   *     of every frame.
   */
  const target = liveConnections().find((line) => windowKey(line.userId, line.name) === toWindow);
  if (!target) return 'gone';
  const toUserId = target.userId;
  if (state.ghosts.has(toUserId)) return 'gone';

  const floorKey = `${from.userId}\n${toUserId}`;
  const last = state.nudges.get(floorKey);
  if (last !== undefined && now - last < NUDGE_FLOOR_MS) return 'soon';

  const lines = connectionsOfUser(toUserId).filter(
    (line) => line.clientId !== from.clientId && windowKey(line.userId, line.name) === toWindow,
  );
  if (!lines.length) return 'gone';
  const person = db
    .select({ isKeeper: schema.users.isKeeper })
    .from(schema.users)
    .where(eq(schema.users.id, toUserId))
    .get();
  if (!person) return 'gone';
  if (!canWatch(place, { id: toUserId, isKeeper: person.isKeeper })) return 'refused';
  const named = labelOfPlace(place, now);
  if (!named) return 'refused';

  state.nudges.set(floorKey, now);
  for (const line of lines) {
    sendTo(line, {
      event: 'nudge',
      // `from` is the sender's *window* id, for the same reason `to` is: an
      // account id has no business on the wire (`hub.ts`), and the screen that
      // receives this only ever needs to say who is asking.
      data: {
        from: windowKey(from.userId, from.name),
        name: from.name,
        colour: from.colour,
        label: named.label,
        href: named.href,
        at: now,
      },
    });
  }
  return 'ok';
}

/* ----------------------------------------------------------------- wiring */

setRosterDelivery(publishSoon);
setDepartureListener(noteDeparture);

/** Test seam. Never called by the app. */
export function resetRoster() {
  state.activity.clear();
  state.resting.clear();
  state.asleep.clear();
  state.gone.clear();
  state.ghosts.clear();
  state.nudges.clear();
  labels.clear();
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.again = false;
  // The 30-second handle that moves a resting window into the tail. It is
  // `unref`'d, so it never held anything open — but a seam that leaves a timer
  // running has not actually put the module back to rest.
  if (state.ticker) clearInterval(state.ticker);
  state.ticker = null;
}
