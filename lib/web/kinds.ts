import type { Words } from '@/lib/words';
import type { WebEdgeKind, WebLineColour, WebNodeKind } from './types';

/**
 * §43: how each kind of tie is drawn, and what it is called.
 *
 * Pure — client components import this. The colours are the wall's own: ink
 * for what is written, the red draad for what hangs on a prikbord, the speld's
 * blue for a landkaart, the folder's gold for a dossier, the axis's green for
 * a tijdlijn. A dash says "this is a fact about the artikel" (an infobox
 * field, a section) as opposed to "this is in the running text".
 *
 * The words come from `Words` (§11) so a Keeper who renamed "artikel" sees
 * their word in the legend too; nothing here hard-codes a noun.
 */

export type EdgeStyle = {
  colour: string;
  /** The same line on dark paper (§29's dark face), where ink is light. */
  colourDark: string;
  /** Canvas dash pattern; empty = solid. */
  dash: number[];
  width: number;
  /** A factor on the line's alpha at rest: a mention is drawn nearly transparent (round 18). */
  restAlpha?: number;
};

export type EdgeKindInfo = EdgeStyle & {
  /** The legend's word for it, e.g. "genoemd in de tekst". */
  label: (words: Words) => string;
  /**
   * One line for the panel and the hover label, with the detail folded in:
   * `phrase(words, detail)` → "infobox: Huidige houder", "op prikbord", …
   */
  phrase: (words: Words, detail: string) => string;
  /** Which group the legend files it under. */
  group: 'text' | 'case' | 'board' | 'map' | 'timeline' | 'people';
};

const INK = '#2a2118';
const RED = '#c0392b';
const BLUE = '#1f4e79';
const GOLD = '#8a6a24';
const GREEN = '#2f6b4f';
const VIOLET = '#5b3a78';
const INK_DARK = '#e8e1d2';
const RED_DARK = '#e2705f';
const BLUE_DARK = '#8fb8dd';
const GOLD_DARK = '#d4b45f';
const GREEN_DARK = '#7fc79c';
const VIOLET_DARK = '#b78fd8';

const withDetail = (base: string, detail: string) => (detail ? `${base}: ${detail}` : base);

export const EDGE_KINDS: Record<WebEdgeKind, EdgeKindInfo> = {
  mention: {
    colour: INK,
    colourDark: INK_DARK,
    dash: [],
    // Round 18: the thinnest, faintest line there is — the text naming
    // something is the weakest tie, and it yields to any other (slice.ts).
    width: 0.8,
    restAlpha: 0.35,
    group: 'text',
    label: () => 'genoemd in de tekst',
    phrase: () => 'genoemd in de tekst',
  },
  relation: {
    colour: INK,
    colourDark: INK_DARK,
    dash: [],
    width: 2.2,
    group: 'text',
    label: () => 'relatie met een naam',
    phrase: (_w, detail) => withDetail('relatie', detail),
  },
  field: {
    colour: INK,
    colourDark: INK_DARK,
    dash: [6, 4],
    width: 1.4,
    group: 'text',
    label: () => 'in de infobox',
    phrase: (_w, detail) => withDetail('infobox', detail),
  },
  section: {
    colour: INK,
    colourDark: INK_DARK,
    dash: [2, 4],
    width: 0.8,
    restAlpha: 0.35,
    group: 'text',
    label: (w) => `in een ${w.section}`,
    phrase: (w, detail) => withDetail(w.section, detail),
  },
  filed: {
    colour: GOLD,
    colourDark: GOLD_DARK,
    dash: [],
    width: 1.8,
    group: 'case',
    label: (w) => `in het ${w.case}`,
    phrase: (w) => `zit in het ${w.case}`,
  },
  caseNotes: {
    colour: GOLD,
    colourDark: GOLD_DARK,
    dash: [6, 4],
    width: 1.4,
    group: 'case',
    label: () => 'in de aantekeningen',
    phrase: () => 'genoemd in de aantekeningen',
  },
  caseLink: {
    colour: GOLD,
    colourDark: GOLD_DARK,
    dash: [2, 4],
    width: 1.4,
    group: 'case',
    label: (w) => `${w.case} in de infobox`,
    phrase: (_w, detail) => withDetail('infobox', detail),
  },
  inCase: {
    colour: GOLD,
    colourDark: GOLD_DARK,
    dash: [10, 4],
    width: 1.8,
    group: 'case',
    label: (w) => `hangt in het ${w.case}`,
    phrase: (w) => `hangt in het ${w.case}`,
  },
  board: {
    colour: RED,
    colourDark: RED_DARK,
    dash: [],
    width: 1.6,
    group: 'board',
    label: (w) => `${w.card} op het ${w.board}`,
    phrase: (w) => `${w.card} op het ${w.board}`,
  },
  boardNote: {
    colour: RED,
    colourDark: RED_DARK,
    dash: [6, 4],
    width: 1.4,
    group: 'board',
    label: (w) => `in een ${w.note} op het ${w.board}`,
    phrase: (w, detail) => withDetail(`genoemd in ${w.note}`, detail),
  },
  thread: {
    colour: RED,
    colourDark: RED_DARK,
    dash: [],
    width: 2.4,
    group: 'board',
    label: (w) => `${w.string} op het ${w.board}`,
    // Round 18: the draad's own words are the line — "heeft vermoord", not
    // "draad: heeft vermoord". Without a label it is just a draad.
    phrase: (w, detail) => detail || w.string,
  },
  pin: {
    colour: BLUE,
    colourDark: BLUE_DARK,
    dash: [],
    width: 1.6,
    group: 'map',
    label: (w) => `${w.mapPin} op de ${w.map}`,
    phrase: (w, detail) => withDetail(`${w.mapPin} op de ${w.map}`, detail),
  },
  mapOf: {
    colour: BLUE,
    colourDark: BLUE_DARK,
    dash: [10, 4],
    width: 1.8,
    group: 'map',
    label: (w) => `${w.map} van deze plek`,
    phrase: (w) => `${w.map} van deze plek`,
  },
  event: {
    colour: GREEN,
    colourDark: GREEN_DARK,
    dash: [],
    width: 1.6,
    group: 'timeline',
    label: (w) => `${w.event} op de ${w.timeline}`,
    phrase: (w, detail) => withDetail(`${w.event} op de ${w.timeline}`, detail),
  },
  investigator: {
    colour: VIOLET,
    colourDark: VIOLET_DARK,
    dash: [],
    width: 1.6,
    group: 'people',
    label: (w) => `${w.character} op het ${w.case}`,
    phrase: (w) => `${w.character} op het ${w.case}`,
  },
  player: {
    colour: VIOLET,
    colourDark: VIOLET_DARK,
    dash: [6, 4],
    width: 1.4,
    group: 'people',
    label: (w) => `${w.player} in de infobox`,
    phrase: (_w, detail) => withDetail('infobox', detail),
  },
};

/** A draad's own colour on the wall, on light and dark paper — the same six inks the kinds use. */
export const LINE_COLOURS: Record<WebLineColour, { colour: string; colourDark: string }> = {
  red: { colour: RED, colourDark: RED_DARK },
  ink: { colour: INK, colourDark: INK_DARK },
  blue: { colour: BLUE, colourDark: BLUE_DARK },
  green: { colour: GREEN, colourDark: GREEN_DARK },
  gold: { colour: GOLD, colourDark: GOLD_DARK },
  violet: { colour: VIOLET, colourDark: VIOLET_DARK },
};

/** The CSS custom property that prints an edge in the colour the canvas draws it. */
export function edgeColourVar(edge: { kind: WebEdgeKind; colour?: WebLineColour }): string {
  return edge.colour ? `var(--web-line-${edge.colour})` : `var(--web-${edge.kind})`;
}

export const EDGE_KIND_ORDER: WebEdgeKind[] = [
  'mention',
  'relation',
  'field',
  'section',
  'filed',
  'caseNotes',
  'caseLink',
  'inCase',
  'board',
  'boardNote',
  'thread',
  'pin',
  'mapOf',
  'event',
  'investigator',
  'player',
];

export const EDGE_GROUPS: { key: EdgeKindInfo['group']; label: (w: Words) => string }[] = [
  { key: 'text', label: (w) => `Tussen ${w.entryPlural}` },
  { key: 'case', label: (w) => `Met ${w.casePlural}` },
  { key: 'board', label: (w) => `Op ${w.boardPlural}` },
  { key: 'map', label: (w) => `Op ${w.mapPlural}` },
  { key: 'timeline', label: (w) => `Op ${w.timelinePlural}` },
  { key: 'people', label: (w) => `Met ${w.characterPlural}` },
];

export type NodeKindInfo = {
  label: (words: Words) => string;
  plural: (words: Words) => string;
  icon: string;
  /** The node's own colour when it has no soort to borrow one from. */
  colour: string;
  colourDark: string;
};

export const NODE_KINDS: Record<WebNodeKind, NodeKindInfo> = {
  entry: { label: (w) => w.entry, plural: (w) => w.entryPlural, icon: 'file', colour: '#5C544A', colourDark: '#a49b8a' },
  case: { label: (w) => w.case, plural: (w) => w.casePlural, icon: 'folder', colour: GOLD, colourDark: GOLD_DARK },
  board: { label: (w) => w.board, plural: (w) => w.boardPlural, icon: 'board', colour: RED, colourDark: RED_DARK },
  map: { label: (w) => w.map, plural: (w) => w.mapPlural, icon: 'map', colour: BLUE, colourDark: BLUE_DARK },
  timeline: { label: (w) => w.timeline, plural: (w) => w.timelinePlural, icon: 'timeline', colour: GREEN, colourDark: GREEN_DARK },
  note: { label: (w) => w.note, plural: (w) => `${w.note}s`, icon: 'note', colour: '#8a7f6a', colourDark: '#b3a88f' },
};

export function isWebEdgeKind(value: unknown): value is WebEdgeKind {
  return typeof value === 'string' && value in EDGE_KINDS;
}
