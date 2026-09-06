# Zeeland Case Files

A private player aid for a West Marches *Call of Cthulhu* campaign set in a 1930s
Zeeland that has drifted into the North Sea. A wiki of typed entries, Case Files
that bundle them, and corkboards with red string.

No email, no analytics, no third-party services, nothing fetched at runtime.
One container, one SQLite file, up to about forty players.

**Phases 1 and 2 are complete**: accounts, entries, linking, search, the theme,
Case Files, clue boards and, since §32, tijdlijnen — which are **live**: two people at one board see
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
allows but the proxy refuses looks like a broken upload button — the app now
says so ("groter dan de webserver toelaat"), and **Beheer → Site →
Uploadlimiet testen** posts 1.5, 11 and 101 MB of nothing to
`/api/health/upload` and reports where it stops, with the line to add.

```nginx
server {
    server_name site.landoverwater.nl;
    client_max_body_size 100m;      # uploads: 10 MB for players, 100 MB for the Keeper
    # ...
}
```

Then `sudo nginx -t && sudo systemctl reload nginx`.

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

### Five ways this has already gone wrong

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

**5. One import in `instrumentation.ts`, and every page answers 500.**

```
⨯ ./node_modules/better-sqlite3/lib/binding.js:2:1
Module not found: Can't resolve 'fs'
Import trace: ./lib/db/index.ts → ./lib/entries/mentions.ts → ./instrumentation.ts
 GET / 500
```

Next compiles `instrumentation.ts` once for **every** runtime it supports,
edge included, even in a project where every route is `runtime: nodejs`. The
edge build can resolve neither `node:fs` nor the bare `require('fs')` inside
better-sqlite3. The `if (process.env.NEXT_RUNTIME !== 'nodejs') return` at the
top of `register()` looks like it settles this and does not: it stops the code
*running* off Node, while webpack follows every `await import(…)` in the file
into the edge bundle regardless, because a specifier that is dynamic to a
reader is perfectly static to a bundler.

The tell is that everything *works*: the start-up job runs, the log line is
written, and the site is down anyway. It bites in `next dev` first, which
compiles instrumentation for edge on the first request — a production build can
sail past it.

The answer is the `IgnorePlugin` in `next.config.mjs`, and **every module
`instrumentation.ts` imports has to be named in it**. Adding an import and
forgetting that line is the whole trap, so `tests/unit/instrumentation-edge.test.ts`
reads both files and refuses the mismatch by name.

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
    timelines/       the shelf of tijdlijnen, and one tijdlijn with its
                     gebeurtenissen (§32)
    wiki/            browse, and browse-by-type (one row of soorten as tabs)
    search/          instant search, one soort at a time
    admin/           users, review queue, types and pages, words, trash,
                     history, site, export, log
    you/             account, the wardrobe of characters, and the choice of
                     which face an artikel or dossier opens on
                     (ArticleModeForm)
  api/               entries, cases, boards, maps, timelines, characters,
                     access, assets, search, suggest, admin, ink (§33: the
                     tekenlaag of a prikbord, landkaart or tijdlijn)
components/
  editor/            Tiptap: the entryLink node, @ and [[ suggestions, toolbar;
                     the shared-text editor (useLiveDoc, LiveBody, LivePeople)
  entry/             cover (its tools behind one "Afbeelding" menu), the list
                     crop, type fields — as a form on the editing face and as
                     printed facts on the reading one (`FieldsView`) — tags,
                     the pickers for a linked artikel (EntryPicker), a linked
                     dossier (CasePicker) and the landkaart that draws this
                     place (ConnectMapButton), the autosave hook, the
                     proposals panel, the outline of the page (EntryOutline)
  cases/             the dossier — two faces, like an artikel — its add-boxes
                     and cards
  boards/            the canvas, the card (artikel, notitie, foto, punaise,
                     landkaart, dossier), the inspector, the sync hook, and
                     the "…and in the dossier too?" question (offerToFile)
  maps/              the map canvas (pan, zoom, pins, legend), the Keeper's
                     upload sheet and tools
  timelines/         the tijdlijn: the stage (axis, ticks, tags, the
                     folded-out windows), the sheets around it (the date form,
                     a new gebeurtenis, an existing one, the settings) and
                     the "Nieuwe tijdlijn" button
  ink/               §33: the tekenlaag — the canvas (InkCanvas), the
                     toolbar, the sheet that takes the hand and the Keeper's
                     switch (InkTools), and the hook that owns the strokes,
                     the frames and the saves (useInk)
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
                     the wiki's filter vocabulary, caseFields.ts and
                     caseName.ts — the dossier a clue was made in, stored as an
                     id and printed in front of its name — origin.ts, which
                     keeps that id in step with the dossiers it is filed in,
                     mentions.ts (§27: everything that is not an artikel and
                     names one) and mode.ts, reading or editing and whose
                     default is which
  admin/             trash — artikelen, dossiers, prikborden and landkaarten:
                     restoring, and the one way out of the archive
                     (destroyFromTrash) — history, the entry-type editor, the
                     word list
  cases/             the case service, its visibility rule, the lookup that
                     turns a stored dossier id into a name this viewer may see
                     (resolveCaseRefs), and tabs.ts — which soorten a dossier
                     has shelves for, and in what order
  boards/            the board service, the pure merge rule, the resolvers for
                     what a card stands for, and the live hub (presence,
                     change signals, pointer frames)
  maps/              maps, pins, and the artikel a map is a map *of*
  timelines/         §32: time.ts (pure: a moment as one integer, precision,
                     the ruling of the axis, where the tags go) and the
                     service (tijdlijnen behind the prikbord's dials,
                     gebeurtenissen behind the artikel's rule)
  live/              §20: rooms of shared text (docs.ts is the hub, rooms.ts
                     the gates, schema.ts the ProseMirror schema on the server)
  ink/               §33: the tekenlaag — types.ts (the stroke, the eight
                     colours, the limits), merge.ts (pure: append, sort,
                     tombstones, the view for one person), service.ts (the
                     one gate that is *seeing*, the Keeper's switch and wipe)
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

Thirty-two rules worth knowing before changing anything:

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
   A soort's *address* is a Keeper's to change too, which it was not before:
   `entry_types.id` **is** the slug, so `renameTypeSlug` in `lib/admin/types.ts`
   moves the row, `entries.type_id`, `cases.tab_types` and every `ofType` /
   `fromType` in every soort's fields and page blocks, in one transaction. What
   no cascade can reach is a link somebody saved, so the editor warns in plain
   Dutch and asks before it runs. `seedBaseline` remembers the rename — through
   a `schema_migrations` marker and, because a restore drops those, through the
   audit log — so a restart never puts the old address back as a second, empty
   soort.
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
16. **Every page is live, and no write is silent.** Each tab holds one line to
    the site (`/api/live/site`, `components/live/LiveProvider.tsx`), and every
    page under `app/(app)` renders `<LivePage place=… watch=[…]>` — which is
    what puts the tab on the presence strip, draws other people's hands, and
    re-renders the page from the server when a watched key moves.
    `tests/unit/live-everywhere.test.ts` fails a page without one. On the
    other side, every INSERT/UPDATE/DELETE the ORM runs passes
    `lib/live/changes.ts`, which reads the table and the ids out of the
    statement and publishes change keys (`entry:{id}`, `entries`, `case:{id}`,
    …) to whoever watches them — so a service function that forgets to
    announce itself cannot exist. Watching is gated by `lib/live/gate.ts`
    with the page's own visibility rules: a change signal for a hidden record
    is itself a leak. A key names a thing and never carries it (rule 3
    applies to the whole site now, not only to boards).
17. **A short text is a shared field.** A record's name, one-liner and string
    infobox fields live in a `fields` room (`entry:{id}:fields`,
    `case:{id}:fields`, `map:{id}:fields`, `pin:{id}:fields`) — one Y.Text per
    field — bound by `<LiveField>` inside `<LiveFields>`
    (`components/live/LiveFields.tsx`). The room saves; the parent's autosave
    is only for the road without a room (a viewer who may only propose). Any
    plain write of such a field goes through the service, which calls
    `resetFieldsInRoom` for exactly the fields it wrote — never the whole
    record, or a field someone is typing in would be reset under their hands.
    Rule 13 still holds: the archive is the truth, the room follows it.
18. **An artikel has two faces, and the reading one has no inputs in it.**
    §22. `EntryView` renders either the editing page this archive always had
    or a reading page shaped like any wiki article — a heading, a lead, the
    picture and the facts in one box on the right, prose underneath.
    `lib/entries/mode.ts` decides which a person lands on: their own setting
    from Jouw account, or, until they set one, their role — a Keeper writes so
    a Keeper edits, everyone else came to read. The toggle in the header
    crosses over, and it is not a right: a player who may only propose gets
    the editing face too, their changes simply travel as proposals (§10, §17).
    Two things follow for anything new on that page. Reading must be a *hard*
    no — `LiveBody` and `SectionsEditor` take a `readOnly` that no room may
    overrule, because the room's answer is about rights and this is about
    which face the reader asked for. And the reading face prints what is
    filled in and leaves the rest out: an empty field is not a blank row, an
    empty hand-filled list is not a list, and an artikel with no picture has
    no empty frame in its margin. A new block that is a form on one face needs
    a printed shape on the other, or it does not belong on the reading page.
    §23 gives a **dossier** the same two faces and the same one setting: a
    dossier that opens as a form for a Keeper opens as a file to read for
    everyone else, and `CaseDossier` folds "may not" (`readOnly`) and "did not
    ask to" (`reading`) together into one `locked` that every input on the page
    is switched off by.

19. **A card on a wall carries an id, and what it stands for is resolved per
    viewer.** §8, §23. A board card can stand for an artikel, a landkaart or a
    dossier (`cardRef` in `lib/boards/merge.ts` says which), and none of them
    keeps a name in the document. `resolveBoardEntries` / `resolveBoardMaps` /
    `resolveBoardCases` look each one up behind its own visibility rule, and a
    card whose record this viewer may not see comes back *absent* — the card
    draws a MISSING stamp, which is deliberately the same answer as "it was
    deleted". A fourth kind of card would add a fourth resolver and nothing
    else; it must never add a name to the JSON. The same rule governs the
    dossiers named in an infobox field (`case_link` / `case_links`): the field
    stores ids, `resolveCaseRefs` supplies the names, and an id that resolves
    to nothing prints nothing.

20. **A pointer frame is sight, never state.** §8. Cursors, carried cards and
    the selection box someone is dragging open all travel as `PointerFrame`
    over the live line, are fanned out directly, and are never stored and
    never merged — the save that follows the gesture is what makes it true.
    Everything in a frame is drawn straight into a style attribute on somebody
    else's screen, so `readPointerFrame` in `lib/boards/live.ts` is the one
    place that reads one off the wire, and it keeps a frame to finite numbers,
    forty carried cards and a box of exactly four coordinates.

21. **The bin has a bottom, and it is the only thing in the archive with
    nothing behind it.** §11. Everything soft-deletes first, so
    `destroyFromTrash` only ever reaches something already in the bin, and the
    Keeper has to type its name back before it runs. It takes everything that
    existed only because of the thing — sections, versions, reveals, links,
    proposals, spelden, the search-index row — and nothing that belongs to
    something else: a dossier's artikelen survive it, and its prikborden become
    loose prikborden rather than boards pointing at a case that is gone (which
    `getBoard` cannot open at all). The audit row is written *first*, with the
    name, because afterwards there is nothing left to look the name up in.
    §26 finished the sentence: a prikbord and a landkaart had no way into the
    bin at all, and a landkaart taken off the wall was gone for good. Everything
    the archive makes now soft-deletes into the bin, is restorable, and can be
    destroyed from there. Anything new that can be *made* needs all three.

22. **A soort can be one that only exists inside a dossier.** §24.
    `entry_types.case_only` — a voorwerp or a clue is *found*, during an
    investigation, so the "Nieuw artikel" sheet leaves it out and the wiki's own
    new button is gone for it. The sheet hiding it is a courtesy; `/api/entries`
    refusing it without a dossier the writer may edit is the rule. What comes
    out is an artikel like any other and lands in the wiki like any other; it
    simply remembers where it was born, in `entries.origin_case_id`.

23. **A name is stored short and printed long.** §24. The dossier in front of a
    clue's name ("Zaak Vlissingen: De brief") is put there by
    `entryDisplayName` where the archive *lists* it — the wiki, search, the
    autocomplete — and never written into `entries.name`: rename the dossier
    and every list follows. `nameTheirCases` looks the dossier up behind
    `visibleCaseCondition`, so somebody who may not open it is shown the plain
    name rather than told an investigation exists.

24. **Both locks have to say yes, and one panel says so.** §25. The Keeper's
    dial (`entries.visibility` + reveals) is about what the camping knows; the
    owner's dials (§17) are about who among them may look and type. They are
    AND-ed in `visibleEntryCondition` and they are now two halves of one
    "Rechten" panel, because two separate panels that quietly AND themselves
    together in the database is a thing nobody could read off the screen.

25. **A field that is handed over must not lose what was typed into it.** §21.
    A `LiveField` is a plain input until the room loads (`ssr: false`), so there
    is always a window in which somebody is typing into the parent's autosave
    instead. When the room arrives with an *empty* text and the parent has one,
    the parent's is what the person just typed and is seeded into the room; when
    the room holds anything at all, somebody is in it and the room wins. Getting
    this backwards lost a one-liner and looked exactly like a save that failed —
    `tests/unit/live-field-handover.test.ts` is the specification.

26. **"Genoemd in" counts every place a name is written, and each place is
    filtered by its own rule.** §27. `entry_links` is artikel-to-artikel and
    stays that way; `entry_mentions` is the same idea with a source that is a
    dossier's werkaantekeningen, an infobox field, one of an artikel's sections,
    a card on a prikbord or a speld on a landkaart. Like `entry_links` it is
    **derived, never authored**: `recomputeMentions` in `lib/entries/mentions.ts`
    wipes what a source said before and writes what it says now, on every save,
    hung off the *service* function so a save through a Yjs room counts exactly
    as much as a plain PATCH (rule 13). The table is therefore disposable, and
    `rebuildAllMentions()` builds it again from the archive — which
    `instrumentation.ts` does once, at start-up, when it finds it empty. Coming
    back out is where rule 1 lives: `listMentions` puts a dossier through
    `visibleCaseCondition`, a field or a section through `visibleEntryCondition`,
    a prikbord through the two conditions `getBoard` applies, and a section
    through `canSeeSection` as well — and a mention the reader may not follow is
    **absent**, not hidden and not stamped MISSING. That is the one difference
    from rule 19's MISSING card: a card on a wall you are already looking at has
    to say *something*, but "an investigation you cannot see mentions you" gives
    the investigation away whether it is named or not. A new kind of source adds
    a `fromKind`, a recompute on its save path and a branch in `listMentions`
    carrying its own condition — never a name written into the row.

27. **A dossier's tabs are a decision, not a report.** §28. `cases.tab_types` is
    null for every dossier that has never been told otherwise, and null means
    what the archive always did: one tab per soort with something filed in it. A
    list of soort slugs means those tabs are *always* there, empty or not, each
    with the add-box the populated ones have — so a fresh investigation can be
    given a Clues shelf before there is a single clue in the archive to put on
    it. `lib/cases/tabs.ts` is pure and is the specification
    (`tests/unit/case-tabs.test.ts`). Two things it is not: it is never a filter
    — any soort with something filed here keeps its tab, always, so a change of
    mind cannot hide what is in a file — and it is never a permission; who may
    see what is still §17 and §25. The order is the Keeper's own list first, then
    `TAB_ORDER`, then the soort's place in Beheer → Soorten.

28. **A reference box offers the desk you are standing at first.** §31. With an
    artikel or a dossier open, every dropdown that picks an artikel —
    `EntryPicker`, the `entry_link` / `entry_links` fields, and the editor's `@`
    and `[[` — puts what is filed in *those* dossiers above everything else. It
    is an `ORDER BY` and never a widened `WHERE`: the candidates were already
    behind `visibleEntryCondition`, the dossier ids arrive from a browser and go
    through `visibleCaseCondition` before anything is looked up in them, and a
    boosted row is marked with a folder icon and never with a dossier's name.
    Rule 1 has one more place it could be broken and is not. The ids travel by
    context (`components/entry/PreferredCases.tsx`), because the pickers sit four
    levels below the pages that know.

29. **The letters can be changed and the stamps cannot.** §29. Jouw account has a
    third dial beside the theme and the face a page opens in: Archief, Beter
    leesbaar (Atkinson Hyperlegible) or Dyslexie (OpenDyslexic). It re-points
    `--serif` and `--sans` and nothing else — `--stamp-face` stays, because a
    dyslexia setting that flattens the whole archive into one font takes the
    archive away rather than making it readable. Both faces are bundled through
    `@fontsource`, so nothing is fetched at runtime and the promise on the front
    page of this README still holds. The attribute is written on one wrapper in
    `app/(app)/layout.tsx` on the server, so there is no flash and nothing
    becomes client-rendered; the second selector in `globals.css`
    (`:root:has(…)`) is what reaches a `Sheet`, which portals onto `<body>`
    outside that wrapper. **`npm ci` is required after this change** — two new
    dependencies.

30. **A picture arrives by one road, whichever way it was picked up.** §30. The
    file dialog and the clipboard both end at the same upload, everywhere a
    picture is taken: the cover, the prose editor, a card on a prikbord, a
    landkaart, the site's logo. `imageFromClipboard` in `lib/upload.ts` is the
    only place that reads a clipboard, because a browser puts a picture there in
    two different shapes — `clipboardData.files` for a file copied in Explorer,
    an `image/*` entry under `clipboardData.items` (nameless) for a screenshot
    or a picture copied out of a web page — and anything reading only the first
    silently ignores the commonest paste there is. The size ceiling is
    deliberately *not* in that helper: it belongs to the upload, which already
    knows whose ceiling applies (`uploadLimitFor`) and is checked again on the
    server against the bytes that actually arrived. A paste that grew a limit of
    its own, or a second wording for "too large", is the bug this rule exists to
    prevent.

31. **The cork is not text, and the cork does not scroll.** §30. A corkboard is a
    thing you drag, and a browser's answer to a drag is to sweep a text selection
    across everything it passes — which fought the board's own selection
    rectangle (rule 20) over the same gesture. So `.board-viewport`, the world,
    the cards and the pins are `user-select: none`, and the text you can actually
    type in is handed back explicitly; anything new that puts *readable* text
    inside `.board-viewport` needs a `user-select: text` of its own. The second
    half is the one that bites silently: the wall's position is the transform on
    `.board-world` and nothing else, but an `overflow: hidden` box is still a
    scroll box, so a browser revealing a focused field could slide the whole cork
    sideways behind the board's back and never put it back. `overflow: clip`
    means there is nothing to scroll, and the `onScroll` in `BoardCanvas` puts it
    back where `clip` is not understood. For the same family of reasons a new
    card is now laid down *in sight*: `freeSpotNear` prefers a spot on screen
    that overlaps a little over a clear spot outside the view, because on a phone
    the view is two cards wide and the old answer was a card you never saw.

32. **A tijdlijn measures; a gebeurtenis is a moment on it, and the tijdlijn
    keeps its own words about that moment.** §32. A tijdlijn is made like a
    prikbord — by anyone, with the owner's two dials (`timeline` is the fourth
    `AccessTargetType`), loose or in a dossier, into the bin and back — and
    `scale` (jaren … seconden) is the one thing it asks before it exists: it
    decides which boxes the date form offers and how the axis is ruled. A
    moment is one integer (seconds, proleptic Gregorian, no time zone —
    negative for the 1930s) plus a *precision*, so "1931" and "12 maart 1931,
    14:30" both have a place and print as they were typed; `precision` is
    clamped to the scale at *read* time, never rewritten, so a coarser measure
    hides detail and a finer one brings it back. Every piece of it is pure in
    `lib/timelines/time.ts` and `tests/unit/timeline-time.test.ts` is the
    specification. A gebeurtenis is either an artikel (any soort; it wears the
    soort's icon and colour and the larger mark, because an artikel is the
    archive saying this mattered) or a *note* that exists on this axis and
    nowhere else — it has no id anywhere but `timeline_events`, cannot be
    pinned, mapped or named in a field, and becomes an artikel in place the
    way a notitie on a wall does. Both keep the tijdlijn's own `text` and
    picture frame on the row, like a card on a prikbord (rule 8's §8): the
    artikel behind an artikel gebeurtenis is read for its name and cover and
    never written to from here. Rule 1 holds through `visibleEventCondition`;
    rule 16 through `timeline:{id}` / `event:{id}` keys and the `timelines`
    collection; rule 17 through the `event:{id}:fields` room; rule 19 through
    a fourth card kind with a fourth resolver; rule 21 through `listTrash` /
    `destroyFromTrash('timeline')`; rule 26 through `recomputeTimelineMentions`.

33. **Drawing is for everyone who may look, and a gum is a stroke.** §33. The
    tekenlaag on a prikbord, a landkaart or a tijdlijn is the one write in the
    archive that asks *may this person see it* and nothing more — rule 10's
    `viewerCanEdit` does not apply, by Nick's decision: the layer is a shared
    scribble over the work, not the work, it holds no archive content, and
    "everyone may rub out everyone's lines" is the point. The edit dial still
    guards everything underneath it. Do not "fix" this by adding the boolean
    to `lib/ink/service.ts`; `tests/unit/ink-service.test.ts` asserts it from
    the side of a viewer the edit dial shuts out. A stroke is a record
    (`lib/ink/types.ts`), never a bitmap, and the gum is a stroke too, painted
    with `destination-out` in the server's time order — so it takes away only
    what was there before it, nothing is ever cut in two, and the merge stays
    "append and sort". Undo lifts a stroke by tombstone, the corkboard's rule
    (rule 2's tombstones), so a stale screen cannot put it back. The Keeper's
    switch is a column; off means 403 for every stroke and undo and the
    strokes stay where they are; only a Keeper flips it or wipes, and both go
    to the audit log. The layer has its own table, its own key (`ink:{id}`,
    gated like the thing it hangs on) and its own line — never the board
    hub, never a column on `boards`/`maps`/`timelines`, so a stroke a second
    does not re-render every page that watches those. Frames of a stroke in
    progress ride the site line like pointer frames: sight, never state
    (rule 20). Coordinates are the place's own — board units, picture pixels,
    and on a tijdlijn *seconds* for x and a fraction of the stage for y, so a
    circle round 1887 stays round 1887. `InkCanvas` draws in screen pixels
    through a `project` function the place supplies; it knows nothing else.
    The frame of anything without a picture starts *shut* — a gebeurtenis, and
    since this round an artikel card on a wall too (`defaultShowImage(kind,
    hasPicture)`) — and the button that opens it is where the soort's icon
    waits.
