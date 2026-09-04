import { sql } from 'drizzle-orm';
import type { PageBlock, TypeText } from '@/lib/pageBlocks';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const now = sql`(unixepoch())`;

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
  },
  (t) => [uniqueIndex('entry_types_slug_idx').on(t.slug)],
);

export type FieldKind =
  | 'text'
  | 'longtext'
  | 'select'
  | 'entry_link'
  | 'entry_links'
  | 'user_link'
  | 'case_link'
  | 'date'
  | 'map_pin';

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  /** for select */
  options?: string[];
  /** for entry_link / entry_links: restrict the picker to these type slugs */
  ofType?: string[];
};

export type Visibility = 'all' | 'keeper' | 'players';

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
    coverCrop: text('cover_crop', { mode: 'json' }).$type<CoverCrop | null>(),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    status: text('status').$type<'draft' | 'published'>().notNull().default('published'),
    isLocked: integer('is_locked', { mode: 'boolean' }).notNull().default(false),
    visibility: text('visibility').$type<Visibility>().notNull().default('all'),
    keeperNotes: text('keeper_notes').notNull().default(''),
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

/**
 * How a picture sits inside a frame, stored as focal point + zoom rather than
 * four edges.
 * `x`/`y` are the centre of the crop in 0..1 of the source image; `zoom` is 1
 * for "fit the frame" and higher as the user pinches in. This carries the same
 * information as an explicit rectangle and maps straight onto CSS
 * (object-position + transform-origin + scale). The uploaded image is never
 * cropped on disk, so a crop can be redone forever — and every *placement*
 * keeps its own: this one is the entry's default for lists, while a case card
 * and a board card each hold theirs. The entry page itself shows the whole
 * picture, uncropped, whatever shape it is.
 */
export type CoverCrop = { x: number; y: number; zoom: number };

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
    visibility: text('visibility').$type<'all' | 'assigned'>().notNull().default('all'),
    coverAssetId: text('cover_asset_id'),
    /** How the Case Files grid squares off the cover; the dossier shows it whole. */
    coverCrop: text('cover_crop', { mode: 'json' }).$type<CoverCrop | null>(),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
    deletedAt: integer('deleted_at'),
  },
  (t) => [uniqueIndex('cases_slug_idx').on(t.slug)],
);

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
    /** This case's own crop of the entry's cover; null falls back to the entry's. */
    crop: text('crop', { mode: 'json' }).$type<CoverCrop | null>(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.entryId] })],
);

export const caseRevisions = sqliteTable('case_revisions', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull(),
  snapshot: text('snapshot', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  editedBy: text('edited_by'),
  createdAt: integer('created_at').notNull().default(now),
});

export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  caseId: text('case_id'),
  state: text('state', { mode: 'json' }).$type<unknown>().notNull().default({}),
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
  createdAt: integer('created_at').notNull().default(now),
});

export const pendingEdits = sqliteTable('pending_edits', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').notNull(),
  proposedSnapshot: text('proposed_snapshot', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .notNull(),
  proposedBy: text('proposed_by'),
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
    verb: text('verb').notNull(),
    entryId: text('entry_id'),
    caseId: text('case_id'),
    boardId: text('board_id'),
    createdAt: integer('created_at').notNull().default(now),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('activity_created_idx').on(t.createdAt)],
);
