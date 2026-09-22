import { sql } from 'drizzle-orm';
import type { ColourScheme, SchemeKey, TokenKey } from '@/lib/theme/schemes';
import type { ReadingFont } from '@/lib/readingFont';
import type { PageBlock, TypeText } from '@/lib/pageBlocks';
import {
  blob,
  customType,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { normaliseCrops, type CoverCrops } from '@/lib/images/shapes';
// §66: the four kinship roles a koppelingsveld may carry. Type-only, so this
// import is erased and `lib/families/types.ts` never loads the database.
import type { FieldRole } from '@/lib/families/types';
import type { FamilyTreeState } from '@/lib/families/types';

const now = sql`(unixepoch())`;

/**
 * How a picture sits inside a frame — three crops, one per shape (round 19).
 *
 * See `lib/images/shapes.ts`: `{ landscape?, portrait?, square? }`, each a
 * focal point in 0..1 of the source and a zoom that is 1 for "fit the frame".
 * That carries the same information as a rectangle and maps straight onto CSS
 * (object-position + transform-origin + scale), so the uploaded file is never
 * cropped on disk and a crop can be redone for ever.
 *
 * The per-placement rule is *reversed* this round: an artikel's three crops
 * are the only crops there are, used by every list, card and knot that shows
 * it. `case_entries.crop` is unread and a board card no longer carries one, so
 * a face looks the same everywhere it appears.
 *
 * A JSON text column, as it always was, so the column itself needs no SQL
 * migration. The rows written before this round hold a bare `{ x, y, zoom }`;
 * this column type puts every read — every `select` on either table — through
 * `normaliseCrops`, which reads that as `{ portrait }` (the 3:4 card was the
 * only frame it was drawn for) and clamps whatever else it finds. Nothing
 * reads `cover_crop` around drizzle, so there is no second road to keep in
 * step. The artikel page itself still shows the whole picture, uncropped.
 */
const coverCrops = customType<{ data: CoverCrops | null; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
  fromDriver(value) {
    try {
      return normaliseCrops(JSON.parse(value));
    } catch {
      return null;
    }
  },
});

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    usernameLower: text('username_lower').notNull(),
    passwordHash: text('password_hash').notNull(),
    isKeeper: integer('is_keeper', { mode: 'boolean' }).notNull().default(false),
    isDisabled: integer('is_disabled', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull().default(now),
    lastSeenAt: integer('last_seen_at'),
    /** §18: the character this person is currently wearing; null means "just me". */
    activeCharacterId: text('active_character_id'),
    /**
     * §22, retired in round 13 — kept because this repo never edits an old
     * migration and a live database still has the column.
     *
     * It used to hold which face an artikel opened in for this person. Nobody
     * lands anywhere but Lezen now, so nothing reads or writes it: it is here
     * only so the table drizzle describes matches the table on disk. Do not
     * write a migration to drop it — SQLite's `DROP COLUMN` on a table with an
     * index is fragile and there is nothing to gain.
     */
    articleMode: text('article_mode').notNull().default(''),
    /**
     * §29: which face this person reads in. '' is the archive's own; the two
     * alternatives are bundled locally, so nothing is fetched at runtime.
     */
    readingFont: text('reading_font').$type<ReadingFont>().notNull().default(''),
    /**
     * §45: which half of the four colour schemes this person reads in —
     * '' follows the system, 'light' and 'dark' overrule it. Which *side's*
     * colours they are is not stored anywhere: the page they are standing on
     * decides that (`lib/theme/schemes.ts`).
     */
    colourScheme: text('colour_scheme').$type<ColourScheme>().notNull().default(''),
  },
  (t) => [uniqueIndex('users_username_lower_idx').on(t.usernameLower)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

export const siteSettings = sqliteTable('site_settings', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().default('LoW: Land over Water Archief'),
  tagline: text('tagline').notNull().default('Archief van het Eiland'),
  logoAssetId: text('logo_asset_id'),
  /**
   * §88: het icoontje in de browsertab. Een asset, net als het logo, en langs
   * dezelfde weg gezet. Leeg betekent "geen eigen icoon" — de tab valt dan
   * terug op het logo, want wie er één heeft wil hem daar vrijwel zeker ook.
   */
  faviconAssetId: text('favicon_asset_id'),
  inviteCode: text('invite_code').notNull(),
  /**
   * §11's accent, and since §45 the four colour schemes beside it. `accent` is
   * kept and still read: a Keeper who set one before §45 has it folded into the
   * stamp of all four schemes until they touch the new pane (`cleanSchemes`).
   */
  theme: text('theme', { mode: 'json' })
    .$type<{ accent?: string; schemes?: Partial<Record<SchemeKey, Partial<Record<TokenKey, string>>>> }>()
    .notNull()
    .default({}),
  /**
   * §11: the Keeper's own words for the things the interface names — only the
   * ones they changed, keyed by `lib/words.ts`. Everything else falls back to
   * the default, so a later change to a default still reaches them.
   */
  words: text('words', { mode: 'json' }).$type<Record<string, string>>().notNull().default({}),
  /** The start page's welcome, in the Keeper's words; empty means the default text. */
  intro: text('intro').notNull().default(''),
});

export const entryTypes = sqliteTable(
  'entry_types',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    icon: text('icon').notNull().default('file'),
    colour: text('colour').notNull().default('#5C544A'),
    /** Card border treatment; see lib/borders.mjs. */
    border: text('border').notNull().default('solid'),
    fields: text('fields', { mode: 'json' }).$type<FieldDef[]>().notNull().default([]),
    /**
     * §11: what this soort's *page* is made of and in what order. Empty means
     * the standard page; see `lib/pageBlocks.ts`, which is the only thing that
     * should ever read this raw.
     */
    blocks: text('blocks', { mode: 'json' }).$type<PageBlock[]>().notNull().default([]),
    /** This soort's own wording for the few sentences that read badly shared. */
    pageText: text('page_text', { mode: 'json' }).$type<TypeText>().notNull().default({}),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * §80: alleen een Keeper maakt hier nieuwe artikelen van.
     *
     * **Niet te verwarren met §44's `keeper_only`**, dat op een *artikel* staat
     * en zegt aan welke kant het hangt. Deze staat op de *soort* en gaat over
     * wie er een mag máken. De soort verdwijnt uit de nieuw-artikel-lijst van
     * een speler, en `createEntry` weigert het ook — een slot op het scherm is
     * een slot aan de buitenkant van de deur.
     */
    keeperMade: integer('keeper_made', { mode: 'boolean' }).notNull().default(false),
    /**
     * §80: één in de wereld, of niet.
     *
     * Een voorwerp (§24) is uniek: twee onderzoekers kunnen niet allebei
     * dezelfde lantaarn op hun plank hebben. Huisraad is juist een ding waarvan
     * er meer zijn. Het verschil hoort bij de *soort* en niet bij de code die
     * neerzet, en het is wat `room_slots.claim` vult of leeg laat.
     */
    oneOfAKind: integer('one_of_a_kind', { mode: 'boolean' }).notNull().default(false),
    /**
     * §24, and no longer read: this soort was only made inside a dossier.
     *
     * §49 took the gate away — every soort is makeable everywhere again — and
     * what is left of the idea is `prefixDefault` below. The column stays
     * because this repo never drops one and an old backup still restores; the
     * only thing that still asks it is the trigger in `0022_case_prefix`, which
     * gives a freshly seeded soort its default.
     */
    caseOnly: integer('case_only', { mode: 'boolean' }).notNull().default(false),
    /**
     * §49: what a *new* artikel of this soort starts with — does it wear the
     * dossier it is made in in front of its name? Clues and Voorwerpen do,
     * because that is what they were; everything else does not. A default and
     * nothing more: the tickbox on the artikel's own page decides afterwards,
     * and changing this never touches an artikel that already exists.
     */
    prefixDefault: integer('prefix_default', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [uniqueIndex('entry_types_slug_idx').on(t.slug)],
);

export type FieldKind =
  | 'text'
  | 'longtext'
  // §38: three kinds that are not a string. A `number` is stored as a JS
  // number, a `boolean` as a real true/false, a `multiselect` as an array of
  // the Keeper's own options — `lib/entries/fieldValues.ts` is what keeps them
  // to those shapes, on the server as well as on the page.
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'entry_link'
  | 'entry_links'
  | 'user_link'
  | 'case_link'
  | 'case_links'
  // §66 (round 32): one stamboom, so a Familie can say which tree it is the
  // family of. Stored as one `{ id, name, slug }` — see `lib/entries/fieldValues.ts`.
  | 'family_tree_link'
  | 'date'
  | 'map_pin';

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  /** for select and multiselect */
  options?: string[];
  /** for entry_link / entry_links: restrict the picker to these type slugs */
  ofType?: string[];
  /**
   * §66: what this koppelingsveld *means* in a stamboom. Only meaningful on
   * `entry_link` / `entry_links` — `cleanFields` drops it off anything else.
   *
   *   parent   the artikelen in this field are this artikel's parents
   *            ("Ouders", "Geschapen door")
   *   child    they are its children ("Kinderen", "Schepselen")
   *   partner  they stand beside it in a union ("Partner")
   *   kin      a side tie with no generation implied ("Aspect van")
   *
   * The field's *label* is the word printed on the line, so a god's vocabulary
   * needs no code of its own. `parent` and `child` are each other's mirror and
   * `partner` is its own; the server writes the other side for those three
   * (`lib/families/mirror.ts`, inside `updateEntry`). `kin` is never mirrored.
   */
  role?: FieldRole;
};

export type Visibility = 'all' | 'keeper' | 'players';

/**
 * §17: the owner's two dials, on a fiche, a dossier and a prikbord alike.
 *   'all'      everyone signed in — the default, because the archive is built on trust
 *   'some'     the people listed in access_grants
 *   'private'  the owner and the Keepers
 * Separate from the Keeper's `Visibility` above: a player sees something only
 * when the Keeper allows it AND the owner allows it.
 */
export type AccessMode = 'all' | 'some' | 'private';
export type AccessTargetType =
  | 'entry'
  | 'case'
  | 'board'
  | 'timeline'
  | 'map'
  | 'family_tree'
  // §75: an overzicht wears the same two dials as everything else. Its
  // `edit_mode` starts at 'all' on purpose — see the table below.
  | 'overzicht'
  /**
   * §79: a kamer. The only one of these whose two dials point in opposite
   * directions on purpose — `view_mode: 'all'` because the table looks, and
   * `edit_mode: 'private'` because only the onderzoeker who lives there
   * arranges it.
   */
  | 'room';

export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    typeId: text('type_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    shortDescription: text('short_description').notNull().default(''),
    /** Tiptap JSON document */
    body: text('body', { mode: 'json' }).$type<unknown>(),
    /** Plain-text projection of body, for FTS and previews */
    bodyText: text('body_text').notNull().default(''),
    fields: text('fields', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
    coverAssetId: text('cover_asset_id'),
    /** Three crops by shape; see `coverCrops` above. Null = centred, unzoomed, in every shape. */
    coverCrop: coverCrops('cover_crop'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    status: text('status').$type<'draft' | 'published'>().notNull().default('published'),
    isLocked: integer('is_locked', { mode: 'boolean' }).notNull().default(false),
    visibility: text('visibility').$type<Visibility>().notNull().default('all'),
    keeperNotes: text('keeper_notes').notNull().default(''),
    /** §17 */
    viewMode: text('view_mode').$type<AccessMode>().notNull().default('all'),
    editMode: text('edit_mode').$type<AccessMode>().notNull().default('all'),
    accessLocked: integer('access_locked', { mode: 'boolean' }).notNull().default(false),
    /**
     * §24: the dossier this artikel was *made in*, if it was made in one.
     *
     * Not the same as the dossiers it is filed in — that is `case_entries`, and
     * there can be several. This is the one it came from, and it is what the
     * wiki prints in front of its name ("Zaak Vlissingen: De koperen sleutel"),
     * so two clues called "de brief" in two investigations can be told apart at
     * a glance. Null for everything born in the wiki itself.
     */
    originCaseId: text('origin_case_id'),
    /**
     * §24: false means `originCaseId` follows `case_entries` on its own — taken
     * out of the dossier it names and it moves, or empties. True means somebody
     * chose that dossier on purpose and nothing may move it but them.
     */
    originPinned: integer('origin_pinned', { mode: 'boolean' }).notNull().default(false),
    /**
     * §49: does this artikel wear that dossier's name in front of its own?
     *
     * §24 asked the soort; the wiki then printed "Zaak Vlissingen: Jan" over a
     * persoon somebody had filed, which nobody meant. So the prefix is a fact
     * about the artikel: one tickbox on its page, beside the dossier it points
     * at. Off is silence, not a lie — the artikel stays exactly where it is
     * filed, the list simply prints its plain name.
     */
    casePrefix: integer('case_prefix', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
    deletedAt: integer('deleted_at'),
  },
  (t) => [
    uniqueIndex('entries_slug_idx').on(t.slug),
    index('entries_type_idx').on(t.typeId),
    index('entries_updated_idx').on(t.updatedAt),
  ],
);

/** The bag on `entries.cover_crop` and `cases.cover_crop`; see `coverCrops` at the top of this file. */
export type { CoverCrops } from '@/lib/images/shapes';

export const entryReveals = sqliteTable(
  'entry_reveals',
  {
    entryId: text('entry_id').notNull(),
    userId: text('user_id').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.userId] })],
);

/**
 * §70, round 36: a sectie — a titled block of shared text — belongs to a
 * *thing*, not to an artikel. `owner_kind` is 'entry' or 'case' today; a fifth
 * kind of owner is this column and nothing else.
 *
 * It was `entry_sections` until round 36, and it was the Keeper's prep (§9):
 * only a Keeper could make one, and a new one started keeper-only. Both halves
 * moved. Anyone who may edit the thing may add a sectie to it, because that is
 * what a player asking "where do I write down what this onderzoek turned up?"
 * is asking for; and what a *new* sectie starts as now depends on who made it —
 * a Keeper's is prep, a player's is for everybody (`startingVisibility`).
 * Changing that dial afterwards, and revealing to named players, stayed the
 * Keeper's (`lib/sections/service.ts`).
 *
 * The ids did not change in the migration, so `section:{id}` — the room its
 * text lives in (§20) — is the same room it always was.
 */
export const sections = sqliteTable(
  'sections',
  {
    id: text('id').primaryKey(),
    ownerKind: text('owner_kind').$type<SectionOwnerKind>().notNull().default('entry'),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull().default(''),
    body: text('body', { mode: 'json' }).$type<unknown>(),
    bodyText: text('body_text').notNull().default(''),
    visibility: text('visibility').$type<Visibility>().notNull().default('keeper'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: text('created_by'),
    /** §18: the karakter whoever wrote it was wearing. NULL: before §70. */
    characterId: text('character_id'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [index('sections_owner_idx').on(t.ownerKind, t.ownerId)],
);

/** §70: what a sectie can hang from. A new one is this union and its gate. */
export type SectionOwnerKind = 'entry' | 'case' | 'overzicht';

export const entrySectionReveals = sqliteTable(
  'entry_section_reveals',
  {
    sectionId: text('section_id').notNull(),
    userId: text('user_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sectionId, t.userId] })],
);

export const entryRevisions = sqliteTable(
  'entry_revisions',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id').notNull(),
    snapshot: text('snapshot', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    editedBy: text('edited_by'),
    /** §18: the karakter its author was wearing when this was written. NULL: before §18b. */
    characterId: text('character_id'),
    createdAt: integer('created_at').notNull().default(now),
    note: text('note').notNull().default(''),
  },
  (t) => [index('entry_revisions_entry_idx').on(t.entryId, t.createdAt)],
);

export const entryLinks = sqliteTable(
  'entry_links',
  {
    fromEntryId: text('from_entry_id').notNull(),
    toEntryId: text('to_entry_id').notNull(),
    kind: text('kind').$type<'mention' | 'relation'>().notNull().default('mention'),
    label: text('label').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.fromEntryId, t.toEntryId, t.kind, t.label] }),
    index('entry_links_to_idx').on(t.toEntryId),
  ],
);

/**
 * §27: a mention of an artikel that did not come from another artikel.
 *
 * `entry_links` is artikel-to-artikel and stays that way. This is the same
 * idea with a source that is a dossier's notes, an infobox field, a card on a
 * prikbord or a speld on a landkaart. Like `entry_links` it is *derived*:
 * rebuilt from the source document on every save, so it can never say
 * something the text does not. Nothing is read out of it without the reader's
 * own visibility rule for whatever `fromKind` names (rule 1).
 */
export const entryMentions = sqliteTable(
  'entry_mentions',
  {
    toEntryId: text('to_entry_id').notNull(),
    fromKind: text('from_kind')
      .$type<'case' | 'board' | 'map' | 'timeline' | 'family_tree' | 'field' | 'section'>()
      .notNull(),
    /** The dossier / prikbord / landkaart / artikel the mention sits in. */
    fromId: text('from_id').notNull(),
    /** What to print after the source: a field's label, a card's name. */
    detail: text('detail').notNull().default(''),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.toEntryId, t.fromKind, t.fromId, t.detail] }),
    index('entry_mentions_to_idx').on(t.toEntryId),
    index('entry_mentions_from_idx').on(t.fromKind, t.fromId),
  ],
);

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  kind: text('kind').$type<'image' | 'file'>().notNull().default('image'),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  uploadedBy: text('uploaded_by'),
  createdAt: integer('created_at').notNull().default(now),
});

export const cases = sqliteTable(
  'cases',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    summary: text('summary').notNull().default(''),
    notes: text('notes', { mode: 'json' }).$type<unknown>(),
    notesText: text('notes_text').notNull().default(''),
    keeperNotes: text('keeper_notes').notNull().default(''),
    status: text('status').$type<'open' | 'cold' | 'closed'>().notNull().default('open'),
    /** Pre-§17. Migrated into view_mode; kept so an old backup still restores. */
    visibility: text('visibility').$type<'all' | 'assigned'>().notNull().default('all'),
    /** §17 */
    viewMode: text('view_mode').$type<AccessMode>().notNull().default('all'),
    editMode: text('edit_mode').$type<AccessMode>().notNull().default('all'),
    accessLocked: integer('access_locked', { mode: 'boolean' }).notNull().default(false),
    /**
     * §44: the Keeper's own side. True means the table may not know this
     * exists at all — AND-ed onto the §17 dials in `viewableCondition`, never
     * substituted for them, exactly as §9's `visibility` is for an artikel.
     */
    keeperOnly: integer('keeper_only', { mode: 'boolean' }).notNull().default(false),
    coverAssetId: text('cover_asset_id'),
    /** Three crops by shape, like an artikel's; the Case Files grid and the cards use them. */
    coverCrop: coverCrops('cover_crop'),
    /**
     * §28: which soorten belong in this dossier, as type slugs. Null is "let the
     * tabs follow whatever is filed here", which is what every dossier did
     * before; a list means those tabs are always there, empty or not.
     */
    tabTypes: text('tab_types', { mode: 'json' }).$type<string[] | null>(),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
    deletedAt: integer('deleted_at'),
  },
  (t) => [uniqueIndex('cases_slug_idx').on(t.slug)],
);

/** Pre-§17. Its rows were copied into access_grants; nothing reads it any more. */
export const caseMembers = sqliteTable(
  'case_members',
  {
    caseId: text('case_id').notNull(),
    userId: text('user_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.userId] })],
);

export const caseEntries = sqliteTable(
  'case_entries',
  {
    caseId: text('case_id').notNull(),
    entryId: text('entry_id').notNull(),
    addedBy: text('added_by'),
    addedAt: integer('added_at').notNull().default(now),
    note: text('note').notNull().default(''),
    /**
     * Pre-round 19: this case's own crop of the entry's cover. Nulled by
     * `0020_one_crop_per_picture` and read by nothing — the artikel's own three
     * crops are used everywhere. The column stays so an old backup restores.
     */
    crop: text('crop', { mode: 'json' }).$type<unknown>(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.entryId] })],
);

export const caseRevisions = sqliteTable('case_revisions', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull(),
  snapshot: text('snapshot', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  editedBy: text('edited_by'),
  /** §18: the karakter its author was wearing when this was written. NULL: before §18b. */
  characterId: text('character_id'),
  createdAt: integer('created_at').notNull().default(now),
});

export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  caseId: text('case_id'),
  state: text('state', { mode: 'json' }).$type<unknown>().notNull().default({}),
  /** §17 */
  viewMode: text('view_mode').$type<AccessMode>().notNull().default('all'),
  editMode: text('edit_mode').$type<AccessMode>().notNull().default('all'),
  accessLocked: integer('access_locked', { mode: 'boolean' }).notNull().default(false),
  /** §43, round 18: false keeps this wall out of the web and out of "Genoemd in". */
  inWeb: integer('in_web', { mode: 'boolean' }).notNull().default(true),
  /**
   * §44: the Keeper's own side. True means the table may not know this
   * exists at all — AND-ed onto the §17 dials in `viewableCondition`, never
   * substituted for them, exactly as §9's `visibility` is for an artikel.
   */
  keeperOnly: integer('keeper_only', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
  deletedAt: integer('deleted_at'),
});

export const boardRevisions = sqliteTable('board_revisions', {
  id: text('id').primaryKey(),
  boardId: text('board_id').notNull(),
  snapshot: text('snapshot', { mode: 'json' }).$type<unknown>().notNull(),
  editedBy: text('edited_by'),
  /** §18: the karakter its author was wearing when this was written. NULL: before §18b. */
  characterId: text('character_id'),
  createdAt: integer('created_at').notNull().default(now),
});

export const pendingEdits = sqliteTable('pending_edits', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').notNull(),
  proposedSnapshot: text('proposed_snapshot', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .notNull(),
  proposedBy: text('proposed_by'),
  /** §18: the karakter its author was wearing when this was written. NULL: before §18b. */
  characterId: text('character_id'),
  createdAt: integer('created_at').notNull().default(now),
  status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('pending'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: integer('reviewed_at'),
  reviewNote: text('review_note').notNull().default(''),
});

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id'),
    /** §18: the karakter its author was wearing when this was written. NULL: before §18b. */
    characterId: text('character_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull().default(''),
    targetId: text('target_id').notNull().default(''),
    createdAt: integer('created_at').notNull().default(now),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
);

export const activity = sqliteTable(
  'activity',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id'),
    /** §18: the karakter its author was wearing when this was written. NULL: before §18b. */
    characterId: text('character_id'),
    verb: text('verb').notNull(),
    entryId: text('entry_id'),
    caseId: text('case_id'),
    boardId: text('board_id'),
    createdAt: integer('created_at').notNull().default(now),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('activity_created_idx').on(t.createdAt)],
);

/**
 * §17: the people behind `view_mode = 'some'` / `edit_mode = 'some'`. One table
 * for all three kinds. Rights are per ACCOUNT, never per character.
 */
export const accessGrants = sqliteTable(
  'access_grants',
  {
    targetType: text('target_type').$type<AccessTargetType>().notNull(),
    targetId: text('target_id').notNull(),
    userId: text('user_id').notNull(),
    canView: integer('can_view', { mode: 'boolean' }).notNull().default(true),
    canEdit: integer('can_edit', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.targetType, t.targetId, t.userId] }),
    index('access_grants_user_idx').on(t.userId),
  ],
);

/** §18: which fiches a person may wear as a character. */
export const userCharacters = sqliteTable(
  'user_characters',
  {
    userId: text('user_id').notNull(),
    entryId: text('entry_id').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entryId] })],
);

/** §19: an uploaded picture of somewhere. The island is fiction; nothing is fetched. */
export const maps = sqliteTable(
  'maps',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    assetId: text('asset_id').notNull(),
    width: integer('width').notNull().default(0),
    height: integer('height').notNull().default(0),
    description: text('description').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * §23: the artikel this map is a map *of* — a place with a floor plan, a
     * harbour with its own chart. Not the same relation as a pin: a pin says
     * "this artikel is somewhere on this map", this says "this map is that
     * place". Null for a map of the world rather than of one page.
     */
    entryId: text('entry_id'),
    /**
     * §17: the same two dials every other thing wears. `view_mode` defaults to
     * 'all' — a landkaart hung before there was a dial was visible to everyone
     * signed in, and stays so. `edit_mode` defaults to 'private', because §19
     * has always said only a Keeper renames, redraws or takes down a landkaart:
     * the owner is a Keeper, so 'private' is exactly today's rule written down,
     * and a Keeper who wants help can now turn it up.
     */
    viewMode: text('view_mode').$type<AccessMode>().notNull().default('all'),
    editMode: text('edit_mode').$type<AccessMode>().notNull().default('private'),
    accessLocked: integer('access_locked', { mode: 'boolean' }).notNull().default(false),
    /**
     * §44: the Keeper's own side. True means the table may not know this
     * exists at all — AND-ed onto the §17 dials in `viewableCondition`, never
     * substituted for them, exactly as §9's `visibility` is for an artikel.
     */
    keeperOnly: integer('keeper_only', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
    deletedAt: integer('deleted_at'),
  },
  (t) => [uniqueIndex('maps_slug_idx').on(t.slug), index('maps_entry_idx').on(t.entryId)],
);

/**
 * §19: a pin on a map, in picture coordinates 0..1 so a redrawn map keeps
 * them. A fiche (`entry_id`), a loose note (`name` + `text`), or — since 0017
 * — another landkaart (`target_map_id`): the speld on the town that opens the
 * town's own map.
 */
export const mapPins = sqliteTable(
  'map_pins',
  {
    id: text('id').primaryKey(),
    mapId: text('map_id').notNull(),
    kind: text('kind').$type<'entry' | 'note' | 'map'>().notNull().default('entry'),
    entryId: text('entry_id'),
    /**
     * §39: the landkaart this speld stands for — the town on the map of the
     * province, the house on the map of the town. A landkaart is its own table
     * rather than an artikel, so this is a column beside `entry_id` and not a
     * second meaning for it, exactly as a kaart on a prikbord keeps `mapId`
     * apart from `entryId`. NULL: this speld is not a landkaart speld.
     */
    targetMapId: text('target_map_id'),
    name: text('name').notNull().default(''),
    text: text('text').notNull().default(''),
    x: real('x').notNull().default(0.5),
    y: real('y').notNull().default(0.5),
    /**
     * §71, round 36: which speld is on top. Higher is nearer the reader, ties
     * broken by `createdAt` so the order is total and stable on every screen.
     *
     * It is *not* derived from the artikel's soort, and that was a decision
     * rather than an omission: what outranks what differs from map to map, so
     * the hand that sets the speld says it, with Naar voren / Naar achter /
     * Voorgrond / Achtergrond. The same number decides who represents a bunch
     * of spelden at low zoom — see `clusterPins` in `lib/maps/cluster.ts`.
     */
    layer: integer('layer').notNull().default(0),
    createdBy: text('created_by'),
    /** §18: the karakter whoever set it was wearing. NULL: before §18b. */
    characterId: text('character_id'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
    /**
     * §69, round 35: gone, but not yet unrecoverable.
     *
     * A speld and a gebeurtenis are deleted without being asked about now, and
     * the answer to "are you sure?" is an *Ongedaan maken* in the toast that
     * follows. That is only honest if there is something to undo, and for these
     * two there was not: `removePin` and `removeEvent` were a hard
     * `db.delete`, and the road back through `addPin`/`addEvent` would mint a
     * new id, re-derive the author from whoever pressed undo, and — for a
     * gebeurtenis — lose the picture, because the create route cannot carry an
     * `asset_id`. A column keeps the row whole: same id, same author, same
     * karakter, same picture.
     *
     * **Every read of this table filters it** (`livePins` / `liveEvents` in the
     * services), with two deliberate exceptions in `lib/admin/trash.ts`: what a
     * destroy will take away, and what it takes away, both count the buried
     * rows too — they are going either way.
     *
     * This is not the prullenbak. `lib/admin/trash.ts` is for the six kinds of
     * container a Keeper can hand back; a speld is not a thing anybody browses
     * a bin for. It is the memory behind one toast, swept by
     * `sweepDeletedRows()` after `DELETED_ROW_TTL_MS`.
     */
    deletedAt: integer('deleted_at'),
  },
  (t) => [
    index('map_pins_map_idx').on(t.mapId),
    index('map_pins_entry_idx').on(t.entryId),
    index('map_pins_target_idx').on(t.targetMapId),
  ],
);

/**
 * §32: a tijdlijn — a ruled axis with gebeurtenissen on it. Made like a
 * prikbord: by anyone, with the owner's two dials (§17), loose or inside a
 * dossier, into the bin and back. `scale` is how it is measured (see
 * `lib/timelines/time.ts`): which boxes the date form offers and how the
 * axis is ruled.
 */
export const timelines = sqliteTable(
  'timelines',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    caseId: text('case_id'),
    scale: text('scale').$type<TimelineScale>().notNull().default('day'),
    /**
     * §35: "deze tijdlijn speelt op 3 oktober 1931". One moment and the unit
     * it is known to — always coarser than `scale` — or nothing at all. Both
     * columns are null together; see `lib/timelines/time.ts` for what an
     * anchor does (it fills a new gebeurtenis in and fences the axis).
     */
    anchorAt: integer('anchor_at'),
    anchorUnit: text('anchor_unit').$type<'year' | 'month' | 'day'>(),
    /** §17 */
    viewMode: text('view_mode').$type<AccessMode>().notNull().default('all'),
    editMode: text('edit_mode').$type<AccessMode>().notNull().default('all'),
    accessLocked: integer('access_locked', { mode: 'boolean' }).notNull().default(false),
    /**
     * §44: the Keeper's own side. True means the table may not know this
     * exists at all — AND-ed onto the §17 dials in `viewableCondition`, never
     * substituted for them, exactly as §9's `visibility` is for an artikel.
     */
    keeperOnly: integer('keeper_only', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
    deletedAt: integer('deleted_at'),
  },
  (t) => [uniqueIndex('timelines_slug_idx').on(t.slug), index('timelines_case_idx').on(t.caseId)],
);

export type TimelineScale = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

/**
 * §32: a gebeurtenis on a tijdlijn. Either an artikel (`entry_id`; any soort,
 * and drawn large because an artikel is the archive saying "this mattered")
 * or a loose note that exists nowhere but here (`name` + `text`). Both keep
 * what the tijdlijn *says* about the moment — `text`, the picture, whether the
 * picture frame is open — on the row, exactly as a card on a prikbord keeps
 * its own text (§8): the artikel behind it is never written to from here.
 *
 * `at` is seconds since 1970 in a proleptic Gregorian calendar, no time zone;
 * `precision` is how much of that moment is known. See `lib/timelines/time.ts`.
 */
export const timelineEvents = sqliteTable(
  'timeline_events',
  {
    id: text('id').primaryKey(),
    timelineId: text('timeline_id').notNull(),
    kind: text('kind').$type<'entry' | 'note'>().notNull().default('note'),
    entryId: text('entry_id'),
    name: text('name').notNull().default(''),
    text: text('text').notNull().default(''),
    at: integer('at').notNull().default(0),
    precision: text('precision').$type<TimelineScale>().notNull().default('day'),
    /** A note's own picture; an artikel gebeurtenis borrows its artikel's cover. */
    assetId: text('asset_id'),
    /** False hides the picture frame — the default while there is nothing to show in it. */
    showImage: integer('show_image', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by'),
    /** §18: the karakter whoever set it was wearing. NULL: before §18b. */
    characterId: text('character_id'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
    /** §69: see `mapPins.deletedAt` — the same column for the same reason. */
    deletedAt: integer('deleted_at'),
  },
  (t) => [
    index('timeline_events_timeline_idx').on(t.timelineId, t.at),
    index('timeline_events_entry_idx').on(t.entryId),
  ],
);

/**
 * §66: een stamboom. The fourth container, made the way a prikbord and a
 * tijdlijn are made: by anyone, with the owner's two dials (§17), loose or
 * inside a dossier, on either side of the archive (§44), into the bin.
 *
 * It is a *window* onto the archive's kinship, not a second place where
 * kinship is written down: who is whose parent, child or partner lives on the
 * artikel, in koppelingsvelden that carry a role. So there are no child rows.
 * `state` is one JSON blob of what the tree owns itself — its members, the
 * losse kaartjes that are not artikelen (yet) and the lijnen that touch one —
 * normalised on every read by `normaliseTreeState` (`lib/families/merge.ts`),
 * which is where a new field on a member gets its default (CLAUDE.md §5).
 */
export const familyTrees = sqliteTable(
  'family_trees',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    caseId: text('case_id'),
    state: text('state', { mode: 'json' }).$type<FamilyTreeState>().notNull().default({
      v: 1,
      members: [],
      loose: [],
      ties: [],
      deleted: { members: {}, loose: {}, ties: {} },
    }),
    /** §17 */
    viewMode: text('view_mode').$type<AccessMode>().notNull().default('all'),
    editMode: text('edit_mode').$type<AccessMode>().notNull().default('all'),
    accessLocked: integer('access_locked', { mode: 'boolean' }).notNull().default(false),
    /** §43: false keeps this tree out of the web and out of "Genoemd in". */
    inWeb: integer('in_web', { mode: 'boolean' }).notNull().default(true),
    /**
     * §44: the Keeper's own side. True means the table may not know this
     * exists at all — AND-ed onto the §17 dials in `viewableCondition`, never
     * substituted for them, exactly as §9's `visibility` is for an artikel.
     */
    keeperOnly: integer('keeper_only', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
    deletedAt: integer('deleted_at'),
  },
  (t) => [
    uniqueIndex('family_trees_slug_idx').on(t.slug),
    index('family_trees_case_idx').on(t.caseId),
  ],
);

/**
 * §75, round 38: een overzicht — a page of the wiki that is about the wiki.
 *
 * It is the front door players write themselves: prose, groupings and links
 * that say where to start and what belongs together, with a home overzicht at
 * `/wiki` and as many more as the table cares to make. Wikipedia and every
 * Fandom wiki have the same thing in a namespace of its own; this is that
 * namespace, as a table.
 *
 * What it *lacks* is the whole idea, and it is why this is a table of its own
 * rather than a soort artikel with a flag on it:
 *
 *   - **no type, no fields, no infobox, no cover, no tags.** An overzicht is
 *     text and links. Nothing about it is a fact about the world.
 *   - **it is not in the web, not in "Genoemd in", not in a stamboom, not on a
 *     landkaart and not in a dossier.** An overzicht is about the archive, not
 *     about the fiction, so a line from one would be a lie about the world.
 *     Because it is not a row in `entries`, every one of those exclusions is
 *     had for free rather than remembered in fourteen places — that is the
 *     argument for the table. Links go one way, outward: an overzicht names an
 *     artikel, and the artikel never hears about it (`lib/sections/service.ts`,
 *     `recomputeOwnerMentions`).
 *
 * What it carries is the rest of the archive's spine, because the same rules
 * have to hold: §17's two dials, §44's `keeper_only` side, §43-style soft
 * delete into the Keeper's bin, and §70's secties, which are the whole of its
 * body — an overzicht *is* a title, a lead and its secties.
 *
 * `edit_mode` starts at **'all'** rather than at 'private' (which is what a
 * landkaart does, §40). That is Nick's decision written into the column: the
 * players decide how the wiki is run, so anybody may tidy anybody's overzicht,
 * and a Keeper who wants one left alone has `access_locked` (§17's bolt).
 */
export const overzichten = sqliteTable(
  'overzichten',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** The paragraph under the title. Plain text; the secties carry the rest. */
    lead: text('lead').notNull().default(''),
    /** The one at `/wiki`. Exactly one row has this, and it cannot be binned. */
    isHome: integer('is_home', { mode: 'boolean' }).notNull().default(false),
    icon: text('icon').notNull().default('book'),
    sortOrder: integer('sort_order').notNull().default(0),
    /** §17 */
    viewMode: text('view_mode').$type<AccessMode>().notNull().default('all'),
    editMode: text('edit_mode').$type<AccessMode>().notNull().default('all'),
    accessLocked: integer('access_locked', { mode: 'boolean' }).notNull().default(false),
    /** §44: the Keeper's own side, AND-ed onto the dials in `viewableCondition`. */
    keeperOnly: integer('keeper_only', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
    deletedAt: integer('deleted_at'),
  },
  (t) => [uniqueIndex('overzichten_slug_idx').on(t.slug), index('overzichten_home_idx').on(t.isHome)],
);

/**
 * §20: the CRDT state behind a piece of shared text, keyed by room
 * (`entry:{id}:body`, `section:{id}`). `entries.body` remains what every
 * reader uses; this is the Yjs document's own memory, so a client that was
 * away merges instead of overwriting.
 */
export const liveDocs = sqliteTable('live_docs', {
  room: text('room').primaryKey(),
  state: blob('state', { mode: 'buffer' }).notNull(),
  updatedAt: integer('updated_at').notNull().default(now),
});

/**
 * §33: the tekenlaag of a prikbord, a landkaart or a tijdlijn — one row per
 * thing drawn on, keyed by that thing's id (ids are unique across the three
 * tables). `layer` is the strokes and their tombstones (`lib/ink/merge.ts`);
 * `enabled` is the Keeper's switch, a column so a page can read it without
 * parsing the layer. Its own table rather than a column on each of the three,
 * so a stroke saved every second while someone draws does not move
 * `boards`/`maps`/`timelines` and re-render every page that watches them.
 */
export const inkLayers = sqliteTable('ink_layers', {
  targetId: text('target_id').primaryKey(),
  kind: text('kind').$type<'board' | 'map' | 'timeline' | 'family_tree'>().notNull(),
  layer: text('layer', { mode: 'json' }).$type<unknown>().notNull().default({}),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at').notNull().default(now),
});

/* --------------------------------------------------------------- §44 */

/**
 * §44: the tie between the Keeper's own page and the one the table reads.
 *
 * Polymorphic on both ends — an artikel, a dossier, a prikbord, een landkaart
 * or een tijdlijn on either side — because the Keeper's page about a
 * conspiracy hangs off five different things and a single `target_*_id`
 * column would only ever hold one of them (§39's warning, taken).
 *
 * `isTwin` marks the one tie that is a *pair*: the Keeper's other face of that
 * exact thing, made with one button, sharing its notes, and reachable from it
 * with one press. At most one twin per side, which two partial unique indexes
 * in migration 0021 enforce in the database rather than in a promise. Every
 * other tie is a plain rope: several are allowed, in both directions.
 *
 * A row here says nothing about who may see either end. Both are asked their
 * own visibility rule on every read (`lib/keeper/ties.ts`), so a tie can never
 * be the thing that reveals a page.
 */
export const counterparts = sqliteTable(
  'counterparts',
  {
    id: text('id').primaryKey(),
    keeperKind: text('keeper_kind').$type<KeeperKind>().notNull(),
    keeperId: text('keeper_id').notNull(),
    playerKind: text('player_kind').$type<KeeperKind>().notNull(),
    playerId: text('player_id').notNull(),
    isTwin: integer('is_twin', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('counterparts_pair_idx').on(t.keeperKind, t.keeperId, t.playerKind, t.playerId),
    index('counterparts_player_idx').on(t.playerKind, t.playerId),
    index('counterparts_keeper_idx').on(t.keeperKind, t.keeperId),
  ],
);

/**
 * The kinds of thing that can have a Keeper side (§44, §66, §75).
 *
 * This union is the same one `lib/keeper/kinds.ts` exports, restated here
 * because a column's `$type<>` may not reach for a module that reaches back
 * for the schema. The two must move together — `tests/unit/overzicht-spine.test.ts`
 * asserts they are equal, so the next kind cannot be added to one and forgotten
 * in the other.
 */
export type KeeperKind =
  | 'entry'
  | 'case'
  | 'board'
  | 'map'
  | 'timeline'
  | 'family_tree'
  // §75
  | 'overzicht';

/**
 * §44: the Keeper's notes, for all five kinds, in one place.
 *
 * They used to be a column on `entries` and on `cases` and nowhere else. A
 * page and its twin share one text — the twin's — so the notes had to stop
 * belonging to a row and start belonging to a *pair*; keyed by (kind, id) they
 * do, and the other three kinds get notes they never had.
 *
 * Nothing here is ever handed to a player: every read goes through
 * `lib/keeper/notes.ts`, which refuses anyone but a Keeper before it opens the
 * table at all.
 */
export const keeperNotes = sqliteTable(
  'keeper_notes',
  {
    kind: text('kind').$type<KeeperKind>().notNull(),
    targetId: text('target_id').notNull(),
    text: text('text').notNull().default(''),
    updatedAt: integer('updated_at').notNull().default(now),
    updatedBy: text('updated_by'),
  },
  (t) => [primaryKey({ columns: [t.kind, t.targetId] })],
);

/**
 * §79: de kamer.
 *
 * One per onderzoeker — `entryId` is that karakter's artikel, and it is unique.
 * Everything about who may see a kamer is two facts ANDed: the artikel's own
 * visibility (§9, `visibleEntryCondition` — an onderzoeker you cannot see has
 * no kamer as far as you are concerned) and the room's own dial (§17).
 *
 * Two columns it deliberately does **not** have:
 *
 *   `deleted_at`  A kamer follows its onderzoeker into the prullenbak and back
 *                 out again, because the artikel's bin *is* the kamer's bin.
 *                 Two flags that can drift apart are worse than one.
 *   `keeper_only` §44 with the same shape of exception as §75's: a side exists
 *                 so one thing in the world can have two faces, and a kamer
 *                 hangs on an onderzoeker — which a Keeper never wears (§18).
 */
export const rooms = sqliteTable(
  'rooms',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id').notNull(),
    /** §17: the table looks… */
    viewMode: text('view_mode').$type<AccessMode>().notNull().default('all'),
    /** …and the owner arranges. */
    editMode: text('edit_mode').$type<AccessMode>().notNull().default('private'),
    accessLocked: integer('access_locked', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [uniqueIndex('rooms_entry_idx').on(t.entryId)],
);

/**
 * §79: één plek in een kamer.
 *
 * Every plek a kamer will ever have exists from the moment the kamer does —
 * most of them locked, with a price. A room that shows only what you already
 * own gives you nothing to save up for, and that is the whole reason the rows
 * are seeded rather than created on purchase.
 *
 * `unlockedAt` null means locked; `entryId` null means empty. The partial
 * unique index on `entry_id` — the whole archive, not per kamer — is what keeps
 * one voorwerp in one plek: a lantaarn is one thing in the world, which is the
 * reason it is an artikel in the first place, and two onderzoekers displaying
 * the same one is a sentence about the fiction that nobody said.
 */
export const roomSlots = sqliteTable(
  'room_slots',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull(),
    /** muur, plank, bureau, kist — named in `lib/words.ts`, never in a CHECK. */
    kind: text('kind').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    price: integer('price').notNull().default(0),
    unlockedAt: integer('unlocked_at'),
    /** The voorwerp lying here — an artikel, like everything else in the world. */
    entryId: text('entry_id'),
    placedAt: integer('placed_at'),
    /**
     * §80: de claim op een uniek ding.
     *
     * §79 hield één voorwerp op één plek met een unieke index op `entry_id`.
     * Toen kwam huisraad, waarvan er wél meer mogen zijn, en de verleiding was
     * om die index weg te halen — een garantie inruilen voor een controle die
     * iemand vergeet. In plaats daarvan staat hij nu hier: gevuld met `entryId`
     * als de soort `one_of_a_kind` is, en anders `null`. Het schema zegt het
     * dus nog steeds, en alleen over de dingen waarover het waar is.
     */
    claim: text('claim'),
  },
  (t) => [index('room_slots_room_idx').on(t.roomId, t.sortOrder)],
);

/**
 * §79: het grootboek.
 *
 * The balance is `SUM(delta)` and is stored nowhere. A Keeper's mistake is a
 * line added, never a line changed, which is also what makes the granting
 * screen nothing but a list with a form under it.
 */
export const roomLedger = sqliteTable(
  'room_ledger',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull(),
    /** Signed. A grant is positive; opening a plek or buying a thing is negative. */
    delta: integer('delta').notNull(),
    /**
     * §93: `return` is een koop die binnen het venster ongedaan is gemaakt —
     * een regel erbij, nooit een regel die verandert (§79 regel 1).
     */
    kind: text('kind').$type<'grant' | 'slot' | 'item' | 'return'>().notNull(),
    reason: text('reason').notNull().default(''),
    actorId: text('actor_id'),
    slotId: text('slot_id'),
    entryId: text('entry_id'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('room_ledger_room_idx').on(t.roomId, t.createdAt)],
);

/**
 * §93: de lade van een kamer — huisraad dat deze onderzoeker bezit en dat nu
 * op geen plek ligt.
 *
 * Eén rij is één exemplaar. Twee leesstoelen in de lade zijn twee rijen, want
 * §83 staat twee van hetzelfde toe en een telling in een kolom zou een getal
 * zijn dat iemand bijwerkt. Er staat niets in dat rekent (rule 78): geen prijs,
 * geen waarde, alleen *welk ding* en *welke kamer*.
 *
 * Bezit is **plekken plus lade**, en niets anders. Een koop legt het ding op een
 * plek; weghalen legt het hier; neerzetten uit de lade haalt de rij weer weg.
 * Alleen huisraad (`keeper_made`) komt hier: een gevonden voorwerp is van de
 * wereld en blijft, zoals vóór §93, van niemand als het van de plank gaat.
 */
export const roomDrawer = sqliteTable(
  'room_drawer',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull(),
    entryId: text('entry_id').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('room_drawer_room_idx').on(t.roomId, t.entryId)],
);

/**
 * §95, ronde 56: wat een vermelding in een kort vak bedoelt.
 *
 * Een korte beschrijving, een samenvatting of een infoboxveld Tekst / Lange
 * tekst bewaart een vermelding als `⟦handle⟧` (`lib/entries/shortTokens.mjs`).
 * Deze tabel zegt welk artikel dat handvat bedoelt; de naam wordt bij het lezen
 * per kijker opgezocht (`resolveHandles` in `lib/entries/shortRefs.ts`), zodat
 * een hernoeming de chip meeneemt en een artikel dat de lezer niet mag zien
 * voor hem niets is. Eén rij per vermelding: het handvat zegt niet wie.
 */
export const mentionHandles = sqliteTable(
  'mention_handles',
  {
    handle: text('handle').primaryKey(),
    entryId: text('entry_id').notNull(),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('mention_handles_entry_idx').on(t.entryId)],
);
