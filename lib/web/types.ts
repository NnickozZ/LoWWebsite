/**
 * §43: het web — the archive drawn as what points at what.
 *
 * Pure types, shared by the server (which builds a graph *for one viewer*) and
 * the browser (which draws it). Nothing in here opens the database, so client
 * components may import it freely.
 *
 * Two shapes carry the whole thing: a **node** is a thing in the archive that
 * has a page (an artikel, a dossier, a landkaart, a prikbord, a tijdlijn) or —
 * only when asked for — a loose notitie on a prikbord; an **edge** is one way
 * one node is tied to another, and its `kind` says *how* ("genoemd in de
 * tekst", "kaart op het prikbord", "speld op de landkaart", …).
 *
 * Every edge is directed from → to, read as "`from` refers to `to`": a dossier
 * *holds* an artikel, a prikbord *shows* a landkaart, an artikel's text *names*
 * another artikel. The focus view draws what points at the focus on the left
 * and what the focus points at on the right, so the direction matters. A draad
 * (`thread`) without a label is the one kind with no natural direction; it is
 * drawn on the right and its `via` names the prikbord it hangs on. A draad
 * *with* a label reads from its from-card to its to-card (round 18).
 *
 * Rule 1 holds here exactly as it does under "Genoemd in": a node this viewer
 * may not open is **not in the graph**, and neither is any edge touching it.
 * Not stamped MISSING, not dimmed — absent. The server builds the graph per
 * viewer and the browser never sees what was left out.
 */

export type WebNodeKind = 'entry' | 'case' | 'map' | 'board' | 'timeline' | 'note';

/** `${kind}:${id}` — a node id that says what table it came from. */
export type WebNodeId = string;

export type WebNode = {
  id: WebNodeId;
  kind: WebNodeKind;
  /** The record's own id (an entry id, a board id, …). For a note: the card id. */
  refId: string;
  name: string;
  /** Where "Openen" goes. A note opens its prikbord. */
  href: string;
  /** Artikel only: the soort, for colour and icon. */
  typeSlug?: string;
  typeLabel?: string;
  typeIcon?: string;
  typeColour?: string;
  /** Artikel only: somebody wears this fiche as a karakter (§18). */
  isCharacter?: boolean;
  /** A picture to show in the panel; never drawn on the canvas. */
  coverAssetId?: string | null;
  /** One line under the name in the panel: a soort, a dossier, a moment. */
  subtitle?: string;
  /** How many edges touch this node in the whole visible graph. */
  degree: number;
  /**
   * Focus graphs only: how many steps from the focus (0 = the focus itself),
   * and on which side it was first reached.
   */
  depth?: number;
  side?: 'in' | 'out';
};

export type WebEdgeKind =
  /** An artikel's text names another artikel (`entry_links`, kind mention). */
  | 'mention'
  /** An artikel's text ties another artikel on with a labelled relation. */
  | 'relation'
  /** An infobox field points at an artikel; `detail` is the field's label. */
  | 'field'
  /** A section of an artikel names another; `detail` is the section's title. */
  | 'section'
  /** A dossier holds an artikel (`case_entries`). */
  | 'filed'
  /** A dossier's working notes name an artikel. */
  | 'caseNotes'
  /** An infobox field points at a dossier; `detail` is the field's label. */
  | 'caseLink'
  /** A prikbord/tijdlijn hangs inside a dossier. */
  | 'inCase'
  /** A card on a prikbord stands for a node (an artikel, a landkaart, a dossier, a tijdlijn). */
  | 'board'
  /** A notitie on a prikbord names an artikel; `detail` is the card's name. */
  | 'boardNote'
  /** A draad on a prikbord between two cards; `detail` is its label, `via` the prikbord. */
  | 'thread'
  /** A speld on a landkaart stands for an artikel or another landkaart; `detail` is a note-speld's name. */
  | 'pin'
  /** A landkaart is the map *of* a place (§23). */
  | 'mapOf'
  /** A gebeurtenis on a tijdlijn is an artikel; `detail` is the moment. */
  | 'event'
  /** A karakter's player is on a dossier's list (§17 grants, §18). */
  | 'investigator'
  /** A "speler" infobox field names a player, drawn as their karakter; `detail` is the label. */
  | 'player';

/** The six colours a draad can have on a prikbord (`STRING_COLOURS` in `lib/boards/merge.ts`). */
export type WebLineColour = 'red' | 'ink' | 'blue' | 'green' | 'gold' | 'violet';

export type WebEdge = {
  id: string;
  from: WebNodeId;
  to: WebNodeId;
  kind: WebEdgeKind;
  /** What to print on the line when someone asks how: a label, a title, a moment. */
  detail: string;
  /** `thread` only: the prikbord the draad hangs on. */
  via?: WebNodeId;
  /**
   * `thread` only (round 18): the colour the draad has on the wall, so the
   * web draws it in that colour rather than the prikbord's red. A labelled
   * draad is read from → to ("A — heeft vermoord → B"); an unlabelled one
   * still has no direction.
   */
  colour?: WebLineColour;
};

export type WebGraph = {
  nodes: WebNode[];
  edges: WebEdge[];
  /** Set on a focus graph. */
  focus?: WebNodeId;
  depth?: number;
  /** True when a cap was hit and something was left out. */
  truncated?: boolean;
};

export const WEB_DEPTH_MIN = 1;
export const WEB_DEPTH_MAX = 4;
export const WEB_DEPTH_DEFAULT = 1;

/** A hard ceiling on a focus graph, so a hub at depth 4 cannot ship the whole archive twice. */
export const WEB_FOCUS_NODE_LIMIT = 600;

export function webNodeId(kind: WebNodeKind, refId: string): WebNodeId {
  return `${kind}:${refId}`;
}

export function parseWebNodeId(id: string): { kind: WebNodeKind; refId: string } | null {
  const colon = id.indexOf(':');
  if (colon <= 0) return null;
  const kind = id.slice(0, colon);
  const refId = id.slice(colon + 1);
  if (!refId) return null;
  if (!['entry', 'case', 'map', 'board', 'timeline', 'note'].includes(kind)) return null;
  return { kind: kind as WebNodeKind, refId };
}
