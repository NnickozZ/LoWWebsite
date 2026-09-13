import { normaliseBorder } from '@/lib/borders.mjs';

/**
 * The board document and the merge rule from §8. Pure — no database, no React —
 * so `tests/unit/board-merge.test.ts` can pin the concurrency behaviour down.
 */

/**
 * A pin is a card with nothing on it: a head to run string from and a small
 * tag underneath that can be labelled. It is how a lead that has no entry yet
 * gets a place on the wall.
 *
 * `map`, `case` and `timeline` are the other things this archive holds that a
 * wall might want to point at: the landkaart the harbour is drawn on, the
 * dossier this all belongs to, the tijdlijn of the night it happened (§32).
 * They are cards like any other — draggable, resizable, string can be run to
 * them — and, like an entry card, they carry only an id. What is behind that
 * id is resolved per viewer, so a dossier somebody may not open comes back as
 * MISSING rather than as a name.
 *
 * §52: `board` joins them. A wall may point at another wall — the board of the
 * night itself hanging on the board of the whole affair — and it is a card like
 * the rest. A wall may not hold itself (the picker leaves this board out of its
 * own list), but two walls pointing at each other is allowed and harmless: the
 * web simply draws both ties.
 */
export type CardKind = 'entry' | 'note' | 'photo' | 'pin' | 'map' | 'case' | 'timeline' | 'board';

/** The card kinds that stand for a record elsewhere in the archive. */
export const REFERENCE_KINDS = ['entry', 'map', 'case', 'timeline', 'board'] as const;

/** Index cards are all one size; a pin is a head and a tag. */
export const CARD_SIZE = { width: 160, height: 250 } as const;
export const PIN_SIZE = { width: 76, height: 40 } as const;

/**
 * §41: how big a card is drawn. 1 is the card every board has always had, and the
 * range is what a person may ask for. Half, because a wall of forty names wants
 * small ones; five times, because one card is sometimes the whole point of the
 * wall and should read across a room.
 *
 * Stored per card, defaulted in `normaliseState`, and quantised to two decimals
 * so a drag cannot write 1.7000000000000002 into a style attribute. It is one
 * number, not one per axis: Nick's decision is that a card zooms like a
 * photograph — picture, title and text together — rather than being stretched.
 */
export const CARD_SCALE_MIN = 0.5;
export const CARD_SCALE_MAX = 5;
export const DEFAULT_CARD_SCALE = 1;
/** What the bar offers, in the order the names below have them. */
export const CARD_SCALE_PRESETS = [0.5, 1, 1.5, 2.5] as const;
/** What the corner grip snaps to. Holding Shift drags free of it. */
export const CARD_SCALE_STEP = 0.05;

/**
 * A size off the wire, or out of a board saved before this existed, made safe:
 * anything that is not a finite number becomes 1 — which is exactly what every
 * card on every wall hung before today gets — and the rest is clamped and
 * rounded to a hundredth.
 */
export function normaliseCardScale(input: unknown): number {
  const raw = clampNumber(input, DEFAULT_CARD_SCALE);
  const rounded = Math.round(raw * 100) / 100;
  return Math.min(CARD_SCALE_MAX, Math.max(CARD_SCALE_MIN, rounded));
}

/**
 * §41: how wide a punaise's paper tag may grow before it wraps.
 *
 * A pin's label used to be one line clipped with an ellipsis at 76 px, which
 * meant a lead written out in full — "de man met de grijze jas" — reached the
 * wall as "de man met…" and nothing on the card said the rest existed. So the
 * tag wraps and the pin grows downward instead, capped in width so a long
 * label does not lay a banner across the cork.
 *
 * The four numbers under it are the tag's own box measured out: everything
 * above the first line (the head, and the gap under it), one line of type, the
 * two rules plus the side padding, and the mean advance of one character at the
 * tag's 0.7rem sans. The line height is deliberately generous — 18 against a
 * painted 15.1 — because guessing *short* is the dangerous way round: the
 * document reasons in `cardSize`, and a tag that paints taller than the model
 * says leaves the wall with gaps nothing knows about.
 */
export const PIN_TAG_MAX_WIDTH = 132;
const PIN_TAG_TOP = 22;
const PIN_TAG_LINE_H = 18;
const PIN_TAG_PADDING = 16;
const PIN_TAG_CHAR_W = 5.9;
/** How many characters fit on one line of a tag at its widest. */
const PIN_TAG_CHARS = Math.floor((PIN_TAG_MAX_WIDTH - PIN_TAG_PADDING) / PIN_TAG_CHAR_W);

/**
 * How many lines a label takes at the tag's widest — a greedy wrap on words,
 * chopping a word that is longer than a line, which is what `word-break:
 * break-word` does to a pasted URL. An estimate, not a measurement: this is
 * pure, and the wall it describes is not rendered anywhere near it.
 */
export function pinTagLines(name: string): number {
  const text = (name ?? '').trim();
  if (!text) return 1;
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const need = used === 0 ? word.length : used + 1 + word.length;
    if (need <= PIN_TAG_CHARS) {
      used = need;
      continue;
    }
    if (used > 0) lines += 1;
    if (word.length <= PIN_TAG_CHARS) {
      used = word.length;
      continue;
    }
    const extra = Math.ceil(word.length / PIN_TAG_CHARS) - 1;
    lines += extra;
    used = word.length - extra * PIN_TAG_CHARS;
  }
  return lines;
}

/**
 * A pin's natural size — the one thing on this wall whose box comes from what
 * is written on it. A label that already fitted gets exactly `PIN_SIZE` back,
 * so every pin hung before this reads the same to the pixel.
 */
export function pinSize(card: Pick<BoardCard, 'name'>): { width: number; height: number } {
  const text = (card.name ?? '').trim();
  const estimated = Math.ceil(text.length * PIN_TAG_CHAR_W + PIN_TAG_PADDING);
  return {
    width: Math.min(PIN_TAG_MAX_WIDTH, Math.max(PIN_SIZE.width, estimated)),
    height: PIN_TAG_TOP + pinTagLines(text) * PIN_TAG_LINE_H,
  };
}

/** Anything the geometry can be asked to measure — a card, or a card-shaped bit. */
type Measurable = Pick<BoardCard, 'kind'> & Partial<Pick<BoardCard, 'name' | 'scale'>>;
type Placed = Measurable & Pick<BoardCard, 'x' | 'y'>;

/** The box the content asks for, before the scale multiplies it. */
function intrinsicSize(card: Measurable): { width: number; height: number } {
  return card.kind === 'pin' ? pinSize({ name: card.name ?? '' }) : CARD_SIZE;
}

/**
 * §41: one rule holds the two halves of this together: **the intrinsic box comes
 * from the content, the scale multiplies it.** A punaise gets its natural size
 * from its label; every other card is a piece of paper of a fixed size; and
 * `card.scale` is applied to whichever it is.
 */
export function cardSize(card: Measurable): { width: number; height: number } {
  const base = intrinsicSize(card);
  const scale = normaliseCardScale(card.scale);
  if (scale === 1) return { width: base.width, height: base.height };
  return { width: tidy(base.width * scale), height: tidy(base.height * scale) };
}

export type CardBox = { x: number; y: number; width: number; height: number };

/**
 * §41: where a card actually *is* on the cork, at the size it is actually drawn.
 *
 * This is the single seam every piece of geometry goes through — the hit test,
 * the marquee, "Alles in beeld", the room a new card is given, the point string
 * ties to. It exists because a scaled card is painted with a CSS `transform`,
 * which grows the box about its **centre**: `card.x` is still the corner of the
 * card at scale 1, and at 250% the paper reaches 120 px further left than that.
 * Anything that reads `card.x` and `cardSize` separately gets the size right
 * and the place wrong, which is a card you cannot click at the top-left and can
 * click on bare cork below it.
 *
 * At scale 1 it returns `{card.x, card.y}` and the intrinsic box unchanged, to
 * the pixel — that is the promise every board hung before today rides on.
 */
export function cardBox(card: Placed, base = intrinsicSize(card)): CardBox {
  const scale = normaliseCardScale(card.scale);
  if (scale === 1) return { x: card.x, y: card.y, width: base.width, height: base.height };
  const width = tidy(base.width * scale);
  const height = tidy(base.height * scale);
  return {
    x: tidy(card.x - (width - base.width) / 2),
    y: tidy(card.y - (height - base.height) / 2),
    width,
    height,
  };
}

/**
 * Whether a *newly made* card starts with its picture frame open.
 *
 * Only a card that has something to put in it. A `photo` card is made around a
 * picture, and the three kinds that stand for something else in the archive —
 * `entry`, `map`, `case` — show what that thing looks like: its cover, the
 * landkaart itself, or, until it has a picture of its own, the icon and the
 * colour of its soort, which is how you tell a person from a place across a
 * wall of a hundred cards.
 *
 * A `note` and a `pin` stand for nothing and hold nothing. Their frame was
 * open all the same, so every notitie ever written came into the world with a
 * grey 3:4 box above the words — a picture frame on a slip of paper that has
 * no picture and, nine times out of ten, never will. That is the same sentence
 * §22 already writes for the reading face of an artikel: no picture, no empty
 * frame in the margin. Give a notitie a photo afterwards and the frame opens,
 * because that is somebody deciding it should.
 *
 * `map` and `case` are the pair worth explaining, since a card that resolves
 * to nothing for *this* viewer (§19) has no picture and no icon either. They
 * start open regardless, because that is a card that is MISSING, and a MISSING
 * card says so with its stamp on a plain slip; the frame is decided again at
 * render time by whether anything actually turned up. Starting them closed
 * would have taken the picture off every landkaart card on the wall to spare
 * the rare one that is out of reach.
 *
 * Since §32 the frame also stays shut on a card that stands for something
 * *without* a picture, when the caller knows that (`hasPicture === false`): an
 * artikel with no cover used to open every card with a grey box holding its
 * soort's icon, and Nick asked for that placeholder to wait behind the
 * "Foto tonen" button instead — the same rule a gebeurtenis on a tijdlijn
 * follows. A caller that does not know (`undefined`) gets the old answer, and
 * the frame is decided again at render time by whether anything turned up.
 *
 * This is a *default*, not a normalisation: `normaliseState` keeps whatever a
 * saved card says, so no board already on the wall changes under it.
 * `BoardCard` then refuses to draw a frame with nothing in it whatever the
 * flag says, which is what quietly repairs the walls hung before this rule.
 */
export function defaultShowImage(kind: CardKind, hasPicture?: boolean): boolean {
  if (kind === 'note' || kind === 'pin') return false;
  // §52: a prikbord has no cover of its own, so it goes with the tijdlijn —
  // the caller says `hasPicture === false` and the frame stays shut.
  if (
    (kind === 'entry' || kind === 'case' || kind === 'timeline' || kind === 'board') &&
    hasPicture === false
  )
    return false;
  return true;
}

/**
 * The record a card stands for, if it stands for one. One shape for all three
 * kinds, so anything that has to walk a board's references — the resolver, the
 * page that builds the props — asks once instead of three times.
 */
export function cardRef(
  card: Pick<BoardCard, 'kind' | 'entryId' | 'mapId' | 'caseId' | 'timelineId' | 'boardId'>,
): { kind: 'entry' | 'map' | 'case' | 'timeline' | 'board'; id: string } | null {
  if (card.kind === 'entry' && card.entryId) return { kind: 'entry', id: card.entryId };
  if (card.kind === 'map' && card.mapId) return { kind: 'map', id: card.mapId };
  if (card.kind === 'case' && card.caseId) return { kind: 'case', id: card.caseId };
  if (card.kind === 'timeline' && card.timelineId) return { kind: 'timeline', id: card.timelineId };
  // §52: a wall on a wall.
  if (card.kind === 'board' && card.boardId) return { kind: 'board', id: card.boardId };
  return null;
}

/**
 * Where the pin head sits — the point a string is tied to.
 *
 * Through `cardBox`, so a card that has been made bigger keeps its string tied
 * to the head you can see: the head is drawn at the top of the paper and grows
 * with it, so the 8 and the 10 — how far down the head's own centre is — are
 * multiplied too. Left unscaled, a card at 300% would tie its string a
 * card's-width above its own head, in mid-air.
 */
export function headOf(card: Placed): { x: number; y: number } {
  const box = cardBox(card);
  const down = (card.kind === 'pin' ? 8 : 10) * normaliseCardScale(card.scale);
  return { x: box.x + box.width / 2, y: box.y + down };
}

export type BoardCard = {
  id: string;
  kind: CardKind;
  /** Set for kind 'entry'. The card still renders if the entry is later deleted. */
  entryId?: string | null;
  /** Set for kind 'map' — the landkaart this card stands for. */
  mapId?: string | null;
  /** Set for kind 'case' — the dossier this card stands for. */
  caseId?: string | null;
  /** Set for kind 'timeline' — the tijdlijn this card stands for (§32). */
  timelineId?: string | null;
  /** Set for kind 'board' — the prikbord this card stands for (§52). */
  boardId?: string | null;
  /**
   * A picture belonging to this card. Notes may gain one after the fact.
   *
   * Round 19: a card no longer carries a crop of its own. An entry card draws
   * the artikel's own portrait crop (`lib/images/shapes.ts`), the same one
   * every other list uses; a card's own photo is drawn centred. A `crop` in
   * old state is simply not read (`normaliseState` drops it).
   */
  assetId?: string | null;
  /** False hides the picture frame entirely, leaving a plain index card. */
  showImage: boolean;
  /** Overrides the border this card would inherit from its entry's type. */
  border?: string | null;
  /** The card's own title. For entry cards this is a copy of the entry name. */
  name: string;
  /** Board-local text. §8: never written back to the entry. */
  text: string;
  x: number;
  y: number;
  /** Degrees, ±2, chosen once at placement and stored so it stays put. */
  rotation: number;
  /**
   * How big this card is drawn, 1 being the size it has always been. Grows
   * about the card's centre, so `x` and `y` stay where they were — see
   * `cardBox`, which is the only place that is allowed to work that out.
   */
  scale: number;
};

/**
 * Where one end of a string is tied: to a card, or to a bare point on the cork.
 * A loose end is a perfectly good thing to have on a corkboard — a lead that
 * goes somewhere you have not named yet.
 */
export type Endpoint = { card: string } | { x: number; y: number };

export function isCardEnd(end: Endpoint): end is { card: string } {
  return typeof (end as { card?: unknown }).card === 'string';
}

/**
 * String colours are stored as a key, not raw CSS: it keeps the palette to
 * something that belongs on this board, survives a theme change, and means
 * nothing a client sends can end up inside a style attribute.
 */
export const STRING_COLOURS = {
  red: '#c0392b',
  ink: '#2a2118',
  blue: '#1f4e79',
  green: '#2f6b4f',
  gold: '#8a6a24',
  violet: '#5b3a78',
} as const;

export type StringColour = keyof typeof STRING_COLOURS;
export const STRING_COLOUR_KEYS = Object.keys(STRING_COLOURS) as StringColour[];
export const DEFAULT_STRING_COLOUR: StringColour = 'red';

/**
 * How thick a string is, in **board units** — the same units a card's position
 * is in, so a thread grows and shrinks with the zoom exactly like the 2 every
 * board was drawn with before this existed. That is deliberate, and unlike the
 * tekenlaag, whose widths are measured on the screen: a piece of string is a
 * thing on the wall, not ink on the glass.
 *
 * The bar offers four of them; the range is what is *allowed*, so a value off
 * the wire is clamped rather than refused.
 */
export const STRING_WIDTH_MIN = 1;
export const STRING_WIDTH_MAX = 8;
export const DEFAULT_STRING_WIDTH = 2;
export const STRING_WIDTH_PRESETS = [1.5, 2, 4, 6.5] as const;

/**
 * And how it is drawn. Stored as a key for the same reason a colour is: nothing
 * a client sends ends up inside a style attribute.
 */
export const STRING_STYLES = ['solid', 'dashed', 'dotted', 'double', 'dashdot'] as const;
export type StringStyle = (typeof STRING_STYLES)[number];
export const DEFAULT_STRING_STYLE: StringStyle = 'solid';

export type BoardString = {
  id: string;
  from: Endpoint;
  to: Endpoint;
  label: string;
  colour: StringColour;
  /** Board units. Defaults to 2, which is what every board looked like before. */
  width: number;
  style: StringStyle;
};

export type Viewport = { x: number; y: number; zoom: number };

/**
 * What has been taken off the wall, and when — id to a millisecond timestamp.
 *
 * Merging by id alone cannot express a deletion. Someone whose screen still
 * shows a card the wall no longer has will send that card up with their next
 * save, entirely honestly, and an upsert puts it straight back. On a board
 * where two people are working that is not a rare race: it is what happens
 * every time one deletes while the other is holding a card, because a client
 * that is busy defers the change rather than applying it.
 *
 * So a deletion is written down. The merge drops any incoming card whose id is
 * in here, which is the difference between "I have not heard of this card" and
 * "this card is gone".
 */
export type Tombstones = {
  cards: Record<string, number>;
  strings: Record<string, number>;
};

export type BoardState = {
  cards: BoardCard[];
  strings: BoardString[];
  viewport: Viewport;
  /** Optional so every board saved before this existed still opens. */
  deleted?: Tombstones;
};

export type BoardPatch = {
  cards?: BoardCard[];
  strings?: BoardString[];
  deletedCardIds?: string[];
  deletedStringIds?: string[];
  /**
   * Undo. A deletion that has already been saved leaves a tombstone, and
   * without a way to lift one, undo would put a card back on screen and the
   * next save would quietly delete it again. These ids say "this is deliberate,
   * it exists again" — only ever sent for something the person just restored.
   */
  restoredCardIds?: string[];
  restoredStringIds?: string[];
  viewport?: Viewport;
};

/**
 * How long a deletion is remembered. Long enough that a laptop shut mid-session
 * and opened the next evening cannot resurrect anything; short enough that the
 * document does not accumulate for ever. Ids are a few dozen bytes each.
 */
export const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** And a hard ceiling, so a scripted client cannot grow the row without bound. */
export const TOMBSTONE_LIMIT = 500;

export const EMPTY_BOARD: BoardState = {
  cards: [],
  strings: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

function clampNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normaliseColour(input: unknown): StringColour {
  return typeof input === 'string' && input in STRING_COLOURS
    ? (input as StringColour)
    : DEFAULT_STRING_COLOUR;
}

/** The CSS colour for a string, for the SVG stroke. */
export function stringColourValue(colour: StringColour | undefined): string {
  return STRING_COLOURS[colour ?? DEFAULT_STRING_COLOUR];
}

/**
 * A thickness off the wire, or out of a board saved before this existed, made
 * safe: anything that is not a finite number becomes the default 2, and the
 * rest is clamped to the allowed range and rounded to a tenth of a unit.
 */
export function normaliseStringWidth(input: unknown): number {
  const raw = clampNumber(input, DEFAULT_STRING_WIDTH);
  const rounded = Math.round(raw * 10) / 10;
  return Math.min(STRING_WIDTH_MAX, Math.max(STRING_WIDTH_MIN, rounded));
}

function normaliseStringStyle(input: unknown): StringStyle {
  return typeof input === 'string' && (STRING_STYLES as readonly string[]).includes(input)
    ? (input as StringStyle)
    : DEFAULT_STRING_STYLE;
}

/** Keeps `1.5 * 2.2` from reaching a style attribute as 3.3000000000000003. */
function tidy(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The dash pattern for a style, in board units, scaled to the thickness so a
 * thick dashed line has long dashes rather than a dotted look.
 *
 * `undefined` means an unbroken line: `solid`, and `double`, which is two whole
 * strokes side by side rather than a pattern (see `stringPathOffset` on the
 * canvas). Round caps are already on, which is what turns a zero-length dash
 * into a dot.
 */
export function stringDash(style: StringStyle | undefined, width: number): string | undefined {
  const w = normaliseStringWidth(width);
  switch (style) {
    case 'dashed':
      return `${tidy(w * 3)} ${tidy(w * 2.2)}`;
    case 'dotted':
      return `${tidy(w * 0.01)} ${tidy(w * 2.4)}`;
    case 'dashdot':
      return `${tidy(w * 3)} ${tidy(w * 2)} ${tidy(w * 0.01)} ${tidy(w * 2)}`;
    default:
      return undefined;
  }
}

/**
 * Accepts the old shape — a bare card id — as well as the current one, so a
 * board saved before loose ends existed still opens.
 */
function normaliseEndpoint(input: unknown): Endpoint | null {
  if (typeof input === 'string') return input ? { card: input } : null;
  if (!input || typeof input !== 'object') return null;
  const end = input as { card?: unknown; x?: unknown; y?: unknown };
  if (typeof end.card === 'string' && end.card) return { card: end.card };
  if (typeof end.x === 'number' && typeof end.y === 'number') {
    return { x: clampNumber(end.x, 0), y: clampNumber(end.y, 0) };
  }
  return null;
}

export function endpointsEqual(a: Endpoint, b: Endpoint): boolean {
  if (isCardEnd(a) && isCardEnd(b)) return a.card === b.card;
  if (!isCardEnd(a) && !isCardEnd(b)) return a.x === b.x && a.y === b.y;
  return false;
}

/** True when two strings join the same two things, whichever way round. */
export function sameEnds(a: Pick<BoardString, 'from' | 'to'>, b: Pick<BoardString, 'from' | 'to'>) {
  return (
    (endpointsEqual(a.from, b.from) && endpointsEqual(a.to, b.to)) ||
    (endpointsEqual(a.from, b.to) && endpointsEqual(a.to, b.from))
  );
}

/**
 * One string between any two things. Two cards joined twice is never what
 * anyone meant — it is a second drag that landed on the same pair — so the
 * later one is dropped and the first keeps its label and colour.
 */
function dedupeStrings(strings: BoardString[]): BoardString[] {
  const kept: BoardString[] = [];
  for (const line of strings) {
    if (!kept.some((other) => sameEnds(other, line))) kept.push(line);
  }
  return kept;
}

function normaliseString(line: unknown): BoardString | null {
  if (!line || typeof line !== 'object') return null;
  const raw = line as Partial<BoardString>;
  if (typeof raw.id !== 'string' || !raw.id) return null;

  const from = normaliseEndpoint(raw.from);
  const to = normaliseEndpoint(raw.to);
  if (!from || !to) return null;
  // A string from a card to itself is not a string. Two loose ends in the same
  // place are equally pointless.
  if (endpointsEqual(from, to)) return null;

  return {
    id: raw.id,
    from,
    to,
    label: typeof raw.label === 'string' ? raw.label.slice(0, 200) : '',
    colour: normaliseColour(raw.colour),
    // A board saved before strings had a thickness or a kind gets the look it
    // has always had. No migration: the state is one JSON blob, and the
    // defaults are applied every time it is read.
    width: normaliseStringWidth(raw.width),
    style: normaliseStringStyle(raw.style),
  };
}

/** Accepts anything out of the database or off the wire and returns a valid board. */
export function normaliseState(input: unknown, now = Date.now()): BoardState {
  const raw = (input ?? {}) as Partial<BoardState>;

  const cards: BoardCard[] = Array.isArray(raw.cards)
    ? raw.cards
        .filter((card): card is BoardCard => Boolean(card) && typeof card.id === 'string')
        .map((card) => ({
          id: card.id,
          kind:
            card.kind === 'note' ||
            card.kind === 'photo' ||
            card.kind === 'pin' ||
            card.kind === 'map' ||
            card.kind === 'case' ||
            card.kind === 'timeline' ||
            card.kind === 'board'
              ? card.kind
              : 'entry',
          entryId: card.entryId ?? null,
          mapId: card.mapId ?? null,
          caseId: card.caseId ?? null,
          timelineId: card.timelineId ?? null,
          boardId: card.boardId ?? null,
          assetId: card.assetId ?? null,
          // Round 19: a `crop` saved on a card before this round is dropped
          // here, on read — the artikel's own crops are used everywhere.
          showImage: card.showImage !== false,
          border: typeof card.border === 'string' ? normaliseBorder(card.border) : null,
          name: typeof card.name === 'string' ? card.name.slice(0, 200) : '',
          text: typeof card.text === 'string' ? card.text.slice(0, 4000) : '',
          x: clampNumber(card.x, 0),
          y: clampNumber(card.y, 0),
          rotation: Math.max(-6, Math.min(6, clampNumber(card.rotation, 0))),
          // A board saved before cards had a size of their own gets the size it
          // has always had. No migration, for the reason a string's thickness
          // needed none: the state is one JSON blob, and the defaults are
          // applied every time it is read.
          scale: normaliseCardScale(card.scale),
        }))
    : [];

  const cardIds = new Set(cards.map((card) => card.id));
  const endExists = (end: Endpoint) => !isCardEnd(end) || cardIds.has(end.card);

  const strings: BoardString[] = Array.isArray(raw.strings)
    ? dedupeStrings(
        raw.strings
          .map((line) => normaliseString(line))
          .filter((line): line is BoardString => Boolean(line))
          // A string tied to a card that no longer exists is not a string; one
          // tied to a bare point is fine on its own.
          .filter((line) => endExists(line.from) && endExists(line.to)),
      )
    : [];

  const viewport = raw.viewport ?? EMPTY_BOARD.viewport;
  const deleted = normaliseTombstones(raw.deleted, now);

  return {
    cards,
    strings,
    viewport: {
      x: clampNumber(viewport.x, 0),
      y: clampNumber(viewport.y, 0),
      zoom: Math.max(0.2, Math.min(3, clampNumber(viewport.zoom, 1))),
    },
    deleted,
  };
}

/**
 * Reads whatever is in the column, drops anything expired, and keeps the most
 * recent `TOMBSTONE_LIMIT`. Pruning happens on the way in rather than on a
 * timer: every merge passes through here, so the list cannot outlive its use.
 *
 * §61: "most recent" has to mean something when six hundred cards are deleted
 * in one gesture, because every one of them is stamped with the same `now`.
 * A stable sort on the timestamp alone then keeps whichever half the object
 * happened to list first — the *older* half — and the newest hundred lost their
 * tombstones the moment they were written, which is a deletion that undoes
 * itself on the next save. Insertion order is the tiebreak: a merge appends the
 * ids it has just buried after the ones the wall already knew, so the later an
 * id arrived, the later it is in the object.
 */
function normaliseTombstones(input: unknown, now = Date.now()): Tombstones {
  const out: Tombstones = { cards: {}, strings: {} };
  if (!input || typeof input !== 'object') return out;
  const raw = input as Partial<Tombstones>;

  for (const key of ['cards', 'strings'] as const) {
    const source = raw[key];
    if (!source || typeof source !== 'object') continue;
    const entries = Object.entries(source)
      .filter(
        ([id, at]) =>
          typeof id === 'string' &&
          id.length > 0 &&
          id.length <= 64 &&
          typeof at === 'number' &&
          Number.isFinite(at) &&
          now - at < TOMBSTONE_TTL_MS,
      )
      .map((entry, order) => ({ entry, order }))
      .sort((a, b) => b.entry[1] - a.entry[1] || b.order - a.order)
      .slice(0, TOMBSTONE_LIMIT)
      .map((item) => item.entry);
    out[key] = Object.fromEntries(entries);
  }
  return out;
}

/**
 * §8: merge by id. Cards the incoming client has never heard of — because
 * someone else added them a second ago — survive; incoming positions and text
 * win for cards it does know; deletions are applied explicitly rather than
 * inferred from absence, so a stale client cannot wipe the board.
 *
 * §61: which is exactly why a patch may now be *partial*. Since this round a
 * client sends only the cards and strings its own hand changed (`lib/boards/dirty.ts`),
 * and `viewport` only when it moved one. Nothing here had to change for that —
 * absence has never been deletion, a tombstone is — but it is load-bearing now
 * rather than merely true, so do not "tidy" this into a replace.
 */
export function mergeBoardState(stored: unknown, patch: BoardPatch, now = Date.now()): BoardState {
  const base = normaliseState(stored);
  const incoming = normaliseState({
    cards: patch.cards ?? [],
    strings: [],
    viewport: patch.viewport ?? base.viewport,
  });

  const deletedCards = new Set(patch.deletedCardIds ?? []);
  const deletedStrings = new Set(patch.deletedStringIds ?? []);

  // What the wall already knows is gone, plus what this patch just removed,
  // minus anything the person deliberately restored with undo.
  const tombstones: Tombstones = {
    cards: { ...(base.deleted?.cards ?? {}) },
    strings: { ...(base.deleted?.strings ?? {}) },
  };
  for (const id of deletedCards) tombstones.cards[id] = now;
  for (const id of deletedStrings) tombstones.strings[id] = now;
  for (const id of patch.restoredCardIds ?? []) delete tombstones.cards[id];
  for (const id of patch.restoredStringIds ?? []) delete tombstones.strings[id];

  const cardsById = new Map<string, BoardCard>();
  for (const card of base.cards) cardsById.set(card.id, card);
  // A card the sender still has on screen but the wall has buried stays buried.
  // Without this the sender's next save — a drag, a pan, anything — hands the
  // card straight back, and a deletion made while somebody was mid-drag simply
  // undoes itself a few seconds later.
  for (const card of incoming.cards) {
    if (card.id in tombstones.cards) continue;
    cardsById.set(card.id, card);
  }
  for (const id of Object.keys(tombstones.cards)) cardsById.delete(id);

  const stringsById = new Map<string, BoardString>();
  for (const line of base.strings) stringsById.set(line.id, line);
  // Incoming strings are normalised on their own, because they may reference a
  // card that only the *stored* half of the merge knows about.
  for (const line of patch.strings ?? []) {
    const clean = normaliseString(line);
    if (clean && !(clean.id in tombstones.strings)) stringsById.set(clean.id, clean);
  }
  for (const id of Object.keys(tombstones.strings)) stringsById.delete(id);

  return normaliseState(
    {
      cards: [...cardsById.values()],
      strings: [...stringsById.values()],
      viewport: patch.viewport ?? base.viewport,
      deleted: tombstones,
    },
    now,
  );
}

/** ±2° at placement, stored so a card never jumps between loads (§8). */
export function placementRotation(): number {
  return Math.round((Math.random() * 4 - 2) * 10) / 10;
}

/** The bounding box of every card, for "Fit all". */
export function boardBounds(
  cards: BoardCard[],
  cardWidth = CARD_SIZE.width,
  cardHeight = CARD_SIZE.height,
) {
  if (!cards.length) return { x: 0, y: 0, width: cardWidth, height: cardHeight };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const card of cards) {
    // Through `cardBox`, so a card someone made three times as big is wholly
    // inside "Alles in beeld" rather than sticking out of it on all four sides.
    const box = cardBox(card, card.kind === 'pin' ? undefined : { width: cardWidth, height: cardHeight });
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
