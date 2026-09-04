/**
 * Hand-written DDL, applied in order at startup. Append only — never edit a
 * migration that has shipped; add a new one instead.
 */
export const MIGRATIONS = [
  {
    name: '0001_init',
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_lower TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  is_keeper INTEGER NOT NULL DEFAULT 0,
  is_disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER
);
CREATE UNIQUE INDEX users_username_lower_idx ON users(username_lower);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX sessions_token_hash_idx ON sessions(token_hash);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE site_settings (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Zeeland Case Files',
  tagline TEXT NOT NULL DEFAULT 'Archief van het Eiland',
  logo_asset_id TEXT,
  invite_code TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE entry_types (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'file',
  colour TEXT NOT NULL DEFAULT '#5C544A',
  fields TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX entry_types_slug_idx ON entry_types(slug);

CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  type_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  short_description TEXT NOT NULL DEFAULT '',
  body TEXT,
  body_text TEXT NOT NULL DEFAULT '',
  fields TEXT NOT NULL DEFAULT '{}',
  cover_asset_id TEXT,
  cover_crop TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'published',
  is_locked INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'all',
  keeper_notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  updated_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at INTEGER
);
CREATE UNIQUE INDEX entries_slug_idx ON entries(slug);
CREATE INDEX entries_type_idx ON entries(type_id);
CREATE INDEX entries_updated_idx ON entries(updated_at);

CREATE TABLE entry_reveals (
  entry_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (entry_id, user_id)
);

CREATE TABLE entry_sections (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT,
  body_text TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'keeper',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX entry_sections_entry_idx ON entry_sections(entry_id);

CREATE TABLE entry_section_reveals (
  section_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (section_id, user_id)
);

CREATE TABLE entry_revisions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  edited_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX entry_revisions_entry_idx ON entry_revisions(entry_id, created_at);

CREATE TABLE entry_links (
  from_entry_id TEXT NOT NULL,
  to_entry_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'mention',
  label TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (from_entry_id, to_entry_id, kind, label)
);
CREATE INDEX entry_links_to_idx ON entry_links(to_entry_id);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'image',
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  uploaded_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  notes TEXT,
  notes_text TEXT NOT NULL DEFAULT '',
  keeper_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  visibility TEXT NOT NULL DEFAULT 'all',
  cover_asset_id TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at INTEGER
);
CREATE UNIQUE INDEX cases_slug_idx ON cases(slug);

CREATE TABLE case_members (
  case_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (case_id, user_id)
);

CREATE TABLE case_entries (
  case_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  added_by TEXT,
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (case_id, entry_id)
);

CREATE TABLE case_revisions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  edited_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  case_id TEXT,
  state TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at INTEGER
);

CREATE TABLE board_revisions (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  edited_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE pending_edits (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  proposed_snapshot TEXT NOT NULL,
  proposed_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at INTEGER,
  review_note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_log_created_idx ON audit_log(created_at);

CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  verb TEXT NOT NULL,
  entry_id TEXT,
  case_id TEXT,
  board_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX activity_created_idx ON activity(created_at);

CREATE VIRTUAL TABLE entries_fts USING fts5(
  entry_id UNINDEXED,
  name,
  short_description,
  body_text,
  tags,
  tokenize = "unicode61 remove_diacritics 2"
);
`,
  },
  {
    name: '0002_borders_and_placement_crops',
    sql: `
-- A border treatment per entry type, so a Clue reads differently from a
-- Location on a card without anyone having to read the label.
ALTER TABLE entry_types ADD COLUMN border TEXT NOT NULL DEFAULT 'solid';

-- Each placement of a picture keeps its own crop. The entry's own crop is the
-- one lists fall back to; a case card may want the face, a board card the hands.
ALTER TABLE case_entries ADD COLUMN crop TEXT;
`,
  },
  {
    name: '0003_case_cover_crop',
    sql: `
-- A case file has had a cover since the schema was drawn, but no crop for the
-- list card. Same shape as an entry's: the dossier shows the whole picture,
-- the Case Files grid squares it off with this.
ALTER TABLE cases ADD COLUMN cover_crop TEXT;
`,
  },
  {
    name: '0004_keeper_words_and_page_blocks',
    sql: `
-- §11. Three JSON columns, all defaulting to "nothing said", so an archive that
-- never opens the new panes behaves exactly as it did.

-- The Keeper's own words for the things the interface names — only the ones
-- they changed. Keyed by lib/words.ts; anything else falls back to the default.
ALTER TABLE site_settings ADD COLUMN words TEXT NOT NULL DEFAULT '{}';

-- What a soort fiche's page is made of, and in what order: the five built-in
-- blocks plus any lists the Keeper added. '[]' means the standard page.
ALTER TABLE entry_types ADD COLUMN blocks TEXT NOT NULL DEFAULT '[]';

-- A soort's own wording for the handful of sentences that read badly when
-- every soort says the same thing — the question under a new entry's title,
-- the placeholder in the body, the per-type New button.
ALTER TABLE entry_types ADD COLUMN page_text TEXT NOT NULL DEFAULT '{}';
`,
  },
];
