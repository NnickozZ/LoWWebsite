import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { FieldDef } from '@/lib/db/schema';
import { cardRef, isCardEnd, normaliseState, type BoardCard, type BoardState } from '@/lib/boards/merge';
import { listBoards } from '@/lib/boards/service';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { caseIdsIn } from '@/lib/entries/caseFields';
import { extractEntryLinks } from '@/lib/entries/doc';
import { entryIdsIn, plainMentions, revealedSectionIds } from '@/lib/entries/mentions';
import { canSeeSection, visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { sideCondition } from '@/lib/keeper/side';
import { visibleMapCondition } from '@/lib/maps/visibility';
import { listTimelines } from '@/lib/timelines/service';
import { formatWhen } from '@/lib/timelines/time';
import { collapseMentions, degrees } from './slice';
import { webNodeId, type WebEdge, type WebEdgeKind, type WebGraph, type WebLineColour, type WebNode, type WebNodeId } from './types';

/**
 * §43: building the whole web for one viewer.
 *
 * The graph is built in two passes and the order is the design. First every
 * *node* this viewer may open is collected — an artikel through
 * `visibleEntryCondition`, a dossier through `visibleCaseCondition`, a
 * landkaart through `visibleMapCondition`, a prikbord and a tijdlijn through
 * the two listers that already apply both their own dial and their dossier's.
 * Nothing here re-derives a rule: the condition each kind of thing already has
 * is the condition used, so the web can never show more than the page would.
 *
 * Only then are the *edges* read, and every edge is kept only when both of its
 * ends are already in the node map. That one filter is what makes rule 1 hold
 * for the whole graph at once: a node the viewer may not open is not in the
 * map, so nothing can point at it and it can point at nothing — not dimmed,
 * not stamped MISSING, absent. `assertClosed` in the tests checks exactly
 * this, and the final `edges.filter` at the bottom is the guarantee even if a
 * builder above forgets.
 *
 * The sources are the derived tables the archive already keeps — `entry_links`
 * for what a body says, `entry_mentions` (§27) for what a field, a section, a
 * dossier's notes, a card, a speld or a gebeurtenis says — plus the record
 * tables themselves for what *holds* what. Each is read once, whole, and
 * filtered in memory: a campaign archive is a few hundred rows a table, and
 * fifteen bulk reads are cheaper than any per-node question could be.
 *
 * Deliberate limits, so nobody goes looking for a bug:
 * - `listBoards` and `listTimelines` cap at 200, and so does the web.
 * - An investigator edge is drawn for *every* karakter a dossier member holds
 *   (§18), not only the one they are wearing right now — the web is about the
 *   archive, not about who is at the keyboard this minute.
 * - A section edge is kept only when a section with that title is one this
 *   viewer may see *and* still names the target, exactly as "Genoemd in" does.
 */

export type BuildWebOptions = {
  /** Loose notities on prikborden become nodes of their own. */
  notes?: boolean;
  /**
   * Round 18, Keepers only: also spin in the private walls, dossiers,
   * landkaarten and tijdlijnen of *other* people. Off by default: a Keeper
   * may open anything, but a speler's private wall is the speler's thinking,
   * and the Keeper's web is about the archive, not about who is thinking
   * what. The Keeper's own private things, and what is shared with them,
   * are always in. Ignored for a player, whose web never had them.
   */
  othersPrivate?: boolean;
  /**
   * §46: build the graph out of *both* sides of the archive.
   *
   * The whole web is a list like any other and is read from the side the
   * viewer is standing on. A **focus** web is not: it is about one record and
   * its ties deliberately cross the two sides, so `app/api/web/route.ts` sets
   * this whenever `?focus=` is given.
   */
  bothSides?: boolean;
};

type NodeMap = Map<WebNodeId, WebNode>;

/** How long a nameless notitie's first line may be, as its name on the web. */
const NOTE_NAME_LENGTH = 40;

/** The panel's short description: trimmed, and absent rather than empty. */
function summaryOf(text: string | null | undefined): string | undefined {
  const trimmed = (text ?? '').trim();
  return trimmed ? trimmed : undefined;
}

export function buildWebGraph(viewer: Viewer, options: BuildWebOptions = {}): WebGraph {
  const showNotes = Boolean(options.notes);
  /*
   * §46: which side this web is read from. A focus web crosses the two on
   * purpose, so it is built from a viewer with no side at all — `sideCondition`
   * then answers `1 = 1` for every kind and nothing below has to know.
   */
  const sided: Viewer = options.bothSides && viewer ? { ...viewer, side: undefined } : viewer;
  const keeperSide = Boolean(sided?.isKeeper && sided.side === 'keeper');
  /*
   * The containers — dossiers, prikborden, landkaarten, tijdlijnen — are read
   * *as a player* for a Keeper who has not asked for other people's private
   * things: the same dials, minus the Keeper's skeleton key. Artikelen and
   * sections keep the real viewer, so the Keeper's own hidden pages stay.
   *
   * §46: except on the Keeper's own side, where the skeleton key is the whole
   * point. Since §44 the `keeper_only` flag lives *inside* those dials, so
   * reading as a player would leave the Keeper's side of the web without a
   * single dossier, prikbord, landkaart or tijdlijn. The side filter below
   * narrows it back to keeper-only records, which are the Keeper's by
   * definition — nobody else's private thinking can arrive this way.
   */
  const containerViewer: Viewer =
    sided?.isKeeper && !options.othersPrivate && !keeperSide ? { ...sided, isKeeper: false } : sided;
  const nodes: NodeMap = new Map();
  const edges = new Map<string, WebEdge>();

  const put = (node: Omit<WebNode, 'id' | 'degree'>) => {
    const id = webNodeId(node.kind, node.refId);
    nodes.set(id, { ...node, id, degree: 0 });
    return id;
  };
  const has = (kind: WebNode['kind'], refId: string | null | undefined): refId is string =>
    Boolean(refId) && nodes.has(webNodeId(kind, refId as string));
  const add = (kind: WebEdgeKind, from: WebNodeId, to: WebNodeId, detail = '', via?: WebNodeId, colour?: WebLineColour) => {
    if (from === to) return;
    if (!nodes.has(from) || !nodes.has(to)) return;
    const id = `${kind}:${from}>${to}:${detail}${via ? `@${via}` : ''}`;
    if (edges.has(id)) return;
    edges.set(id, { id, from, to, kind, detail, ...(via ? { via } : {}), ...(colour ? { colour } : {}) });
  };

  /* ----------------------------------------------------------- the nodes */

  // §18: who wears which fiche. Read whole — it is a handful of rows — and
  // used three times: the karakter mark, the investigator edge, the player edge.
  const wearers = db
    .select({ userId: schema.userCharacters.userId, entryId: schema.userCharacters.entryId })
    .from(schema.userCharacters)
    .all();
  const characterIds = new Set(wearers.map((row) => row.entryId));
  const charactersOf = new Map<string, string[]>();
  for (const row of wearers) {
    (charactersOf.get(row.userId) ?? charactersOf.set(row.userId, []).get(row.userId)!).push(row.entryId);
  }

  const entryRows = db
    .select({
      id: schema.entries.id,
      name: schema.entries.name,
      slug: schema.entries.slug,
      coverAssetId: schema.entries.coverAssetId,
      coverCrop: schema.entries.coverCrop,
      shortDescription: schema.entries.shortDescription,
      fields: schema.entries.fields,
      typeSlug: schema.entryTypes.slug,
      typeLabel: schema.entryTypes.label,
      typeIcon: schema.entryTypes.icon,
      typeColour: schema.entryTypes.colour,
      typeFields: schema.entryTypes.fields,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(visibleEntryCondition(viewer), sideCondition('entry', sided)))
    .all();
  for (const row of entryRows) {
    put({
      kind: 'entry',
      refId: row.id,
      name: row.name,
      href: `/e/${row.slug}`,
      typeSlug: row.typeSlug,
      typeLabel: row.typeLabel,
      typeIcon: row.typeIcon,
      typeColour: row.typeColour,
      isCharacter: characterIds.has(row.id),
      coverAssetId: row.coverAssetId ?? null,
      coverCrop: row.coverCrop ?? null,
      subtitle: row.typeLabel,
      summary: summaryOf(row.shortDescription),
    });
  }

  const caseRows = db
    .select({
      id: schema.cases.id,
      name: schema.cases.name,
      slug: schema.cases.slug,
      coverAssetId: schema.cases.coverAssetId,
      coverCrop: schema.cases.coverCrop,
      summary: schema.cases.summary,
    })
    .from(schema.cases)
    .where(and(visibleCaseCondition(containerViewer), sideCondition('case', sided)))
    .all();
  const caseNames = new Map<string, string>();
  for (const row of caseRows) {
    caseNames.set(row.id, row.name);
    put({
      kind: 'case',
      refId: row.id,
      name: row.name,
      href: `/c/${row.slug}`,
      coverAssetId: row.coverAssetId ?? null,
      coverCrop: row.coverCrop ?? null,
      summary: summaryOf(row.summary),
    });
  }

  // Round 18: a wall its manager keeps out of the web is not in it — not as
  // a knot, not as a line, not as the prikbord a draad hangs on.
  // §46: `containerViewer` already carries the side, so `listBoards` and
  // `listTimelines` below apply it themselves — nothing extra to AND in here.
  const boardSummaries = listBoards(containerViewer).filter((board) => board.inWeb);
  const boardStates = new Map<string, BoardState>();
  if (boardSummaries.length) {
    const states = db
      .select({ id: schema.boards.id, state: schema.boards.state })
      .from(schema.boards)
      .where(inArray(schema.boards.id, boardSummaries.map((board) => board.id)))
      .all();
    for (const row of states) boardStates.set(row.id, normaliseState(row.state));
  }
  for (const board of boardSummaries) {
    put({
      kind: 'board',
      refId: board.id,
      name: board.name,
      href: `/b/${board.id}`,
      subtitle: board.caseId ? caseNames.get(board.caseId) : undefined,
    });
  }

  const mapRows = db
    .select({
      id: schema.maps.id,
      name: schema.maps.name,
      slug: schema.maps.slug,
      entryId: schema.maps.entryId,
      description: schema.maps.description,
    })
    .from(schema.maps)
    .where(and(visibleMapCondition(containerViewer), sideCondition('map', sided)))
    .all();
  const entryNames = new Map(entryRows.map((row) => [row.id, row.name] as const));
  for (const row of mapRows) {
    put({
      kind: 'map',
      refId: row.id,
      name: row.name,
      href: `/maps/${row.slug}`,
      subtitle: row.entryId ? entryNames.get(row.entryId) : undefined,
      summary: summaryOf(row.description),
    });
  }

  const timelineRows = listTimelines(containerViewer);
  for (const row of timelineRows) {
    put({
      kind: 'timeline',
      refId: row.id,
      name: row.name,
      href: `/timelines/${row.slug}`,
      subtitle: row.caseId ? caseNames.get(row.caseId) : undefined,
      summary: summaryOf(row.description),
    });
  }

  // Notities: a card that is somebody's own writing, on a wall this viewer may
  // open. Only when asked for — the global web is about the records.
  if (showNotes) {
    for (const board of boardSummaries) {
      const state = boardStates.get(board.id);
      if (!state) continue;
      for (const card of state.cards) {
        if (!isNoteCard(card)) continue;
        const name = noteName(card);
        if (!name) continue;
        put({ kind: 'note', refId: card.id, name, href: `/b/${board.id}`, subtitle: board.name });
      }
    }
  }

  /* --------------------------------------------- what a body says (entry_links) */

  for (const row of db
    .select({
      from: schema.entryLinks.fromEntryId,
      to: schema.entryLinks.toEntryId,
      kind: schema.entryLinks.kind,
      label: schema.entryLinks.label,
    })
    .from(schema.entryLinks)
    .all()) {
    if (!has('entry', row.from) || !has('entry', row.to)) continue;
    add(
      row.kind === 'relation' ? 'relation' : 'mention',
      webNodeId('entry', row.from),
      webNodeId('entry', row.to),
      row.kind === 'relation' ? row.label : '',
    );
  }

  /* ------------------------------------- what everything else says (entry_mentions) */

  const mentionRows = db
    .select({
      fromKind: schema.entryMentions.fromKind,
      fromId: schema.entryMentions.fromId,
      toEntryId: schema.entryMentions.toEntryId,
      detail: schema.entryMentions.detail,
    })
    .from(schema.entryMentions)
    .all()
    .filter((row) => has('entry', row.toEntryId));

  const sectionSources = [
    ...new Set(mentionRows.filter((row) => row.fromKind === 'section' && has('entry', row.fromId)).map((row) => row.fromId)),
  ];
  const sections = sectionSources.length
    ? db
        .select({
          id: schema.entrySections.id,
          entryId: schema.entrySections.entryId,
          title: schema.entrySections.title,
          body: schema.entrySections.body,
          visibility: schema.entrySections.visibility,
        })
        .from(schema.entrySections)
        .where(inArray(schema.entrySections.entryId, sectionSources))
        .all()
    : [];
  const revealed = sectionSources.length ? revealedSectionIds(viewer) : new Set<string>();
  // Which section a title belongs to is settled here, behind `canSeeSection`,
  // and the section has to still *say* it — a Keeper-only section and a public
  // one sharing a title must not let the secret one speak through the other.
  const sectionSays = (entryId: string, title: string, target: string) =>
    sections.some(
      (section) =>
        section.entryId === entryId &&
        section.title === title &&
        canSeeSection(section, viewer, revealed, section.id) &&
        extractEntryLinks(section.body).includes(target),
    );

  for (const row of mentionRows) {
    const to = webNodeId('entry', row.toEntryId);
    switch (row.fromKind) {
      case 'field':
        if (has('entry', row.fromId)) add('field', webNodeId('entry', row.fromId), to, row.detail);
        break;
      case 'section':
        if (has('entry', row.fromId) && sectionSays(row.fromId, row.detail, row.toEntryId)) {
          add('section', webNodeId('entry', row.fromId), to, row.detail);
        }
        break;
      case 'case':
        if (has('case', row.fromId)) add('caseNotes', webNodeId('case', row.fromId), to, '');
        break;
      case 'board':
        // An empty detail is an entry card, which the `board` edge below draws.
        if (row.detail && has('board', row.fromId)) add('boardNote', webNodeId('board', row.fromId), to, row.detail);
        break;
      case 'map':
        // An empty detail is an artikel-speld, which `map_pins` below draws.
        if (row.detail && has('map', row.fromId)) add('pin', webNodeId('map', row.fromId), to, row.detail);
        break;
      case 'timeline':
        // An empty detail is an artikel gebeurtenis, drawn from `timeline_events`.
        if (row.detail && has('timeline', row.fromId)) add('event', webNodeId('timeline', row.fromId), to, row.detail);
        break;
    }
  }

  /* -------------------------------------------------------------- dossiers */

  for (const row of db
    .select({ caseId: schema.caseEntries.caseId, entryId: schema.caseEntries.entryId })
    .from(schema.caseEntries)
    .all()) {
    if (has('case', row.caseId) && has('entry', row.entryId)) {
      add('filed', webNodeId('case', row.caseId), webNodeId('entry', row.entryId));
    }
  }

  for (const row of entryRows) {
    const from = webNodeId('entry', row.id);
    const values = (row.fields ?? {}) as Record<string, unknown>;
    for (const { caseId, label } of caseLinksInFields(row.typeFields ?? [], values)) {
      if (has('case', caseId)) add('caseLink', from, webNodeId('case', caseId), label);
    }
  }

  for (const board of boardSummaries) {
    if (has('case', board.caseId)) add('inCase', webNodeId('case', board.caseId), webNodeId('board', board.id));
  }
  for (const timeline of timelineRows) {
    if (has('case', timeline.caseId)) add('inCase', webNodeId('case', timeline.caseId), webNodeId('timeline', timeline.id));
  }

  /* ------------------------------------------------------------ prikborden */

  for (const board of boardSummaries) {
    const state = boardStates.get(board.id);
    if (!state) continue;
    const boardNode = webNodeId('board', board.id);
    const cardNode = new Map<string, WebNodeId>();
    for (const card of state.cards) {
      const ref = cardRef(card);
      if (ref) {
        if (!has(ref.kind, ref.id)) continue;
        const target = webNodeId(ref.kind, ref.id);
        cardNode.set(card.id, target);
        add('board', boardNode, target);
      } else if (showNotes && isNoteCard(card) && has('note', card.id)) {
        cardNode.set(card.id, webNodeId('note', card.id));
      }
    }
    for (const string of state.strings) {
      if (!isCardEnd(string.from) || !isCardEnd(string.to)) continue;
      const from = cardNode.get(string.from.card);
      const to = cardNode.get(string.to.card);
      if (!from || !to) continue;
      add('thread', from, to, string.label, boardNode, string.colour);
    }
  }

  /* ----------------------------------------------------------- landkaarten */

  for (const row of mapRows) {
    if (has('entry', row.entryId)) add('mapOf', webNodeId('map', row.id), webNodeId('entry', row.entryId));
  }
  for (const pin of db
    .select({
      mapId: schema.mapPins.mapId,
      kind: schema.mapPins.kind,
      entryId: schema.mapPins.entryId,
      targetMapId: schema.mapPins.targetMapId,
    })
    .from(schema.mapPins)
    .all()) {
    if (!has('map', pin.mapId)) continue;
    const from = webNodeId('map', pin.mapId);
    if (pin.kind === 'entry' && has('entry', pin.entryId)) add('pin', from, webNodeId('entry', pin.entryId));
    // §39: the target landkaart is asked its own dial, by being in the map or not.
    if (pin.kind === 'map' && has('map', pin.targetMapId)) add('pin', from, webNodeId('map', pin.targetMapId));
  }

  /* ------------------------------------------------------------- tijdlijnen */

  for (const event of db
    .select({
      timelineId: schema.timelineEvents.timelineId,
      kind: schema.timelineEvents.kind,
      entryId: schema.timelineEvents.entryId,
      at: schema.timelineEvents.at,
      precision: schema.timelineEvents.precision,
    })
    .from(schema.timelineEvents)
    .all()) {
    if (event.kind !== 'entry' || !has('timeline', event.timelineId) || !has('entry', event.entryId)) continue;
    add('event', webNodeId('timeline', event.timelineId), webNodeId('entry', event.entryId), formatWhen(event.at, event.precision));
  }

  /* ---------------------------------------------------------------- people */

  // The same grant query `listCaseMembers` makes, for every visible dossier at
  // once. A member's karakters that this viewer may open stand on the dossier.
  for (const grant of db
    .select({ caseId: schema.accessGrants.targetId, userId: schema.accessGrants.userId })
    .from(schema.accessGrants)
    .where(and(eq(schema.accessGrants.targetType, 'case'), eq(schema.accessGrants.canView, true)))
    .all()) {
    if (!has('case', grant.caseId)) continue;
    for (const characterId of charactersOf.get(grant.userId) ?? []) {
      if (has('entry', characterId)) add('investigator', webNodeId('entry', characterId), webNodeId('case', grant.caseId));
    }
  }

  for (const row of entryRows) {
    const from = webNodeId('entry', row.id);
    const values = (row.fields ?? {}) as Record<string, unknown>;
    for (const field of row.typeFields ?? []) {
      if (field.kind !== 'user_link') continue;
      for (const userId of entryIdsIn(values[field.key])) {
        for (const characterId of charactersOf.get(userId) ?? []) {
          if (has('entry', characterId)) add('player', from, webNodeId('entry', characterId), field.label);
        }
      }
    }
  }

  /* ----------------------------------------------------------- the closing */

  // Rule 1, once more and for everything above: no edge leaves the node map.
  // Round 18: a text line yields to any other tie between the same two knots.
  const edgeList = collapseMentions([...edges.values()].filter((edge) => nodes.has(edge.from) && nodes.has(edge.to)));
  const nodeList = [...nodes.values()];
  const graph: WebGraph = { nodes: nodeList, edges: edgeList };
  const degree = degrees(graph);
  for (const node of nodeList) node.degree = degree.get(node.id) ?? 0;
  return graph;
}

/* -------------------------------------------------------------- helpers */

/** A notitie: the card's own writing. `photo` is the name it had before §8's rename. */
function isNoteCard(card: Pick<BoardCard, 'kind'>): boolean {
  return card.kind === 'note' || card.kind === 'photo';
}

/**
 * What a notitie is called on the web: its name, or the start of its text.
 * Round 21: without its brackets. A knot's name is drawn on a canvas, which
 * has no room for a chip, so `[[Jan Vermeer]]` would be printed as its own
 * punctuation; the panel's short description keeps the shorthand, because
 * there `MentionText` turns it into a chip.
 */
export function noteName(card: Pick<BoardCard, 'name' | 'text'>): string {
  const name = plainMentions((card.name ?? '').trim());
  if (name) return name;
  const text = plainMentions((card.text ?? '').trim()).replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length > NOTE_NAME_LENGTH ? `${text.slice(0, NOTE_NAME_LENGTH).trimEnd()}…` : text;
}

/**
 * Every dossier an infobox points at, with the *label* of the field that
 * points there — the twin of `caseIdsInFields`, which returns only the ids
 * because the field page needs nothing more. The web prints the label on the
 * line ("infobox: Zaak"), so it needs both.
 */
export function caseLinksInFields(
  fields: FieldDef[],
  values: Record<string, unknown>,
): { caseId: string; label: string }[] {
  return fields.flatMap((field) =>
    field.kind === 'case_link' || field.kind === 'case_links'
      ? caseIdsIn(values[field.key]).map((caseId) => ({ caseId, label: field.label }))
      : [],
  );
}
