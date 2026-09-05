import { slugify } from '@/lib/slug';

/**
 * §11's page builder.
 *
 * A soort fiche no longer just decides which *fields* an entry has — it decides
 * what its **page** is made of, and in what order. Every block on an entry page
 * is one of these, and the Keeper drags them about in Beheer → Soorten fiches.
 *
 * Five of the kinds are built in and exist exactly once per type; they can be
 * renamed, reordered and hidden, but never removed, so a type can never end up
 * with a page that has nowhere to type. The two interesting ones can be added
 * as often as you like:
 *
 *   `links`    a list you fill by hand — "Bondgenoten", "Vijanden". Its values
 *              live in `entries.fields` under the block's own `key`, so they
 *              save through the ordinary autosave and survive the block being
 *              renamed or removed and put back, exactly like a field does.
 *
 *   `derived`  a list that fills itself — "Leden van deze factie" is every
 *              Personage whose field *Factie* points back here. Nothing is
 *              stored: it is a query, run per page, through
 *              `visibleEntryCondition` like every other read.
 *
 * Pure on purpose — client components import it. The query itself lives in
 * `lib/entries/derived.ts`, which is the half that may open the database.
 */

export type BlockKind =
  | 'fields'
  | 'body'
  | 'sections'
  | 'backlinks'
  | 'history'
  | 'links'
  | 'derived';

export type PageBlock = {
  /** Stable within a type. Never shown; it is what React and the props key on. */
  id: string;
  kind: BlockKind;
  /** The heading. Empty means "use the default for this kind". */
  title?: string;
  /** A line of explanation under the heading, for the players. */
  note?: string;
  /** Starts expanded rather than folded shut. */
  open?: boolean;
  /** Still configured, just not drawn. Built-in blocks are hidden, not deleted. */
  hidden?: boolean;

  /* --- links ------------------------------------------------------------- */
  /** Where the chosen entries live in `entries.fields`. Assigned once, then fixed. */
  key?: string;
  /** Restrict the picker to these type slugs. Empty means anything. */
  ofType?: string[];

  /* --- derived ----------------------------------------------------------- */
  /** Which soorten to look through. Empty means all of them. */
  fromType?: string[];
  /** The field *on those* entries that points back at this one. */
  viaField?: string;
  /** How to order what comes back. */
  sort?: 'name' | 'recent';
};

/** The kinds a Keeper may add more than one of. */
export const ADDABLE_KINDS: { kind: BlockKind; label: string; hint: string }[] = [
  {
    kind: 'derived',
    label: 'Lijst die zichzelf vult',
    hint: 'Alles wat hiernaar verwijst via een veld. Bijvoorbeeld: leden van deze factie.',
  },
  {
    kind: 'links',
    label: 'Lijst die je zelf vult',
    hint: 'Een eigen lijst met een eigen kop. Bijvoorbeeld: bondgenoten.',
  },
];

/** The two orders a derived list offers, and what the picker calls them. */
export const DERIVED_SORTS: { value: 'name' | 'recent'; label: string }[] = [
  { value: 'name', label: 'Op naam' },
  { value: 'recent', label: 'Onlangs bijgewerkt' },
];

/** Built-ins, in the order a page has always had them. */
export const BUILT_IN_KINDS: BlockKind[] = ['fields', 'body', 'sections', 'backlinks', 'history'];

const BUILT_IN = new Set<BlockKind>(BUILT_IN_KINDS);
const ALL_KINDS = new Set<BlockKind>([...BUILT_IN_KINDS, 'links', 'derived']);

/**
 * What each built-in block is called when the Keeper has not renamed it. The
 * words come from Beheer → Woorden, so this takes them rather than hard-coding.
 */
export function defaultBlockTitle(kind: BlockKind, words: Record<string, string>): string {
  switch (kind) {
    case 'fields':
      return words.addMore ?? 'Meer toevoegen';
    case 'body':
      return '';
    case 'sections':
      return words.sectionPlural ? capitaliseFirst(words.sectionPlural) : 'Secties';
    case 'backlinks':
      return words.backlinks ?? 'Genoemd in';
    case 'history':
      return words.history ?? 'Geschiedenis';
    default:
      return '';
  }
}

function capitaliseFirst(word: string) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** The page every soort fiche has until a Keeper rearranges it. */
export function defaultBlocks(): PageBlock[] {
  return BUILT_IN_KINDS.map((kind) => ({ id: kind, kind }));
}

/** A field key that `json_extract` can be handed, and a slug can produce. */
export function isFieldKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9_]{1,60}$/.test(value);
}

/** Turns a heading into the key its values are filed under. */
export function keyForTitle(title: string, taken: ReadonlySet<string>): string {
  const base = `lijst_${slugify(title || 'lijst').replace(/-/g, '_')}`.slice(0, 54);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 200; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

function cleanSlugList(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out = input
    .map((value) => String(value).trim())
    .filter((value) => /^[a-z0-9-]{1,60}$/.test(value))
    .slice(0, 20);
  return out.length ? out : undefined;
}

/**
 * Keeps a saved block list to shapes the page can actually render, and makes
 * sure the five built-ins are all present exactly once — hidden if the Keeper
 * hid them, appended in their usual order if a saved list is missing one. That
 * last rule is what stops a bad save from leaving a type with no body to type
 * in, and it is why `blocks` can be trusted everywhere downstream.
 */
export function cleanBlocks(input: unknown): PageBlock[] {
  const raw = Array.isArray(input) ? input : [];
  const out: PageBlock[] = [];
  const ids = new Set<string>();
  const keys = new Set<string>();
  const seenBuiltIn = new Set<BlockKind>();

  for (const item of raw.slice(0, 24)) {
    if (!item || typeof item !== 'object') continue;
    const block = item as Partial<PageBlock>;
    const kind = block.kind as BlockKind;
    if (!ALL_KINDS.has(kind)) continue;
    if (BUILT_IN.has(kind)) {
      if (seenBuiltIn.has(kind)) continue;
      seenBuiltIn.add(kind);
    }

    let id = typeof block.id === 'string' ? block.id.trim().slice(0, 40) : '';
    if (!id || ids.has(id)) id = `${kind}_${out.length + 1}`;
    while (ids.has(id)) id = `${id}x`;
    ids.add(id);

    const next: PageBlock = { id, kind };
    if (typeof block.title === 'string' && block.title.trim()) {
      next.title = block.title.trim().slice(0, 60);
    }
    if (typeof block.note === 'string' && block.note.trim()) {
      next.note = block.note.trim().slice(0, 200);
    }
    if (block.open) next.open = true;
    if (block.hidden) next.hidden = true;

    if (kind === 'links') {
      // A new list arrives without a key and is given one from its heading —
      // once. From then on the key travels with the block, so renaming the
      // heading never orphans what players already filed under it. Two blocks
      // that somehow claim the same key are separated rather than one being
      // thrown away, because a dropped block loses its contents with it.
      const wanted = isFieldKey(block.key) ? block.key : keyForTitle(next.title ?? '', keys);
      const key = keys.has(wanted) ? keyForTitle(next.title ?? '', keys) : wanted;
      keys.add(key);
      next.key = key;
      const ofType = cleanSlugList(block.ofType);
      if (ofType) next.ofType = ofType;
    }

    if (kind === 'derived') {
      // A derived list with nothing to follow would silently show everything.
      if (!isFieldKey(block.viaField)) continue;
      next.viaField = block.viaField;
      const fromType = cleanSlugList(block.fromType);
      if (fromType) next.fromType = fromType;
      next.sort = block.sort === 'recent' ? 'recent' : 'name';
    }

    out.push(next);
  }

  for (const kind of BUILT_IN_KINDS) {
    if (!seenBuiltIn.has(kind)) out.push({ id: kind, kind });
  }

  return out;
}

/** What a page is made of: the saved list, or the standard page if there is none. */
export function resolveBlocks(input: unknown): PageBlock[] {
  const cleaned = cleanBlocks(input);
  const custom = cleaned.some((block) => !BUILT_IN.has(block.kind));
  const rearranged = Array.isArray(input) && input.length > 0;
  return custom || rearranged ? cleaned : defaultBlocks();
}

/* ------------------------------------------------------ per-type wording */

/**
 * The handful of sentences that read badly when every soort fiche says the
 * same thing. A Locatie asks a different opening question than a Personage.
 */
export type TypeText = {
  /** The grey question under the title of a new entry. */
  descriptionPlaceholder?: string;
  /** The grey line in the big text box. */
  bodyPlaceholder?: string;
  /** What the per-type "Nieuw" button says. */
  newButton?: string;
  /** What stands where the backlinks would be, when there are none. */
  noBacklinks?: string;
};

/**
 * §6's opening question and the line in the big text box, as they read when a
 * soort has not been given its own. Here rather than in the component so the
 * type editor can show them as the placeholder of the box that replaces them.
 */
export const DEFAULT_DESCRIPTION_PLACEHOLDER =
  'Waar kwam je ze tegen, wat was de sfeer, wat was de context van de eerste ontmoeting, en hoe zagen ze eruit?';

export const DEFAULT_BODY_PLACEHOLDER =
  'Wat is er verder bekend? Typ @ of [[ om een ander artikel te koppelen.';

export function cleanTypeText(input: unknown): TypeText {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const out: TypeText = {};
  const take = (key: keyof TypeText, max: number) => {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, max);
  };
  take('descriptionPlaceholder', 300);
  take('bodyPlaceholder', 300);
  take('newButton', 40);
  take('noBacklinks', 300);
  return out;
}
