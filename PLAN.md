# PLAN

Phases 1 and 2 of the brief, as a checklist. Tick items as they land; keep this current.

## Phase 1 — Foundation

### 1. Repo, Docker, schema, migrations, seed

- [x] Next.js (App Router) + TypeScript, no Tailwind, no UI kit
- [x] SQLite via Drizzle, single file at `$DATA_DIR/app.db`, WAL, FTS5
- [x] Every table from §5, created by hand-written migrations applied at startup
- [x] Seeded entry types with their default fields (§5)
- [x] `make bootstrap` — first Keeper, interactive or `--username X --password Y`
- [x] `make seed-demo` — the Zeeland dataset from §16
- [x] `make dev` / `make reset` / `make backup` / `make restore`
- [x] `.env.example` with working local defaults; `make dev` generates real secrets
- [x] Dockerfile (multi-stage, node:22-alpine, standalone) + docker-compose with
      a nightly backup sidecar keeping the last 14
- [x] LAN URL printed by `make dev`; `Secure` cookies only when `PUBLIC_URL` is https

### 2. Auth

- [x] Signup with a single shared invite code; username + password + password again
- [x] Username rules (2–32, letters/numbers/space/hyphen/apostrophe, case-insensitive unique)
- [x] Password minimum 8, with the recovery notice at signup, verbatim
- [x] argon2id hash **and** AES-256-GCM recoverable copy under `PASSWORD_RECOVERY_KEY`
- [x] Sessions table + httpOnly cookie, 90-day rolling expiry
- [x] Rate limiting, 10 attempts / 15 min / IP, on login and signup. No CAPTCHA
- [x] Account page: change password, log out, log out everywhere
- [x] Admin → Users: last seen, Keeper toggle, disable, Set new password,
      Reveal password for 30 s with an audit row
- [x] Admin → Invite code: view and regenerate
- [x] Admin → Audit log
- [x] No email field anywhere

### 3. Entries

- [x] New entry sheet: type chips (last-used preselected), name, short description, Create
- [x] "Did you mean…" — up to 5 similar names under the name field
- [x] The short-description placeholder, verbatim
- [x] Lands on the entry in edit-in-place mode with "Add more" expanded
- [x] Inline editing, autosave 800 ms after typing stops and on blur, "Saved" indicator
- [x] Per-field last-write-wins, with "X also edited this — refreshed"
- [x] Cover upload (file or paste), focal-point crop, resize to 1600 px, 400 px thumbnails
- [x] Type fields for every field kind in §5
- [x] Tags, free-form, lower-cased, autocompleted
- [x] Revisions on every save (coalesced within 5 minutes), view, diff, restore
- [x] Soft delete
- [x] Locked entries route a player's save to `pending_edits` ("Sent to the Keeper for review")

### 4. Linking

- [x] Tiptap with a custom `entryLink` node
- [x] `@` and `[[` autocomplete, both with "Create '<typed>'" as the last item
- [x] Creating from the autocomplete inserts the chip when the sheet closes
- [x] Chips render with the type colour; hover (desktop) / long-press (phone) previews
- [x] `entry_links` recomputed from the body on every save
- [x] "Mentioned in" backlinks with a count

### 5. Browse, search, home

- [x] Per-type card grids with tag chips and recent/name sort
- [x] Global search: fuzzy, typo-tolerant names and tags, plus an FTS5 body section
- [x] Results grouped by type; "Create '<typed>'" always available
- [x] `/` and `n` keyboard shortcuts
- [x] Home: "Since you were last here" feed with an Earlier divider, then recent entries

### 6. Theme and responsive

- [x] Palette, fonts and stamps from §12; self-hosted fonts, no CDN at runtime
- [x] Left nav on desktop, bottom tabs + FAB on phone
- [x] 44 px tap targets, 16 px minimum body text, no horizontal scrolling
- [x] Dark variant, `prefers-reduced-motion` respected

### Verification

- [x] `npm run build` clean, `npm run typecheck` clean
- [x] 30 unit tests (link extraction, plain-text projection, visibility, fuzzy
      ranking, slugs, diff, backup zip)
- [x] Golden flow 1 and golden flow 2 pass at 390 px and 1440 px

## Phase 2 — Cases and boards

### 7. Case Files

- [x] Create with name + one-line summary (the same two-field sheet)
- [x] Dossier header: status stamp OPEN / COLD / CLOSED, confidential stamp,
      assigned investigators as initials, inline name and summary
- [x] Desktop tabs: Overview · People · Places · Objects · Clues ·
      Abnormalities · Board · Activity, with empty type tabs hidden
- [x] Phone: the same sections stacked, sticky headers, jump menu
- [x] Overview: a universal add box, rich-text case notes, four most recent
      additions, Keeper notes
- [x] Add from an entry ("Add to case"), and from the case's own per-tab search
      with "Create '<typed>'" as the last result
- [x] Per-link case note ("Why this matters here"), shown on the card in the
      case and nowhere else
- [x] Member assignment, `all` / `assigned` visibility with a leak test
- [x] Activity tab with a "before your last visit" divider
- [x] Case revisions on every edit (coalesced within five minutes)

### 8. Clue boards

- [x] Pannable, zoomable cork canvas: DOM cards, SVG overlay for pins and string
- [x] Entry cards from the board's search box, uniform 3:4 covers, board-local
      text that never writes back to the entry
- [x] Free notes, with a dotted "Create entry" that converts the note in place
- [x] Photo cards from a file or a paste
- [x] Red string between pins with an optional label
- [x] Drag, shift-click and marquee multi-select, Delete, 50-step undo
- [x] Scroll/pinch zoom, drag-to-pan, "Fit all"
- [x] Phone: view, pan, zoom, open, add and edit text — no dragging or
      string-drawing, with the hint from §8
- [x] Autosave 800 ms, server-side merge by id, revision at most once a minute
- [x] Boards page, boards inside a case, "Pin to board" from an entry
- [x] "View full" on a photo card (§8), which the first pass had missed

### 8a. Board editing pass

- [x] A selection inspector for cards and strings, replacing the per-card kebab
- [x] Strings: click to select, relabel, recolour from a palette of six, remove
- [x] Cards: attach a photo to a note, replace it, re-crop it, take it off
- [x] Crop mode with the same gestures as an entry cover
- [x] Zoom buttons and a zoom readout; Escape clears, exits crop, cancels a string
- [x] An empty-board hint, a proper string hit area, honest double-click wording
- [x] Selection on phones (first tap selects, second opens), so the inspector is
      reachable there
- [x] Fixed: undo after a delete no longer comes apart on the round trip

### 8b. Borders, per-place crops and string anchors

- [x] A border treatment per entry type (10 of them, `lib/borders.mjs`), drawn on
      every card: wiki grids, case cards and board cards — each one a period
      object (photograph, warrant card, map edge, evidence tag, ledger rule,
      censor's hatching, tape, photo corners, foxed page, plain)
- [x] One click on a board card selects; a double-click on its picture or name
      opens it (phones: first tap selects, second opens)
- [x] Board cards inherit their entry type's border and can override it; a note
      with no entry picks its own
- [x] The picture frame on a board card can be switched off entirely
- [x] Entries show the whole picture, at any size, never cropped; the 3:4 crop is
      a separate "Crop for lists" control that only lists use
- [x] Every *placement* keeps its own crop: the entry's default, a case's own
      (`case_entries.crop`) and a board card's own, none of them affecting the
      others
- [x] A case file has a picture of its own, shown whole on the dossier and
      squared off on the Case Files grid (`cases.cover_crop`)
- [x] Cards draw a 900 px `card` variant instead of the 400 px thumbnail; made
      at upload, and lazily for older pictures
- [x] Bare pins: a card kind with a head and a tag, pushed in from the toolbar
      or by dropping a string end on bare cork; draggable, labellable, and any
      number of strings can tie to one. An unlabelled pin leaves with its last
      string
- [x] Either end of a selected string can be grabbed and moved to another card,
      or to bare cork
- [x] Pinning an entry to a board that hangs off a case offers to file it in that
      case too — including when a note is turned into an entry

### 8c. Dutch, and a polish pass

- [x] The whole interface in Dutch (`GLOSSARY-NL.md`), including seeded type
      labels, field labels, select options and relative times; English
      archives are brought over on start
- [x] One string per pair of cards, in the model and on the board
- [x] Home lists the open dossiers instead of a Phase-2 placeholder
- [x] The sidebar carries the tagline; hover states on cards, buttons and
      chips; filter chips scroll sideways on a phone; the boards index shows a
      cork swatch with card and string counts; the border picker has a visible
      label; the compass rose sits where it does not cover text

### Verification

- [x] 78 unit tests, including the board merge rules, endpoint shapes (old and
      new), one-string-per-pair, pins, border overrides and case visibility
- [x] Golden flows 1–4 pass at 390 px and 1440 px
- [x] Board strings/borders, per-placement crops and thumbnail clipping have
      their own specs

## Phase 3 — Keeper tools

### 9. Secrets and reveals

- [x] Entry visibility (`all` / `keeper` / `players`) from the entry page, with
      the stamp on the header following it
- [x] "Onthuld aan" picker: every player as a chip, plus one chip per case that
      ticks all its assigned investigators at once (§9's "all assigned
      investigators of case X")
- [x] Titled sections with their own visibility and their own reveals — the
      Keeper's prep, flipped on mid-session from a phone
- [x] Keeper notes per entry (Phase 1) and per case (Phase 2), never rendered
      for a player, not even in the HTML
- [x] Leak tests: a Keeper-only entry is absent from its own URL, the wiki,
      search and the home feed; a hidden section is not in another player's HTML
- [x] A reveal to named players writes no activity row — a feed line would tell
      the rest of the table that a secret exists

### 10. Locked entries and the review queue

- [x] Lock / unlock from the entry page; a player's save on a locked entry
      still says "Naar de Keeper gestuurd ter beoordeling"
- [x] Admin review queue with a per-field side-by-side diff, Approve / Reject
      and an optional note to the author
- [x] The author reads the outcome and the note on their own account page

### 11. Trash, history, site, export, audit, types

- [x] Trash: soft-deleted entries, cases and boards in one list, each restorable
      to where it was
- [x] Case and board revisions, browsable and restorable from admin
- [x] Site: name, tagline, logo and accent colour — the accent really repaints
      the stamps and buttons
- [x] "Alles downloaden": every table as JSON plus every asset, the same zip
      `scripts/backup.mjs` writes nightly (both now share `lib/archive.mjs`)
- [x] Audit rows for visibility changes, reveals, locks, deletions, restores,
      type edits, settings and exports, with Dutch labels
- [x] Entry-type editor: name, icon, colour, card border, and fields (add,
      rename, retype, reorder, remove); a type with entries cannot be removed
- [x] The seed stops overwriting type labels once the editor exists — the
      English-to-Dutch changeover runs exactly once, behind a marker row

### The page builder and the word list (§11, continued)

- [x] A soort fiche owns its page: the five built-in blocks can be renamed,
      reordered and hidden, and never deleted — a saved list missing one gets it
      back
- [x] Lists you fill yourself, as many per soort as you like, each with its own
      heading, its own note and its own restriction on which soorten may go in;
      the values live in `entries.fields` under a key assigned once from the
      heading, so renaming the heading never orphans them
- [x] Lists that fill themselves: "every Personage whose *Factie* points here",
      chosen from a dropdown of pointing fields by their on-screen names rather
      than by key; behind `visibleEntryCondition` like every other read
- [x] Per-soort wording: the question under the title, the line in the body box,
      what its "Nieuw" button says, what stands in for empty backlinks
- [x] Beheer → Woorden: about forty terms the interface repeats, each with its
      default showing through as a placeholder; only the changes are stored, so
      clearing a box is how a word is undone
- [x] The seed gives Facties, Locaties and Onderzoekers a worked example, once,
      behind a marker row, and never over a Keeper's own arrangement

### Live boards (§8, continued)

- [x] One open line per board (server-sent events on a route handler), behind
      the same session cookie and the same `getBoard()` check as every other read
- [x] A change is a signal, never a document — each client pulls its own copy,
      because board cards are resolved per viewer
- [x] Nothing is applied while a hand is on the board: a change arriving during
      a drag, a crop, a string, a marquee or an unsaved edit is remembered and
      lands when the board goes quiet
- [x] Presence: who is at the wall, as a strip of initials in the bar, and a
      coloured border round whatever each of them is holding — in memory,
      reaped after thirty seconds, never written down
- [x] A person's colour is a hash of their account, so it is the same everywhere
- [x] Falls back to polling every four seconds if the line will not stay open,
      and backs off rather than hammering a server that is down
- [x] Renames travel too: the title bar follows, unless you are typing in it

### The board's case tray

- [x] A collapsible drawer on a case-connected board listing everything filed
      in the case that is not on the wall yet; drag one onto the cork, or tap it
      to pin it at the centre (the only thing that works on a phone)

### Verification

- [x] 141 unit tests, including the live hub (an author is never told about
      their own save, a dead socket cannot silence the others, a tab that died
      mid-drag is reaped), the page-builder rules and the derived-list SQL
      against a real SQLite file (a field holding text, null, or a list of bare
      strings must not raise, and a Keeper-only member must not be listed)
- [x] Golden flows 1–5 pass at 390 px and 1440 px — flow 5 reveals a password
      with its audit row, and reveals a section from the phone viewport that the
      player then sees on refresh
- [x] Phase 3 has its own spec: the leak test, the review queue round trip, the
      trash, the type editor, site settings and the export download
- [x] The page builder and the word list have their own spec: a self-filling
      list filling itself, a hand-built list keeping what is filed in it, and a
      renamed word reaching both menus
- [x] Live boards have their own spec, and every assertion in it is made on a
      second browser that is never reloaded: a card appearing, a hand showing on
      a held card, someone leaving the strip, and a change arriving mid-drag
      without yanking the card out from under the pointer

## Phase 4 — Rights, characters, maps

### 17. Who may look, who may touch

- [x] Two dials on every fiche, dossier and prikbord — *kijken* and *bewerken* —
      each Iedereen / Gekozen personen / Privé, both defaulting to Iedereen
      (migration `0005`; `view_mode`, `edit_mode`, `access_grants`)
- [x] One rule module, `lib/access.ts`, applied by every reader and every writer:
      `viewableCondition()` is ANDed into `visibleEntryCondition` and
      `visibleCaseCondition`, so lists, search, feeds, backlinks, board cards,
      map pins and direct URLs all agree; the API refuses a write the owner did
      not allow (403)
- [x] Rights per **account**, never per character; Keepers see and edit everything,
      always; the owner always may; editing implies viewing; a Keeper's secrecy
      (§9) stays a separate layer on top
- [x] The owner turns the dials from the thing itself: a `Rechten` fold on a
      fiche, a `Rechten` chip on a dossier and a prikbord; chosen people are
      checkboxes; a Keeper can bolt the dials shut (`access_locked`)
- [x] A prikbord is born with one of two buttons, *Openbaar* or *Privé*, so a
      private wall never spends a minute public
- [x] Dossiers use the same dials; the old "toegewezen onderzoekers" list became
      the chosen-people list of the *kijken* dial (`case_members` migrated into
      `access_grants`)
- [x] Someone who may look at a fiche but not touch it still types — and what
      they type goes to the owner as a proposal through the §10 review queue,
      which the owner now judges on the fiche itself (`Voorstellen`)
- [x] Lists show a stamp — Privé / Gekozen / Vertrouwelijk — where a dial is not
      Iedereen; the §14 filters can narrow to just those

### 18. Characters

- [x] An account ties any number of fiches on as characters and wears one at a
      time (`user_characters`, `users.active_character_id`); a Keeper wears
      nobody and is always the Keeper
- [x] From a fiche: *Dit is mijn karakter*; from the Jij page: the wardrobe
      (tie on, take off, swap); from the side menu: *Je speelt als …* under the
      masthead, which opens the swap sheet — on a phone the Jij tab is the switch
- [x] The name is resolved at display time from who is active *now*, in one
      query per feed (`lib/characters.ts`: `displayNames`, `attributed`): the
      home feed, a dossier's activity, a fiche's history, who is at a wall, "X
      also edited this", proposals, dossier member initials, the reveal picker
      and the rights checkboxes; the account name stays as the tooltip and in
      Beheer

### 19. Maps

- [x] The Keeper hangs any number of maps — uploaded pictures, kept sharp to
      3200 px — and can rename, describe, reorder, redraw (same pins) or take
      one down (`maps`, `map_pins`, `/api/maps`)
- [x] A pin is a fiche or a loose note, in picture coordinates 0..1; anyone
      signed in may set one, only whoever set it or a Keeper may move, edit or
      pull it; a fiche pin is only shown to someone who may see that fiche
- [x] One picture, one transform: drag to pan, wheel or pinch to zoom, pins that
      keep their size; *Speld zetten* then a tap asks what goes there; a legend
      per kind of pin, remembered per map in the browser; *Alleen mijn spelden*;
      a search that jumps to a pin; `?pin=` deep links from the fiche's
      *Op de landkaart* row, and *Zet op …* the other way round
- [x] The old `map_pin` field kind now points at the maps page

### The dossier prompt, and sorting and filtering

- [x] Pinning a fiche on a dossier's prikbord asks "also file it?" in a sheet in
      the middle of the screen, not a toast in a corner (`ui.confirm()`, the
      app's own yes/no sheet, now available to every screen)
- [x] One bar on the wiki, dossiers, prikborden and landkaarten
      (`components/SortFilterBar.tsx`, URL-driven so a filtered list can be
      sent to someone): wiki — bewerkt / naam / aangemaakt, tag, van mij, niet
      voor iedereen, op een landkaart, and for the Keeper the §9 secrecy level;
      dossiers — open eerst / recent / naam / aangemaakt / meeste fiches, status
      (several at once), waar ik bij zit, van mij, vertrouwelijk; prikborden —
      recent / naam / aangemaakt / meeste kaarten, los of bij een dossier, van
      mij, privé of gekozen; landkaarten — volgorde / naam / recent / nieuwste,
      met mijn spelden

### Verification

- [x] 187 unit tests: the three rules of §17 (`access.test.ts`), the dossier
      condition rewritten on them, characters against a real SQLite file (the
      first tied is worn, a Keeper is refused, taking off what you wear falls
      back, switching re-labels the past), and every §14 filter from a player's
      seat as well as the Keeper's (`list-filters.test.ts`)
- [x] Playwright, desktop and phone: `access-rights.spec.ts` (a private fiche is
      nobody else's and the Keeper sees it anyway; look-but-not-touch sends a
      proposal and the owner takes it; a private board is born private and a
      chosen person may look but the API still refuses; the Keeper bolts the
      dials), `characters.spec.ts`, `maps.spec.ts`, `sort-filter.spec.ts`, and
      the dossier prompt in `board-strings-borders.spec.ts` now expects a dialog

## Phase 5 — Live: hands on the wall, shared text

### 8d. The other hand on the prikbord

- [x] Everyone's pointer on the cork, as a named arrow in their ink, in board
      coordinates under each viewer's own pan and zoom; eased between frames
      (`pointer` frames over the existing line, ~16/s, never stored)
- [x] A card being dragged travels on every other wall *while* it is dragged,
      under the mover's hand, and lands where it was put — no snap back:
      carried positions stay until the mover's save has been pulled
- [x] The drop saves at once (`saveNow`), and the debounce for everything else
      went from 800 ms to 300 ms, so a card, a note or a string is on the other
      screen inside a second
- [x] A late goodbye from a replaced line (a reconnect) no longer throws the
      tab off the roster (`connection` on presence)

### 20. Shared text (fiches, sections, dossier notes)

- [x] One Yjs document per piece of text — a fiche's body, each §9 section, a
      dossier's working notes — held in a room in the server process
      (`lib/live/docs.ts`), fanned out over server-sent events, keystrokes up
      as batched updates; carets and names through Yjs awareness
- [x] The room's gate *is* the visibility rule (`lib/live/rooms.ts`):
      `visibleEntryCondition` / `canSeeSection` / `visibleCaseCondition` to be
      in it, `canEdit` (§17) and the §10 lock to type; a POST from someone who
      may only look is 403 even if their page were lying
- [x] The archive stays the truth: the room writes itself back through
      `updateEntry` / `updateSection` / `updateCase` (revisions, links, search,
      feed) on a debounce with a ceiling, and the Yjs state is kept beside it
      (`live_docs`, migration `0006`) so a tab that was away merges instead of
      clobbering; a body written *around* the room (a restored revision, an
      approved proposal) rewrites the room (`resetRoom`)
- [x] The page hands the document over in the HTML (`snapshot`), so the
      editor has its text before the line is open; the editor is client-only
      (`next/dynamic`, `ssr: false`) and `yjs` is a server external, so the
      server holds exactly one copy of Yjs
- [x] Who else is here (initials strip + a live/offline word), other people's
      carets and selections in the text, undo that is your own
- [x] Someone who may only look sees the text live, read-only, and proposes
      through a copy (*Wijziging voorstellen* → *Voorstel sturen*) instead of
      a proposal per keystroke
- [x] The rest of the record follows: a save of name, description, tags,
      fields or cover on one screen (`saved` event) is fetched and taken over
      on the others, except in the field the person is typing in
- [x] Rooms nobody has open are written out and let go of; every dirty room is
      written before the process exits (a shutdown hook the diagnostics run)

### Verification

- [x] 199 unit tests: the room converges, persists as the last typist, merges
      an offline tab's edits, follows a rewrite, tells the room about other
      saves, survives a reconnect's late goodbye; every gate from a player's
      seat and the Keeper's (`live-docs.test.ts`); the board hub's presence
- [x] Playwright, on a second browser that is never reloaded:
      `board-live.spec.ts` (a pointer that follows, a card that travels before
      it lands and does not snap back), `entry-live.spec.ts` (typing arrives
      as typed, carets with names, the archive holds it, undo is your own, a
      rename lands on the other screen, a reader sees live and proposes) — on
      the production build and on `next dev` (Strict Mode's double mount found
      two real bugs)

## Not started (later phases)

- [ ] Obsidian import, handout PDFs

§14's Phase 4 also lists a "Dutch interface toggle"; the interface is simply
Dutch now (see `GLOSSARY-NL.md`), so a toggle would mean building an English
half nobody asked for. §16 says the default answer is no.
