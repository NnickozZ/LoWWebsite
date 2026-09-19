/**
 * §76: the shapes the roster travels in.
 *
 * Pure, like `wire.ts` and `keys.ts`: it imports nothing, so the browser, the
 * server and a unit test all read the same file. Everything a row *says* is
 * decided on the server (`lib/live/roster.ts`) — where a place may be named at
 * all is a question only the server can answer — and everything a row *looks
 * like* is decided in the popover.
 *
 * One rule governs the whole shape. A row never carries a place a viewer may
 * not see, not even the kind of thing it is: `mode` is the only thing that
 * varies, and it varies between exactly three words.
 *
 *   place   the real label, and an href when it can be walked to
 *   hidden  somewhere this viewer may not follow. One constant sentence, the
 *           same for a Keeper-only artikel, a private prikbord and the far
 *           side of a §44 pair — the *variation* is the leak, not the label
 *   quiet   the Keeper, seen by a player: he is here, and that is all. His
 *           whereabouts are the shape of tonight's session
 */

/** What somebody is doing, decided from what the line already carries. */
export type RosterVerb = 'kijkt' | 'typt' | 'tekent' | 'sleept';

export type RosterPlaceMode = 'place' | 'hidden' | 'quiet';

export type RosterRow = {
  /**
   * §18b: one row per *window*, not per account — a person playing two
   * onderzoekers in two windows is two people at this table, and the strip has
   * said so since §18b. Three tabs on one karakter are one row.
   */
  id: string;
  /** The karakter this window wears, or the account for someone wearing nobody. */
  name: string;
  /** The account behind it, for the tooltip. Never the headline (§18, rule 5). */
  account: string;
  colour: string;
  isKeeper: boolean;
  /** This viewer's own window. */
  self: boolean;
  mode: RosterPlaceMode;
  /** Only ever set when `mode` is `place`. */
  label: string | null;
  /** Where clicking goes. Null means the row is not a link — see rule 2 of §76. */
  href: string | null;
  verb: RosterVerb;
  /** §60: every tab of this window has given its socket back. Greyed, not gone. */
  resting: boolean;
  /** How many *other* places this window's tabs stand in. Never which. */
  elsewhere: number;
  /** The spelerspagina (§77). */
  speler: string | null;
  /** A Keeper who has made himself invisible — only ever sent to a Keeper. */
  ghost: boolean;
};

export type RosterTailRow = {
  id: string;
  name: string;
  account: string;
  colour: string;
  /** When they were last here. The tail never carries a place: it is stale by definition. */
  at: number;
  speler: string | null;
};

export type RosterFrame = { rows: RosterRow[]; tail: RosterTailRow[] };

/** A nudge, as it arrives: somebody asking you to come and look (§76). */
export type NudgeFrame = {
  from: string;
  name: string;
  colour: string;
  label: string;
  href: string | null;
  at: number;
};

/**
 * A verb older than this is not news. Without a decay the last thing anybody
 * did sticks for ever: close a laptop mid-sentence and the archive says you are
 * still typing, tomorrow.
 */
export const VERB_DECAY_MS = 20_000;

/** How long a resting window stays on the roster before it falls into the tail. */
export const REST_TO_TAIL_MS = 10 * 60_000;

/** How long the tail remembers somebody who left. */
export const TAIL_MS = 30 * 60_000;

/** Roster frames are sight, not fact: coalesced, and dropped under backpressure. */
export const ROSTER_THROTTLE_MS = 400;

/** Nobody may drum on somebody else's screen. */
export const NUDGE_FLOOR_MS = 8_000;

/** A nudge is gone from the screen this long after it arrived. */
export const NUDGE_TTL_MS = 120_000;

/** What a verb has decayed to by `now`. */
export function verbNow(verb: RosterVerb, at: number, now: number): RosterVerb {
  return now - at > VERB_DECAY_MS ? 'kijkt' : verb;
}
