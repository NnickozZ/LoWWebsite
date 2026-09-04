# Zeeland Case Files

A private player aid for a West Marches *Call of Cthulhu* campaign set in a 1930s
Zeeland that has drifted into the North Sea. A wiki of typed entries, Case Files
that bundle them, and corkboards with red string.

No email, no analytics, no third-party services, nothing fetched at runtime.
One container, one SQLite file, up to about forty players.

**Phases 1 and 2 are complete**: accounts, entries, linking, search, the theme,
Case Files and clue boards — which are **live**: two people at one board see
each other's cards appear, and a coloured border round whatever the other is
holding. Phase 3 is the Keeper's tools — reveal controls,
review queue, trash, export — and, on top of it, the two things that let a Keeper
reshape the archive without touching this repository: a **page builder**, where a
soort fiche decides what its page is made of (including lists that fill
themselves), and a **word list**, where every term the interface repeats can be
renamed. See `PLAN.md` for exactly where things stand and `DECISIONS.md` for the
choices made along the way.

---

## Running it on your own laptop

No Docker, no VPS, no network needed.

```bash
npm install
npm run dev          # or: make dev
```

The first run creates `./data/app.db`, applies migrations, seeds the entry types
and writes a `.env` with fresh random secrets. It prints two URLs:

```
Local:   http://localhost:3000
Network: http://192.168.1.20:3000   (phones on the same Wi-Fi)
```

Then, in a second terminal:

```bash
npm run bootstrap    # creates the first Keeper and prints the invite code
npm run seed-demo    # optional: 21 Zeeland entries, one open case, one board
```

Sign in as the Keeper. Everyone else signs up at `/signup` with the invite code,
which you can see and regenerate under **You → Admin**.

`npm run seed-demo` refuses to run once the archive has entries in it, so it can
never trample real notes. `make reset` deletes `./data` after a confirmation.

### Testing on a phone

`npm run dev` binds to `0.0.0.0` and prints the LAN address. Session cookies are
marked `Secure` only when `PUBLIC_URL` starts with `https://`, so plain http on a
LAN address works.

---

## Everyday commands

| Command | What it does |
|---|---|
| `make dev` | The app at `localhost:3000`, also on the LAN |
| `make bootstrap` | Create a Keeper (`--username X --password Y` for scripts) |
| `make seed-demo` | Load the Zeeland demo dataset |
| `make reset` | Delete `./data` after confirming |
| `make backup` | Write a zip of every table plus all assets to `./data/backups` |
| `make restore FILE=…` | Restore from one of those zips |
| `make test` | Unit tests |
| `make test-e2e` | The golden flows, at 390 px and 1440 px |
| `E2E_DEV=1 npm run test:e2e` | The same flows against `next dev`, where React Strict Mode double-invokes state updaters |
| `make typecheck` | `tsc --noEmit` |
| `make docker` | Build and run the production image against the same `./data` |

---

## Deploying

`docker compose up` locally first — it uses the same `./data` folder, so you can
verify the exact production image before renting anything.

On the VPS:

```bash
# copy the repo and ./data across, then
echo "PUBLIC_URL=https://cases.example.nl" >> .env
docker compose up -d
```

Put Caddy or the host's reverse proxy in front for TLS. The compose file also
runs a small sidecar that writes a backup zip at 03:15 every night and keeps the
last fourteen.

### Without Docker (Node + pm2)

If the VPS already runs Node for something else, the app can run beside it.
Two rules, and both matter:

- **Never run `npm run dev` on the server.** The dev server recompiles every
  route the first time someone opens it, keeps the whole webpack graph in
  memory — measured at 860 MB and climbing, against about 165 MB for the built
  app — and shows React's development warnings to whoever is looking. On a
  machine shared with another service it is the process the kernel kills first,
  which looks like "the site goes down whenever someone opens a board".
- **Never copy `node_modules` to the server.** `better-sqlite3`, `sharp` and
  `@node-rs/argon2` are compiled for the machine that installed them; a copy from
  Windows or a Mac fails on Linux with `invalid ELF header`. `npm ci` on the
  server is the fix, every time.

First time:

```bash
sudo apt install -y build-essential python3      # in case a native module has to compile
npm install -g pm2                               # Foundry's own docs recommend the same tool
git clone <your repository> /home/LandOverWater
cd /home/LandOverWater
cp .env.example .env                             # then set PUBLIC_URL and fresh secrets
# bring an existing ./data folder across here, if there is one
npm ci && npm run build
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
```

Every update after that, on the server:

```bash
cd /home/LandOverWater && bash scripts/deploy.sh
```

`pm2 logs landoverwater` shows the server's own output, `pm2 status` whether it
is up. The nightly backup that the compose file's sidecar provides is
`npm run backup` here; `crontab -e` with `15 3 * * * cd /home/LandOverWater && npm run backup`
does the same job.

### Environment

Everything has a working local default in `.env.example`.

| Variable | Notes |
|---|---|
| `PUBLIC_URL` | Drives the `Secure` cookie flag. Set it to your https URL in production |
| `SESSION_SECRET` | 32 random bytes, hex |
| `PASSWORD_RECOVERY_KEY` | **64 hex characters exactly.** Encrypts the recoverable copy of passwords |
| `DATA_DIR` | Where `app.db`, `assets/` and `backups/` live |
| `PORT` | Defaults to 3000 |

If `PASSWORD_RECOVERY_KEY` is ever lost or changed, **logins keep working** —
they use the argon2id hash. Only "Reveal password" stops working for passwords
set under the old key; "Set new password" still does.

---

## A note on password recovery

The brief asks for Keeper-recoverable passwords, which means keeping something
reversible. Two things are stored per account:

- an **argon2id hash**, the only thing consulted when someone logs in;
- an **AES-256-GCM encrypted copy**, read only when a Keeper presses "Reveal
  password", which writes an audit row naming who revealed whose, and when.

The encryption key lives only in the server environment, never in the database,
so a stolen `app.db` on its own yields nothing but hashes. Players are told at
signup not to reuse a password from another site. That is as safely as this
requirement can be done, and the audit log is what keeps it honest.

---

## Layout of the code

```
app/
  (auth)/            login, signup, their server actions
  (app)/             everything behind the login
    e/[slug]/        the entry page: inline editing, backlinks, history
    c/[slug]/        the case dossier: tabs on desktop, stacked on a phone
    b/[id]/          the corkboard
    cases/ boards/   the two index pages
    wiki/            browse, and browse-by-type
    search/          instant search
    admin/           users, review queue, types and pages, words, trash,
                     history, site, export, log
    you/             account
  api/               entries, cases, boards, assets, search, suggest, admin
components/
  editor/            Tiptap: the entryLink node, @ and [[ suggestions, toolbar
  entry/             cover, the list crop, type fields, tags, the autosave hook
  cases/             the dossier, its add-boxes and cards
  boards/            the canvas, the card, the inspector, the sync hook
  ui/                the new-entry and new-case sheets, toasts, shortcuts
lib/
  auth/              password hashing and recovery, sessions, rate limiting
  db/                schema, migrations, seeds, the connection
  entries/           the entry service, the document helpers, visibility,
                     sections and reveals (secrets.ts), the review queue
  admin/             trash and history, the entry-type editor, the word list
  cases/             the case service and its visibility rule
  boards/            the board service, the pure merge rule, and the live hub
  search/            fuzzy ranking, the search service
words.ts             every term the interface repeats, with its default
pageBlocks.ts        what a soort fiche's page is made of (pure; the queries
                     behind it live in lib/entries/derived.ts)
scripts/             dev, bootstrap, seed-demo, backup, restore
tests/unit/          vitest
tests/e2e/           playwright, the golden flows
```

The interface is Dutch; `GLOSSARY-NL.md` is the list of terms every screen
uses. Code, comments and these docs are English.

Nine rules worth knowing before changing anything:

1. **Every read of an entry goes through `visibleEntryCondition()`, and every
   read of a case through `visibleCaseCondition()`.** Lists, search,
   autocomplete, backlinks, feeds, previews, board cards and direct URLs all use
   them. A new query that skips one is how a Keeper's secret leaks. A board card
   whose entry the viewer may not see comes back stamped MISSING, exactly like a
   deleted one.
2. **The board's merge rule lives in `lib/boards/merge.ts` and is pure.** The
   server is the only thing that merges; the client sends what it knows plus the
   ids it deleted, and applies whatever comes back. `tests/unit/board-merge.test.ts`
   is the specification.
3. **What travels down a board's live line is a signal, never the document.**
   `lib/boards/live.ts` broadcasts "the board moved"; each client then GETs its
   own copy. That extra round trip is not an oversight — board cards are
   resolved per viewer, so one merged state fanned out to every listener would
   hand a player the name of a Keeper-only fiche, and rule 1 would have a second
   place it could be broken. Presence (who is at the wall, what they are
   holding) is the only thing the hub itself knows, it lives in memory, and it
   is gone thirty seconds after a tab stops saying hello. Nothing is applied to
   a client that is mid-drag or holding unsaved work: `useBoardLive` remembers
   the change and lands it when the board goes quiet.
4. **`.mjs` files are shared with the CLI scripts.** `lib/auth/password.mjs`,
   `lib/db/open.mjs`, `lib/db/seed.mjs`, `lib/borders.mjs` and `lib/zip.mjs` are
   plain JavaScript so that `npm run bootstrap` and the app cannot drift into two
   ways of storing a password, two versions of the schema, or two lists of border
   treatments.
5. **A picture is cropped per *placement*, never on disk.** The entry page shows
   the whole image at whatever shape it is. `entries.cover_crop` is only the
   default for lists; `case_entries.crop` and a board card's own `crop` override
   it where they are set. All three are `{ x, y, zoom }` and all three fall back
   to the one above when null. A case's own picture works the same way
   (`cases.cover_asset_id` + `cases.cover_crop`).
6. **Anything a player may not see is dropped on the server.** A Keeper-only
   entry never reaches a query (`visibleEntryCondition`); a hidden section never
   reaches the props (`listSections`); Keeper notes are blanked in
   `getEntryBySlug`. Nothing is hidden with CSS, and
   `tests/e2e/flow-5-keeper.spec.ts` asserts the raw HTML.
7. **A soort fiche owns its page, and `lib/pageBlocks.ts` is the only thing
   that reads `entry_types.blocks` raw.** Everything else goes through
   `resolveBlocks()`, which guarantees the five built-in blocks are all present
   exactly once — hidden if the Keeper hid them — so no saved arrangement, however
   mangled, can leave a soort with a page that has nowhere to type. A block that
   is a *read* of the archive (a self-filling list, the backlinks, the history)
   is rendered on the server in `app/(app)/e/[slug]/page.tsx` and handed to
   `EntryView` as a slot, so its rows stay behind `visibleEntryCondition` and
   never travel to a player's browser as props. Rule 1 applies to a derived list
   exactly as it does to a search result.
8. **No screen types a word that `lib/words.ts` already holds.** About forty
   terms — fiche, dossier, prikbord, punaise, the menu, the main buttons, the
   Beheer tabs — are the Keeper's to rename in Beheer → Woorden. Read them from
   `useUi().words` in a client component and `getWords()` on the server; adding a
   term to that file is what puts it on the screen. Only the Keeper's *changes*
   are stored, so an empty box means the default and improving a default still
   reaches every archive.
9. **Three sizes of every picture.** `?s=thumb` (400 px) for the feed and the
   search list, `?s=card` (900 px) for any card, and the bare id (1600 px) for
   the entry page, the lightbox and crop frames. `lib/assets.ts` makes the card
   size on first request for pictures uploaded before it existed.
