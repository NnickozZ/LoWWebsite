import { and, eq, inArray, isNull } from 'drizzle-orm';
import { viewableCondition } from '@/lib/access';
import { db, schema } from '@/lib/db';
import type { FieldDef } from '@/lib/db/schema';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { cardRef, normaliseState, type BoardCard } from '@/lib/boards/merge';
import { visibleMapCondition } from '@/lib/maps/visibility';
import { extractEntryLinks } from './doc';
import { listTimelines } from '@/lib/timelines/service';
import { canSeeSection, visibleEntryCondition, type Viewer } from './visibility';

/**
 * §27: "Genoemd in", for the places that are not another artikel's body.
 *
 * `entry_links` answers one question — which *artikel* points at this one —
 * and it stays exactly that. But an artikel is named in a dossier's working
 * notes, in another artikel's infobox ("Huidige houder: Jan Vermeer"), on a
 * card pinned to a prikbord and on a speld stuck in a landkaart, and until now
 * none of those said so anywhere. `entry_mentions` is the same idea with a
 * source that is not a body document.
 *
 * Two properties carry the whole design.
 *
 * 1. **Derived, never authored.** Exactly like `entry_links`, every row is
 *    rebuilt from the source document on each save: `recomputeMentions` wipes
 *    everything that source said before and writes what it says now. Nothing
 *    edits a row, nothing adds one by hand, so the table cannot drift into
 *    claiming a mention the text does not make. It also means the table is
 *    disposable — `rebuildAllMentions()` can throw it away and build it again
 *    from the archive, which is how an existing archive gets filled in.
 *
 * 2. **Nothing comes out of it without the reader's own rule for whatever
 *    `fromKind` names.** A dossier through `visibleCaseCondition`, an artikel
 *    (a field, a section) through `visibleEntryCondition`, a prikbord through
 *    the same two conditions `getBoard` applies, a section through
 *    `canSeeSection`. A mention the reader may not follow is not returned at
 *    all — not returned and hidden in the markup, not stamped MISSING. §24
 *    already worried about exactly this shape of leak: "there is an
 *    investigation you cannot see, and it is about you" gives the
 *    investigation away in one line, and a MISSING row would give it away just
 *    as loudly as a named one. Rule 1, on a table rule 1 had not reached yet.
 */

export type MentionKind = 'case' | 'board' | 'map' | 'timeline' | 'field' | 'section';

/** One thing a source says: which artikel, and what to print after the source. */
export type MentionTarget = { toEntryId: string; detail?: string };

/** A mention resolved for one reader: everything the page needs, nothing else. */
export type Mention = {
  kind: MentionKind;
  /** The dossier / prikbord / landkaart / artikel it sits in. */
  id: string;
  href: string;
  name: string;
  /** A field's label, a card's name, a section's title. May be empty. */
  detail: string;
};

/* ------------------------------------------------------------ the writes */

/**
 * Replaces everything this source said about any artikel with what it says
 * now. Targets that do not exist are dropped — a card can point at an artikel
 * somebody has since destroyed, and a row pointing at nothing would be a row
 * nobody could ever explain.
 *
 * Written through the ORM on purpose (rule 16): `lib/live/changes.ts` reads
 * the statement and publishes `entry:{id}` for each artikel whose "Genoemd in"
 * just changed, so a page open on the mentioned artikel refreshes itself.
 */
export function recomputeMentions(
  fromKind: MentionKind,
  fromId: string,
  targets: MentionTarget[],
): void {
  db.delete(schema.entryMentions)
    .where(and(eq(schema.entryMentions.fromKind, fromKind), eq(schema.entryMentions.fromId, fromId)))
    .run();

  // Dedupe on the primary key the table already has, so one save can never
  // hand SQLite the same row twice.
  const wanted = new Map<string, { toEntryId: string; detail: string }>();
  for (const target of targets) {
    if (!target.toEntryId || target.toEntryId === fromId) continue;
    const detail = (target.detail ?? '').trim().slice(0, 200);
    wanted.set(`${target.toEntryId}\u0000${detail}`, { toEntryId: target.toEntryId, detail });
  }
  if (!wanted.size) return;

  const ids = [...new Set([...wanted.values()].map((row) => row.toEntryId))];
  const existing = new Set(
    db
      .select({ id: schema.entries.id })
      .from(schema.entries)
      .where(inArray(schema.entries.id, ids))
      .all()
      .map((row) => row.id),
  );

  const rows = [...wanted.values()]
    .filter((row) => existing.has(row.toEntryId))
    .map((row) => ({ toEntryId: row.toEntryId, fromKind, fromId, detail: row.detail }));
  if (rows.length) db.insert(schema.entryMentions).values(rows).onConflictDoNothing().run();
}

/* ------------------------------------------- reading a source for targets */

/**
 * The artikel ids an infobox field value points at, in every shape such a
 * field has ever been written in — one ref, a list of refs, a bare id, a list
 * of ids. The twin of `caseIdsIn` in `caseFields.ts`, and here for the same
 * reason: a Keeper who changes a field from `entry_link` to `entry_links`
 * should not lose what was in it.
 */
export function entryIdsIn(value: unknown): string[] {
  const one = (item: unknown): string | null => {
    if (typeof item === 'string') return item || null;
    if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      return (item as { id: string }).id || null;
    }
    return null;
  };
  if (Array.isArray(value)) return value.map(one).filter((id): id is string => Boolean(id));
  const single = one(value);
  return single ? [single] : [];
}

/**
 * Every artikel an infobox points at, with the *label* of the field that
 * points there — "Huidige houder", not `holder`. The label is what a person
 * reads on the page, so it is what the mention prints.
 */
export function fieldMentionsIn(
  fields: FieldDef[],
  values: Record<string, unknown>,
): MentionTarget[] {
  return fields.flatMap((field) =>
    field.kind === 'entry_link' || field.kind === 'entry_links'
      ? entryIdsIn(values[field.key]).map((toEntryId) => ({ toEntryId, detail: field.label }))
      : [],
  );
}

/**
 * Plain text is not a document, so it has no `entryLink` nodes to read. A card
 * on a wall and a speld on a landkaart are typed into a plain box, and what
 * people type there is the archive's own shorthand: `[[Naam]]` or `@Naam`,
 * the two triggers the rich editor answers to and the two the placeholders
 * teach. So that is what is read back out.
 *
 * The match is on the artikel's whole name and is exact — no fuzzy matching,
 * no prefixes — because a mention is a claim about what the text says, and a
 * near-miss claim is worse than none. After `@`, the longest run of words that
 * *is* a name wins, so "@Jan Vermeer kwam langs" finds Jan Vermeer and not Jan.
 */
export function entryIdsInText(text: string, byName: ReadonlyMap<string, string>): string[] {
  if (!byName.size) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const span of mentionSpans(text, byName)) {
    if (!span.entryId || seen.has(span.entryId)) continue;
    seen.add(span.entryId);
    out.push(span.entryId);
  }
  return out;
}

/**
 * One piece of shorthand where it stands in the text. Round 21: the reading
 * above used to throw the positions away, because the only question was which
 * artikelen a save mentions. A browser asks the other half of the same
 * question — *where* in this text, so it can print a chip there — and the two
 * answers may never disagree, so there is one reading and `entryIdsInText`
 * is now a view of it.
 *
 * `entryId` is null for a `[[Naam]]` that matches nothing: the brackets are a
 * claim the writer made, and a claim that does not land is worth showing as
 * not landing. A bare `@` that matches nothing is not a span at all — it is
 * an e-mail address, a handle, a price, prose.
 */
export type MentionSpan = {
  /** Index of the first character of the shorthand in the text. */
  start: number;
  /** Index one past its last character. */
  end: number;
  /** The name as the text spells it, without brackets or `@`. */
  name: string;
  /** What it means on the archive-wide index; null when no name matches. */
  entryId: string | null;
};

/** Where the n-th whitespace-separated word of `rest` ends, counted in `rest`. */
function endOfWord(rest: string, n: number): number {
  const word = /\S+/g;
  let end = 0;
  for (let i = 0; i < n; i++) {
    const m = word.exec(rest);
    if (!m) break;
    end = m.index + m[0].length;
  }
  return end;
}

export function mentionSpans(text: string, byName: ReadonlyMap<string, string>): MentionSpan[] {
  if (!text) return [];
  const spans: MentionSpan[] = [];
  const idFor = (name: string) => byName.get(name.trim().toLowerCase()) ?? null;

  for (const match of text.matchAll(/\[\[([^\]\n]{1,120})\]\]/g)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length, name: match[1].trim(), entryId: idFor(match[1]) });
  }

  /*
   * The `@` scan walks the text one `@` at a time rather than matching a
   * hundred and twenty characters at once, which is what it used to do — and
   * which quietly meant that only the first `@` of every such window was ever
   * read: "@Jan en @Piet" found Jan and lost Piet. Each `@` now gets its own
   * look, and the scan resumes after whatever it took.
   */
  for (let at = text.indexOf('@'); at !== -1; at = text.indexOf('@', at + 1)) {
    if (spans.some((s) => at >= s.start && at < s.end)) continue;
    const line = text.slice(at + 1, at + 1 + 120).split('\n')[0];
    const words = line.split(/\s+/).filter(Boolean).slice(0, 8);
    // Longest first: a name is allowed to contain another name.
    for (let n = words.length; n > 0; n--) {
      // Trailing punctuation belongs to the sentence, not to the name.
      const raw = words.slice(0, n).join(' ');
      const candidate = raw.replace(/[.,;:!?)\]}'"]+$/, '');
      const id = idFor(candidate);
      if (!id) continue;
      const end = at + 1 + endOfWord(line, n) - (raw.length - candidate.length);
      spans.push({ start: at, end, name: candidate, entryId: id });
      at = end - 1;
      break;
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

/**
 * The same text with the brackets taken off — what a canvas prints, where a
 * chip cannot live: a knot's name in the web, the short description in its
 * panel. `@Naam` is left exactly as typed; it reads as a name already, and
 * without the index the browser cannot tell where it ends anyway.
 */
export function plainMentions(text: string): string {
  return text.replace(/\[\[([^\]\n]{1,120})\]\]/g, (_, name: string) => name.trim());
}

/**
 * Artikel name → id, for the plain-text sources. Names are not unique in this
 * archive (§24 lets two dossiers each hold a "De brief"), so the oldest wins
 * and stays winning — a lookup that changed its mind on a later save would
 * make the table drift, which is the one thing it may not do.
 */
export function entryNameIndex(): Map<string, string> {
  const rows = db
    .select({ id: schema.entries.id, name: schema.entries.name })
    .from(schema.entries)
    .where(isNull(schema.entries.deletedAt))
    .orderBy(schema.entries.createdAt, schema.entries.id)
    .all();
  const out = new Map<string, string>();
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    if (key && !out.has(key)) out.set(key, row.id);
  }
  return out;
}

/**
 * One span, ready for a browser to print: a chip that opens the artikel, or a
 * dead one that does not.
 *
 * The name is resolved on the *archive-wide* index and only then held against
 * `visibleEntryCondition`, never resolved on a smaller index of its own. That
 * order is the whole point. A name means one artikel — the oldest that carries
 * it, the same one `entry_mentions` recorded — and a reader who may not open
 * that one is told nothing else; resolving on "the artikelen you may see"
 * would hand a player a *different* "De brief" than the one the writer meant,
 * and the chip would lie about what the sentence says.
 *
 * Rule 1 of this file (nothing comes out without the reader's own rule) is
 * kept: no id, no name, no slug of an artikel the reader may not see ever
 * leaves here. What is left behind is a dead chip — which is exactly what a
 * plain typo leaves too, so the two cannot be told apart, and the name in the
 * sentence was the writer's to show either way.
 */
export type ResolvedMention = {
  start: number;
  end: number;
  name: string;
  /** Null for a name that matches nothing this reader may open. */
  entryId: string | null;
  slug: string | null;
  icon: string | null;
  colour: string | null;
};

export function resolveMentions(viewer: Viewer, texts: string[]): ResolvedMention[][] {
  const byName = entryNameIndex();
  const perText = texts.map((text) => mentionSpans(text, byName));
  const wanted = [...new Set(perText.flat().map((s) => s.entryId).filter((id): id is string => Boolean(id)))];
  const rows = wanted.length
    ? db
        .select({
          id: schema.entries.id,
          slug: schema.entries.slug,
          name: schema.entries.name,
          icon: schema.entryTypes.icon,
          colour: schema.entryTypes.colour,
        })
        .from(schema.entries)
        .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
        .where(and(inArray(schema.entries.id, wanted), visibleEntryCondition(viewer)))
        .all()
    : [];
  const open = new Map(rows.map((row) => [row.id, row]));
  return perText.map((spans) =>
    spans.map((span) => {
      const row = span.entryId ? open.get(span.entryId) : undefined;
      return {
        start: span.start,
        end: span.end,
        name: span.name,
        entryId: row ? row.id : null,
        slug: row ? row.slug : null,
        icon: row ? row.icon : null,
        colour: row ? row.colour : null,
      };
    }),
  );
}

/* ------------------------------------------------- one source at a time */

/**
 * A dossier's working notes. Reads the stored document rather than the patch,
 * so it does not matter whether the save came from the Yjs room or from a
 * plain PATCH — rule 13: hook the service, not the room.
 */
export function recomputeCaseMentions(caseId: string): void {
  const row = db
    .select({ notes: schema.cases.notes })
    .from(schema.cases)
    .where(eq(schema.cases.id, caseId))
    .get();
  const targets = row ? extractEntryLinks(row.notes).map((toEntryId) => ({ toEntryId })) : [];
  recomputeMentions('case', caseId, targets);
}

/** One artikel's infobox: every `entry_link` / `entry_links` field it fills in. */
export function recomputeFieldMentions(entryId: string): void {
  const row = db
    .select({ fields: schema.entries.fields, typeFields: schema.entryTypes.fields })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(eq(schema.entries.id, entryId))
    .get();
  const targets = row
    ? fieldMentionsIn(row.typeFields ?? [], (row.fields ?? {}) as Record<string, unknown>)
    : [];
  recomputeMentions('field', entryId, targets);
}

/**
 * Every section of one artikel, in one go. The source is the *artikel*, not
 * the section — one row per (artikel, section title) — so a save of any one
 * section has to rebuild all of them or the ones it did not touch would be
 * wiped. Which section a title belongs to is settled again at read time,
 * behind `canSeeSection`.
 */
export function recomputeSectionMentions(entryId: string): void {
  const sections = db
    .select({ title: schema.entrySections.title, body: schema.entrySections.body })
    .from(schema.entrySections)
    .where(eq(schema.entrySections.entryId, entryId))
    .all();
  const targets = sections.flatMap((section) =>
    extractEntryLinks(section.body).map((toEntryId) => ({ toEntryId, detail: section.title })),
  );
  recomputeMentions('section', entryId, targets);
}

/**
 * A prikbord. An `entry` card stands for its artikel outright, so it prints
 * nothing after the board's name — the card's own name is a copy of the
 * artikel's, and repeating the page you are already on says nothing. A
 * `note` card is the card's own writing, so it prints the card's name; so
 * does the scribble under an artikel card when it names *another* artikel.
 */
export function recomputeBoardMentions(boardId: string, state?: unknown): void {
  const raw =
    state ??
    db.select({ state: schema.boards.state }).from(schema.boards).where(eq(schema.boards.id, boardId)).get()
      ?.state;
  const cards: BoardCard[] = raw ? normaliseState(raw).cards : [];
  if (!cards.length) {
    recomputeMentions('board', boardId, []);
    return;
  }

  const targets: MentionTarget[] = [];
  for (const card of cards) {
    const ref = cardRef(card);
    if (ref?.kind === 'entry') targets.push({ toEntryId: ref.id });
  }
  // What is written on the wall: a notitie's text, and — round 18 — the
  // scribble under an artikel's own card, which names other artikelen just
  // as readily ("zag @Jan Vermeer bij de sluis"). A card naming its own
  // artikel says nothing new and is skipped.
  const written = cards.filter((card) => card.text && (card.kind === 'note' || cardRef(card)?.kind === 'entry'));
  if (written.length) {
    const byName = entryNameIndex();
    for (const card of written) {
      const own = cardRef(card)?.kind === 'entry' ? cardRef(card)?.id : undefined;
      for (const toEntryId of entryIdsInText(card.text, byName)) {
        if (toEntryId === own) continue;
        targets.push({ toEntryId, detail: card.name });
      }
    }
  }
  recomputeMentions('board', boardId, targets);
}

/** A landkaart: its artikel-spelden, and what its note-spelden say. */
export function recomputeMapMentions(mapId: string): void {
  const pins = db
    .select({
      kind: schema.mapPins.kind,
      entryId: schema.mapPins.entryId,
      name: schema.mapPins.name,
      text: schema.mapPins.text,
    })
    .from(schema.mapPins)
    .where(eq(schema.mapPins.mapId, mapId))
    .all();

  const targets: MentionTarget[] = [];
  for (const pin of pins) {
    if (pin.kind === 'entry' && pin.entryId) targets.push({ toEntryId: pin.entryId });
  }
  const notes = pins.filter((pin) => pin.kind === 'note' && pin.text);
  if (notes.length) {
    const byName = entryNameIndex();
    for (const pin of notes) {
      for (const toEntryId of entryIdsInText(pin.text, byName)) {
        targets.push({ toEntryId, detail: pin.name });
      }
    }
  }
  recomputeMentions('map', mapId, targets);
}

/** §32: a tijdlijn: its artikel gebeurtenissen, and what its notes (and the text under any gebeurtenis) say. */
export function recomputeTimelineMentions(timelineId: string): void {
  const events = db
    .select({
      kind: schema.timelineEvents.kind,
      entryId: schema.timelineEvents.entryId,
      name: schema.timelineEvents.name,
      text: schema.timelineEvents.text,
    })
    .from(schema.timelineEvents)
    .where(eq(schema.timelineEvents.timelineId, timelineId))
    .all();

  const targets: MentionTarget[] = [];
  for (const event of events) {
    if (event.kind === 'entry' && event.entryId) targets.push({ toEntryId: event.entryId });
  }
  const written = events.filter((event) => event.text);
  if (written.length) {
    const byName = entryNameIndex();
    for (const event of written) {
      for (const toEntryId of entryIdsInText(event.text, byName)) {
        targets.push({ toEntryId, detail: event.kind === 'note' ? event.name : '' });
      }
    }
  }
  recomputeMentions('timeline', timelineId, targets);
}

/* ------------------------------------------------------------ the refill */

/**
 * Walks every source and builds the table from scratch.
 *
 * The table starts empty on an archive that already has years of notes in it,
 * and nobody is going to re-save four hundred dossiers by hand to fill it in.
 * Cheap enough to be unremarkable: a campaign wiki is a few hundred rows, and
 * every source is read once.
 */
export function rebuildAllMentions(): { cases: number; entries: number; boards: number; maps: number; timelines: number } {
  const cases = db.select({ id: schema.cases.id }).from(schema.cases).all();
  for (const row of cases) recomputeCaseMentions(row.id);

  const entries = db.select({ id: schema.entries.id }).from(schema.entries).all();
  for (const row of entries) {
    recomputeFieldMentions(row.id);
    recomputeSectionMentions(row.id);
  }

  const boards = db.select({ id: schema.boards.id }).from(schema.boards).all();
  for (const row of boards) recomputeBoardMentions(row.id);

  const maps = db.select({ id: schema.maps.id }).from(schema.maps).all();
  for (const row of maps) recomputeMapMentions(row.id);

  const timelines = db.select({ id: schema.timelines.id }).from(schema.timelines).all();
  for (const row of timelines) recomputeTimelineMentions(row.id);

  return { cases: cases.length, entries: entries.length, boards: boards.length, maps: maps.length, timelines: timelines.length };
}

/**
 * Fills the table in once, at start-up, if it is empty — which it is exactly
 * once per archive, the first time a server carrying §27 opens an older
 * `app.db`. Called from `instrumentation.ts` rather than from the migration,
 * because building it needs `extractEntryLinks`, `normaliseState` and the
 * board's card shape: TypeScript the `.mjs` migration file cannot reach
 * (rule 4), and duplicating any of it there is how two readings of one
 * document start to disagree.
 */
export function ensureMentionsBackfilled(): boolean {
  const any = db.select({ toEntryId: schema.entryMentions.toEntryId }).from(schema.entryMentions).limit(1).get();
  if (!any) {
    rebuildAllMentions();
    return true;
  }
  // Round 18: migration 0019 emptied the walls' rows so the scribbles under
  // artikel cards get read; no board row at all while there are walls means
  // they have not been written back yet. A wall is cheap to read again.
  const anyBoard = db
    .select({ toEntryId: schema.entryMentions.toEntryId })
    .from(schema.entryMentions)
    .where(eq(schema.entryMentions.fromKind, 'board'))
    .limit(1)
    .get();
  if (anyBoard) return false;
  const boards = db.select({ id: schema.boards.id }).from(schema.boards).where(isNull(schema.boards.deletedAt)).all();
  if (!boards.length) return false;
  for (const board of boards) recomputeBoardMentions(board.id);
  return true;
}

/* ------------------------------------------------------------- the reads */

/**
 * Everything that mentions this artikel and is *not* another artikel's body —
 * already resolved to something printable, and already filtered by this
 * reader's own rule for each kind. See the note at the top of this file: a
 * mention the reader may not follow does not come back at all.
 */
export function listMentions(entryId: string, viewer: Viewer): Mention[] {
  const rows = db
    .select({
      kind: schema.entryMentions.fromKind,
      fromId: schema.entryMentions.fromId,
      detail: schema.entryMentions.detail,
    })
    .from(schema.entryMentions)
    .where(eq(schema.entryMentions.toEntryId, entryId))
    .all();
  if (!rows.length) return [];

  const idsOf = (kind: MentionKind) => [
    ...new Set(rows.filter((row) => row.kind === kind).map((row) => row.fromId)),
  ];
  const out: Mention[] = [];

  /* Dossiers — `visibleCaseCondition`, like every other read of one. */
  const caseIds = idsOf('case');
  if (caseIds.length) {
    const found = new Map(
      db
        .select({ id: schema.cases.id, name: schema.cases.name, slug: schema.cases.slug })
        .from(schema.cases)
        .where(and(inArray(schema.cases.id, caseIds), visibleCaseCondition(viewer)))
        .all()
        .map((row) => [row.id, row] as const),
    );
    for (const row of rows) {
      const source = row.kind === 'case' ? found.get(row.fromId) : undefined;
      if (source) {
        out.push({ kind: 'case', id: source.id, href: `/c/${source.slug}`, name: source.name, detail: row.detail });
      }
    }
  }

  /*
   * Prikborden — the same two conditions `getBoard` applies, and for the same
   * reason: a board inside a dossier this reader may not open is as invisible
   * as the dossier.
   */
  const boardIds = idsOf('board');
  if (boardIds.length) {
    const boards = db
      .select({ id: schema.boards.id, name: schema.boards.name, caseId: schema.boards.caseId })
      .from(schema.boards)
      .where(
        and(
          inArray(schema.boards.id, boardIds),
          isNull(schema.boards.deletedAt),
          // Round 18: a wall kept out of the web is kept out of here too.
          eq(schema.boards.inWeb, true),
          viewableCondition('board', viewer),
        ),
      )
      .all();
    // The parent dossier, in a second pass — the same two-step `listBoards`
    // makes, and for the same reason: one condition per table, never a
    // hand-written subquery that could quietly stop matching the real rule.
    const parentIds = [...new Set(boards.flatMap((row) => (row.caseId ? [row.caseId] : [])))];
    const openParents = new Set(
      parentIds.length
        ? db
            .select({ id: schema.cases.id })
            .from(schema.cases)
            .where(and(inArray(schema.cases.id, parentIds), visibleCaseCondition(viewer)))
            .all()
            .map((row) => row.id)
        : [],
    );
    const found = new Map(
      boards
        .filter((row) => !row.caseId || openParents.has(row.caseId))
        .map((row) => [row.id, row] as const),
    );
    for (const row of rows) {
      const source = row.kind === 'board' ? found.get(row.fromId) : undefined;
      if (source) {
        out.push({ kind: 'board', id: source.id, href: `/b/${source.id}`, name: source.name, detail: row.detail });
      }
    }
  }

  /*
   * Landkaarten — §40: a landkaart has its own view dial, so this is the map's
   * own rule and nothing else. One this reader may not open, or one taken down,
   * is simply not in the list: naming it under "Genoemd in" would tell them a
   * hidden map mentions this artikel, which is the leak the dial exists to stop.
   */
  const mapIds = idsOf('map');
  if (mapIds.length && viewer) {
    const found = new Map(
      db
        .select({ id: schema.maps.id, name: schema.maps.name, slug: schema.maps.slug })
        .from(schema.maps)
        .where(and(inArray(schema.maps.id, mapIds), visibleMapCondition(viewer)))
        .all()
        .map((row) => [row.id, row] as const),
    );
    for (const row of rows) {
      const source = row.kind === 'map' ? found.get(row.fromId) : undefined;
      if (source) {
        out.push({ kind: 'map', id: source.id, href: `/maps/${source.slug}`, name: source.name, detail: row.detail });
      }
    }
  }

  /*
   * Tijdlijnen — the same two conditions as a prikbord (its own dials and its
   * dossier's), for the same reason; `listTimelines` is the one reader that
   * applies both, so it is asked rather than re-derived here.
   */
  const timelineIds = idsOf('timeline');
  if (timelineIds.length && viewer) {
    const found = new Map(
      listTimelines(viewer)
        .filter((timeline) => timelineIds.includes(timeline.id))
        .map((timeline) => [timeline.id, timeline] as const),
    );
    for (const row of rows) {
      const source = row.kind === 'timeline' ? found.get(row.fromId) : undefined;
      if (source) {
        out.push({ kind: 'timeline', id: source.id, href: `/timelines/${source.slug}`, name: source.name, detail: row.detail });
      }
    }
  }

  /* Artikelen — an infobox field, or one of the artikel's sections. */
  const entryIds = [...new Set([...idsOf('field'), ...idsOf('section')])];
  if (entryIds.length) {
    const found = new Map(
      db
        .select({ id: schema.entries.id, name: schema.entries.name, slug: schema.entries.slug })
        .from(schema.entries)
        .where(and(inArray(schema.entries.id, entryIds), visibleEntryCondition(viewer)))
        .all()
        .map((row) => [row.id, row] as const),
    );

    for (const row of rows) {
      if (row.kind !== 'field') continue;
      const source = found.get(row.fromId);
      if (source) {
        out.push({ kind: 'field', id: source.id, href: `/e/${source.slug}`, name: source.name, detail: row.detail });
      }
    }

    /*
     * A section is the one source whose visibility is finer than its record's:
     * an artikel everyone may read can carry a section only three people have
     * been shown. The row names the artikel and the section's title, so the
     * section itself is found again here — and it has to still *say* it, or a
     * Keeper-only section and a public one that happen to share a title would
     * let the secret one speak through the other's name.
     */
    const sectionSources = rows.filter((row) => row.kind === 'section' && found.has(row.fromId));
    if (sectionSources.length) {
      const sections = db
        .select({
          id: schema.entrySections.id,
          entryId: schema.entrySections.entryId,
          title: schema.entrySections.title,
          body: schema.entrySections.body,
          visibility: schema.entrySections.visibility,
        })
        .from(schema.entrySections)
        .where(inArray(schema.entrySections.entryId, [...new Set(sectionSources.map((row) => row.fromId))]))
        .all();
      const revealed = revealedSectionIds(viewer);

      for (const row of sectionSources) {
        const section = sections.find(
          (candidate) =>
            candidate.entryId === row.fromId &&
            candidate.title === row.detail &&
            canSeeSection(candidate, viewer, revealed, candidate.id) &&
            extractEntryLinks(candidate.body).includes(entryId),
        );
        const source = found.get(row.fromId);
        if (!section || !source) continue;
        out.push({
          kind: 'section',
          id: source.id,
          href: `/e/${source.slug}#section-${section.id}`,
          name: source.name,
          detail: row.detail,
        });
      }
    }
  }

  return out.sort(
    (a, b) => a.name.localeCompare(b.name, 'nl') || a.detail.localeCompare(b.detail, 'nl'),
  );
}

/**
 * Section ids this viewer has been shown. Empty for a Keeper, who sees all.
 * Exported for §43's web, which resolves section mentions by the same rule.
 */
export function revealedSectionIds(viewer: Viewer): Set<string> {
  if (!viewer || viewer.isKeeper) return new Set();
  return new Set(
    db
      .select({ sectionId: schema.entrySectionReveals.sectionId })
      .from(schema.entrySectionReveals)
      .where(eq(schema.entrySectionReveals.userId, viewer.id))
      .all()
      .map((row) => row.sectionId),
  );
}

/* ------------------------------------------------------------ rendering */

/**
 * The groups the block prints, in the order it prints them. A field mention
 * and a section mention both come from an artikel, so they share one group —
 * what differs is only what is printed after the name.
 *
 * `word` is a key into `lib/words.ts` (rule 8): the Keeper renames "dossiers"
 * and this heading follows. `icon` is a name in `components/Icon.tsx`.
 */
export const MENTION_GROUPS: {
  key: string;
  kinds: MentionKind[];
  word: string;
  icon: string;
}[] = [
  { key: 'case', kinds: ['case'], word: 'mentionedInCases', icon: 'folder' },
  { key: 'entry', kinds: ['field', 'section'], word: 'mentionedInEntries', icon: 'file' },
  { key: 'board', kinds: ['board'], word: 'mentionedOnBoards', icon: 'board' },
  { key: 'map', kinds: ['map'], word: 'mentionedOnMaps', icon: 'map' },
  { key: 'timeline', kinds: ['timeline'], word: 'mentionedOnTimelines', icon: 'timeline' },
];

/**
 * The mentions in printing order, with the empty groups already gone — §22's
 * reading face prints what is filled in and leaves the rest out, and an empty
 * group heading is exactly the blank row that rule forbids.
 */
export function groupMentions(
  mentions: Mention[],
): { key: string; word: string; icon: string; items: Mention[] }[] {
  return MENTION_GROUPS.map((group) => ({
    key: group.key,
    word: group.word,
    icon: group.icon,
    items: mentions.filter((mention) => group.kinds.includes(mention.kind)),
  })).filter((group) => group.items.length > 0);
}
