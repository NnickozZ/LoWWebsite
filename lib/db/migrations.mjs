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
  {
    name: '0009_map_of_entry',
    sql: `
-- §19/§23: the place a landkaart is a map *of*. A speld says "this artikel is
-- somewhere on this map"; this says the other thing — "this map *is* that
-- place": the floor plan of the lighthouse, the harbour drawn for the harbour's
-- own page. Nullable, because most maps are of the world rather than of one
-- page, and unset when the artikel is destroyed rather than dragging the map
-- down with it.
ALTER TABLE maps ADD COLUMN entry_id TEXT;
CREATE INDEX IF NOT EXISTS maps_entry_idx ON maps (entry_id);
`,
  },
  {
    name: '0010_case_only_types',
    sql: `
-- §24: some soorten only exist inside a dossier. A voorwerp or a clue is found
-- *during* an investigation — it has no life of its own before one — so those
-- soorten are made in a dossier and nowhere else. They still land in the wiki
-- like anything else; they are simply born somewhere.
ALTER TABLE entry_types ADD COLUMN case_only INTEGER NOT NULL DEFAULT 0;

-- And the dossier an artikel was made in. Not "the dossiers it is in" — that is
-- case_entries, and there can be several — but the one it came from, which is
-- what the wiki prints in front of its name. Nullable, because most artikelen
-- were not born in a dossier at all.
ALTER TABLE entries ADD COLUMN origin_case_id TEXT;
CREATE INDEX IF NOT EXISTS entries_origin_case_idx ON entries (origin_case_id);
`,
  },
  {
    name: '0011_mentions_origin_tabs_font',
    sql: `
-- §27: "Genoemd in" stopped being a thing only artikelen could do. A dossier's
-- working notes, an infobox field, a card on a wall and a speld on a landkaart
-- all mention artikelen, and none of them could say so. entry_links is the
-- artikel-to-artikel table and keeps its shape (its primary key is four
-- columns of artikel); this is the same idea with a source that is not an
-- artikel. Rebuilt from the source document on every save, exactly like
-- entry_links, so it can never drift from what the text says.
CREATE TABLE IF NOT EXISTS entry_mentions (
  to_entry_id TEXT NOT NULL,
  from_kind TEXT NOT NULL,           -- 'case' | 'board' | 'map' | 'field' | 'section'
  from_id TEXT NOT NULL,             -- the case / board / map / artikel id it came from
  detail TEXT NOT NULL DEFAULT '',   -- a field label, a card name: what to print after the source
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (to_entry_id, from_kind, from_id, detail)
);
CREATE INDEX IF NOT EXISTS entry_mentions_to_idx ON entry_mentions (to_entry_id);
CREATE INDEX IF NOT EXISTS entry_mentions_from_idx ON entry_mentions (from_kind, from_id);

-- §24 continued: the dossier in front of a voorwerp or clue is a living
-- reference, not a stamp. It follows case_entries by itself — out of the last
-- dossier and the prefix goes with it — unless somebody chose one on purpose,
-- which is what this remembers.
ALTER TABLE entries ADD COLUMN origin_pinned INTEGER NOT NULL DEFAULT 0;

-- §28: which soorten belong in this dossier. NULL means "whatever happens to be
-- in it", which is what every dossier did before; a list means those tabs are
-- always there, empty or not, with somewhere to add to them.
ALTER TABLE cases ADD COLUMN tab_types TEXT;

-- §29: the face this person reads in. '' is the archive's own; 'atkinson' and
-- 'opendyslexic' are the two bundled alternatives.
ALTER TABLE users ADD COLUMN reading_font TEXT NOT NULL DEFAULT '';
`,
  },
  {
    name: '0012_timelines',
    sql: `
-- §32: tijdlijnen. A ruled axis with gebeurtenissen on it, made the way a
-- prikbord is made: by anyone, with the owner's two dials, loose or inside a
-- dossier, soft-deleted into the bin. \`scale\` is how it is measured — jaren,
-- maanden, dagen, uren, minuten or seconden — which decides what the date form
-- asks for and how the axis is ruled.
CREATE TABLE IF NOT EXISTS timelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  case_id TEXT,
  scale TEXT NOT NULL DEFAULT 'day',
  view_mode TEXT NOT NULL DEFAULT 'all',
  edit_mode TEXT NOT NULL DEFAULT 'all',
  access_locked INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS timelines_slug_idx ON timelines (slug);
CREATE INDEX IF NOT EXISTS timelines_case_idx ON timelines (case_id);

-- A gebeurtenis on one of them: an artikel (any soort) or a note that exists
-- nowhere else. \`at\` is seconds since 1970, proleptic Gregorian, no time zone
-- — negative for the 1930s, which is fine — and \`precision\` says how much of
-- that moment is actually known ('1931' is stored as 1 January 00:00 with
-- precision 'year'). The text and the picture are the tijdlijn's own, never
-- the artikel's (§8 for cards on a wall; the same rule here).
CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  timeline_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',      -- 'entry' | 'note'
  entry_id TEXT,
  name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL DEFAULT 0,
  precision TEXT NOT NULL DEFAULT 'day',
  asset_id TEXT,
  show_image INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS timeline_events_timeline_idx ON timeline_events (timeline_id, at);
CREATE INDEX IF NOT EXISTS timeline_events_entry_idx ON timeline_events (entry_id);
`,
  },
  {
    name: '0013_ink',
    sql: `
-- §33: the tekenlaag. One row per prikbord, landkaart or tijdlijn that has
-- been drawn on, keyed by that thing's id. \`layer\` holds the strokes and
-- the tombstones of lifted ones as JSON; \`enabled\` is the Keeper's switch.
CREATE TABLE IF NOT EXISTS ink_layers (
  target_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  layer TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`,
  },
  {
    name: '0014_timeline_anchor',
    sql: `
-- §35: a tijdlijn zoomed in past the day may say which day it is *of* —
-- "deze tijdlijn speelt op 3 oktober 1931". \`anchor_at\` is that moment as
-- seconds (the same integer a gebeurtenis keeps) and \`anchor_unit\` how much
-- of it is meant ('year' | 'month' | 'day'), always coarser than \`scale\`.
-- Null together: no anchor, which is what every existing tijdlijn has.
ALTER TABLE timelines ADD COLUMN anchor_at INTEGER;
ALTER TABLE timelines ADD COLUMN anchor_unit TEXT;
`,
  },
  {
    name: '0015_character_attribution',
    sql: `
-- §18: *who wrote this*, recorded, instead of *who they are being now*, asked
-- again at every page load. Every row that says an act happened gets the
-- karakter its author was wearing at that moment — the one the browser window
-- chose (the \`X-Character\` header), resolved server-side against the fiches
-- that account actually holds.
--
-- Nullable, and deliberately never backfilled: NULL means "written before the
-- archive asked", and those rows keep falling back to the account's karakter
-- of the day, exactly as they always did. So an old feed reads as it did
-- yesterday, and everything written from now on keeps its own name.
ALTER TABLE entry_revisions ADD COLUMN character_id TEXT;
ALTER TABLE activity ADD COLUMN character_id TEXT;
ALTER TABLE audit_log ADD COLUMN character_id TEXT;
ALTER TABLE pending_edits ADD COLUMN character_id TEXT;
ALTER TABLE case_revisions ADD COLUMN character_id TEXT;
ALTER TABLE board_revisions ADD COLUMN character_id TEXT;

-- The two records that carry their own maker rather than lean on a log row:
-- a speld on a landkaart and a gebeurtenis on a tijdlijn both print "gezet
-- door …" straight off the row.
ALTER TABLE map_pins ADD COLUMN character_id TEXT;
ALTER TABLE timeline_events ADD COLUMN character_id TEXT;
`,
  },
  {
    name: '0016_map_access',
    sql: `
-- §17 on a landkaart. Artikelen, dossiers, prikborden and tijdlijnen have each
-- had the owner's two dials since 0005 and 0012; a landkaart never got them, so
-- every signed-in person could see every landkaart and a Keeper had no way to
-- keep a plattegrond back until the players find the house.
--
-- The defaults are chosen so that nothing already hanging on the wall changes:
--
--   view_mode = 'all'      EVERY EXISTING LANDKAART STAYS VISIBLE TO EVERYONE
--                          SIGNED IN. That is the deliberate intent of this
--                          migration: it adds a dial, it does not turn one. A
--                          Keeper who wants a map hidden turns it themselves.
--   edit_mode = 'private'  the owner and the Keepers, which is exactly what
--                          §19 already allowed — only a Keeper renames,
--                          redraws or takes down a landkaart, and every
--                          landkaart's owner is a Keeper because only a Keeper
--                          can hang one. 'all' here would have handed every
--                          player the rename and the delete, which is a change
--                          rather than a dial.
--   access_locked = 0      nothing is bolted; the Keeper's bolt works the same
--                          as it does everywhere else.
--
-- The grants themselves need no new table: access_grants has been one table for
-- all kinds since 0005 and simply gains rows with target_type = 'map'.
ALTER TABLE maps ADD COLUMN view_mode TEXT NOT NULL DEFAULT 'all';
ALTER TABLE maps ADD COLUMN edit_mode TEXT NOT NULL DEFAULT 'private';
ALTER TABLE maps ADD COLUMN access_locked INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    name: '0017_pin_targets',
    sql: `
-- §39, under §19: a speld on a landkaart may now stand for another landkaart.
--
-- A landkaart of Zeeland gets a speld on a town and that speld opens the town's
-- landkaart; the town's landkaart gets a speld on a house and that one opens the
-- plattegrond. Until now a speld was a fiche or a loose notitie and nothing
-- else, so there was no way down from the big picture to the small one.
--
-- A landkaart is its own table, not an artikel, so this is a column of its own
-- rather than a second meaning for entry_id — exactly the way a kaart on a
-- prikbord keeps map_id apart from entry_id.
--
-- NULL ON EVERY EXISTING ROW MEANS "THIS SPELD DOES NOT STAND FOR A LANDKAART",
-- which is what every speld set before today is. There is nothing to backfill:
-- a fiche speld keeps its entry_id, a notitie keeps its name and text, and the
-- kind column already says which of the three a row is.
ALTER TABLE map_pins ADD COLUMN target_map_id TEXT;
CREATE INDEX IF NOT EXISTS map_pins_target_idx ON map_pins(target_map_id);
`,
  },
];
