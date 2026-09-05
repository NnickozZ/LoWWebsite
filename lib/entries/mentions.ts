import { and, eq, inArray, isNull } from 'drizzle-orm';
import { viewableCondition } from '@/lib/access';
import { db, schema } from '@/lib/db';
import type { FieldDef } from '@/lib/db/schema';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { cardRef, normaliseState, type BoardCard } from '@/lib/boards/merge';
import { extractEntryLinks } from './doc';
import { canSeeSection, visibleEntryCondition, type Viewer } from './visibility';

/**
 * §27: "Genoemd in", for the four places that are not another artikel's body.
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

export type MentionKind = 'case' | 'board' | 'map' | 'field' | 'section';

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
  if (!text || !byName.size) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const take = (name: string) => {
    const id = byName.get(name.trim().toLowerCase());
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };

  for (const match of text.matchAll(/\[\[([^\]\n]{1,120})\]\]/g)) take(match[1]);

  for (const match of text.matchAll(/@([^\n]{1,120})/g)) {
    const words = match[1].split(/\s+/).filter(Boolean).slice(0, 8);
    // Longest first: a name is allowed to contain another name.
    for (let n = words.length; n > 0; n--) {
      // Trailing punctuation belongs to the sentence, not to the name.
      const candidate = words.slice(0, n).join(' ').replace(/[.,;:!?)\]}'"]+$/, '');
      if (byName.has(candidate.toLowerCase())) {
        take(candidate);
        break;
      }
    }
  }
  return out;
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
 * `note` card is the card's own writing, so it prints the card's name.
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
  const notes = cards.filter((card) => card.kind === 'note' && card.text);
  if (notes.length) {
    const byName = entryNameIndex();
    for (const card of notes) {
      for (const toEntryId of entryIdsInText(card.text, byName)) {
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

/* ------------------------------------------------------------ the refill */

/**
 * Walks every source and builds the table from scratch.
 *
 * The table starts empty on an archive that already has years of notes in it,
 * and nobody is going to re-save four hundred dossiers by hand to fill it in.
 * Cheap enough to be unremarkable: a campaign wiki is a few hundred rows, and
 * every source is read once.
 */
export function rebuildAllMentions(): { cases: number; entries: number; boards: number; maps: number } {
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

  return { cases: cases.length, entries: entries.length, boards: boards.length, maps: maps.length };
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
  if (any) return false;
  rebuildAllMentions();
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

  /* Landkaarten — everyone signed in may open one; a map taken down is gone. */
  const mapIds = idsOf('map');
  if (mapIds.length && viewer) {
    const found = new Map(
      db
        .select({ id: schema.maps.id, name: schema.maps.name, slug: schema.maps.slug })
        .from(schema.maps)
        .where(and(inArray(schema.maps.id, mapIds), isNull(schema.maps.deletedAt)))
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

/** Section ids this viewer has been shown. Empty for a Keeper, who sees all. */
function revealedSectionIds(viewer: Viewer): Set<string> {
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
