import { normaliseBorder } from '@/lib/borders.mjs';

/**
 * The board document and the merge rule from §8. Pure — no database, no React —
 * so `tests/unit/board-merge.test.ts` can pin the concurrency behaviour down.
 */

/**
 * A pin is a card with nothing on it: a head to run string from and a small
 * tag underneath that can be labelled. It is how a lead that has no entry yet
 * gets a place on the wall.
 */
export type CardKind = 'entry' | 'note' | 'photo' | 'pin';

/** Index cards are all one size; a pin is a head and a tag. */
export const CARD_SIZE = { width: 160, height: 250 } as const;
export const PIN_SIZE = { width: 76, height: 40 } as const;

export function cardSize(card: Pick<BoardCard, 'kind'>): { width: number; height: number } {
  return card.kind === 'pin' ? PIN_SIZE : CARD_SIZE;
}

/** Where the pin head sits — the point a string is tied to. */
export function headOf(card: Pick<BoardCard, 'kind' | 'x' | 'y'>): { x: number; y: number } {
  return card.kind === 'pin'
    ? { x: card.x + PIN_SIZE.width / 2, y: card.y + 8 }
    : { x: card.x + CARD_SIZE.width / 2, y: card.y + 10 };
}

/**
 * Focal point and zoom for a picture, same shape and meaning wherever it is
 * used: the file on disk is never altered, and each *placement* keeps its own,
 * so a face cropped tight on a board card can still sit differently in a list.
 */
export type CardCrop = { x: number; y: number; zoom: number };

export type BoardCard = {
  id: string;
  kind: CardKind;
  /** Set for kind 'entry'. The card still renders if the entry is later deleted. */
  entryId?: string | null;
  /** A picture belonging to this card. Notes may gain one after the fact. */
  assetId?: string | null;
  /** How that picture — or the entry's — sits in this card's frame. */
  crop?: CardCrop | null;
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

export type BoardString = {
  id: string;
  from: Endpoint;
  to: Endpoint;
  label: string;
  colour: StringColour;
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

export function normaliseCrop(input: unknown): CardCrop | null {
  if (!input || typeof input !== 'object') return null;
  const crop = input as Partial<CardCrop>;
  return {
    x: Math.min(1, Math.max(0, clampNumber(crop.x, 0.5))),
    y: Math.min(1, Math.max(0, clampNumber(crop.y, 0.5))),
    zoom: Math.min(4, Math.max(1, clampNumber(crop.zoom, 1))),
  };
}

export const CENTRED_CROP: CardCrop = { x: 0.5, y: 0.5, zoom: 1 };

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
            card.kind === 'note' || card.kind === 'photo' || card.kind === 'pin'
              ? card.kind
              : 'entry',
          entryId: card.entryId ?? null,
          assetId: card.assetId ?? null,
          // Every card keeps its own crop: an entry card crops the entry's
          // cover for this board alone, and leaves every other list untouched.
          crop: normaliseCrop(card.crop),
          showImage: card.showImage !== false,
          border: typeof card.border === 'string' ? normaliseBorder(card.border) : null,
          name: typeof card.name === 'string' ? card.name.slice(0, 200) : '',
          text: typeof card.text === 'string' ? card.text.slice(0, 4000) : '',
          x: clampNumber(card.x, 0),
          y: clampNumber(card.y, 0),
          rotation: Math.max(-6, Math.min(6, clampNumber(card.rotation, 0))),
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
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOMBSTONE_LIMIT);
    out[key] = Object.fromEntries(entries);
  }
  return out;
}

/**
 * §8: merge by id. Cards the incoming client has never heard of — because
 * someone else added them a second ago — survive; incoming positions and text
 * win for cards it does know; deletions are applied explicitly rather than
 * inferred from absence, so a stale client cannot wipe the board.
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
    const size = card.kind === 'pin' ? PIN_SIZE : { width: cardWidth, height: cardHeight };
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + size.width);
    maxY = Math.max(maxY, card.y + size.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
