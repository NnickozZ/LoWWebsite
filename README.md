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

**Uploads and the proxy.** A player may upload a picture of 2 MB, a Keeper one
of 20 MB. The two numbers live in `lib/upload.ts` — which is pure, so the
browser can read them too — and `lib/assets.ts` re-exports them and is still
the only place they are *enforced*, twice: on the size the browser declared,
and again on the bytes that arrived. A player rarely meets the ceiling at all,
because the browser shrinks an oversized picture to fit before it sends it
(rule 30).

Whatever sits in front of the server has a ceiling of its own: nginx refuses
anything over 1 MB unless `client_max_body_size 25m;` is set on the server
block; Caddy has no such default. A limit the app allows but the proxy refuses
looks like a broken upload button — the app says so ("groter dan de webserver
toelaat"), and **Beheer → Site → Uploadlimiet testen** posts 1.5, 3 and 21 MB
of nothing to `/api/health/upload` and reports where it stops, with the line to
add. (`?probe=1.5,3,25` in the URL climbs other steps.)

```nginx
server {
    server_name site.landoverwater.nl;
    client_max_body_size 25m;       # uploads: 2 MB for players, 20 MB for the Keeper
    # ...
}
```

Apache calls the same thing `LimitRequestBody 26214400`.

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
    you/             account, and the wardrobe of characters — which of the
                     ones you hold you are wearing. Handing one out is the
                     Keeper's (§18c, rule 42), so the wardrobe has no ✕ on it;
                     the choice of which face a page opens on is gone
                     altogether (rule 18: everybody lands on lezen)
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
                     switch (InkTools: one strip of three dots that is the
                     brushes with the potlood and the gummen with the gum),
                     and the hook that owns the strokes, the frames and the
                     saves (useInk)
  access/            the two dials (kijken, bewerken) and their checkboxes
  you/               the character switcher and the wardrobe, and §18b's
                     AuthorProvider — the question this window answers once
                     ("Met wie ben je nu aan het schrijven?"), the
                     "Je schrijft als …" line and the read-only banner
  ui/                the new-entry and new-case sheets, the yes/no sheet,
                     toasts, shortcuts, and `ui.uploadLimit` — this reader's
                     own ceiling, handed down from the layout
  shrinkImage.ts     §30: `fitUpload` — a picture too heavy for the ceiling is
                     re-encoded to fit in the browser rather than refused
  SortFilterBar.tsx  the one toolbar every list page shares: count, the
                     Filters panel, the sort, the active-filter chips
  TypeTabs.tsx       the wiki's soorten as tabs, with counts
  useOverflowing.ts  "does this strip really overflow?" — for scrollbars that
                     should not show until they must
lib/
  auth/              password hashing and recovery, sessions, rate limiting,
                     and author.ts (§18b: the `X-Character` header resolved
                     against the fiches an account holds, `requireAuthor` and
                     the one exception, `requireAuthorOrFirstCharacter`)
  db/                schema, migrations, seeds, the connection
  entries/           the entry service, the document helpers, visibility,
                     sections and reveals (secrets.ts), the review queue,
                     the wiki's filter vocabulary, caseFields.ts and
                     caseName.ts — the dossier a clue was made in, stored as an
                     id and printed in front of its name — origin.ts, which
                     keeps that id in step with the dossiers it is filed in,
                     mentions.ts (§27: everything that is not an artikel and
                     names one), mode.ts — reading or editing, and since
                     round 13 the one sentence that everybody lands on
                     reading — and fieldValues.ts (§38: the one gate that says
                     an infobox holds the Keeper's keys in the Keeper's shapes)
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
  maps/              maps, pins, the artikel a map is a map *of*, and
                     visibility.ts (§40: a landkaart's own view rule, written
                     the way `lib/cases/visibility.ts` writes a dossier's)
  timelines/         §32: time.ts (pure: a moment as one integer, precision,
                     the ruling of the axis, where the tags go, and §35's
                     snapping and anchor), the service (tijdlijnen behind the
                     prikbord's dials, gebeurtenissen behind the artikel's
                     rule), moment.ts — §35: the one writer that keeps a
                     dragged gebeurtenis and an artikel's date in step — and
                     inkSpace.ts (§33, also pure: where a streek lives on an
                     axis and how wide it is, in both stroke formats)
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
characters.ts        §18: who a person is being, and the name a feed prints —
                     `displayNames`/`attributed` for a log (the karakter the
                     row recorded), `presenceNames`/`windowPresenceName` for
                     the live layer (who is standing here, in this window)
authorChoice.ts      §18b: the browser's half of "who is writing?", pure — what
                     one window remembers and what the shell does about it
authorSignal.ts      §18b: the bell the live line rings when the archive
                     answers `needsAuthor`, so the shell can ask the question
listParams.ts        the server half of the sort-and-filter bar
words.ts             every term the interface repeats, with its default
intro.ts             the start page's welcome: the default text and paragraphs
upload.ts            the one road a picture takes: the clipboard reader, the
                     answer reader that names the web server on a 413, and
                     (§30) the two ceilings and the shrinking ladder — pure,
                     so a client component may import it
assets.ts            pictures in three sizes; re-exports the two ceilings and
                     is where they are enforced
pageBlocks.ts        what a soort artikel's page is made of (pure; the queries
                     behind it live in lib/entries/derived.ts)
scripts/             dev, bootstrap, seed-demo, backup, restore
tests/unit/          vitest
tests/e2e/           playwright, the golden flows
```

The interface is Dutch; `GLOSSARY-NL.md` is the list of terms every screen
uses. Code, comments and these docs are English.

Forty-two rules worth knowing before changing anything:

1. **Every read of an entry goes through `visibleEntryCondition()`, and every
   read of a case through `visibleCaseCondition()`.** Lists, search,
   autocomplete, backlinks, feeds, previews, board cards, map pins and direct
   URLs all use them. A new query that skips one is how a Keeper's secret
   leaks. A board card whose entry the viewer may not see comes back stamped
   MISSING, exactly like a deleted one. Since §17 both conditions also carry the
   owner's *kijken* dial (`viewableCondition()` from `lib/access.ts`), so a
   private fiche is hidden by the same clause that hides a secret one. Since
   §40 a **landkaart** has the third condition of the same family,
   `visibleMapCondition()` — it was the one thing in the archive with no dial
   at all — and rule 40 is the general form of this rule: a new kind of thing
   gets its own `visible<Thing>Condition` when it is built, not a round later.
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
11. **A feed prints the character the row recorded, never the account — and
    presence is a different question.** §18b. Any row that carries an actor
    (`actorId`, `actorName`, `actorIsKeeper`, `characterId`) goes through
    `attributed()` from `lib/characters.ts` on the page that shows it; single
    names go through `displayNameOf()`. The account stays in the tooltip. A
    Keeper is always the Keeper's word, whatever a row happens to carry. A new
    feed that prints `users.username` directly is a bug.

    What changed in §18b is where the name comes from. It used to be re-derived
    at display time from `users.active_character_id`, so switching character
    re-labelled a person's past; it is now **written into the row** at the
    moment of the act (`character_id`, migration `0015`) and read back from
    there. The old behaviour survives as the fallback and only as the fallback:
    a NULL `character_id` means "written before the archive asked", nothing was
    backfilled, and such a row still reads the way it always did. One
    consequence to expect rather than fix: one account may appear twice in one
    feed under two names. That is two investigators at one table.

    The live layer asks a different question and has its own pair.
    `presenceNames()` / `presenceNameOf()` — and, for the thing that actually
    matters, `windowPresenceName()` — are what the ghost cursors, the "ook
    hier" strip, the caret in a shared text, the hand on a card and the ink
    someone is drawing use. A player is the onderzoeker they are wearing on
    both sides; a **Keeper is their account name** here, because a strip of
    identical "Keeper" arrows is not a name and two Keepers at one wall could
    not tell each other apart. A blank username falls back to the Keeper's
    word. And `windowPresenceName` answers per *window*, not per account
    (§18b), so a person playing two onderzoekers in two tabs stands on the
    strip as two people. `presenceNameOf` is the per-account version and is now
    only exercised by its own test. A page that needs both jobs builds two name
    maps and never one: `app/(app)/maps/[slug]/page.tsx` and
    `app/(app)/timelines/[slug]/page.tsx` are the worked examples — the "gezet
    door" labels come from `displayNames`, the live user's name from
    `windowPresenceName`.
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
    **Everybody lands on the reading face, a Keeper included** (round 13).
    That is the whole of `lib/entries/mode.ts` now: the face is a thing about
    *this visit*, not about the person, so it is not remembered anywhere and
    there is no setting for it. It used to be a preference in Jouw account
    falling back to the viewer's role — "a Keeper writes the archive, so a
    Keeper lands in bewerken" — and that fallback was the thing that made a
    Keeper's first sight of every page a form. The one override is `?new=1`,
    which is how the "nieuw …" sheets land you on the thing you just made, and
    which had to reach a **dossier** as well the moment the role fallback went.
    The toggle in the header crosses over, and it is not a right: it is
    rendered for every signed-in viewer and always was, so nothing about who
    may type changed with the setting's removal — a player who may only propose
    gets the editing face too, their changes simply travel as proposals
    (§10, §17). The column `users.article_mode` stays on the table, unread and
    commented as retired: this repo never edits an old migration, and SQLite's
    `DROP COLUMN` on an indexed table is fragile for nothing.
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

    Since Round 11 the ceilings are 2 MB and 20 MB, and that one gate does one
    more thing before it sends: `fitUpload` in `components/shrinkImage.ts`
    re-encodes an oversized picture to JPEG at 0.82 and walks down a ladder of
    sizes (1 → 0.85 → 0.7 → 0.55 → 0.42 → 0.3), sending the first that fits and
    saying so once ("De afbeelding was te groot en is verkleind."). A phone's
    photograph weighs four megabytes and the archive keeps a 1600 px webp of it
    in the end, so those are megabytes nobody would ever have seen. Two
    pictures are never re-encoded and get the ordinary "too large" sentence: a
    **GIF**, because a canvas knows only its first frame and a silently
    flattened animation is worse than a refusal, and an **SVG**, which has no
    pixels to shrink. The shrinking is a courtesy in front of the gate and
    never the gate itself: the server still weighs the declared size and the
    bytes that arrived, and refuses a browser that ran none of this. The
    ceiling reaches a screen as `ui.uploadLimit` — `uploadLimitFor(me)` in
    `app/(app)/layout.tsx` → `AppShell` → `UiProvider` — so the sentence under
    the map field says the reader's own number rather than a hard-coded one.

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
    (rule 20). Coordinates are the place's own — board units on a prikbord,
    picture pixels on a landkaart, and on a tijdlijn **seconds on both axes**:
    x an absolute moment, y the seconds from the axis, and the width in
    seconds too, all three multiplied by `pxPerSecond` on the way to the glass.
    So a drawing on a tijdlijn is ink on the axis — it grows and shrinks with
    the years the way ink on a prikbord grows with the cork (Nick's decision,
    round 12), a circle round 1887 is a circle at every zoom and on every
    screen, and the gum stays exactly over what it took away. That is
    **format v1**, and it rides on the *stroke* as `v: 1`, never on the layer.
    A stroke with no `v` is **v0** and is drawn by the old formula — x in
    seconds, y a *fraction of the stage's height* — which is two spaces at
    once: it stretched a drawing horizontally by the ratio of the viewing zoom
    to the drawing zoom, and squashed it vertically between a phone and a
    desktop. Nothing is migrated and nothing may be: a stroke is immutable once
    saved, and the `stageH` an old one was drawn at was never recorded, so a
    tekenlaag holds both formats for ever (`lib/ink/types.ts`, `InkFormat`).
    The seam is accepted and named rather than hidden — a v1 gum over v0 ink
    drifts apart under zoom, which can only happen to a drawing already on
    disk, and the answer if it ever bites is a Keeper wiping that layer, not a
    rewrite. `InkCanvas` draws in screen pixels through a `project` function
    the place supplies, handed each stroke's own `v` as an opaque third
    argument (and a `widthScale` that may be a number or a function of it);
    it knows nothing else, which is why `BoardCanvas` and `MapCanvas` needed no
    change at all.

    The frame of anything without a picture starts *shut* — a gebeurtenis, and
    since this round an artikel card on a wall too (`defaultShowImage(kind,
    hasPicture)`) — and the button that opens it is where the soort's icon
    waits. Seeing is still the only *right* the layer asks for, but a streek is
    a write like any other and therefore needs an onderzoeker (§18b, rule 36):
    `useInk` folds `useMayType()` into the same `enabled` the toolbar reads, so
    a speler with no onderzoeker is not handed the potlood at all.

    Widths come in two ranks now (`INK_BRUSHES = [3, 6, 12]`,
    `INK_ERASERS = [12, 24, 48]`), and the toolbar has one strip of three dots
    for both: with the potlood they are the brushes, with the gum they are the
    gummen, and the eight colours dim while the gum is out. Nothing on the wire
    changed — a width was always a number clamped to 0.1–4000 in
    `lib/ink/merge.ts`, never an enumerated set, and the API route never looks
    at it, so every stroke drawn with the old single 22 px gum reads back as 22.

    Since round 12 that clamp is the **v0** one. A v1 width is measured in the
    same unit as its coordinates, and on a tijdlijn that unit runs from a
    second to a millennium: 0.1–4000 would fatten a 3 px brush to twenty pixels
    at the finest zoom and shave a year-scale one down to invisible. So v1
    widths are clamped to `INK_V1_MIN_WIDTH`–`INK_V1_MAX_WIDTH`
    (1e-6 … 1e12) and kept to six *significant figures* (`INK_V1_WIDTH_DIGITS`)
    rather than three decimals, which mean nothing at 10⁻². `readInkFrame`
    reads the frame's `v` and applies exactly the same bounds as
    `normaliseStroke`, or a live frame of somebody else's v1 stroke would
    arrive twenty pixels thick and snap to its real size the moment they lifted
    their hand.

34. **A landkaart and a tijdlijn take the screen.** §34. They are not read, they
    are *looked at*, so the page around them is one wrapping line of heading and
    then the canvas, as tall as what is left. **Four** things used to eat that
    screen, and all four are undone together in `app/globals.css`:
    `.page-wide`'s 1200 px cap
    (lifted by `.page-wide:has(> .page-canvas)`), the page's own gutter (given
    back as a half-gutter negative margin either side, so the canvas's border
    still reads as a border and not as the edge of the screen), a magic
    stage height that guessed at what stood above it (`.map-stage`'s
    `calc(100dvh - var(--tabs-h) - 12rem)`; the tijdlijn's was two constants in
    TypeScript), and — the one that hid behind the other three — `.live-strip`,
    which is a **float** inside `main.main`. A `.page-canvas` is a flex
    container, so it is an independent formatting context, and a browser keeps
    one *clear* of a float instead of flowing it round: beside the strip the
    column lost 26 px **and** both half-gutter margins, on every screen. On a
    page that is a canvas the strip therefore comes out of the flow altogether
    (`.main:has(.page-canvas) .live-strip` — absolutely positioned in the
    column's top-right corner) and `.canvas-head`'s `padding-right: 2.5rem`
    keeps that corner free for it. `.page-canvas` is a viewport-tall flex column
    stopping at the tab bar plus `env(safe-area-inset-bottom)`; `.main`'s three
    paddings are named (`--page-pad`, `--main-pad-t`, `--main-pad-b`) so the
    canvas can measure against them and follow when one changes.
    `.page-canvas:last-child` takes the bottom padding back, so a page that is
    only a canvas does not scroll at all, while a page with the Keeper's tools
    after it keeps that padding and puts them below the fold — which is right,
    because a landkaart is looked at far more often than it is re-hung.
    `.canvas-head` is one wrapping baseline row (about 64 px, where the stacked
    block took 140), and its description is the first thing to go under 768 px.

    Below the fold is where the landkaart's tekenlaag switch stands too. It is
    a *tool*, not part of the map, and 132 px of one on a telephone, so
    `InkKeeperControls` is portalled out of `MapCanvas` into `#map-underfold` —
    an empty div the map page renders between `.page-canvas` and
    `MapKeeperTools`, Keeper-only like both of them, so a player's page is
    still nothing but the canvas and does not scroll. That one move took the
    phone stage from 61.7% of the screen to 75.1%. The tijdlijn never had the
    problem: its ink switch lives in the Instellingen sheet.

    What it comes to, measured: a desktop stage of 1188 × 758 (84% of the
    screen), a phone landkaart of 374 × 634 (75%), a phone tijdlijn of
    374 × 574 (68%), no horizontal overflow at any size, and one invariant that
    holds on every screen — **the stage is the main column less one page
    gutter** (`stage width === main width − var(--page-pad)`), which is the
    half-gutter margin either side and nothing else taken off it.

    A canvas in that column has no height of its own and must **measure** what
    it was given. `MapCanvas` already did; `TimelineCanvas` had
    `STAGE_H_DESKTOP = 460` / `STAGE_H_PHONE = 400` and an inline height, and
    now measures width and height together with one `ResizeObserver`. It uses
    the measured height *exactly*, deliberately unclamped in TypeScript: the ink
    canvas is drawn at those very pixels, and a clamp in one place and not the
    other puts the drawing out of register with the stage under it — the floor
    lives in `.timeline-stage`'s own `min-height` and nowhere else. Everything
    reckoned from the old constant is reckoned from the measurement now: the
    axis across the middle, the ink layer's `project`, where a folded-out window
    opens, and how many lanes of tags there is room for (never fewer than the
    three a short stage always had, so a tall stage really uses its height).
    A test measures all of it (`tests/e2e/canvas-fills-the-screen.spec.ts`), and
    `placeAt` in `tests/e2e/maps.spec.ts` had to stop taking its fraction from
    the stage and take it from `.map-world`: on a full-screen stage a fitted map
    leaves bare cork beside the paper, where a tap places nothing.

    The prikbord is deliberately **not** part of this: `.board-viewport` still
    carries `calc(100dvh - 320px)` / `calc(100dvh - 205px)` and should adopt
    `.page-canvas` in its own round.

35. **A gebeurtenis is dragged along the axis, and a tijdlijn may speel op one
    day.** §35. A tag is dragged with a mouse or a finger and lands on a whole
    unit of **its own precision** — an artikel known only as "1931" steps a year
    at a time however finely the axis is ruled, because a drag must never invent
    a precision nobody has (Nick's rule; `snapTo` in `lib/timelines/time.ts`).
    Moving an artikel gebeurtenis rewrites `entries.fields.date`, and editing
    that field moves every gebeurtenis of that artikel on every tijdlijn. When
    an artikel is on several tijdlijnen **the last drag wins**: the artikel has
    one date, the one the hand last put it on, and the other tags follow, each
    re-snapped to *its* gebeurtenis's precision and re-anchored to *its*
    tijdlijn.

    Both legs go through one writer, `lib/timelines/moment.ts`, which moves rows
    with plain drizzle rather than through `updateEntry` — twice deliberate.
    `updateEntry` calls into this module, so importing it back would be a cycle;
    and `updateEntry` routes somebody who may see an artikel but not edit it
    into `pending_edits`, which would turn a drag by a person who *may* edit
    this tijdlijn into a proposal. State the consequence plainly rather than be
    surprised by it: **whoever may edit a tijdlijn may move an artikel's date
    through it.** A module-level `busy` flag is what stops the two legs circling
    each other.

    A tijdlijn measured finer than a day may declare an **anchor** — "deze
    tijdlijn speelt op 3 oktober 1931" — as `anchor_at` + `anchor_unit`
    (migration `0014_timeline_anchor`; null together, always coarser than
    `scale`, `year` | `month` | `day`). It does two small total things.
    `applyAnchor` overwrites every moment's components from the year down to the
    anchor's unit, so a new gebeurtenis is asked only for its hour and minute.
    And **the anchor fences the axis**: the origin is clamped to the anchor's
    span and the zoom has a floor of one span in the view, so 4 October cannot
    be panned or zoomed into sight — applied to every view the canvas ever sets,
    and again in the service, because a fence only on screen is decoration.

    The fence is built on a **ref**, and that is the fence rather than a
    micro-optimisation. `fence()` was a `useCallback` over `[span, width]`, so
    `moveView` took a new identity every time a tijdlijn was anchored or the
    stage was measured — while `zoomAt` and `addEvent`, made long before either
    happened, went on holding the *first* `moveView`, whose fence had no span
    and no width and therefore handed back its argument untouched. Panning was
    clamped and zooming was not: eight presses of the zoom-out walked an
    anchored tijdlijn clean off its day, out to 22 sep – 15 okt. Reading the
    span and the width out of a ref makes `fence` and `moveView` stable, so
    every caller, however old its closure, fences against the anchor as it is
    now; what has to move to the effect's dependency list instead is `span` and
    `width` themselves, which are what re-fence a view already on screen.

    **A canvas on a server-rendered page refreshes the router after every
    write.** `/timelines/[slug]` is a server component, and Next keeps the RSC
    payload from the moment the URL was pushed. Every write after that was a
    `fetch` and some local state, so the browser's own Back button landed on the
    payload from *before* the write and the tijdlijn came back as empty as it
    was first found. `addEvent`, `patchEvent` and `removeEvent` therefore end
    with `router.refresh()`, exactly as the settings sheet already did. Known
    gap, narrowed in round 13: `components/maps/MapCanvas.tsx` now refreshes
    after a speld is **created** and after one is **removed** — §39 made that
    load-bearing, because walking down a landkaart speld and coming back up the
    chip is a navigation, and the payload it came back to did not have the
    speld in it — but a speld that has merely been **moved** still does not
    refresh.

    Placing is one click. A double-click on the axis hands the sheet a finished
    moment, printed as a line with a "Wijzig" behind it rather than an open
    form, and `?place=` reads the artikel's own date (or the tijdlijn's anchor)
    and simply puts the gebeurtenis down, folded open and ready to be nudged;
    the form is the fallback, not the road.

    **A radio's name is the word; the sentence under it is its description.**
    The scale radios in both tijdlijn sheets took their accessible name from the
    wrapping `<label>`, which is the word *and* the hint: "Seconden — Tot op de
    seconde. De laatste twee minuten." is a radio called *Minuten* as loudly as
    the one above it, and "Uren — Tot op het uur. Eén dag, één nacht." is one
    called *Eén dag*, which collides with the anchor's own *Eén dag*. They carry
    `aria-label` with the word and point at the sentence with
    `aria-describedby` instead — which is what a screen reader wants anyway, and
    what makes `getByLabel` mean one thing. The Dutch copy is unchanged.

    The tekenlaag's geometry on an axis is pure too, and sits beside the rest
    of the timeline's arithmetic: `lib/timelines/inkSpace.ts` — `projectInk`,
    `inkFromScreen`, `inkWidthScale` and `TIMELINE_INK_FORMAT` — is the whole
    of what turns a streek's seconds into pixels and back, in both of §33's
    formats. No React and no canvas in it, so `tests/unit/timeline-ink-space.test.ts`
    pins the shape of a drawing down without a browser.

    Not done on purpose: no ghosting of a drag in progress on other people's
    screens (the drop is one PATCH, and the change signal is what everyone else
    sees), no dragging between lanes or between tijdlijnen, no rubber-band, and
    `convertEventToEntry` does not push its moment into the new artikel's date.

36. **A browser window writes as one onderzoeker, and the header is never
    trusted.** §18b. Every window asks a player once — "Met wie ben je nu aan
    het schrijven?" — remembers the answer for its own lifetime
    (`sessionStorage`, which is exactly that lifetime) and puts it on every
    same-origin request as `X-Character`. Two windows of one account are two
    investigators at one table, which is the whole reason the choice sits on the
    window and not on the account. Nothing believes the header:
    `lib/auth/author.ts` resolves it against the fiches that account actually
    holds and it lands on `SessionUser.characterId`, so no route signature
    carries it and a forged one simply writes as nobody in particular (falling
    back to the account's own `active_character_id`). A Keeper always resolves
    to null: a Keeper is always the Keeper.

    Everything a player does is recorded under it. Migration
    `0015_character_attribution` adds a nullable `character_id` to
    `entry_revisions`, `activity`, `audit_log`, `pending_edits`,
    `case_revisions`, `board_revisions`, `map_pins` and `timeline_events`.
    Nothing was backfilled — NULL means "written before the archive asked" and
    still reads the old way (rule 11). The revision-coalescing window, and the
    prikbord's once-a-minute revision, now compare the karakter as well as the
    account: two investigators of one account would otherwise silently merge
    into one revision under whichever name happened to be first.

    `requireAuthor` sits at the top of every mutating handler under `app/api/`
    that a player can reach — the Keeper-only ones (`requireKeeper`) pass it by
    definition — and answers a plain 400 with `needsAuthor`, which is the
    browser's cue to ask the question rather than show an error. Three doors are
    open on purpose: `/api/characters` (which is where a person *gets* an
    onderzoeker, so a gate there locks out exactly the people it is for),
    `/api/client-error`, and the live and presence lines, which are sight and
    not writing. The same rule reaches shared text through `admit()` in
    `lib/live/rooms.ts`, as one line that drops `canEdit` — a player with no
    onderzoeker may read a room and watch other people's carets and may not type
    in it. It is deliberately **not** in `lib/access.ts`: rights there are per
    account, and every Keeper — who never has a karakter — would fail.
    `EventSource` cannot send headers, so `/api/live/site` GET also takes
    `?as=<id>`, resolved by exactly the same check and only ever a name on a
    strip.

    Two pieces of wiring are load-bearing. `AuthorProvider` sits **above**
    `AppShell` in `app/(app)/layout.tsx` and calls `setWritingAs` from a
    `useState` initialiser *and* a `useLayoutEffect`, because the value has to
    be in `LiveProvider`'s module box before the first request leaves and before
    its passive effect opens the line — otherwise the first live line, and the
    name on the presence strip, carries the account's default instead of this
    window's onderzoeker. Both writes are idempotent, which makes Strict Mode's
    double invocation a non-event. And the account's `active_character_id` is
    deliberately **not** written when a window answers: it is shared between
    windows, and window B would change what window A paints first.

    **The question is a sheet, so it is never asked from inside one.** There are
    two doors into it, shaped differently on purpose. `ask()` is for an editing
    *surface* — a caret lands in a paragraph, the question comes up over the
    page, and the page is still there when it is answered. `ensureAuthor(then)`
    is for anything that would itself open a sheet, which in practice is the two
    "nieuw …" roads: the action is held back, the question is asked alone, and
    the answer releases it in the same commit that closes it, so two sheets are
    never on screen at once. Asked the other way round, the question arrived on
    top of the new-artikel sheet, and Escape — which the blocking question
    rightly refuses — went to the sheet underneath and left the question
    standing over a bare page.

    One road cannot be sequenced, though: the archive's `needsAuthor` refusal
    arrives asynchronously and may land while any sheet is open. So `Sheet` is
    stack-tolerant anyway, and `lib/sheetStack.ts` — module state, because
    sheets are portals with no common parent and the handlers read it at *event*
    time — settles what used to be shared silently. Escape, Tab, the backdrop
    and the scroll lock belong to whichever sheet is on top, and `z-index`
    counts up with the depth. Before this, one Escape reached *both* sheets
    (`stopPropagation` stops further nodes, not the sibling listener on the same
    node), the first sheet to unmount handed the page its scrollbar back while
    another still stood over it, and both backdrops sat at `z-index: 60`, where
    the order is the accident of which mounted first. The `n` shortcut no longer
    fires while a sheet is open, for the same reason: the focus a sheet leaves
    behind is not a field, so the "is somebody typing?" check waved it through.

    The call sites that stack sheets today now merely *survive* it rather than
    being right by design, and that is worth a round of its own: `MapCanvas`
    (`removePin`'s confirm from inside the pin sheet; the new-pin sheet opening
    the new-artikel sheet), `TimelineCanvas` (`removeEvent` and the ink-clear
    confirm, both from inside their sheets), `EventSheets` (the new-gebeurtenis
    sheet opening the new-artikel sheet) and `BoardCanvas` (the ink-clear
    confirm, from inside the access sheet). `AddToCaseButton` is the one that
    already asks first and opens afterwards.

    A player with no onderzoeker at all sees a standing banner and read-only
    inputs — **except** that `requireAuthorOrFirstCharacter` lets a player who
    holds *none* create artikelen (`POST /api/entries`, and nothing else) and
    tie one on, so they can onboard themselves instead of waiting on the
    Keeper's keyboard. The exception is keyed on holding none, so it closes
    behind them; and it counts *visible* fiches (`listCharacters`) rather than
    tie rows, so a fiche in the prullenbak cannot go on locking somebody out.
    Rule 42 (§18c) **narrows this rather than reversing it**: everything after
    that first one is the Keeper's to hand out, and this one door is the door
    that stays open — asked the same way, by the same `listCharacters`.

    Three gaps are known and deliberate for now. The "gezet door {naam}" labels
    on a landkaart and a tijdlijn still re-derive per account, because the prop
    is keyed by user and not by pin or event. An ink stroke still names an
    account inside the layer JSON (`by`), never a karakter. And
    `updateEvent` / `updatePin` write no activity row at all, which is
    pre-existing and unrelated.

37. **A spec is read as carefully as a screen, because a wrong test is usually a
    wrong sentence about the product.** Two of Round 11's e2e fixes were not
    timing at all. `waitForURL('**/e/**')` is *already true* when the browser is
    standing on an artikel, so a helper that makes three artikelen one after
    another matched the address it was on and handed back the previous one every
    time; a helper that navigates repeatedly must wait for the address to
    **change** (`url.pathname !== from`), not for a shape it already has. And a
    gum is a streek (rule 33): a person who gums twice has two strokes on their
    undo stack, so a test that gums twice presses Ctrl+Z twice before the undo
    button is allowed to go dead — one press and a disabled button would have
    been the bug, not the assertion.

    The timing half has one house pattern, and it is the same one everywhere:
    do it again until it answers. A server-drawn input is on the screen before
    React has picked it up, and a `fill` that lands in that gap is wiped by the
    render that follows — a person is far too slow to hit it, Playwright is not.
    `fillWhenReady` in `tests/e2e/helpers.ts` fills and re-fills until the field
    is still holding the text a beat later, which is the counterpart of the
    press-it-until-it-answers loops the sheet helpers already use. Use it on a
    page that has only just navigated. A plain `fill` is right where a click has
    already been answered — and on a field where every change is a write it is
    the only thing that is right, because a second fill would be a second
    voorstel in the queue.

38. **An infobox holds the Keeper's keys, in the Keeper's shapes — and the
    server is what says so.** §38. The *keys* were always the Keeper's on the
    screen: `FieldsEditor` walks the soort's `FieldDef[]` and nothing else, so
    a key nobody configured renders nowhere. The server disagreed. `updateEntry`
    merged whatever arrived (`{ ...entry.fields, ...patch.fields }`), so a
    hand-rolled `PATCH` — or a client that dropped a `field.whatever` into a
    live room it may write in — could store a key and a shape the archive has
    no word for. `lib/entries/fieldValues.ts` is the gate, it is **pure**, and
    it is applied at the single `updateEntry` / `createEntry` seam, which is
    what makes one check cover both doors: the artikel page's autosave, the §21
    fields room (whose `field.*` sweep out of the Yjs doc is the road that could
    invent a key), an approved voorstel, and the roads that change a soort. The
    gate says *what* may be stored, and the autosave's `mergeKeys: ['fields']`
    (`components/entry/useAutosave.ts`) says *that all of it arrives* — a bag of
    independent answers must not be flattened to the last box anybody touched on
    the way to the door.

    **A key has two sources, and a gate that knows only one is worse than no
    gate.** `entry_types.fields[].key` is the obvious one; the other is every
    hand-filled `links` block on the soort's page, which `cleanBlocks` gives its
    own key and `EntryView` renders through a synthetic `entry_links` FieldDef.
    Validating against `typeFields` alone would have silently emptied every
    hand-filled list on every artikel on its next save. `allowedFieldKeys` takes
    both, `listBlockKeys` is not optional, and the resolved blocks are what to
    hand it.

    A refusal is **silent in a live room and named on a PATCH**, and both are
    deliberate: a CRDT told "no" with a 400 resends for ever, while a person
    saving a form deserves to be told which key went nowhere — so the PATCH
    still answers 200 and carries `rejectedFields`. **Nothing stored is ever
    destroyed by it.** Only the incoming patch is filtered; the merge base is
    not, so a field taken away in Beheer → Soorten keeps its value and brings it
    back when the field returns, and a *retype* is not a coercion — a `text`
    that becomes a `number` leaves the old `"veertien"` exactly where it lay.
    Two writers are outside the gate on purpose and must stay outside:
    `writeEntryDate` (§35 — it writes `formatWhen` output that `parseDutchDate`
    reads back, and routing it through `updateEntry` would be the cycle *and*
    would turn a drag into a voorstel) and `restoreRevision` (putting a version
    back is meant to be exact, not corrected). Both say so in a comment. The one
    road that deletes is **Beheer → Soorten → "Oude waarden"**, which counts what
    is still stored under a key the soort no longer has and asks before it wipes.

    Three kinds joined the list. **Getal** stores a real number, so a page can
    print it in Dutch and a sort could one day compare it. **Ja/nee** stores a
    real boolean and nothing that resembles one — not `1`, not `"ja"` — and on
    the reading face a `true` prints "Ja" while a `false` **prints nothing at
    all**, because rule 18's infobox lists what is so, and "nee" is the empty
    answer. **Meerkeuze** drops a member that is not on the Keeper's option list
    and keeps the rest, following `entry_links` rather than `select`: a list has
    to behave like one, and taking an option away must not start refusing every
    save of every artikel that still names it. A **Datum stays free text** with a
    quiet hint under it when `parseDutchDate` cannot read what is typed — a
    native picker would forbid "oktober 1934" and "ergens in de zomer", and §35
    is built on the archive keeping those. Adding a kind is four places, in this
    order: the `FieldKind` union, `FIELD_KINDS`, a `case` in `coerceFieldValue`,
    and the control plus the reading shape in `FieldsEditor` — and **the shape
    the editor writes is the shape the gate must accept**, or the editor is
    quietly writing values the server throws away.

39. **A speld may stand for another landkaart, and that is the way down.** §39.
    `map_pins.target_map_id` (migration `0017_pin_targets`), beside `entry_id`
    and never a second meaning for it — the same separation a card on a prikbord
    keeps between `map_id` and `entry_id` (rule 19). The map of Zeeland gets a
    speld on a town that opens the town's landkaart; the town's gets one on a
    house that opens the plattegrond. The target is resolved through the
    viewer's **own** `visibleMapCondition` in the join's `ON` clause, so a speld
    to a landkaart this reader may not open is simply not there — which is why
    rule 40 had to exist first, and is the whole of what it was a prerequisite
    for. The speld's **name is read from the target on every read and never
    stored**, so renaming the landkaart renames every speld that points at it.

    **Cycles are allowed; only the self-pin is refused.** A→B→A is not a
    mistake, it is the way back up: the speld on the harbour map that returns to
    the island is how a reader climbs out of a plattegrond. Nothing renders
    recursively — navigation is a click and `listPins` is one level deep — so
    the only thing worth refusing is a speld on the map it stands on, which
    opens the page you are already reading. `listMapsPinningMap` supplies the
    derived chip in the other direction ("Op de grotere landkaart: Zeeland"),
    behind the same condition, because a plattegrond with no way out is a dead
    end and a phone does not always have a Back button. A tap on such a speld
    opens the **sheet**, not the other map: everything a speld has — "gezet
    door", the drag hint, "speld weghalen" — lives in the sheet, and the button
    inside it is the road. A speld on a **dossier** or a **tijdlijn** is
    deliberately out of scope; this is one column, not a polymorphic target.

40. **A new kind of thing gets its dials when it is built.** §40. A landkaart
    was the one thing in the archive with **no `view_mode` at all**: every
    signed-in person saw every one, a plattegrond could not be kept back until
    the players found the house, and `resolveBoardMaps` had been carrying a
    `_viewer` it never used. Migration `0016_map_access` gives `maps` the same
    three columns everything else has had since 0005 and 0012, and
    `lib/maps/visibility.ts` states the rule the way `lib/cases/visibility.ts`
    states a dossier's, on purpose — one shape, so the next reader recognises it.
    `access_grants` needed no new table: it has been one table for every kind
    since 0005 and simply gains rows with `target_type = 'map'`.

    Two defaults were chosen rather than inherited. `view_mode = 'all'`, so
    **every landkaart already hanging stays visible to everyone signed in** — a
    dial nobody has touched must change nothing, and a migration that hides work
    people are using is not a migration, it is an outage. `edit_mode = 'private'`,
    because §19 has always said only a Keeper renames, redraws or takes down a
    landkaart and every map's owner is a Keeper: the dial writes an existing rule
    down instead of loosening it, where `'all'` would have handed every player
    the rename and the delete.

    A speld follows its landkaart, and its own per-artikel rule still stacks on
    top (rule 1). A board card for a hidden map stamps MISSING exactly as one for
    a hidden artikel does (rule 19). And the general lesson, which is why this is
    a rule and not a changelog entry: **thirteen reads in five modules had to be
    found and fixed afterwards** — the shelf, the map's own URL, board cards,
    "Genoemd in", the fields room, the tekenlaag, the two `…ForEntry` lookups.
    A `visible<Thing>Condition` applied to every read, with a `viewer` argument
    that is **required rather than optional**, is what a new kind of thing gets
    on the day it is built. An optional viewer is how a dial ends up missing for
    four rounds, and a `_viewer` nobody uses is the tell.

41. **A card on a wall can be made bigger, and it grows about its centre.** §41.
    A card carries `scale` (0.5–5, default 1, two decimals), and it is one number
    rather than one per axis: Nick's decision is that a card zooms like a
    photograph — picture, title and words together — rather than being stretched.
    It is painted with a CSS `transform`, which grows the box about its **centre**,
    so `card.x` is the corner of the card *at scale 1 only*. `cardBox(card)` in
    `lib/boards/merge.ts` is therefore the single seam every piece of geometry
    goes through — the hit test, the marquee, "Alles in beeld", `freeSpotNear`,
    the held-by overlay, `headOf` where a string ties, and the grip itself.
    Anything that reads `card.x` and `cardSize` separately gets the size right
    and the place wrong, which is a card you cannot click at its top-left and can
    click on bare cork below it. At scale 1 `cardBox` returns the old numbers to
    the pixel, which is the promise every board hung before this round rides on.

    The crop divisor had to gain `card.scale` beside the board's zoom for exactly
    the same reason: a card at 250% has a cover two and a half times as wide on
    the glass, so a hand travelling 100 px has crossed less of the picture, and
    without it cropping an enlarged card moved the photograph two and a half
    times too fast. Everything on the paper scales, **including the 1px border
    and the shadow** — Nick's decision, and it is what the wall's own zoom has
    always done to a card's border, so a card at 200% looks like the same card
    seen at 200% zoom. A card past 150% asks for the full-size picture rather
    than the card-sized one. Two controls, because a phone has no drag: a corner
    **grip** in the world layer (counter-scaled by the zoom, and outside the card
    so it is not scaled by the very thing it sets) and four presets in the
    inspector — Klein · Normaal · Groot · Extra groot — which on a phone are the
    only road. There is **no migration**: board state is one JSON blob normalised
    on every read (§5), so a card with no `scale` reads back as 1.

    The other half of the same rule is that **a punaise's box comes from what is
    written on it**. Its label used to be one clipped line at 76 units with no
    tooltip, so "de man met de grijze jas" reached the wall as "de man met…" and
    nothing said the rest existed. The tag wraps now and the pin grows downward,
    capped at `PIN_TAG_MAX_WIDTH` (132) so a long label does not lay a banner
    across the cork. `pinTagLines` estimates the wrap rather than measuring it —
    this module is pure and the wall it describes is not rendered anywhere near
    it — and it deliberately guesses the line height *generous*, because guessing
    short is the dangerous way round: the document reasons in `cardSize`, and a
    tag that paints taller than the model says leaves gaps nothing knows about.
    One rule holds the two halves together: **the intrinsic box comes from the
    content, and the scale multiplies it.**

42. **Casting is the Keeper's; wearing is the player's.** §18c. Tying a fiche to
    an account and untying it again are Keeper acts. A speler who could tie any
    fiche they can see to their own account could hand themselves a second, a
    third, the NPC in the next dossier — and the archive would go on printing
    each of those names as if the Keeper had meant it. Casting is a decision
    about the table, so the Keeper makes it. Which of the ones they hold a person
    *wears* stays entirely theirs, per window: `setActiveCharacter` and "Als
    jezelf" are untouched, and §18b's question is unchanged.

    **One door stays open, and it is round 11's own exemption**: a speler holding
    **nobody** may make their first onderzoeker and tie it on, so they can begin
    without waiting on the Keeper's keyboard — and it shuts behind them. This
    narrows rule 36's exemption; it does not reverse it. Both halves ask the same
    question the same way, through `listCharacters` — the fiches this person can
    actually *see* — and never a count of tie rows, because a fiche in the
    prullenbak leaves its knot behind and a knot to a fiche nobody can see must
    not be the thing that locks somebody out of the only road they have. One unit
    test runs both gates over the same people so the two cannot drift.

    The Keeper's screen for it is the account list in **Beheer**
    (`app/(app)/admin/UserRow.tsx`): "Toegewezen karakters", the fiches this
    account holds with a ✕ beside each, and an `EntryPicker` to hand out another.
    That is where the `userId` which `whose()` and `addCharacter` have always
    accepted is finally sent from — the argument existed for rounds before there
    was a screen that used it. The wardrobe on Jij loses its ✕ and keeps its
    "Speel als".

    One thing here is a judgement call rather than an instruction, and is cheap
    to reverse: **`removeCharacter` being Keeper-only** was the building agent's
    reading of the symmetry, not something Nick asked for. The argument for it is
    that a player who could untie their last onderzoeker would be back at "holds
    nobody", which is the one state the door above opens for, so the
    self-assignment road would never actually close. If that turns out to cost
    more than it buys, it is one line.
