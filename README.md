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
| `make dev` | The app at `localhost:3000`, also on the LAN — **development only, never on a server** |
| `npm ci && npm run build && npm start` | The production server, which is what a VPS runs |
| `make bootstrap` | Create a Keeper (`--username X --password Y` for scripts) |
| `make seed-demo` | Load the Zeeland demo dataset |
| `make reset` | Delete `./data` after confirming |
| `make backup` | Write a zip of every table plus all assets to `./data/backups` |
| `make restore FILE=…` | Restore from one of those zips |
| `make logs` | Everything the server wrote down; `make logs ARGS=--errors` for the bad news only |
| `make test` | Unit tests |
| `make test-e2e` | The golden flows, at 390 px and 1440 px |
| `E2E_DEV=1 npm run test:e2e` | The same flows against `next dev`, where React Strict Mode double-invokes state updaters **and React's own warnings are still in the build** — `tests/e2e/no-console-warnings.spec.ts` only earns its keep here |
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

**Uploads and the proxy.** A player may upload a picture of 10 MB, a Keeper
one of 100 MB (`lib/assets.ts`). Whatever sits in front of the server has a
ceiling of its own: nginx refuses anything over 1 MB unless `client_max_body_size
100m;` is set on the server block; Caddy has no such default. A limit the app
allows but the proxy refuses looks like a broken upload button.

### Without Docker (Node + pm2)

If the VPS already runs Node for something else, the app can run beside it.

```bash
sudo apt install -y git
npm install -g pm2
git clone https://github.com/NnickozZ/LoWWebsite.git /home/LandOverWater
cd /home/LandOverWater
cp .env.example .env                # then set PUBLIC_URL and fresh secrets
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
`npm run backup` here; `crontab -e` with
`15 3 * * * cd /home/LandOverWater && npm run backup` does the same job.

### Four ways this has already gone wrong on a server

Every one of these was diagnosed the hard way. They are listed because none of
them announces itself as what it is.

**1. `node_modules` copied from another machine.** `better-sqlite3`, `sharp` and
`@node-rs/argon2` ship compiled binaries. A folder copied from Windows fails on
Linux with `invalid ELF header`, and the copy also loses the executable bit on
`node_modules/.bin/*`, which surfaces as `prebuild-install: Permission denied`
and then a compile from source that needs a toolchain the box does not have.
`npm ci` on the machine that will run the app is the only supported install, and
`node_modules` is in `.gitignore` so it can never travel by accident.

**2. `npm run dev` as the public server.** The development server compiles each
route on first visit and holds the whole build graph in memory — measured at
860 MB and climbing against about 165 MB for the built app. On a box shared with
another service it is the first thing the kernel kills, which reads as "the site
goes down whenever someone opens a board". It also serves React's development
warnings to players.

It has a second failure that looks nothing like a server problem. `next dev`
refuses `/_next/*` requests from any origin not in `allowedDevOrigins`, so
reaching it as `landoverwater.nl` instead of `localhost` serves the HTML happily
and answers **403 for every script chunk**. React never hydrates. The pages look
completely normal and not one button does anything — no error, no clue, and the
browser console shows only a failed HMR websocket. This project's
`allowedDevOrigins` now includes the host from `PUBLIC_URL` so development
against a real name works, but the fix is not to run development on a server:
`next start` has no origin list and no HMR socket at all.

`npm start` (via `scripts/start.mjs`) is the server.

**3. A Next.js the project has never been built against.** When
`node_modules/.bin` is missing or unusable, `npx next dev` quietly downloads
whatever the latest major happens to be and runs *that* — a server was found
running Next 16 while `package.json` said 15. `next`, `react` and `react-dom`
are therefore pinned to exact versions, and `npm run dev` / `npm start` both
invoke this project's own Next by path rather than through `npx`.

A stale `node_modules` fails in a way that sends you somewhere else entirely.
Building with a leftover Next 16 reports `This build is using Turbopack, with a
webpack config` and then `Call retries were exceeded` — an error about build
systems, when the real problem is that `npm ci` never ran or failed with its
message scrolled off the screen. So `npm run build` and `npm start` both begin
with `scripts/check-install.mjs`, which compares what is installed against
package.json and stops with the version numbers side by side:

```
  - next: 16.3.4 is installed, package.json wants 15.5.25
  - better-sqlite3: 11.10.0 is installed, package.json wants ^13.0.3
      versions below 13 … abort the entire process on Node 24.19 or newer

    rm -rf node_modules && npm ci
```

It is chained with `&&` inside the `build` script rather than living in a
`prebuild` hook, because `ignore-scripts=true` in `.npmrc` silently skips
`pre`/`post` hooks — and a guard that can be skipped is not a guard.

**4. `better-sqlite3` 11 on Node 24.19 or newer — a hard process abort.**

```
# Assertion failed: (env) != nullptr
2: node::RemoveEnvironmentCleanupHook(...)
3: Statement::~Statement() [.../better_sqlite3.node]
```

Node 24.19.0 added cleanup hooks to the legacy `node::ObjectWrap`
([nodejs/node#63642](https://github.com/nodejs/node/pull/63642)). Every class in
better-sqlite3 11 and 12 derives from `node::ObjectWrap`, so when a V8
environment is torn down while prepared statements are still alive, the
destructor calls `RemoveEnvironmentCleanupHook` against an environment that is
already gone and Node aborts — not an exception, not a stack trace in the app,
the *whole process*, taking every connected player with it. Everything
downstream looks like a different bug: "New board does nothing" (the POST
succeeded, the navigation that followed it hit a dead server),
`NetworkError when attempting to fetch resource`, a site that only falls over
once a second person is on it.

`better-sqlite3` 13 moved to Node-API and links no `node::` C++ symbol at all,
so the abort is structurally impossible rather than merely unlikely. That is why
this project pins `better-sqlite3` to `^13`, and why the version must not be
walked back. It is also why the server needs no compiler any more: v13 ships
Node-API prebuilds that do not care which Node it is loaded into.

**No compiler, and it stays that way.** npm gives any package with a
`binding.gyp` and no install script an implicit `node-gyp rebuild`, so a plain
`npm ci` will compile better-sqlite3 from source and want `build-essential`
back — for a binary it already shipped. The committed `.npmrc` sets
`ignore-scripts=true` to stop that, and `scripts/deploy.sh` passes
`--ignore-scripts` as well, so a deploy is safe even from a checkout where the
file went missing. Every native dependency here (better-sqlite3, sharp,
`@node-rs/argon2`) ships prebuilds, so the install is identical on Windows,
Linux and in Docker, and no dependency runs code during a deploy. If a
dependency is ever added that genuinely needs a postinstall step, that setting
is what will have quietly skipped it.

### When it goes wrong: the logbook

Three outages here left nothing to read. The server died, the browser said
`NetworkError when attempting to fetch resource`, buttons stopped doing
anything, and the request log simply stopped mid-sentence. So everything that
can be caught is now written down, synchronously, to `data/logs/` — on the
server, next to the archive, surviving restarts, kept for fourteen days.

```bash
npm run logs              # everything, newest last  (or: make logs)
npm run logs -- --errors  # only the entries worth waking up for
```

Four things write to it, and between them they cover every way this server has
actually died:

| What | Where it comes from |
|---|---|
| Errors in any page, layout, route handler or **server action** | `onRequestError` in `instrumentation.ts` — this is the "the button did nothing" case |
| Uncaught exceptions and unhandled rejections | process handlers in `lib/diagnostics.ts` |
| **Errors in the browser** | `components/ErrorReporter.tsx` → `POST /api/client-error` |
| The server being killed, and by what signal | `scripts/start.mjs` |

That last row is the one that was missing. A line reading
`FATAL server died: killed by SIGKILL` means the kernel's out-of-memory killer
took it — the box ran out of RAM. `killed by SIGABRT` means a native crash, and
V8 will have dropped a `report-*.json` beside the log with the native stack;
`npm run logs` lists those separately. Neither of those can be caught from
JavaScript, which is exactly why the wrapper watches the child process instead
of trusting it to say goodbye.

A browser error matters as much as a server one. When a client component throws,
React tears down the interactive tree and the page keeps *looking* fine while
every button silently stops working — which is precisely what "I could not press
any buttons to create new entries" was. Nothing reaches the server on its own,
so `ErrorReporter` posts it, and the log line names the signed-in user, the URL
and the stack.

To take a snapshot of a server that is misbehaving but still up:
`kill -USR2 $(pgrep -f next-server)` writes a full diagnostic report — heap,
handles, native stack — into `data/logs/`.

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
    cases/ boards/   two of the index pages
    maps/            the shelf of maps, and one map with its pins
    wiki/            browse, and browse-by-type (one row of soorten as tabs)
    search/          instant search, one soort at a time
    admin/           users, review queue, types and pages, words, trash,
                     history, site, export, log
    you/             account, and the wardrobe of characters
  api/               entries, cases, boards, maps, characters, access, assets,
                     search, suggest, admin
components/
  editor/            Tiptap: the entryLink node, @ and [[ suggestions, toolbar;
                     the shared-text editor (useLiveDoc, LiveBody, LivePeople)
  entry/             cover, the list crop, type fields (also as an infobox),
                     tags, the autosave hook, the proposals panel, the
                     outline of the page (EntryOutline)
  cases/             the dossier, its add-boxes and cards
  boards/            the canvas, the card, the inspector, the sync hook
  maps/              the map canvas (pan, zoom, pins, legend), the Keeper's
                     upload sheet and tools
  access/            the two dials (kijken, bewerken) and their checkboxes
  you/               the character switcher and the wardrobe
  ui/                the new-entry and new-case sheets, the yes/no sheet,
                     toasts, shortcuts
  SortFilterBar.tsx  the one toolbar every list page shares: count, the
                     Filters panel, the sort, the active-filter chips
  TypeTabs.tsx       the wiki's soorten as tabs, with counts
  useOverflowing.ts  "does this strip really overflow?" — for scrollbars that
                     should not show until they must
lib/
  auth/              password hashing and recovery, sessions, rate limiting
  db/                schema, migrations, seeds, the connection
  entries/           the entry service, the document helpers, visibility,
                     sections and reveals (secrets.ts), the review queue,
                     the wiki's filter vocabulary
  admin/             trash and history, the entry-type editor, the word list
  cases/             the case service and its visibility rule
  boards/            the board service, the pure merge rule, and the live hub
                     (presence, change signals, pointer frames)
  maps/              maps and pins
  live/              §20: rooms of shared text (docs.ts is the hub, rooms.ts
                     the gates, schema.ts the ProseMirror schema on the server)
  editor/            the one list of Tiptap extensions both halves build from
  search/            fuzzy ranking, the search service
access.ts            §17: who may look and who may touch, as one SQL condition
                     for readers and one boolean for writers
characters.ts        §18: who a person is being, and the name a feed prints
listParams.ts        the server half of the sort-and-filter bar
words.ts             every term the interface repeats, with its default
intro.ts             the start page's welcome: the default text and paragraphs
assets.ts            pictures in three sizes, and the two upload ceilings
pageBlocks.ts        what a soort artikel's page is made of (pure; the queries
                     behind it live in lib/entries/derived.ts)
scripts/             dev, bootstrap, seed-demo, backup, restore
tests/unit/          vitest
tests/e2e/           playwright, the golden flows
```

The interface is Dutch; `GLOSSARY-NL.md` is the list of terms every screen
uses. Code, comments and these docs are English.

Fifteen rules worth knowing before changing anything:

1. **Every read of an entry goes through `visibleEntryCondition()`, and every
   read of a case through `visibleCaseCondition()`.** Lists, search,
   autocomplete, backlinks, feeds, previews, board cards, map pins and direct
   URLs all use them. A new query that skips one is how a Keeper's secret
   leaks. A board card whose entry the viewer may not see comes back stamped
   MISSING, exactly like a deleted one. Since §17 both conditions also carry the
   owner's *kijken* dial (`viewableCondition()` from `lib/access.ts`), so a
   private fiche is hidden by the same clause that hides a secret one.
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
   the change and lands it when the board goes quiet. Since Phase 5 the line
   also carries *pointer frames* — where each hand is and where the card in it
   is right now — which are fanned out at once and never stored; a card
   carried by someone else is drawn where their hand has it and stays there
   until their save has been pulled, so it never snaps back.
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
8. **No screen types a word that `lib/words.ts` already holds.** About sixty
   terms — artikel (which was "fiche" until 5 September 2026; the keys still
   say `entry`), dossier, prikbord, punaise, landkaart, speld, karakter,
   toegewezen, the menu, the main buttons, the Beheer tabs — are the Keeper's
   to rename in Beheer → Woorden. Read them from
   `useUi().words` in a client component and `getWords()` on the server; adding a
   term to that file is what puts it on the screen. Only the Keeper's *changes*
   are stored, so an empty box means the default and improving a default still
   reaches every archive.
9. **Three sizes of every picture.** `?s=thumb` (400 px) for the feed and the
   search list, `?s=card` (900 px) for any card, and the bare id (1600 px) for
   the entry page, the lightbox and crop frames. `lib/assets.ts` makes the card
   size on first request for pictures uploaded before it existed. A map is the
   one exception: it is kept to 3200 px, because it is the one picture people
   zoom into.
10. **Every write asks `lib/access.ts` first.** `viewerCanEdit(target, id,
    viewer)` for a case, a board or a fiche; the API answers 403 when it says
    no, and the screen has already hidden the tools. The three rules — Keepers
    may do anything; the owner always may; editing implies viewing — are in
    `canView` / `canEdit` / `canManageAccess`, and `tests/unit/access.test.ts`
    is their specification. Rights are per **account**; a character (§18) is a
    name, never a key.
11. **A feed prints the character, never the account.** Any row that carries an
    actor (`actorId`, `actorName`, `actorIsKeeper`) goes through `attributed()`
    from `lib/characters.ts` on the page that shows it; single names go through
    `displayNameOf()`. The account stays in the tooltip. A Keeper is always the
    Keeper's word. A new feed that prints `users.username` directly is a bug.
12. **Sorting and filtering are the URL.** A list page reads its search params
    with `lib/listParams.ts` (`readOne`, `readMany`) and hands
    `components/SortFilterBar.tsx` the same options; the bar only ever writes
    the URL. Every filter is another `AND` on a query that already carries the
    visibility conditions — never a substitute for them.
13. **Shared text is a room, and the room's gate is the visibility rule.** A
    fiche's body, each of its sections and a dossier's notes are Yjs documents
    held in `lib/live/docs.ts` and fanned out to everyone in the room; who is
    in the room is decided by `lib/live/rooms.ts` with the *same* conditions
    the page renders with (`visibleEntryCondition`, `canSeeSection`,
    `visibleCaseCondition`), and who may type by `canEdit` and the §10 lock —
    checked again on every POST. `entries.body` (and friends) stay the truth:
    the room writes itself back through `updateEntry` / `updateSection` /
    `updateCase`, and a body written around the room is pushed back *into* it
    with `resetRoom`, never the other way. A new piece of prose that wants to
    be shared gets a key and an `admit` branch there; nothing else. The editor
    that binds to a room is loaded client-only, and `yjs` is a server
    external, so the server holds one copy of Yjs — two copies fail their own
    `instanceof` checks, and Yjs says so at start-up.
14. **A `Sheet` never re-binds while it is open.** Its key handler and its
    focus bookkeeping run once, for the life of the sheet, and read the latest
    `onClose` through a ref. An effect that depended on `onClose` — which every
    caller passes as an inline arrow, a new function per render — re-ran on
    each keystroke and handed focus back to the button that opened the sheet.
    Anything else that "restores" focus or binds a document listener should be
    written the same way.
15. **Pins, cursors and anything else that must stay crisp live outside the
    transformed layer.** The map's picture is scaled with one transform; its
    pins are placed in stage pixels from the same view state, in a layer that
    is never scaled. A child counter-scaled inside a transformed layer keeps
    its size but is rasterised at the layer's scale — blurry at 4x. The board's
    live cursors follow the same idea.
