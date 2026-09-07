import { sql } from 'drizzle-orm';
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
    /** AES-256-GCM of the plaintext, for Keeper recovery only. Never used to log in. */
    passwordEnc: text('password_enc').notNull(),
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
  name: text('name').notNull().default('Zeeland Case Files'),
  tagline: text('tagline').notNull().default('Archief van het Eiland'),
  logoAssetId: text('logo_asset_id'),
  inviteCode: text('invite_code').notNull(),
  theme: text('theme', { mode: 'json' }).$type<{ accent?: string }>().notNull().default({}),
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
     * §24: this soort is only made inside a dossier. A voorwerp or a clue is
     * found during an investigation, so the "Nieuw artikel" sheet does not
     * offer it and the wiki's own new button is gone; the dossier's add-box is
     * the only door. What comes out is an artikel like any other, and lands in
     * the wiki like any other — under the dossier's name (`originCaseId`).
     */
    caseOnly: integer('case_only', { mode: 'boolean' }).notNull().default(false),
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
export type AccessTargetType = 'entry' | 'case' | 'board' | 'timeline' | 'map';

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

export const entrySections = sqliteTable(
  'entry_sections',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id').notNull(),
    title: text('title').notNull().default(''),
    body: text('body', { mode: 'json' }).$type<unknown>(),
    bodyText: text('body_text').notNull().default(''),
    visibility: text('visibility').$type<Visibility>().notNull().default('keeper'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('entry_sections_entry_idx').on(t.entryId)],
);

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
      .$type<'case' | 'board' | 'map' | 'timeline' | 'field' | 'section'>()
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
    createdBy: text('created_by'),
    /** §18: the karakter whoever set it was wearing. NULL: before §18b. */
    characterId: text('character_id'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
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
  },
  (t) => [
    index('timeline_events_timeline_idx').on(t.timelineId, t.at),
    index('timeline_events_entry_idx').on(t.entryId),
  ],
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
  kind: text('kind').$type<'board' | 'map' | 'timeline'>().notNull(),
  layer: text('layer', { mode: 'json' }).$type<unknown>().notNull().default({}),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at').notNull().default(now),
});
