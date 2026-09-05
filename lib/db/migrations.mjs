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
  {
    name: '0005_access_characters_maps',
    sql: `
-- §17: who may look, and who may touch.
--
-- Every fiche, dossier and prikbord gets an owner's two dials, separate from
-- the Keeper's secrecy in \`visibility\` (§9), which stays exactly as it was:
--   view_mode / edit_mode  'all'      everyone signed in       (the default: trust all)
--                          'some'     the people in access_grants
--                          'private'  the owner and the Keepers
-- access_locked is the Keeper's: once set, the owner can no longer change the
-- dials — for the wall the whole camp is supposed to be served from.
ALTER TABLE entries ADD COLUMN view_mode TEXT NOT NULL DEFAULT 'all';
ALTER TABLE entries ADD COLUMN edit_mode TEXT NOT NULL DEFAULT 'all';
ALTER TABLE entries ADD COLUMN access_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN view_mode TEXT NOT NULL DEFAULT 'all';
ALTER TABLE cases ADD COLUMN edit_mode TEXT NOT NULL DEFAULT 'all';
ALTER TABLE cases ADD COLUMN access_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE boards ADD COLUMN view_mode TEXT NOT NULL DEFAULT 'all';
ALTER TABLE boards ADD COLUMN edit_mode TEXT NOT NULL DEFAULT 'all';
ALTER TABLE boards ADD COLUMN access_locked INTEGER NOT NULL DEFAULT 0;

-- The people behind 'some'. One table for all three kinds: a grant is a grant.
-- Rights are per ACCOUNT, never per character — a character is a name a
-- person wears, not a person.
CREATE TABLE IF NOT EXISTS access_grants (
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  can_view    INTEGER NOT NULL DEFAULT 1,
  can_edit    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (target_type, target_id, user_id)
);
CREATE INDEX IF NOT EXISTS access_grants_user_idx ON access_grants (user_id);

-- A dossier's "assigned investigators" were already exactly this: the chosen
-- people who may see (and work on) a confidential case. They become grants,
-- and a confidential case becomes view_mode 'some'. The old columns stay, unread.
INSERT OR IGNORE INTO access_grants (target_type, target_id, user_id, can_view, can_edit)
  SELECT 'case', case_id, user_id, 1, 1 FROM case_members;
UPDATE cases SET view_mode = 'some' WHERE visibility = 'assigned';

-- §18: characters. A person may wear several; one is active at a time.
CREATE TABLE IF NOT EXISTS user_characters (
  user_id    TEXT NOT NULL,
  entry_id   TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, entry_id)
);
ALTER TABLE users ADD COLUMN active_character_id TEXT;

-- §19: maps. An uploaded picture — the island is fiction, nothing is fetched —
-- and pins on it in picture coordinates (0..1), so a redrawn map keeps them.
CREATE TABLE IF NOT EXISTS maps (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  asset_id    TEXT NOT NULL,
  width       INTEGER NOT NULL DEFAULT 0,
  height      INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at  INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS maps_slug_idx ON maps (slug);

CREATE TABLE IF NOT EXISTS map_pins (
  id         TEXT PRIMARY KEY,
  map_id     TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'entry',
  entry_id   TEXT,
  name       TEXT NOT NULL DEFAULT '',
  text       TEXT NOT NULL DEFAULT '',
  x          REAL NOT NULL DEFAULT 0.5,
  y          REAL NOT NULL DEFAULT 0.5,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS map_pins_map_idx ON map_pins (map_id);
CREATE INDEX IF NOT EXISTS map_pins_entry_idx ON map_pins (entry_id);
`,
  },
  {
    name: '0006_live_docs',
    sql: `
-- §20: shared text. A fiche's body (and each of its sections) is a Yjs
-- document while people are typing in it together. \`entries.body\` stays the
-- truth every reader uses; this is the CRDT's own state — its history and
-- clocks — kept so a laptop that comes back from a tunnel merges cleanly
-- instead of clobbering. One row per room, replaced whole on every persist.
CREATE TABLE IF NOT EXISTS live_docs (
  room       TEXT PRIMARY KEY,
  state      BLOB NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`,
  },
  {
    name: '0007_site_intro',
    sql: `
-- The welcome on the start page, in the Keeper's own words (Beheer → Site).
-- Empty means the archive's own default text; plain paragraphs, no markup.
ALTER TABLE site_settings ADD COLUMN intro TEXT NOT NULL DEFAULT '';
`,
  },
  {
    name: '0008_article_mode',
    sql: `
-- §22: which face an artikel opens in, per person — 'view' to read it the way
-- any wiki reads, 'edit' to land in the form. The empty string, the default,
-- means "whatever my role does": a Keeper edits, everyone else reads. Nobody
-- is locked into either; the toggle at the top of the artikel still switches.
ALTER TABLE users ADD COLUMN article_mode TEXT NOT NULL DEFAULT '';
`,
  },
];
