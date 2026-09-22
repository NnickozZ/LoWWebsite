import { normaliseCrops } from '@/lib/images/shapes';
import type { FieldDef } from '@/lib/db/schema';

/**
 * §65: a geschiedenis that says *what* changed.
 *
 * Until round 30 the history block under an artikel was a list of rows that each
 * said a name and a time and nothing else — "Iemand · 3 uur geleden", eleven
 * times. Opening one gave a line diff of the prose, which is the only thing it
 * could tell you, so a round of work that renamed the artikel, filled in four
 * infobox fields and pulled the omslag off read exactly like a round that fixed
 * one typo.
 *
 * Nothing new is written to do this. `writeRevision` has always snapshotted the
 * whole artikel — name, first line, body, fields, tags, soort, omslag,
 * zichtbaarheid, Keeper-aantekeningen — so what each revision *did* is the
 * difference between its snapshot and the snapshot of the one before it. This
 * module is that subtraction, and it is pure on purpose: every sentence the
 * history prints is decided here and tested in `tests/unit/revision-diff.test.ts`,
 * not assembled inside a server component.
 *
 * Two rules about what may be said out loud:
 *
 *   1. **Keeper-aantekeningen and zichtbaarheid are the Keeper's.** A speler
 *      never learns that an artikel was once keeper-only, or that there are
 *      notes on it at all, so those two are only described when `showKeeper`.
 *   2. **Nothing is quoted out of an epoch the archive was keeping shut.** A
 *      value, a name, a first line and a tag name are only printed when
 *      *neither* side of the step was `visibility: 'keeper'` — or to a Keeper,
 *      who may read all of it anyway. The page a history hangs under shows the
 *      *current* infobox, so quoting the current epoch's answers tells a reader
 *      nothing they cannot already see; quoting a keeper-only epoch's answers
 *      would hand them a value that was written where they could not look and
 *      taken away before they could. The nouns still appear — "Beroep —
 *      gewijzigd" — because *that an edit happened* is what the row already says
 *      by existing.
 *   3. **A koppeling's names are never printed, only counted.** A field of the
 *      `entry_link(s)` / `case_link(s)` / `user_link` kind holds ids, and
 *      resolving an id to a name here would hand a reader the name of an
 *      artikel the archive may be keeping from them (rule 7). "2 erbij, 1 eraf"
 *      says as much as the history needs to. Plain answers — text, a number, a
 *      date, a keuze — *are* printed, because they stand in the infobox on the
 *      page this history hangs under, so a reader who may read the page may
 *      already read them.
 */

/** The part of a revision snapshot this module compares. */
export type RevisionFacts = {
  name: string;
  shortDescription: string;
  bodyText: string;
  fields: Record<string, unknown>;
  tags: string[];
  typeId: string;
  coverAssetId: string | null;
  coverCrop: unknown;
  visibility: string;
  keeperNotes: string;
};

export type ChangeKind =
  | 'created'
  | 'name'
  | 'short'
  | 'body'
  | 'field'
  | 'tags'
  | 'cover'
  | 'crop'
  | 'type'
  | 'visibility'
  | 'keeperNotes';

/**
 * §68: the lines one revision put in and took out of the prose.
 *
 * `clipped` is true when there were more of either than `BODY_LINES`; the
 * sentence beside it (`detail`) already carries the real totals, so the box
 * only has to say that it is showing a part.
 */
export type BodyLines = { added: string[]; removed: string[]; clipped: boolean };

/**
 * One thing that changed. `label` is the noun ("Naam", "Factie", "Tekst") and
 * `detail` is what happened to it, already a finished Dutch phrase — the caller
 * prints them and never composes.
 *
 * §68: `lines` hangs off the one `body` change and is the *words themselves*.
 * It is absent — not empty — wherever rule 2 of this module's header says the
 * prose may not be quoted, so the page has nothing left to decide.
 */
export type Change = { kind: ChangeKind; label: string; detail?: string; lines?: BodyLines };

export type DescribeOptions = {
  /** The soort's field definitions, for a key's label and its kind. */
  fields?: FieldDef[];
  /** typeId → the soort's label, for an artikel that changed soort. */
  typeLabels?: Map<string, string> | Record<string, string>;
  /** May this reader be told about zichtbaarheid and Keeper-aantekeningen? */
  showKeeper?: boolean;
  /**
   * §95: a short text as *this reader* reads it — its handles turned into the
   * names they may see, and into nothing where they may not (`plainShort`).
   * This module is pure, so the caller brings the reading. Absent: the text as
   * stored, which is only right for a text without chips.
   */
  shortText?: (text: string) => string;
};

const LINK_KINDS = new Set([
  'entry_link',
  'entry_links',
  'case_link',
  'case_links',
  // §66 (round 32): a stamboom is a record with dials of its own, so its name
  // is no more printable in a history than a dossier's.
  'family_tree_link',
  'user_link',
  'map_pin',
]);

const VISIBILITY_WORDS: Record<string, string> = {
  all: 'iedereen',
  players: 'alleen spelers',
  keeper: 'alleen de Keeper',
};

/**
 * Reads one stored snapshot into the shape above. Snapshots are JSON blobs
 * written by a dozen rounds of this app, so every field is treated as missing
 * until proven otherwise — an old row must never throw a page away.
 */
export function revisionFacts(snapshot: unknown): RevisionFacts {
  const raw = (snapshot ?? {}) as Record<string, unknown>;
  const fields = raw.fields;
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    shortDescription: typeof raw.shortDescription === 'string' ? raw.shortDescription : '',
    bodyText: typeof raw.bodyText === 'string' ? raw.bodyText : '',
    fields: fields && typeof fields === 'object' && !Array.isArray(fields)
      ? (fields as Record<string, unknown>)
      : {},
    tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag)) : [],
    typeId: typeof raw.typeId === 'string' ? raw.typeId : '',
    coverAssetId: typeof raw.coverAssetId === 'string' ? raw.coverAssetId : null,
    /*
     * Through `normaliseCrops`, because the *other* side of every comparison is
     * `entries.coverCrop` as drizzle hands it over, which has already been
     * through it (`coverCrops.fromDriver`). A pre-round-19 snapshot holds a bare
     * `{x, y, zoom}` where a round-19 one holds `{portrait: {…}}`, and comparing
     * the two raw reported "bijgesneden" on a revision that never touched the
     * picture.
     */
    coverCrop: normaliseCrops(raw.coverCrop),
    visibility: typeof raw.visibility === 'string' ? raw.visibility : '',
    keeperNotes: typeof raw.keeperNotes === 'string' ? raw.keeperNotes : '',
  };
}

/**
 * The same facts, out of the ten projected columns `listRevisions` selects.
 *
 * `json_extract` hands an object or an array back as JSON *text*, so three of
 * these arrive as strings and are parsed here — and a string that will not parse
 * is treated as absent rather than thrown, because one unreadable row from an
 * old round must not take the artikel's page with it.
 */
export type RevisionColumns = {
  snapName?: string | null;
  snapShort?: string | null;
  snapBodyText?: string | null;
  snapFields?: string | null;
  snapTags?: string | null;
  snapTypeId?: string | null;
  snapCoverAssetId?: string | null;
  snapCoverCrop?: string | null;
  snapVisibility?: string | null;
  snapKeeperNotes?: string | null;
};

function fromJson(value: string | null | undefined): unknown {
  if (typeof value !== 'string' || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function revisionFactsFromRow(row: RevisionColumns): RevisionFacts {
  return revisionFacts({
    name: row.snapName,
    shortDescription: row.snapShort,
    bodyText: row.snapBodyText,
    fields: fromJson(row.snapFields),
    tags: fromJson(row.snapTags),
    typeId: row.snapTypeId,
    coverAssetId: row.snapCoverAssetId,
    coverCrop: fromJson(row.snapCoverCrop),
    visibility: row.snapVisibility,
    keeperNotes: row.snapKeeperNotes,
  });
}

/** `“…”`, shortened in the middle of a word rather than at 30 exactly. */
function quote(value: string, limit = 48): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) return 'leeg';
  if (clean.length <= limit) return `“${clean}”`;
  return `“${clean.slice(0, limit - 1).replace(/\s\S*$/, '')}…”`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * §68: how many lines of a revision's prose travel with the history, and how
 * much of one line.
 *
 * Both caps are about the page rather than the reader: a history holds a
 * hundred revisions and every one of them renders its box into the HTML whether
 * a reader opens it or not, so a save that pasted a chapter in may not put that
 * chapter into every visitor's download. Ten lines and a couple of sentences of
 * each is enough to recognise *which* edit this was, which is the question the
 * box answers; `?rev=` is still there for the whole of it.
 */
const BODY_LINES = 10;
const BODY_LINE_CHARS = 240;

/** The non-empty lines of a text, trimmed, counted. */
function lineCounts(text: string): Map<string, number> {
  const seen = new Map<string, number>();
  for (const line of text.split('\n')) {
    const key = line.trim();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return seen;
}

/**
 * The lines of `text` that `other` has not got a copy of, **in the order they
 * stand in `text`**. Each line of `other` is spent once, so three copies of one
 * sentence against two is one surplus copy and not three.
 */
function surplusLines(text: string, other: Map<string, number>): string[] {
  const spare = new Map(other);
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const key = line.trim();
    if (!key) continue;
    const left = spare.get(key) ?? 0;
    if (left > 0) spare.set(key, left - 1);
    else out.push(key);
  }
  return out;
}

/** What one revision did to the prose: the lines themselves, and the words. */
export type BodyEdit = { added: string[]; removed: string[]; words: number };

/**
 * The prose of one step, as two lists of lines.
 *
 * Deliberately **not** `diffLines`: that is an LCS with a quadratic table, and
 * a page works this out for up to a hundred revisions at once. Lines as two
 * multisets is linear, and since §68 it answers both questions off one pass —
 * *how many* lines came and went, for the sentence on the row, and *which*
 * ones, for the box under it. One pass on purpose: two ways of counting the
 * same edit is two answers that can disagree, and they would disagree in the
 * one place a reader can see both at once.
 *
 * What it gives up against a real diff is the pairing: a line with one word
 * changed reads here as one line off and one line on, not as a line edited.
 * That is honest — both halves are printed — and the whole prose diff against
 * *now* is still one click away under `?rev=`.
 */
export function bodyEdit(before: string, after: string): BodyEdit {
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  return {
    added: surplusLines(after, lineCounts(before)),
    removed: surplusLines(before, lineCounts(after)),
    words: words(after) - words(before),
  };
}

/** `bodyEdit` in one Dutch phrase — what the row itself says. */
export function bodyPhrase(edit: BodyEdit): string {
  if (edit.added.length || edit.removed.length) {
    const parts: string[] = [];
    if (edit.added.length) parts.push(`${plural(edit.added.length, 'regel', 'regels')} erbij`);
    if (edit.removed.length) parts.push(`${plural(edit.removed.length, 'regel', 'regels')} eraf`);
    return parts.join(', ');
  }
  if (edit.words > 0) return `${plural(edit.words, 'woord', 'woorden')} erbij`;
  if (edit.words < 0) return `${plural(-edit.words, 'woord', 'woorden')} eraf`;
  return 'regels verplaatst';
}

/** How much prose moved, in one phrase. */
export function bodyChange(before: string, after: string): string {
  return bodyPhrase(bodyEdit(before, after));
}

/** One line of prose, short enough to stand in a list under a history row. */
function clipLine(line: string): string {
  if (line.length <= BODY_LINE_CHARS) return line;
  return `${line.slice(0, BODY_LINE_CHARS - 1).replace(/\s\S*$/, '')}…`;
}

/** `bodyEdit` cut down to what a history row carries. */
export function bodyLines(edit: BodyEdit): BodyLines {
  return {
    added: edit.added.slice(0, BODY_LINES).map(clipLine),
    removed: edit.removed.slice(0, BODY_LINES).map(clipLine),
    clipped: edit.added.length > BODY_LINES || edit.removed.length > BODY_LINES,
  };
}

/** Everything a field value can be, as a list of strings, for comparing. */
function asList(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  return [String(value)];
}

/** A scalar answer as a person reads it in the infobox. */
function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'ja' : 'nee';
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean).join(', ');
  if (typeof value === 'object') return '';
  return String(value);
}

function sameValue(before: unknown, after: unknown): boolean {
  if (before === after) return true;
  // Absent, null and the empty string are all "not filled in", and a dozen
  // rounds of this app have written all three for the same answer.
  const emptyish = (value: unknown) =>
    value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  if (emptyish(before) && emptyish(after)) return true;
  try {
    return JSON.stringify(before ?? null) === JSON.stringify(after ?? null);
  } catch {
    return false;
  }
}

function fieldChange(
  def: FieldDef | undefined,
  key: string,
  before: unknown,
  after: unknown,
  mayQuote: boolean,
  read: (text: string) => string = (text) => text,
): Change {
  const label = def?.label || key;
  const kind = def?.kind ?? 'text';

  if (LINK_KINDS.has(kind)) {
    // Rule 7: counted, never named. See the header of this module.
    const a = new Set(asList(before));
    const b = new Set(asList(after));
    let added = 0;
    let removed = 0;
    for (const id of b) if (!a.has(id)) added += 1;
    for (const id of a) if (!b.has(id)) removed += 1;
    if (!added && !removed) return { kind: 'field', label, detail: 'gewijzigd' };
    const parts: string[] = [];
    if (added) parts.push(`${added} erbij`);
    if (removed) parts.push(`${removed} eraf`);
    return { kind: 'field', label, detail: parts.join(', ') };
  }

  const from = read(asText(before));
  const to = read(asText(after));
  if (!from && to) return { kind: 'field', label, detail: mayQuote ? `ingevuld: ${quote(to)}` : 'ingevuld' };
  if (from && !to) return { kind: 'field', label, detail: 'leeggemaakt' };
  if (!from && !to) return { kind: 'field', label, detail: 'gewijzigd' };
  if (kind === 'longtext' || !mayQuote) return { kind: 'field', label, detail: 'bijgewerkt' };
  return { kind: 'field', label, detail: `${quote(from)} → ${quote(to)}` };
}

/**
 * What the step from `before` to `after` did. `before` is `null` for the first
 * revision an artikel ever had — there is nothing to subtract from, and the one
 * true thing to say is that it was made.
 */
export function describeRevision(
  before: RevisionFacts | null,
  after: RevisionFacts,
  options: DescribeOptions = {},
): Change[] {
  if (!before) return [{ kind: 'created', label: 'Aangelegd' }];

  const out: Change[] = [];
  const defs = new Map((options.fields ?? []).map((def) => [def.key, def]));
  /*
   * Rule 2 of this module's header. A Keeper reads everything; everybody else
   * reads values only from a step where the artikel stood open on both sides of
   * it. `players` and `all` are both open — `keeper` is the shut one.
   */
  const mayQuote = Boolean(options.showKeeper) || (before.visibility !== 'keeper' && after.visibility !== 'keeper');
  const typeLabel = (id: string) => {
    const labels = options.typeLabels;
    if (!labels) return id;
    const found = labels instanceof Map ? labels.get(id) : labels[id];
    return found || id;
  };

  if (before.name !== after.name) {
    out.push({
      kind: 'name',
      label: 'Naam',
      detail: mayQuote ? `${quote(before.name)} → ${quote(after.name)}` : 'gewijzigd',
    });
  }
  if (before.typeId !== after.typeId) {
    out.push({
      kind: 'type',
      label: 'Soort',
      detail: `${typeLabel(before.typeId)} → ${typeLabel(after.typeId)}`,
    });
  }
  if (before.shortDescription !== after.shortDescription) {
    out.push({
      kind: 'short',
      label: 'Eerste regel',
      detail: !after.shortDescription
        ? 'weggehaald'
        : mayQuote
          ? quote((options.shortText ?? ((text: string) => text))(after.shortDescription))
          : 'gewijzigd',
    });
  }
  if (before.bodyText !== after.bodyText) {
    /*
     * §68: the sentence and the lines under it come off one `bodyEdit`, and the
     * lines are dropped entirely where rule 2 forbids quoting — the phrase
     * ("3 regels erbij") stays, because a count is not a quotation and the row
     * says as much by existing. Nothing is carried for a step where only the
     * order moved: an empty box under an open row reads as a broken one.
     */
    const edit = bodyEdit(before.bodyText, after.bodyText);
    const quotable = mayQuote && (edit.added.length > 0 || edit.removed.length > 0);
    out.push({
      kind: 'body',
      label: 'Tekst',
      detail: bodyPhrase(edit),
      ...(quotable ? { lines: bodyLines(edit) } : {}),
    });
  }

  // The infobox, one line per answer that moved — in the soort's own order, so
  // the history reads top to bottom like the box it describes. Keys the soort
  // no longer has come last, under their bare key, because a value is still a
  // value after the Keeper took its field away.
  const keys: string[] = [];
  for (const def of options.fields ?? []) if (def.key in before.fields || def.key in after.fields) keys.push(def.key);
  for (const key of Object.keys({ ...before.fields, ...after.fields })) {
    if (!defs.has(key) && !keys.includes(key)) keys.push(key);
  }
  for (const key of keys) {
    if (sameValue(before.fields[key], after.fields[key])) continue;
    out.push(fieldChange(defs.get(key), key, before.fields[key], after.fields[key], mayQuote, options.shortText));
  }

  const tagsBefore = new Set(before.tags);
  const tagsAfter = new Set(after.tags);
  const tagsAdded = [...tagsAfter].filter((tag) => !tagsBefore.has(tag));
  const tagsRemoved = [...tagsBefore].filter((tag) => !tagsAfter.has(tag));
  if (tagsAdded.length || tagsRemoved.length) {
    const parts: string[] = [];
    if (tagsAdded.length) parts.push(mayQuote ? `+ ${tagsAdded.join(', ')}` : `${tagsAdded.length} erbij`);
    if (tagsRemoved.length) parts.push(mayQuote ? `− ${tagsRemoved.join(', ')}` : `${tagsRemoved.length} eraf`);
    out.push({ kind: 'tags', label: 'Tags', detail: parts.join(mayQuote ? ' · ' : ', ') });
  }

  if (before.coverAssetId !== after.coverAssetId) {
    out.push({
      kind: 'cover',
      label: 'Omslag',
      detail: !before.coverAssetId ? 'toegevoegd' : !after.coverAssetId ? 'weggehaald' : 'vervangen',
    });
  } else if (!sameValue(before.coverCrop, after.coverCrop)) {
    out.push({ kind: 'crop', label: 'Uitsnede', detail: 'bijgesneden' });
  }

  if (options.showKeeper) {
    if (before.visibility !== after.visibility) {
      out.push({
        kind: 'visibility',
        label: 'Zichtbaar voor',
        detail: `${VISIBILITY_WORDS[before.visibility] ?? before.visibility} → ${
          VISIBILITY_WORDS[after.visibility] ?? after.visibility
        }`,
      });
    }
    if (before.keeperNotes !== after.keeperNotes) {
      // Never the words themselves, not even to a Keeper: this list is built on
      // the server for one page and the page is cached by nobody, but the notes
      // have their own box and this is not it.
      out.push({
        kind: 'keeperNotes',
        label: 'Keeper-aantekeningen',
        detail: !before.keeperNotes ? 'geschreven' : !after.keeperNotes ? 'gewist' : 'bijgewerkt',
      });
    }
  }

  return out;
}

/**
 * The one line a row in the history shows: the nouns, nothing else, so eleven
 * rows can be read down the left edge. `Aangelegd` stands alone.
 *
 * An **empty string** for an empty list, and the caller prints nothing at all.
 * Two different things land there and neither may be announced: a save that
 * touched something no snapshot holds, and — for a reader who is not a Keeper —
 * a save that moved only the zichtbaarheid, whose *value* rule 1 hides. A row
 * reading "geen zichtbare wijziging" would be the tell that the dial moved.
 */
export function changeSummary(changes: Change[]): string {
  if (!changes.length) return '';
  if (changes[0]?.kind === 'created') return 'aangelegd';
  const nouns = changes.map((change) => change.label.toLocaleLowerCase('nl'));
  const shown = nouns.slice(0, 4);
  const rest = nouns.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} en ${rest} meer` : shown.join(', ');
}
