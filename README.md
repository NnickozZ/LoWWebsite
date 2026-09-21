# LoW: Land over Water Archief

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
npm run seed-wereld  # optional: a full Dutch test world, ~15 per soort
```

Sign in as the Keeper. Everyone else signs up at `/signup` with the invite code,
which you can see and regenerate under **You → Admin**.

`npm run seed-demo` refuses to run once the archive has entries in it, so it can
never trample real notes. `make reset` deletes `./data` after a confirmation.

### The two seeds, and why there are two

`seed-demo` is the **fixture**: 21 entries in English, one dossier, one
prikbord. `tests/e2e/prepare.mjs` runs it before every Playwright run and
several specs click the names in it, so its contents are load-bearing — change
them and the suite goes red twenty minutes later, somewhere that looks
unrelated.

`seed-wereld` is the **test world**: about fifteen artikelen of every soort, in
Dutch, tied to each other through their infobox fields and their running text,
plus dossiers with tabbladen and werknotities, prikborden with kaarten and
touwtjes, tijdlijnen, landkaarten with spelden, omslagen, six player accounts
wearing karakters, voorstellen, activity and revisions. It is for looking at a
*full* archive — the web (§43), "Genoemd in" (§27), the afgeleide blokken
(§11), the rechten (§17) — before there is a real one. It leaves the fixture
alone.

```bash
npm run seed-wereld -- --per 25    # more per soort (the pools are the ceiling)
npm run seed-wereld -- --seed 7    # a different, equally repeatable world
npm run seed-wereld -- --no-images # skip the drawn covers and map plates
npm run seed-wereld -- --clean     # remove exactly what it put there
```

It writes what it made to `data/seed-wereld.json`; `--clean` reads that file,
and while it exists a second run refuses to lay another world on top of the
first. The six accounts are Kees, Elsje, Bram, Nel, Truus and Machteld, all
with the password `wereld1934` — which is why this belongs nowhere near a
server anybody else can reach. The words are in `scripts/seed-wereld.data.mjs`,
the wiring in `scripts/seed-wereld.mjs`.

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
| `make seed-demo` | Load the small Zeeland demo dataset (also the e2e fixture) |
| `make seed-wereld` | Fill the archive with a full Dutch test world (`-- --clean` removes it) |
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

**And the live line wants four more lines of that same block** (§60, round 29):

```nginx
server {
    server_name site.landoverwater.nl;
    client_max_body_size 25m;       # uploads: 2 MB for players, 20 MB for the Keeper
    http2 on;                       # §60: many tabs, one socket each is not enough
    location / {
        proxy_pass http://127.0.0.1:3000;   # §89: and HOST=127.0.0.1 in .env
        proxy_http_version 1.1;     # HTTP/1.0 to the app would close the stream
        proxy_buffering off;        # or nginx holds every frame until the response ends
        proxy_read_timeout 300s;    # a live line is idle for minutes at a time, on purpose
        # §89: who is knocking. *Overwrite*, never append ($proxy_add_x_forwarded_for
        # keeps whatever the browser sent first), and set TRUST_PROXY=1 in .env.
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        # A header that only Next itself may ever write (CVE-2025-29927).
        proxy_set_header x-middleware-subrequest "";
    }
}
```

**§89: behind that block the app listens on `127.0.0.1` only** (`HOST` in
`.env`), and `TRUST_PROXY=1` tells the login limits the address nginx wrote is
real. Without both, a browser can type its own `X-Forwarded-For` and every
per-address limit is a suggestion. fail2ban watching nginx's log for
`POST /login` bursts is a good second lock.

`http2 on` is the one that matters most: over HTTP/1.1 a browser opens about
six connections per origin, and round 29 went to some trouble to make a browser
need only one — HTTP/2 multiplexes, so the ceiling stops being a ceiling at
all. `proxy_buffering off` is why the app also sends `X-Accel-Buffering: no` on
the stream; belt and braces, because a buffered SSE response is delivered when
the response ends, and a stream never ends. `proxy_read_timeout` has to outlast
the 20 s heartbeat comfortably, or nginx cuts a perfectly healthy line every
minute and every open tab reconnects. Caddy needs none of this.

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
| `SESSION_SECRET` | 32+ random characters. Keys the session table (HMAC); in production nobody is signed in without it. Changing it signs everybody out |
| `DATA_DIR` | Where `app.db`, `assets/` and `backups/` live |
| `PORT` | Defaults to 3000 |
| `HOST` | Defaults to `0.0.0.0` (phones on the LAN reach `make dev`). **Behind nginx: `127.0.0.1`**, so nobody reaches the app around the proxy |
| `TRUST_PROXY` | `1` only when exactly one proxy you run stands in front and overwrites `X-Forwarded-For` (see the nginx block). Leave empty otherwise |

`PASSWORD_RECOVERY_KEY` no longer exists (§89): delete it from your `.env`.

---

## A note on password recovery

**A Keeper gives a new password; nobody reads an old one** (§89, round 50).

Until round 50 the archive kept an AES-encrypted copy of every password beside
its hash, so a Keeper could "reveal" it. That copy went into every nightly
backup and every "Download alles" zip, with its key in `.env` on the same
machine, and every Keeper could read every other Keeper's password. People
reuse passwords. Migration `0032_sloten` blanks and drops the column.

What is stored now is an **argon2id hash** and nothing else. A player who
forgets their password asks the Keeper, who uses **Beheer → Nieuw wachtwoord
instellen**; that also signs the player out everywhere. A Keeper cannot set
another Keeper's password or switch them off — demote first, then reset, and
both steps are in the audit log.

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
    stambomen/       §66: the shelf of stambomen, and one stamboom with its
                     doek — who stands in it, and the lijnen read off the
                     artikelen. Desktop only in the menu; a phone reaches one
                     through a dossier, "Genoemd in" or the start page
    web/             §43: het web — the archive drawn as what points at what,
                     with one thing in the middle (`?focus=`) or all of it
    wiki/            browse, and browse-by-type (one row of soorten as tabs)
    search/          instant search, one soort at a time
    admin/           users, review queue, types and pages, words, trash,
                     history, site, export, log
    you/             account, and the wardrobe of characters — which of the
                     ones you hold you are wearing. Handing one out is the
                     Keeper's (§18c, rule 42), so the wardrobe has no ✕ on it;
                     the choice of which face a page opens on is gone
                     altogether (rule 18: everybody lands on lezen)
  timelines.css      §62: the tijdlijn's own stylesheet — the axis, the lanes,
                     the folded-out windows, the "+n" chips and the hand on
                     the axis. Imported by the one page that is a tijdlijn
  stambomen.css      §66: the stamboom's own stylesheet — the stage, the world,
                     the five frames, the lines and their hit areas, the
                     handles and the floating picker. Imported by the one page
                     that is a stamboom
  api/               entries, cases, boards, maps, timelines, family-trees
                     (§66, with `/relations` and `/promote`), characters,
                     access, assets, search, suggest, admin, ink (§33: the
                     tekenlaag of a prikbord, landkaart, tijdlijn or
                     stamboom), web
                     (§43: this viewer's graph, whole or around a focus),
                     and `live/site` — **the one stream in the whole app**
                     (§60). `api/boards/[id]/live` and `api/live/[room]` were
                     deleted in round 29; a wall and a room of shared text are
                     both places on the site line now
components/
  editor/            Tiptap: the entryLink node, @ and [[ suggestions, toolbar;
                     the shared-text editor (useLiveDoc, LiveBody, LivePeople)
  entry/             cover (its tools behind one "Afbeelding" menu), the three
                     crops (round 19), type fields — as a form on the editing face and as
                     printed facts on the reading one (`FieldsView`) — tags,
                     the pickers for a linked artikel (EntryPicker), a linked
                     dossier (CasePicker) and the landkaart that draws this
                     place (ConnectMapButton), the autosave hook, the
                     proposals panel, the outline of the page (EntryOutline)
  cases/             the dossier — two faces, like an artikel — its add-boxes
                     and cards
  boards/            the canvas, the card (artikel, notitie, foto, punaise,
                     landkaart, dossier, tijdlijn, prikbord), the picker the
                     bar and a dropped string share (§52), the inspector, the
                     sync hook, and the "…and in the dossier too?" question
                     (offerToFile)
  maps/              the map canvas (pan, zoom, pins, legend), the Keeper's
                     upload sheet and tools
  timelines/         the tijdlijn: the stage (axis, ticks, tags, the
                     folded-out windows), the sheets around it (the date form,
                     a new gebeurtenis, an existing one, the settings) and
                     the "Nieuwe tijdlijn" button
  families/          §66: de stamboom — FamilyTreeCanvas (pan, zoom, the
                     cards, the lines, the ink and the other hands),
                     TreeNode (the five frames), TreeHandles (the three `+`
                     and the `…`), treeUndo (pure: the ring of snapshots),
                     useTreeSync (the save and the pull in one) and the
                     "Nieuwe stamboom" button
  web/               §43: the web — WebCanvas (one <canvas>, both layouts,
                     every gesture), WebView (the page around it: search,
                     depth, legend, panel, the phone's sheets),
                     PinSelectionButton (a selection onto a prikbord) and
                     ConnectionsLink (the button every page carries)
  ink/               §33: the tekenlaag — the canvas (InkCanvas), the
                     toolbar, the sheet that takes the hand and the Keeper's
                     switch (InkTools: one strip of three dots that is the
                     brushes with the potlood and the gummen with the gum),
                     and the hook that owns the strokes, the frames and the
                     saves (useInk)
  live/              §16/§60: LiveProvider (the one `EventSource` in the app,
                     the leader tab and the followers that ride its socket),
                     LivePage (a page's place, its watched keys and its
                     `router.refresh()`), LiveStrip (who is here, and the dot),
                     LiveFields/LiveFieldsRoom (§17's shared fields), and
                     refreshHold.ts — §59: while any hand on the page holds,
                     nothing lands
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
                     an artikel's own reveals (secrets.ts — the *sectie* half
                     of it moved to lib/sections/ in §70), the review queue,
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
                     what a card stands for, and — since §60 — a `live.ts` of
                     two functions that forward to the site hub, the wall's own
                     hub (presence, roster, pointer fan-out, TTL reaping) being
                     gone. Three pure files beside it (§61): dirty.ts (what
                     *this hand* changed, and the patch built from it),
                     retry.ts (the schedule a failed save follows and the four
                     flavours of failure it reads) and place.ts (`freeSpotNear`
                     — where a new card lands when the spot is taken)
  sections/          §70: a sectie — a titled block of shared text belonging to
                     an artikel *or* a dossier. service.ts is the only road to
                     one: the two rights (the thing's §17 dials to write,
                     the Keeper's alone for the dial and the reveals),
                     startingVisibility and canEditSections
  maps/              maps, pins, the artikel a map is a map *of*,
                     visibility.ts (§40: a landkaart's own view rule, written
                     the way `lib/cases/visibility.ts` writes a dossier's) and
                     cluster.ts (§71, pure: the total draw order of spelden,
                     who bunches with whom at this zoom, the view one press on
                     a `+n` lands on, and the four laag commands)
  timelines/         §32: time.ts (pure: a moment as one integer, precision,
                     the ruling of the axis, where the tags go, and §35's
                     snapping and anchor), the service (tijdlijnen behind the
                     prikbord's dials, gebeurtenissen behind the artikel's
                     rule), moment.ts — §35: the one writer that keeps a
                     dragged gebeurtenis and an artikel's date in step — and
                     inkSpace.ts (§33, also pure: where a streek lives on an
                     axis and how wide it is, in both stroke formats)
  families/          §66: de stamboom — types.ts (the contract), roles.ts
                     (pure: the four roles, what a koppelingsveld with one
                     means, and fields → lijnen), mirror.ts (pure: what the
                     other page should say; `updateEntry` carries it out),
                     frames.ts, merge.ts (pure: the tree's own state, and the
                     refusal to keep a lijn between two artikelen),
                     layout.ts (pure: generations, unions, where everybody
                     stands), graph.ts (the drawing for one viewer, rule 1 by
                     construction), service.ts and live.ts
  live/              §20: rooms of shared text (docs.ts is the hub, rooms.ts
                     the gates, schema.ts the ProseMirror schema on the server);
                     hub.ts, changes.ts, keys.ts and gate.ts for the one site
                     line; and, since §60, wire.ts (pure: the backoff, the
                     keepalive rule, the batch split, the hidden-tab timer and
                     the backpressure policy — every number the provider used
                     to keep itself) and colour.ts (the ink a person is drawn
                     in, moved out of `lib/boards/live.ts` so the two files do
                     not import each other)
  keeper/            §44/§46: de Keeperkant — kinds.ts (pure: the six kinds,
                     where each lives, and the two `Side`s), side.ts (the one
                     read, `keeperRef`; the only place the two spellings of
                     keeper-only are written; and `sideCondition`, the §46
                     "only this side" fragment every *list* is AND-ed with),
                     ties.ts (a twin and a touwtje), notes.ts (one text per
                     pair, `notesTarget`)
  theme/             §45: schemes.ts — the four palettes, their twenty-four
                     tokens, and the emitter both `globals.css` and the
                     signed-in layout are written from. Pure; the half that
                     reads and writes settings is `lib/admin/schemes.ts`
  web/               §43: het web — types.ts (node, edge, the eighteen kinds
                     of tie), kinds.ts (pure: colour, dash and word per kind),
                     service.ts (the graph for one viewer, rule 1 by
                     construction), slice.ts (pure: the focus walk, the
                     legend), layout.ts (pure: the columns and the fold),
                     force.ts (pure: the organic web, no d3)
  images/            shapes.ts (round 19, pure and client-safe): the three
                     crop shapes — liggend, staand, vierkant — their ratios,
                     and the one reader of a `cover_crop` bag
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
scripts/             dev, bootstrap, seed-demo, seed-wereld, backup, restore
tests/unit/          vitest
tests/e2e/           playwright, the golden flows
```

The interface is Dutch; `GLOSSARY-NL.md` is the list of terms every screen
uses. Code, comments and these docs are English.

Eighty-nine rules worth knowing before changing anything:

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
   own copy. (Since §60 that is a `changed` on `board:{id}` down the **site**
   line — a wall has no line and no hub of its own any more, and
   `lib/boards/live.ts` is two functions forwarding to `lib/live/hub.ts`. The
   rule is untouched; only the pipe changed.) That extra round trip is not an oversight — board cards are
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
5. **A picture is cropped per *shape*, never on disk.** An artikel's page shows
   the whole picture at whatever shape it is. Lists need a shape, so the
   picture carries three crops (`entries.cover_crop`: liggend 3:2, staand 3:4,
   vierkant 1:1 — `lib/images/shapes.ts`, the only place a ratio lives), set
   once under "Afbeelding › Bijsnijden" and drawn by every list, card, thumb
   and knot in the shape it uses: cards and thumbs staand, the tijdlijn's
   window and the web's panel liggend, a web knot vierkant. The file on disk
   is never cropped; each crop is a position and a zoom, applied by CSS
   (`coverStyle`, with the frame's aspect from `coverClass(shape)`) or as a
   source rect on the web canvas at render. *Round 27: "a focal point" is what
   this line used to say and what `drawCover` believed. `x` and `y` are an
   **`object-position` fraction** — the share of the leftover that sits above
   and to the left, which is what `CropFrame` authors and what `cropStyle`
   draws — not a point that must land in the middle of the frame. The two
   agree at 0, 0.5 and 1 and nowhere else. `coverSourceRect` in
   `WebCanvas.tsx` is the maths, pinned against the CSS reading in
   `tests/unit/web-cover-crop.test.ts`.* A row written before round 19
   holds a bare `{ x, y, zoom }` and is read as the staand crop. A dossier's
   own picture (`cases.cover_asset_id` + `cases.cover_crop`) has the same
   three. A dossier's filing of an artikel and a prikbord card no longer keep
   a crop of their own (round 19; `case_entries.crop` is nulled by migration
   `0020` and read by nothing, a card's `crop` is dropped on read) — one set
   per picture, used everywhere, so a face looks the same on every list.
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
    to nothing prints nothing. **One field is deliberately not like that**, and
    it is worth knowing which: `family_tree_link` (§66, round 32) stores
    `{ id, name, slug }`, because nothing resolves a stamboom per viewer on the
    way to the reading face the way `resolveCaseRefs` resolves a dossier. It is
    an `entry_link`-shaped copy, not a MISSING-shaped lookup — a renamed or
    destroyed tree leaves a chip pointing at an address that answers 404. That
    is the trade, and it is written down in `DECISIONS.md` round 32.

20. **A pointer frame is sight, never state.** §8. Cursors, carried cards and
    the selection box someone is dragging open all travel as `PointerFrame`
    over the live line, are fanned out directly, and are never stored and
    never merged — the save that follows the gesture is what makes it true.
    Everything in a frame is drawn straight into a style attribute on somebody
    else's screen, so there is exactly one
    place that reads one off the wire, and it keeps a frame to finite numbers,
    forty carried cards and a box of exactly four coordinates. (Since §60 that
    place is `pointerFrame` in `app/api/live/site/route.ts`, where every hand
    in the archive now arrives — a prikbord's, a landkaart's and, since §62, a
    tijdlijn's; `readPointerFrame` in `lib/boards/live.ts` went with the
    board's own hub. Same three checks, same `s` of exactly four finite
    numbers.)

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

    Round 36 added the fourth thing, which is the one nobody counts: **a door.**
    "Je kunt geen stambomen verwijderen" was true, and true of the stamboom
    alone — `DELETE /api/family-trees/[id]`, `softDeleteFamilyTree` and the
    `family_tree` half of `lib/admin/trash.ts` all existed, and no screen ever
    called any of them. The other three canvases each had their own button
    (`BoardCanvas`'s `removeBoard`, `TimelineCanvas`'s `deleteTimeline` in the
    Instellingen sheet, `MapKeeperTools`'s `takeDown`). So the dossier's folded
    bin drawer became one shared component — `components/ui/BinSlot.tsx`, with
    the noun passed in and the Keeper's word read from `useUi().words` — and it
    was put on the stamboom page **only**: a second door to the same bin on the
    other three would be worse than the gap it closed. On a full-screen canvas
    it goes *outside* `.page-canvas`, below the fold, beside where
    `#tree-underfold` puts the tekenlaag switch, or a folded `<details>` inside
    the canvas column costs the stage its own height (§34). And `DELETE` on a
    prikbord and a stamboom now also `publishChange`, so a canvas that is open
    hears it on the line it is already listening to (§60) and stops autosaving
    into something that is in the bin. Anything that gets a maker gets a door on
    the day it is built — that is §40's rule about dials, one shelf along.

22. **A soort can be one that only exists inside a dossier.** §24. *Reversed by
    §49: every soort is makeable everywhere again, and `case_only` is no longer
    a gate. What is below is history.*
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

    Round 18 added two things at the edges. A prikbord has a switch, **"Telt
    mee in het web"** (`boards.in_web`, in the wall's Rechten sheet, for
    whoever manages its rights): off, and the wall is out of the web *and* out
    of "Genoemd in", both readers checking the same column — a hunch pinned up
    on a private wall should not surface as a fact on an artikel's page. And
    the plain boxes — a card's writing, a notitie-speld, the text under a
    gebeurtenis — offer artikel names on `@` and `[[` (`MentionPopover`,
    `components/ui/`), inserting `[[Naam]]`, the exact form `entryIdsInText`
    reads; the popover attaches to a textarea it does not own and writes into
    it through the native value setter plus an `input` event, so a plain box
    and a Yjs-bound `LiveField` hear it the same way. The scribble under an
    *artikel* card counts as a mention now too, never for its own artikel;
    migration 0019 empties the walls' rows so `ensureMentionsBackfilled()`
    rewrites them at the next start-up.

    Round 36 gave a dossier a second mouth. Since §70 it speaks through its
    **Dossiernotities *and* through each of its secties**, and a sectie's dial
    is *finer* than the dossier's — a dossier the whole table may open can carry
    a sectie only the Keeper may read. So a `case` row is no longer resolved by
    `visibleCaseCondition` alone: the source has to still *say* it, through
    `canSeeSection`, exactly as an artikel's `section` row has always been
    checked. That re-verification lives in **both** readers, `listMentions` and
    `buildWebGraph`, because the count on the artikel, the panel under it and
    the line in the web must look at the same set — the same reason
    `collapseMentions` runs at build time and not in the browser. One rough
    edge, and it is the safe direction: the row carries only the sectie's title,
    so a sectie **without** a title is indistinguishable from the notities, and
    both readers let either source count for a detail-less row. The notities are
    readable by definition to anybody who got that far.

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

    **And the row wraps; it does not scroll** (round 36). A dossier with many
    soorten filed grew a horizontal scrollbar and hid half its own shelves
    behind a drag — Nick: *"I think this is ugly."* He was offered an overflow
    menu and a restructured tab set, and chose wrapping. `.case-tabs` is
    `flex-wrap: wrap` now, with a `row-gap` and **`column-gap: 0`**; the
    `overflow-x`, the scrollbar rules, `.case-tabs-scrollable` and
    `useOverflowing` in `CaseDossier` are gone. The file-tab trick had to move
    for it: a tab used to carry **no** bottom border and be pulled a pixel down
    over the *row's* border-bottom, which is the panel edge and therefore only
    ever sits under the last line. Every tab now carries its own 1 px bottom
    rule and the active one paints that rule in `--paper-raised`, so the notch
    that merges a tab into the panel appears on whichever line the tab lands on.
    The `column-gap: 0` is load-bearing and not a tidy-up: a gap between tabs
    would be a hole in the shelf on every line but the last. Tabs keep their
    distance by their padding and their 1 px transparent side borders.
    `components/useOverflowing.ts` now has no caller and is left on disk on
    purpose — a deleted file cannot be delivered over the device bridge
    (CLAUDE.md §7), and nothing imports it, so it costs a dead file rather than
    a broken build. `git rm components/useOverflowing.ts` is the tidy-up,
    whenever somebody wants it.

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
    to the audit log. The layer has its own table and its own key (`ink:{id}`,
    gated like the thing it hangs on) — never a column on
    `boards`/`maps`/`timelines`/`family_trees`, so a stroke a second
    does not re-render every page that watches those. (Since §60 "its own
    line" means its own *key*, not its own socket: there is one line per tab
    and the board hub it was written against is gone.) Frames of a stroke in
    progress ride the site line like pointer frames: sight, never state
    (rule 20). Coordinates are the place's own — board units on a prikbord
    and (since §66) world units on a stamboom, both `screenWidth / zoom`;
    picture pixels on a landkaart; and on a tijdlijn **seconds on both axes**:
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
    times too fast. (Round 19 retired that crop mode: a card draws the
    artikel's own staand crop, rule 5.) Everything on the paper scales, **including the 1px border
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

43. **The web is a drawing of the archive, never a second copy of it.** §43.
    `lib/web/service.ts` builds a graph *for one viewer* on every request, out
    of the tables that already say what points at what — `entry_links`,
    `entry_mentions` (§27), `case_entries`, a prikbord's cards and draden, a
    landkaart's spelden, a tijdlijn's gebeurtenissen, `access_grants` with
    `user_characters`, and the infobox's `case_link` / `user_link` fields. It
    stores nothing and is never written to: a line in the web is true because
    the text, the wall or the map says so, and stops being true the moment
    they stop saying it. Nodes are collected first, each kind through the
    condition it already has (`visibleEntryCondition`, `visibleCaseCondition`,
    `visibleMapCondition`, `listBoards`, `listTimelines`), and an edge is kept
    only when both its ends are in that set — so **a thing this viewer may not
    open is not in the web at all**: no MISSING knot, no dimmed ghost, no name
    in the JSON. Rule 1, enforced by construction and pinned by
    `tests/unit/web-graph.test.ts` (which asserts the hidden thing's *name* is
    absent from the serialised answer) and `tests/e2e/web.spec.ts`.

    The browser fetches the whole visible graph once (`GET /api/web`) and
    slices it itself: `focusSlice` and `filterGraph` in `lib/web/slice.ts` are
    pure and shared with the API, so the depth stepper, the legend and a new
    middle are instant and `?focus=…&depth=2` on the server says exactly what
    the page shows. Every edge is directed *from → to*, read as "from refers
    to to"; the column layout (`lib/web/layout.ts`) draws what points at the
    focus on the left and what it points at on the right, a node reachable
    both ways sits once on the side that found it first (`out` wins a tie),
    and a column past twenty-eight rows folds into "… nog n". The organic
    layout (`lib/web/force.ts`) is hand-written, deterministic (a node starts
    on a spiral seeded by its id) and local — repulsion stops at 300 px and a
    weak gravity holds the pieces — so five hundred knots settle in under a
    second and a reload does not shuffle the wall. Three things keep a filled
    archive from clotting (round 17): a spring is divided by the smaller
    degree of its two ends, so a hub with thirty lines is pulled on about as
    hard as a knot with one; two knots may never come closer than `r + pad`
    each, `pad` being room for a label, and that floor is a *move*, not a
    force a cooling alpha can starve; and in a focus web every depth has a
    **band** — an annulus with enough area for its knots, a gutter between
    bands — that a strayed knot is moved back into, so the organic web reads
    "one step, two steps" like the columns do. A knot a hand drags is
    **pinned** where it is dropped (`ForceNode.pinned`); it wears a speld, a
    tap on the speld or the toolbar's "losmaken" lets it go. Both layouts are
    drawn by one `<canvas>` (`components/web/WebCanvas.tsx`); nothing in the
    web is a DOM element, the frame loop stops when nothing moves, text is
    measured once at one size and scaled (a font string per zoom step is a
    font parse per knot), and a cover is stamped from a sprite cut once to its
    knot's shape rather than clipped every frame. Names are a pass of their
    own: by rank (the middle, the chosen, the lit, the hubs, the rest) and only
    where the name would not sit on another name or knot; the rest fade in as
    you come closer. A line between two knots that are both two or more steps
    out is drawn faint at rest, in its own colour, and lit on hover.

    Round 18 made the drawing two canvases and four rules. The **resting lines
    and the step rings live on a canvas of their own under the drawing**
    (`.web-canvas-layer`), redrawn only when a knot, the camera, the size, the
    palette or the graph changed; a hover frame strokes the handful of lit
    lines on top and the compositor stacks the two — measured on a 4K canvas,
    a hover frame went from 133 ms to the compositor's own floor. While knots
    move the layer is drawn at half a pixel per CSS pixel without dashes or
    the faint lines; while only the camera moves it is shifted by a CSS
    transform and redrawn sharp once the hand is still (160 ms); the
    simulation takes several ticks per frame while hot and a warm graph
    change settles thirty ticks off-screen first. The four rules: **a text
    line yields** — a `mention` or `section` edge between two knots is dropped
    at build time (`collapseMentions` in `slice.ts`) when any edge of another
    kind ties the same pair, and what remains is 0.8 px at a third of the
    resting alpha; **a draad brings its own words, direction and colour** —
    the line reads the string's label verbatim, a labelled draad points from
    its from-card to its to-card (an unlabelled one still has no direction),
    and `WebEdge.colour` carries the string's colour on the wall
    (`LINE_COLOURS`, `--web-line-<colour>`); **a wall can opt out**
    (`boards.in_web`, see rule 26); and **a Keeper's web reads the containers
    as a player** — dossiers, prikborden, landkaarten, tijdlijnen and (since
    §66) stambomen go through
    the ordinary dials without the Keeper's skeleton key unless the legend's
    "Ook privé van anderen" (`?others=1`) is on, while artikelen and sections
    keep the real viewer, so the Keeper's own hidden pages stay.

    Round 19 refined four things. The web **zooms to 12** instead of 4: a
    cover sprite is keyed on a zoom bucket (1, 2, 4 or 8, `zoomBucket`) and
    cut again at that resolution, fetching the 900 px `?s=card` from bucket 4
    up — never for a whole web at zoom 1 — while a line's on-screen width
    grows as √zoom up to zoom 4 and then stops (`lineZoom`), so a close look
    at a knot is a picture and not a rope. The legend now has **two parts**:
    under *Wat* you switch kinds of knot on and off — dossiers, prikborden,
    landkaarten, tijdlijnen, stambomen and every soort of artikel in the web, each with
    a count — and under *Hoe* the kinds of line; a knot switched off is
    *absent* (`hiddenNodeKinds` / `hiddenTypes` in `slice.ts`), it goes with
    everything that hung only from it, and the middle itself is never hidden.
    In the panel the **short description** of what you clicked stands under
    its name. In **Kolommen** the layout's coordinates are the truth and a
    tween is only the way there — under `prefers-reduced-motion`, where no
    tween is made, cards used to stay at their organic spots for ever — and
    the layout key carries a fingerprint of the graph (every knot's step and
    side, a hash of the edges), so a legend tick re-runs the columns even when
    no id changed. A knot wears the picture's **vierkant** crop, the columns'
    thumb its staand one and the panel its liggend one (rule 5). *Round 27:
    the canvas read those numbers as a focal point while every card read them
    as an `object-position` fraction, so a knot's picture sat wrong everywhere
    but 0, 0.5 and 1 — see rule 5 and `coverSourceRect`. The Kolommen thumb
    also asked for the staand crop and drew it in a 0.87-wide frame; its width
    comes from `SHAPES.portrait.ratio` now. And the web's full-size cover URL
    was `?s=full`, the one address in the app that is not what `assetUrl()`
    builds — the same bytes at a second HTTP cache entry.*

    How a line is tied is a *kind* (`WebEdgeKind`, eighteen of them since §66)
    with one
    colour and dash in `lib/web/kinds.ts` and one CSS custom property
    (`--web-<kind>`) in `globals.css` that must stay the same colour, because
    the legend and the panel print a line in the colour the canvas draws it.
    The words on a line come from `Words` (rule 8). The one thing the web may
    *do* is put a selection on a prikbord (`PinSelectionButton`), through the
    same `POST /api/boards/{id}` road as "Op prikbord prikken" and asking the
    wall's own question — "…en in het dossier?" — once for the batch; the
    lines never become draden, because a draad is the investigator's claim and
    the web's lines are the archive's.

44. **The archive has two sides, and a tie between them is never a right.** §44.
    Any artikel, dossier, prikbord, landkaart, tijdlijn or stamboom can be the Keeper's
    own: a page the table may not know exists. It is written **two ways on
    purpose**, and `isKeeperSide()` in `lib/keeper/side.ts` is the only place in
    the app where that difference is spelled out. An **artikel** says it with
    §9's `visibility = 'keeper'`, as it has since Phase 3. The other four say it
    with `keeper_only` (migration `0021_keeper_side`, `0` on every existing
    row), AND-ed **in front of** the owner's dials inside `viewableCondition()`
    and `canView()` — not folded into them, because this is not a strict setting
    of the §17 kind: no dial, no grant and no ownership opens it. Two ways to
    say one thing is how a leak gets written, so nothing but `isKeeperSide()`
    may ask a record which of the two it uses, and `entries` deliberately has no
    such column.

    **A twin is a pair; a touwtje is everything else.** A twin is one Keeper
    page that is the other face of exactly one player-facing thing — at most one
    per side, and the *database* says so (two partial unique indexes on
    `counterparts`), not a promise in `ties.ts`. `createTwin` makes a record of
    the same kind with the same name and copies only what makes the new page
    make sense: the soort and the origin-dossier of an artikel, a landkaart's
    picture, a tijdlijn's scale and anchor, the dossier a prikbord hangs in.
    Never the text — the Keeper's face is for what the players' one does not
    say, and a page that starts as a copy of the one you were just reading is a
    page nobody rewrites. A touwtje is any other tie, any number, in both
    directions, across kinds; the Keeper end must actually be a Keeper page.

    **A tie is not a permission.** Every end of every tie is read through
    `keeperRef()`, which asks that kind's own visibility rule and returns null
    for "gone, or not for you" — the caller may not tell those apart. A rope to
    something you may not open is simply not in the list you are given, so no
    switch and no menu can be the thing that reveals a page. (Round 22 also
    shipped a `/keeper` list page and a ninth item in the side menu for it.
    §46 replaced both: the address is a redirect that sets the side, and the
    menu item is gone in favour of one toggle in the corner of the screen.)

    **A twin's two faces share one set of notes.** Keeper notes left `entries`
    and `cases` for `keeper_notes`, keyed by `(kind, id)`, so all six kinds
    (de stamboom joined them in §66)
    have them and a pair keeps **one** text — held on the Keeper's side.
    `notesTarget()` is the whole rule and the only place it is written. They are
    a live room now (`keeper:{kind}:{id}:notes`), which **reverses** the note in
    `lib/live/rooms.ts` that said Keeper notes deliberately are not one: the
    premise stopped being true, not the reasoning. The same text is open on two
    pages at once and two Keepers preparing a session are two people typing, and
    without a room the second save threw the first away. Its gate is the only
    one in that file that is a **role** rather than a visibility rule, and its
    key is the only one a page must **resolve before asking for**: request
    `keeper:{this page}:notes` on a page whose notes live next door and
    admission is null, on purpose — that refusal is what keeps one text from
    becoming two.

    **Nothing keeper-only reaches a player's HTML.** The switch, the panel and
    the stamp are rendered by a server that has already established `isKeeper`;
    they are absent, not hidden. A keeper-only page wears `KeeperStamp`, which
    renders `KeeperSideMark` — the marker §45's palette selectors look for, and
    a paint instruction only: nothing anywhere reads `data-side` to decide what
    to show. Since §46 the five record pages render `KeeperStamp` for *every*
    viewer, because the mark now says `player` as well as `keeper`; the visible
    stamp is still only the Keeper's word, and a player's copy is handed no
    `browserSide`, so nothing about their browser moves. A page you may not open answers **404**, never "u mag dit niet
    zien", because the refusal itself would confirm the thing exists (§40); that
    now includes `/api/access`, which used to say 403. `app/(app)/not-found.tsx`
    exists so that 404 keeps the shell: `notFound()` fell through to Next's own
    page, drawn above this group's layout, and the shell is where the way back
    lives. It prints the number **404** on the page on purpose —
    `tests/e2e/phase3-keeper-tools.spec.ts` reads it, and a reader who lands
    there by mistake can repeat it.

    **"Kijk als speler" works by becoming one.** `getSessionUser` turns
    `isKeeper` off for the whole request when the cookie is set, so every read,
    room and API answers the way it would for the table and no surface can be
    forgotten the way a per-page flag would forget one. It also means they write
    as nobody, which is right. `isRealKeeper` exists for the handful of things
    that must survive the preview: the banner in the shell that offers the eyes
    back, and since §46 the toggle in the corner and the cookie behind it
    (`app/api/keeper/flip/route.ts` writes nothing while `asPlayer` is on).
    Beheer refuses to render during the preview, and `/keeper` sets nothing and
    drops the reader on the ordinary Start page, so the way out cannot live on
    either.

    And the rule the leak audit that came with this round wrote down, which is
    older than §44 and outlives it: **a check that asks "is this yours?" must
    ask "may you see it?" first.** An owner stays the owner after the Keeper
    takes their wall or their artikel across, and four places were answering
    them on that alone — a dossier's Activiteit tab naming a prikbord
    (`listCaseActivity`), "op de kaart" in the wiki listing an artikel through a
    landkaart the reader may not open (`browseEntries`), the rechten panel
    opening on a keeper-only board (`loadAccessRow` selected `keeper_only` in
    the SQL but not into the row the predicates are fed from), and the voorstel
    queue serving pending edits — name, body, tags, infobox, cover — for an
    artikel since hidden (`canReview`). Two of the four were leaking a *private*
    prikbord and a *private* landkaart before §44 existed.
    `tests/unit/keeper-leaks.test.ts` pins all four.

45. **Four palettes: the page picks the side, the person picks the light.** §45.
    Spelers licht, Spelers donker, Keeper licht, Keeper donker — twenty-four
    tokens each, in `lib/theme/schemes.ts`, editable in **Beheer → Kleuren**.
    Four and
    not two, because a glance at the screen should say which side of the archive
    you are standing on before you have read a word; twenty-four and not a hundred,
    because every other colour in the stylesheet is a `var()` alias onto one of
    these — the web's eighteen `--web-<kind>` properties are aliases onto its
    **six** line colours, so "wat op een prikbord hangt" is one choice and the
    legend cannot disagree with the drawing. Nothing stores "this account uses
    the Keeper colours": a keeper-only page renders `data-side="keeper"` (§44)
    and *is* Keeper-coloured for whoever is looking at it, which is only ever a
    Keeper. Light against dark is the person's, on their account
    (`users.colour_scheme`; Systeem · Licht · Donker on Jij), written as
    `data-theme` by the signed-in layout.

    **One emitter, two callers, and a test between them.** `schemeCss()` writes
    the whole block; `app/globals.css` carries its output for `DEFAULT_SCHEMES`
    **between two markers** and `app/(app)/layout.tsx` renders the Keeper's
    saved palettes as a `<style>` later in the document. Never hand-edit a
    colour between those markers: change the module and paste its output back.
    `tests/unit/schemes.test.ts` fails the moment the two drift, and that test
    is the point of the arrangement — a token added to the module and forgotten
    in the stylesheet would leave every archive whose Keeper never opened the
    pane one round behind in exactly one colour, with nothing broken and nothing
    to notice.

    Every selector is `:root:has(…)` rather than a class on a wrapper, for §29's
    reason: a `Sheet` portals onto `<body>`, and only a variable named on the
    root reaches it. Specificity does the choosing, so the four blocks can be
    written in one order and read in another. The `@media (prefers-color-scheme:
    dark)` half is fenced with `:not(:has([data-theme='light']))`, because a
    person who chose Licht means it, even at midnight. `--accent` is not a
    token: it has always been "whatever the stamp is" and the emitter keeps it
    an alias of `--stamp-red`. The kurk speck's alpha is baked on by the emitter
    as two more hex digits (`#rrggbb` + `29` or `4d`, per half) so the picker
    stays a plain colour. Everything a
    Keeper types goes through `cleanSchemes()`, so nothing but six hex digits
    reaches the CSS, and §11's old single accent is folded in as the stamp of
    all four schemes until the Kleuren pane is opened.

    Two decisions that read as inconsistencies and are not. Schemes are stored
    **in full**, defaults included, where §11's words are stored sparsely: a
    word left alone should follow a later change to its default, but a Keeper
    who tuned three of twenty-four colours does not want the other twenty-one
    moving under them in a later round. And the pane **warns** below WCAG's 4.5:1 for
    ink on paper rather than refusing the save — the archive is the Keeper's,
    but nobody should be able to make the whole thing unreadable by accident and
    find out on a phone in a tent. The canvas is not exempt from any of this:
    `WebCanvas` reads the custom properties (`readPalette`) rather than keeping
    its own copies, so the dark face, the Keeper's side and the Keeper's own
    palette all reach the drawing.

    **A kaart is a surface of its own** (round 32, which took the count from
    nineteen to twenty-four). Five tokens joined on one argument: a card is not
    a hole in the page, it is a piece of paper lying *on* the page, so it
    carries its own ink and nothing drawn on it may reach for `--ink` or
    `--paper*`. A stamboom's kaartje was painted `--card-face` — a light paper
    in every scheme, dark ones included — and the name on it was written in
    `--ink`, which in a dark palette is nearly white: white on beige, and
    unreadable at night on the one thing a stamboom is read for. A new group
    **De stamboom** holds `--tree-face` (the kaartje), `--tree-ink` (the name on
    it), `--tree-line` (the lines between the kaartjes) and `--tree-accent` (the
    gold of a godheid's ring, and of a huis with no colour of its own), and
    `--card-ink` joins the prikbord's group, replacing a hard-coded `#1f1b16` on
    `.board-card` and `.board-tray-card` that nobody could turn. In a dark
    palette the kaartje itself goes dark and the ink on it goes light — the card
    turns over with the light rather than staying pale — and it is *lighter*
    than the stage it lies on, because darker than the stage reads as a hole
    rather than as paper. `app/stambomen.css` derives two locals from the two
    card tokens with `color-mix` (`--tree-rule` for the card's own edge,
    `--tree-ink-soft` for the small grey lines on it) so a Keeper turns two
    dials and not four; those two are not tokens and do not belong in Kleuren.
    `--house` still overrides the accent where a Familie-artikel has a colour.
    `tests/unit/tree-contrast.test.ts` holds the floors in all four palettes —
    `--tree-ink` on `--tree-face` at 7:1 (AAA: a name on a card is small and
    often over a portrait's edge), `--tree-line` on `--paper-dark` at 3:1 (the
    stage is `--paper-dark`, never `--paper`), `--card-ink` on `--card-face` at
    4.5:1, `--tree-accent` at 2:1 against both the card and the stage, and the
    card turning over with the light — so a later round that darkens one of a
    pair and forgets the other fails there rather than on somebody's screen.

46. **De spiegel: a list filters by side; a lookup never does.** §46. The
    Keeperkant is not a page in the archive — it is the archive, read from the
    other side. On the Keeper's side every list (Start, Wiki, Dossiers,
    Prikborden, Landkaarten, Tijdlijnen, Stambomen, het Web, Zoeken) shows **only** the
    Keeper's own things; on the players' side only what the table may see. Two
    clean worlds, not one world with the Keeper's things added on top.

    That is one WHERE fragment, `sideCondition(kind, viewer)` in
    `lib/keeper/side.ts`, in the same two spellings §44 knows (`visibility` for
    an artikel, `keeper_only` for the other four). It is AND-ed **after** the
    visibility rule, never instead of it: rule 1 still decides what may be seen,
    and this only decides which half of that is on the screen. A viewer with no
    side — a test, an API that patches one record, a room's gate — gets `1 = 1`,
    and so does a player, whose visibility rule has already removed the Keeper's
    half. `onSide()` is the same rule for rows already in memory.

    It is applied in the list functions and nowhere else: `browseEntries`,
    `listTagsWithCounts`, `countEntriesPerType`, `recentActivity`, `listCases`,
    `countEntriesPerCase`, `listBoards`, `listMaps`, `listTimelines`,
    `searchEntries`, and `buildWebGraph` for the whole web. Nothing that finds
    **one** record asks — `getEntryBySlug`, `getCaseBySlug`, `getBoard`,
    `getMapBySlug`, `getTimelineBySlug`, `keeperRef`, `tiesFor`, the live rooms'
    gates, every API that patches one thing — because a Keeper walks across a
    touwtje from either side and the page has to be there when they arrive.
    `bothSides: true` is the opt-out for the reads that are lists in shape only:
    a picker (`/api/boards`, `/api/cases`, `/api/maps`, `/api/timelines`,
    `/api/keeper/search`, the pickers on `/b/[id]`, `/e/[slug]`, `/maps/[slug]`),
    autocomplete (`suggestEntries` — Zoeken passes `sided`, the suggestions do
    not), a record page's own sub-list (`listTimelinesForCase`, which is
    `listTimelines(viewer, { where: caseId })` — a lookup in a list's clothes),
    and a **focus** web, whose ties cross the two sides on purpose
    (`bothSides: Boolean(focus)` in `app/api/web/route.ts`). Every call site
    says so in a `§46` comment; a new one without a reason is a bug. *§50 took
    that opt-out away from all of them but one: only `/api/keeper/search`, the
    touwtjeskiezer, still passes `bothSides`.*

    Two traps. `containerViewer` in `lib/web/service.ts` strips `isKeeper`, so
    `sideCondition` answers `1 = 1` for it — read the side off the *real*
    viewer. And that reading-as-a-player rule now has an exception: on the
    Keeper's own side the real viewer is used, because since §44 `keeper_only`
    lives inside those dials and a player's eyes would leave the Keeper's web
    without a single dossier, prikbord, landkaart, tijdlijn or stamboom. It is safe
    because the side filter then narrows it to keeper-only records, which are
    the Keeper's by definition — nobody else's private thinking arrives that
    way.

    **The page you are standing on decides the side.** The browser's side is a
    cookie (`SIDE_COOKIE = 'zcf_side'`, read by `getSessionUser` into
    `SessionUser.side`, honoured only for a real Keeper who is not looking as a
    player); a record's page renders its own `data-side` — 'keeper' *or*
    'player' — through `KeeperSideMark`. The page wins, in CSS and nowhere else:
    `lib/theme/schemes.ts` emits
    `:has([data-side='keeper']):not(:has([data-side='player']))`, so §45's
    Keeper palette is used when something says keeper and **nothing** says
    player. Following a link across therefore turns the whole site over with
    you, and `SideSync` in `KeeperStamp` tells the cookie so afterwards — one
    `POST /api/keeper/flip`, one `router.refresh()`, only when the page and the
    browser actually disagree. No redirect, no flash, and no permission: the
    attribute is paint, and the cookie grants nothing the toggle does not.
    *§50 reverses that last sentence: the cookie is corrected on the server, by
    a redirect, before anything renders (`sideDetour`), and `SideSync` is gone.
    The palette still follows the page.*

    **One toggle, outside the menu, and the key `k`.** `SideToggle` is a small
    round button fixed to the top-right of the viewport on a desk and on a
    phone, rendered only for a real Keeper who is not previewing as a player —
    absent from anyone else's HTML, not hidden by CSS. Its icon and its
    `aria-label` say where it *goes* (shield → Naar de Keeperkant, person →
    Naar de spelerskant). Pressing it reads the page's `data-flip-to` (the
    twin, or the list of that kind on the other side) and goes there; a page
    with no mark — a list, Start, Zoeken, het web — stays at its address and is
    re-rendered from the other side. The cookie is written *before* the
    navigation. The flip itself is the View Transitions API: a circle grows out
    of the button's centre (`--flip-x` / `--flip-y` on `<html>`) over 550 ms
    with the old side lying still underneath — a wipe, because one archive is
    *over* the other, not dissolving into it — held open until the new page has
    rendered, with a 1500 ms safety timeout. `prefers-reduced-motion: reduce`
    gets none of it, and a browser without `startViewTransition` (Firefox) gets
    a plain navigation. The shortcut `k` lives in `UiProvider` behind the same
    guard as `n` and `/` and reaches the button as a window event, so a browser
    with no button has nobody listening. On the Keeper's side the masthead wears
    a `.masthead-side` stamp; that block lives in the desktop side menu, so on a
    phone the button is the only sign.

    **`/keeper` is an address, not a screen.** Round 22's list page is a
    `redirect('/api/keeper/flip?side=keeper&to=/')`: it keeps its meaning — take
    me to the Keeper's side — and stops being a place. For anybody who is not a
    real Keeper the route sets nothing and they land on the ordinary Start page.
    `tests/unit/keeper-mirror.test.ts` pins the one rule against a real SQLite
    file, and `tests/e2e/keeper-side.spec.ts` ("de spiegel klapt om") presses
    the button and the key.

47. **Drie kleine reparaties: het web onder de hand, een kaartje dat zijn
    artikel kwijt is, en een prikbord dat van dossier kan wisselen.** §47.
    Three separate repairs, kept in one rule because each is one paragraph.

    **The web's resting layer has a bleed.** §43's drawing is two canvases
    (round 18): the resting lines and the step rings live on a lower one that
    is drawn once and moved with a CSS transform while the hand pans, instead
    of being restroked a thousand lines a frame. That layer was exactly the
    size of the glass, and a canvas the size of the glass has nothing outside
    it — so a hand dragging the drawing to the right uncovered **bare paper**
    on the left: the lines and the rings stopped dead at the border the drag
    had started from and only filled in when the hand let go. (The knots never
    showed it; they are drawn on the upper canvas every frame.) While the
    *camera* is what is moving, the layer is now drawn with a margin of lines
    all round the glass — `LAYER_BLEED` = 0.35 of the longer side, capped at
    `LAYER_BLEED_MAX` = 420 px — and the element is hung that far outside it.
    The hand may pan a whole bleed before the layer has to be restroked, and
    what it uncovers is drawing. `placeLayer()` is the one piece of geometry:
    it returns the transform *and* whether the layer still covers the glass,
    and a reuse is refused the moment it does not, so the test and the placing
    can never disagree. The bleed is 0 while the simulation is stirring (that
    layer is restroked every frame anyway) and 0 at rest, where the layer is
    sharp and dear. The cull margin grows with it, or the lines the bleed
    reaches for would be culled before they were drawn.

    **A punaise is a knot on the web, exactly as a notitie is.** A draad run
    through a bare punaise — the ordinary way a lead with no artikel yet is
    tied to two things — used to vanish from the web entirely: `cardNode` in
    `buildWebGraph` knew reference cards and notities, so a string with a
    punaise on either end was dropped on the floor, and the one place the
    connection was supposed to show had nothing. A punaise is a notitie with
    its writing on the tag, so it is drawn as one: `isLooseCard()` covers both,
    `looseName()` gives a labelled punaise its label and a bare one the
    archive's own word for a punaise. It rides the same "Notities" switch — the
    global web is about the records — and it opens the prikbord it is pinned
    to, as a notitie does.

    **A card whose artikel is gone can write it again.** A card that stands for
    an artikel that has been thrown away (or that this viewer may not see — the
    two must stay indistinguishable, rule 1) is stamped "Ontbreekt", and until
    now that was a dead end: the wall remembered the name and there was no way
    back. It now offers "{Artikel} opnieuw aanmaken", which is the same road
    §8's notitie has always had — the new-artikel sheet with the card's name in
    it, and the card repointed at what comes out. Only on a wall this viewer
    may edit (`canMakeEntry`). Note what this cannot know: for a viewer who is
    merely not allowed to see the artikel, "opnieuw" writes a second one. That
    is the price of rule 1 and it is deliberate.

    **A prikbord can be hung in a dossier and taken out of one.** `boards.case_id`
    has existed since §24 but was written only when the wall was made: a wall
    hung loose stayed loose for ever. `setBoardCase()` is the one write that
    moves it, and `PATCH /api/boards/[id]` takes a `caseId` (null = loose).
    Two rights, not one: the hand must be allowed to **edit the wall** — the
    same hand that hangs cards on it — and must be allowed to **see the
    dossier**, because §17 puts a filed wall behind that dossier's view dial as
    well. That second check is a lookup by id, so it asks `loadAccessRow` +
    `canSeeCase` and no side condition (§46). Both ends have a control: a
    picker in the prikbord's own bar, and on the dossier's Prikbord tab a
    "Bestaand prikbord hierheen halen…" list of the loose walls plus a
    "Losmaken" beside each one it holds. Both dossiers are touched so their
    "laatst gewijzigd" is honest, and the move is written to the log as
    `board.filed` / `board.unfiled`.

48. **Alles wordt geboren op de kant waar je staat — en `@` werkt overal.**
    §48. Round 25: one leak, and the two conveniences that turned out to be
    the same shape.

    **A new thing is born on the side it was made on.** `keeper_only` defaulted
    to 0 and an artikel's `visibility` to `'all'`, and nothing but the switch on
    a finished page ever changed them — so a Keeper standing on their own side,
    inside their own dossier, made a prikbord the whole table could read, and
    nothing on the screen said so. Two facts decide it now, and the *hiding* one
    always wins: the **container** (anything made inside a Keeper-only dossier
    is the Keeper's, full stop — a wall carries that dossier's `caseName` into
    every list that shows it, so a players' wall in a Keeper's dossier is a leak
    by itself), and otherwise the **side this browser stands on** (§46).
    `bornSide()`, `keeperOnlyForNew()` and `placeNewOnSide()` in
    `lib/keeper/side.ts` are the whole of it, and they are the only place
    outside §44's own two spellings that may say what "the Keeper's own" means.
    Nobody who is not a Keeper is ever given a side, whatever the request asks
    for. A Keeper *may* say otherwise before saving — see the switch below —
    but never inside a Keeper-only dossier.

    **Hiding travels inwards; revealing never does.** Filing a wall into a
    Keeper-only dossier (§47's `setBoardCase`) takes the wall to the Keeper's
    side with it, and taking a whole dossier to the Keeper's side takes its
    prikborden and tijdlijnen along. Neither move has a mirror image: taking
    the wall back out, or handing the dossier back to the table, leaves them
    where they are. Revealing something is a person pressing a button, never a
    side effect — the same rule `setKeeperSide` has audited both states for
    since §44.

    **The switch that says so.** Every sheet that makes something now carries
    one line for a Keeper — `SideChoice`, "Alleen op de {Keeperkant}" — ticked
    where the archive would tick it, with a sentence under it saying what that
    means. Rendered for nobody else: absent, not hidden (§44's habit), and
    switched off with the reason written out where the container has already
    decided. The five roads it sits on are the artikel-, dossier-, prikbord-,
    tijdlijn- and landkaart-sheets; each posts `keeperOnly`, which the server
    ignores for anyone who is not a Keeper.

    **`@` in every plain box, and chips wherever a description is printed.**
    §27's popover reached three boxes (a kaart, a gebeurtenis, a speld). It now
    reaches an artikel's korte beschrijving, a dossier's samenvatting, the Tekst
    and Lange tekst rows of an infobox, the boxes in the sheets that make an
    artikel, a dossier and a landkaart — and it handles an `<input>` as well as
    a `<textarea>`, which is what the one-line boxes are. It also grew the row
    the rich editor has had since §6: **"'Jan' aanmaken"**, so a name the
    archive does not hold yet is made without leaving the box. Reading, those
    descriptions print chips like every other text, in lists and cards too —
    `flat`, as a `<span>`, because a card is already one big `<a>` and an
    anchor inside an anchor is invalid HTML. *§54 adds the third half of this:
    a plain box also gets a `MentionRow` under it while it is being typed, so
    the chips are there before the box is left.*

    **In a dossier, the `+` makes something in it.** `useIAmTheCase` in
    `UiProvider` is the dossier page saying "this screen is me", which is what
    lets the `+` in the menu, the FAB and the `n` key open the sheet *inside*
    the dossier — and that is the only way a Voorwerp or a Clue (§24's
    `caseOnly`) can be made at all. *§49: that last clause is history — every
    soort is makeable everywhere now; what the `+` still decides is that what
    it makes is filed in this dossier.* It is not `PreferredCases`: that is a
    ranking and a list of every dossier an artikel is in; this is the one
    dossier you are standing in, set by one component and nothing else.

    **And the question after it.** A name typed into a dossier's *own* writing —
    the notities, the samenvatting, any plain box on that page — is offered a
    place on its shelves, in the same sheet the prikbord has asked with since
    §31 (`offerToFileEntry`, `reason: 'text'`). It asks once per artikel per
    visit, and it stays silent when the dossier already holds it, when the hand
    may not file anything there (§17), and when the sheet that just made it has
    already filed it. Made in a dossier and filed in it stay **one fact**: the
    new-artikel sheet's tickbox decides whether `caseId` is sent at all, so
    §24's `originCaseId` never names a dossier the artikel is not in. For a
    soort that exists only inside a dossier the box is ticked and switched off.
    *§49 keeps the fact and removes the tickbox: something made in a dossier is
    filed there, always, and the only tickbox left in that sheet is about the
    name.*

49. **Het dossier voor de naam is een keuze van het artikel, niet van zijn
    soort.** §49. §24 asked one question of the *soort* — "wordt dit alleen in
    een dossier gemaakt?" (`entry_types.case_only`) — and used the one answer
    for two things: a gate on where the thing could be made, and a dossier
    printed in front of its name in every lijst. The two come apart.

    **The tickbox is on the artikel.** `entries.case_prefix`, one per artikel,
    on its own page beside the dossier it points at (`origin_case_id`,
    unchanged, still §24's living reference). `entry_types.prefix_default` is
    only what a *new* artikel of that soort starts with — Clues and Voorwerpen
    ticked, everything else not — and a soort decides nothing after the moment
    of making. Migration `0022_case_prefix` backfills the tickbox onto every
    artikel of a `case_only` soort, so nothing that read "Zaak X: naam" this
    morning stops reading that way this afternoon.

    **The gate is gone.** Every soort is makeable everywhere again: the wiki's
    own new button is back on `/wiki/<soort>`, the sheet leaves nothing out,
    and `/api/entries` no longer refuses an artikel without a dossier.
    `entry_types.case_only` stays in the database (this repo never drops a
    column) and is no longer a rule. Three things still read it, all of them
    cosmetic: the trigger `entry_types_prefix_default_from_case_only` in
    `0022_case_prefix`, which hands a freshly seeded soort its default because
    the seed runs after the migrations; and the two places that put a dossier's
    tabs in order (`TAB_ORDER` in `app/(app)/c/[slug]/page.tsx` and the two
    groups in `CaseTabsButton`). It is not patchable in Beheer.

    **Made in a dossier is filed in that dossier.** Via the `+`, the FAB, `n`,
    the dossier's own add-box or an `@` in its own text — there is no tickbox
    that turns it off any more, because "gemaakt in" and "opgeborgen in" are one
    fact (§48).

    **`nameTheirCases` is the only thing that decides whether the dossier comes
    before the name.** It fills `originCaseName` only for an artikel wearing the
    tickbox, and `entryDisplayName` prints what it is given — so Zoeken, the
    autocomplete and every lijst follow the rule without knowing it exists. It
    is decided *there* and not in `entryDisplayName` because `lib/search/service.ts`
    and `/api/suggest` do not select `case_prefix`, and the prefix would
    silently vanish from both.

    **Unticking it changes nothing about the filing.** Only "Uit dit dossier
    halen" does: `DELETE /api/cases/{id}/entries?entryId=…`, an edit of that
    dossier (§17) and refused with a sentence on screen where the hand may not,
    which really removes the `case_entries` row and lets `reconcileOrigin`
    decide the origin again. An artikel wearing the tickbox with no dossier
    left is `isAdrift` — the grey chip beside its name, and Beheer's list of
    loose ends.

50. **De twee kanten staan los, en de pagina bepaalt waar je staat.** §50.
    §46 made the archive readable from one side at a time. This closes it: the
    browser is put on the right side *before* the page is drawn, and a
    reference across the border is refused.

    **De wissel.** A Keeper who opens a record standing on the other side than
    their browser is turned over on the server, before rendering, through
    `/api/keeper/flip` — the one writer of the side cookie. Both directions: a
    Keeper artikel takes you over, a player-facing one takes you back. The
    decision is `sideDetour()` in `lib/keeper/side.ts` and nowhere else; the
    six record pages (`/e`, `/c`, `/b`, `/maps`, `/timelines`, `/stambomen`,
    the last since §66) call it and
    redirect. It cannot loop, because the flip writes the cookie to exactly the
    side of the record you are opening. `queryTail()` carries the page's own
    query (`?new=1`, `?rev=`) across the round trip and drops `gewisseld`;
    `gewisseld=1` rides back for the toast, and `KeeperStamp` takes it off the
    address afterwards. This replaces §46's `SideSync`, which flipped the
    cookie *after* the render with a `router.refresh()` — one frame in which the
    masthead, the toggle and the colours belonged to the side you had just left,
    and every picker on screen was built for it.

    **De scheiding.** `suggestEntries` is sided by default now, which reverses
    §46's decision to leave the autocomplete open — the suggestion list under
    every text box was the widest opening in the wall. `bothSides` survives with
    exactly one user: `/api/keeper/search`, the touwtjeskiezer. The picker APIs
    (`/api/cases`, `/api/boards`, `/api/maps`, `/api/timelines`,
    `/api/family-trees`), the pickers on
    the record pages, `listTimelinesForCase`, "Genoemd in", `getBacklinks` and
    the focus web all read one side. That is allowed *because* of the wissel:
    "the side the reader stands on" and "the side this record is on" have become
    the same question.

    **De weigering.** `sameSide(kindA, idA, kindB, idB)`, built on
    `isKeeperSide` so §44's two spellings of "the Keeper's own" stay in one
    place, refuses an artikel filed in a dossier, a card on a prikbord, a speld
    on a landkaart and a gebeurtenis on a tijdlijn when the two ends are not on
    the same side: 400, `Dat staat aan de andere kant van het archief.` Five
    routes carry it — `POST /api/cases/[id]/entries`, `PATCH /api/boards/[id]`,
    `POST /api/maps/[id]/pins`, `POST /api/timelines/[id]/events`, and since
    §66 `POST /api/family-trees/[id]`, which asks it of a member that is *new*
    to the tree and names the refused ids so the canvas can save the rest. The rule is
    on the server, not in the picker: a picker is a courtesy. On a prikbord only
    cards whose reference is *new* to that wall are asked, because an autosave
    posts everything the browser knows. Touwtjes and tweelingen never come past
    here — that bridge (§44) exists precisely to cross this border. Nothing is
    migrated: a reference that crossed before this round keeps rendering, and
    only new ones are refused.

51. **Een koppelingsbox mag op meer dan één soort mikken, en de Keeper stelt
    dat zelf in.** §51. `FieldDef.ofType` is a *list* of slugs and is read as a
    set everywhere from the picker to the search service. The order in it is not
    decoration: `EntryPicker`'s "'X' aanmaken" row makes an artikel of the
    **first** slug. Until this round only a seed could write that list; Beheer →
    Soorten now has a chip row under every `entry_link` / `entry_links` field —
    "Alleen deze soorten mogen erin (leeg = alles)" — the same control the page
    builder's `links` block already had, because it is the same question.

    **Families is the worked example.** A new soort (`family`, sort_order 75)
    whose veld **Leden** takes Personen, Onderzoekers *and* Abnormaliteiten,
    with `character` first. The band is written from either end and only once:
    the Leden box on the familie, the veld **Familie** on a persoon,
    onderzoeker or abnormaliteit, and a self-filling `derived` list over
    `familie` on the familie's page, the way Facties has one over `faction`.
    Both ends give "Genoemd in" and a thread in the web for free, because they
    are real fields. There is no migration: `INSERT OR IGNORE` puts the soort
    into a fresh archive and an existing one alike, and the reverse veld is
    added once behind the marker `seed:round-26-families`, never overwritten.
    A familie is an ordinary soort — makeable everywhere, no dossier in front
    of its name — with a tab of its own in a dossier.

52. **Een prikbord is zelf iets om naar te wijzen, een kaartje leest de
    levende naam, en het wiel hoort bij de muur.** §52. Round 27's half of the
    wall, in three parts.

    **A wall may hang on a wall.** `board` is the fifth `REFERENCE_KINDS`
    (`entry`, `map`, `case`, `timeline`, `board` — `lib/boards/merge.ts`): a
    card that carries an id and nothing else, resolved per viewer, drawn like
    the tijdlijn's card because a prikbord has no cover of its own.
    `resolveBoardBoards` goes through `listBoards`, so §17's dial and §47's
    parent-dossier rule both apply without being written a second time, and a
    wall this viewer may not open comes back MISSING rather than as a name.
    The picker leaves *this* wall out of its own list; two walls pointing at
    each other is allowed and harmless — the web draws both ties.

    **A card shows the live name.** A reference card carries a copy of the name
    it was made with, and that copy is what the wall, the inspector header, the
    lightbox title and the `<img alt>` used to print — so a rename never
    reached the cork. They read `subject.name` now, and `card.name` is what is
    left when the artikel is gone: the fallback under "Ontbreekt", and the name
    §47's "{Artikel} opnieuw aanmaken" writes into the sheet. A notitie, a
    speld and a photo own their text themselves and are not touched by this.

    **A string let go on bare cork asks what it points at.** The speld goes in
    and the string is tied to it exactly as before, *and* a picker opens beside
    the drop. Answer it and that same speld becomes the thing picked — upgraded
    in place, so no string is ever relaid — and Escape or a click away leaves
    the wall as this rule found it: a lead with a place on it.
    `components/boards/BoardPicker.tsx` is that picker and the bar's, extracted
    from `BoardCanvas` because they differ only in where they sit and what they
    do with the answer. **"'X' aanmaken" is on the floating one only**: in the
    bar a create row appears before the 160 ms debounced search has answered,
    and a hand reaching for the artikel it just typed lands on "aanmaken"
    instead. The bar keeps the notitie row it has always had.

    **The wheel belongs to the wall.** React registers `wheel` and `touchmove`
    passively, so `preventDefault()` inside an `onWheel` prop is a silent
    no-op: `BoardCanvas` and `CropFrame` both zoomed *and* scrolled the page
    behind them. Both now add a native listener with `{ passive: false }` — the
    shape `MapCanvas` already used — plus `overscroll-behavior: contain`. The
    wall lets its own furniture scroll (`.board-tray`, `.board-inspector`,
    `.ink-toolbar`, `.suggest-list`, `.board-picker`), the way the map lets its
    legend. A trackpad's sideways swipe now pans the wall instead of doing
    nothing and taking the page with it. `CropFrame` also wrote a crop per
    wheel notch; the commit is debounced 300 ms (`COMMIT_WAIT`) and flushed on
    unmount. `MapCanvas`, `TimelineCanvas` and `WebCanvas` were already right.

53. **Een tweeling wordt ook gelinkt, niet alleen gemaakt.** §53. §44 could
    only ever *make* the second face (`createTwin`), which is the wrong door
    for the way the tool is used: a Keeper preps a Keeper page while the table
    writes the wiki article about the same thing, and the two meet later.
    `linkTwin()` in `lib/keeper/ties.ts` is that meeting — nothing is created
    and nothing is copied.

    **Three rules, refused in Dutch rather than by an index in the dark.** The
    same soort ("een tweeling is twee keer hetzelfde soort ding"); opposite
    sides, asked of the *records* through `isKeeperSide` and never of the page
    the button was on; and one face each — `twinRow` on both ends, which is
    stricter than `0021`'s two partial unique indexes and answers first, so a
    Keeper reads a sentence instead of a 500. A rope tied while the two stood
    on the other sides is cut first, because `counterparts` keeps the Keeper's
    end in the Keeper column and one pair may not become two rows.

    **A rope is promoted, never silently kept.** `addTie`'s `existing`
    short-circuit handed the rope's id back unchanged, so "maak hier een
    tweeling van" on two things that were already roped did nothing and said it
    had worked. The row's `isTwin` is set instead — the guards above have
    already refused every case where that would be wrong.

    **Notes are merged, not overwritten.** `mergeNotesIntoTwin` stacks the
    Keeper's own text, a `— van de andere kant —` line, and the player-facing
    one, and keeps the result on the Keeper's side. `moveNotesToTwin` stays
    what it was, for a face that was made a second ago and is empty by
    construction. Unlinking does not move them back, and the confirm says so.

    **Both no-twin states offer it.** The dead "Geen spelersversie" span is
    gone; a Keeper page and a player page each get "Link met bestaande …", a
    twin gets "Ontkoppelen" beside the switch (the tie's id travels down from
    `KeeperPanelServer`, because untying needs it), and `/api/keeper/search`
    gained `onlyKind`, `side` and `free=1` so the picker offers only what would
    be accepted. Query parameters, not a second route: it is one question
    asked more precisely, and a second search road would be a second set of
    rules about who may see what.

    **And two repairs with no rule of their own, marked §53 in the code.**
    Everything below a landkaart — the tekenlaag switch, "Deze landkaart
    (Keeper)" and the Keeperkant — set three top margins in three ways at three
    scales, and the last was 44 rem and centred while the two above ran the
    full width; three uppercase `details > summary` stamps of equal weight had
    nothing above them saying what the group was. It is one `.map-manage`
    section now, copied from the artikel page's `.entry-manage`: one width, one
    `3px double` top rule, one heading ("Beheer van deze {landkaart}") and no
    inline margins. `details.section` itself is untouched. And the kebab menu
    on a dossier card was clipped by `.card { overflow: hidden }` — load-
    bearing, because a zoomed cover crop paints outside its box, so it stays —
    and hard-coded to 190 px inside a grid column that can be 150 px. It is
    portalled to `document.body` with `position: fixed` from the button's
    measured rect, `MENU_WIDTH` = 232 (the longest row is what has to fit),
    clamped to the window, with the outside-click and Escape every other menu
    already had.

54. **Een chipje onder het vak dat je typt.** §54. A `<textarea>` holds
    characters and nothing else, so a chip cannot live inside one — the rich
    editor manages it only because a Tiptap mention is a real inline atom node,
    and the four boxes that matter most are `LiveField`s bound to a `Y.Text`
    per field, which diffs a plain string. `MentionRow` (in
    `components/ui/MentionPopover.tsx`) already existed for exactly this and
    was used by the speld and gebeurtenis sheets; it now stands under **every**
    plain box that can produce a `[[Naam]]` — eight of them: an artikel's korte
    beschrijving, a dossier's samenvatting, the Tekst and Lange tekst rows of
    an infobox, the boxes in the sheets that make an artikel, a dossier and a
    landkaart, and a kaartje's text on the wall. It debounces 400 ms, keeps the
    last answer while the next is on its way, shows one chip per artikel
    however often the writing names it, and renders **nothing** when no name
    resolves, so a tidy infobox stays tidy. It is put at the call sites rather
    than made an automatic tail of `LiveField`, because the speld and
    gebeurtenis sheets already render their own and would have printed two.

    *Round 28: this was not what was asked for.* The row under the box stays,
    but the chip is now drawn **in** the box as well — see §56.

55. **Talen zijn een soort, en de andere kant ervan is een veld.** §55. Soort
    `language`, label **Talen**, `sort_order` 95 — beside Overlevering en
    folklore, because a taal is a thing out of the world you look up. Its
    velden: **Moeilijkheidsgraad** (`select`: eenvoudig · te doen · lastig ·
    zeer lastig · vrijwel onleesbaar — one scale for the mouth and the eye
    together, because a taal here is as often read off a stone as spoken),
    **Schrift**, **Staat** (levend · stervend · uitgestorven · alleen op
    schrift), **Waar gesproken** (→ Locaties) and **Verwant aan** (→ Talen).

    **The other end is a veld called Talen** (`entry_links` → `language`) on
    six soorten: Personen, Onderzoekers, Relieken (`object`), Abnormaliteiten,
    Facties and Overlevering en folklore. Deliberately not on Voorwerpen,
    Locaties, Gebeurtenissen or Sessierapporten — a locatie's languages are the
    taal's own "Waar gesproken" read from the other side, and `talen.test.ts`
    asserts the absence on `location`, `event` and `session`. An infobox veld
    is the only shape that yields `entry_mentions` for free, so "Genoemd in"
    and the web fill themselves; the taal's page carries a `derived` list
    **"Sprekers en geschriften"** over `viaField: 'talen'` with those six in
    `fromType`, so the band is written from one end only.

    **No tab, no migration.** Talen gets no tab in a dossier — a tab is a
    dossier thing and an artikel page has none; what is asked for by "een
    details tab" is the infobox. The soort arrives by `INSERT OR IGNORE` in a
    fresh archive and an existing one alike, and the reverse veld is stuck on
    once behind the marker `seed:round-27-talen` — never overwritten, and
    skipped for a soort that already has a `talen` key or is already at twenty
    velden.


56. **En een chipje ín het vak, want dat is wat gevraagd werd.** §56. §54 put
    the chips *under* the box and Nick came back with three words: *"nogsteeds
    het geval"*. He is right — the ask was to click the name where he wrote it.
    A `<textarea>` still holds characters and nothing else, so the answer is
    not to put an element inside it but to lay one exactly over it:
    `MentionOverlay` (in `components/ui/MentionPopover.tsx`) mirrors the box in
    a `.mention-mirror` that copies the box's own computed typography and box
    metrics — the twenty-odd properties in `MIRROR_PROPS`, read off the live
    element, because a class would drift the day somebody restyles one field —
    prints the same text, wraps each mention in a chip, and is
    `pointer-events: none` **except on the chips**. The box above it keeps the
    caret and the selection and goes `color: transparent`.

    **The chip is the whole `[[Naam]]` run, brackets included.** That is the
    rule the whole thing hangs on: the mirror must contain the *same
    characters* as the box or every glyph after a mention shifts and the caret
    stops sitting under the text. Style the brackets down, never drop them.
    `mirrorSegments(text, spans)` is pure and covers the string byte for byte —
    `tests/unit/mention-mirror.test.ts` asserts exactly that, on adjacent
    mentions, a mention at index 0, an unresolved run, an unmatched `[[`, a
    newline inside a run and astral characters.

    It rides on the same `mentions` prop that already wires `MentionPopover`,
    so a box that offers `@` gets it and nothing else does — including the
    `LiveField`s bound to a `Y.Text`, which keep storing a plain string and
    never learn that anything is drawn over them.

    **The portal goes to `document.body`, never to the box's own
    `offsetParent`.** Hanging it in the parent looked neater — `offsetLeft` and
    `offsetTop` are layout pixels, so a prikbord's zoom needed no dividing out
    — but that parent is a container React is itself reconciling, and a node
    dropped into it corrupted the bookkeeping: the next update to the box (§7's
    handover, swapping the plain box for the room's bound one) went wrong, the
    still-empty room won, and **what had just been typed was gone** — no error,
    no failed save, nothing on screen to say so. `MentionPopover` directly above
    it had already learnt this and says so in its own comment. Measure with
    `getBoundingClientRect`, sit `fixed`, and re-measure on any scroll between
    the box and the body (capture, because those do not bubble). The
    `ResizeObserver` watches **the box and the field it stands in, never the
    body**: the body changes no layout the
    mirror cares about, and on a phone it grows with the page, which was twenty
    computed properties re-read per frame. (The field was added in round 29.
    `MentionRow`'s chips arrive a beat after a name resolves, the field grows,
    and a sheet centred on the screen moves the box half that growth upward —
    13.7 px in the case that found it — and none of that fires scroll, resize
    or input, so the mirror sat where the box used to be. One parent element,
    not the body: this is not the noise the sentence above is about.)

    **And it hangs on the plain boxes only** — the three maak-sheets, a kaartje
    op de muur, een speld, een gebeurtenis. Not on a box inside a `LiveFields`
    room. Moving the portal to the body fixed the outright loss, but the rooms
    stayed marginal: saves that land in two seconds were still timing out at
    fifteen under load, because a mirror beside a box still shifts the handover
    that swaps that box for the room's own. A chip in the box is a decoration
    and the writing is the archive, so the live boxes — de korte beschrijving,
    de samenvatting, Tekst en Lange tekst — keep their clickable chips **under**
    them (`MentionRow`, §54), and making the overlay safe there means making
    that handover safe first. That is the honest state of it, written down
    rather than discovered again.

    Two more things the mirror needs, both learnt the hard way: it re-measures
    a few times over the first half second after it mounts (a sheet slides in,
    and nothing fires scroll, resize or input while it does), and it sits at
    `z-index: 60` beside `.mention-pop`, because a chip behind the sheet the
    box is in is a chip nobody can click.

57. **Er is één weg waarlangs het archief omslaat.** §57. §46's toggle wrote
    the cookie with a `POST` and then did a client-side `router.push`, and that
    is the bug Nick found: `/e/het-complot` and `/wiki` hang under the same
    `app/(app)/layout.tsx`, so Next re-renders the page segment and **reuses
    the layout's RSC output from the client router cache** — and the layout is
    the one thing that knows which side this browser stands on. Flip on a
    Keeper page with no tweeling, land on `/wiki`, and the archive was on the
    players' side while the shell still said Keeper: the button's own
    `data-side-now`, the shield under the masthead, the palette (`[data-side]`
    on the shell's wrapper is the only one on a list page) — and, the one that
    is not cosmetic, `UiProvider`'s `side`, which is §48's *born on a side*.
    Something made from that stale shell was made **keeper-only while the
    cookie said player**, and Nick's standing rule is that nothing is ever born
    keeper-only unless the hand that made it was standing on the Keeper side.

    So the toggle now takes the road §50 already built for the other direction:
    `GET /api/keeper/flip?side=…&to=…`, a 303 and a document load, after which
    the layout, the palette, the masthead, the button and `UiProvider` are all
    on the new side by construction. No ordering to get right, no cache to
    out-think, and one writer of that cookie for every crossing there is —
    `sideDetour()`, `/keeper` and this button. The cost is the view transition,
    which a document navigation cannot wrap; that is the price and it was paid
    knowingly.

    **A flip is never refused.** The side is a face the whole archive wears,
    not a place, so a record with no tweeling still turns the archive over and
    lands on that side's list — it just has to *say so*, because arriving
    somewhere you did not ask for is what reads as broken. `KeeperSideMark`
    therefore distinguishes the two: `data-flip-to` is the tweeling,
    `data-flip-twinless` says the href is the fallback list. `planFlip`,
    `flipRoad`, `readLanding`, `hereFrom` and `switchedMessage` in
    `components/keeper/flipRoad.ts` are pure and unit-tested; `SideSwitched`
    is mounted **once in `AppShell`**, so any page that lands with `gewisseld=1`
    announces it, rather than five list pages each having to remember to.

58. **Het pantheon, en Overlevering werd Geschriften & Kunstwerken.** §58.
    Four soorten between Abnormaliteiten (60) and Facties (70) — *wat je
    vereert komt na wat je ziet en voor wie zich eromheen verzamelt* —
    sharing one border (`frame`, so a wall full of cork reads them as one kind
    of thing) and one core, `PANTHEON_KERN`: **Titels en bijnamen**, **Domein**,
    **Vereerd door** (→ Facties, Personen, Onderzoekers — *facties first,
    because a cult is a factie and the picker makes the first slug in the row*),
    **Tekens en voortekenen**, **Talen** and **Dienaar van**. On top of that,
    each soort keeps one or two of its own: Kosmische Goden a **Toestand** and
    a **Verblijfplaats**, Aardse Goden a **Standplaats** (→ Locaties, because
    an earthly god is stuck to a place — that is the whole difference) and
    **Wat men offert**, Eldritch Entiteiten a **Verschijningsvorm** and a
    **Gevaar**, Bovennatuurlijke wezens an **Aard** and a **Leefgebied**.

    **The hierarchy is one field, not two.** Whoever serves names their master
    — that is the end where the number stays small — and *Dienaren* is a
    `derived` list on the master's page. `Dienaar van` also sits on
    Abnormaliteiten, because an abnormaliteit is as often a servant as a
    phenomenon. The other end of *Vereerd door* is a **Vereert** veld on
    Personen, Onderzoekers and Facties, stuck on once behind
    `seed:round-28-pantheon`.

    **`lore` → `werken`, label Geschriften & Kunstwerken**, so a schilderij, a
    grimoire, a toneelstuk and a boek all have a home: **Soort werk**
    (`select`, ten of them, with *overlevering* still among them so nothing
    that is already filed loses its name), **Maker**, **Gemaakt in**,
    **Bevindt zich in**, the **Talen** veld §55 gave it, and **Toont of
    beweert** — deliberately without `ofType`, because a schilderij shows a
    place and a grimoire claims something about a god. The slug moves too, so
    `/wiki/lore` links from outside break; the same trade was made for Relieken
    in round 8 and it was made again on purpose. It goes through the same
    cascade the Keeper's own rename uses, behind `seed:round-28-werken`, and
    `VOORHEEN = { werken: 'lore' }` is the bridge that stops the seed putting an
    empty second copy beside a soort a Keeper had already moved themselves —
    the skip-marker is written under the *old* slug, and without that line
    there was no `lore` left in `ENTRY_TYPES` for it to match.

59. **Niets landt terwijl er een hand op de pagina ligt.** §59. Round 8 gave
    the prikbord one rule about pulls — *never apply while somebody is
    dragging* — and every page built since has had to invent it again or do
    without. `components/live/refreshHold.ts` is that rule for the whole site:
    `useHoldRefresh(busy)` takes a **hold**, and while any component on the
    page holds one, `LivePage` remembers that a watched key moved and does not
    `router.refresh()`. The moment the last hold is released, one refresh
    fires. A hold never drops a signal, it only delays it — the thing that was
    owed is still owed, and there is exactly one of it however many keys moved
    while the hand was down.

    The registry is **module-level, deliberately**. The holder is a canvas or a
    sheet rendered by the server page, and `LivePage` is its *sibling*, so a
    context set by one could never reach the other; one tab has one page, so
    one tab has one registry. `isRefreshHeld()` and `onRefreshHoldChange()` are
    the whole surface, plus `takeRefreshHold`/`releaseRefreshHold` for the rare
    caller that is not a component.

    Today the tijdlijn is its one taker (`TimelineCanvas`, one
    `useHoldRefresh(busy)` over the whole page) and the prikbord still has
    round 8's own version inside `useBoardLive`. That is not a gap to leave
    open for ever — a landkaart, a dossier and the artikel page all want it —
    but a new canvas takes a hold rather than inventing a third way to wait.

    Two more things in `LivePage` belong to this rule. A remote change that
    lands inside `OWN_WRITE_MUTE_MS` of one's own write is **deferred past the
    window, not dropped** — muting it outright left a screen stale until some
    unrelated change happened along, which is the bug that reads as "it stopped
    updating". And the replay after a reconnection (`reason: 'resync'`) is
    never muted at all: it is not one's own echo, it is everything that was
    missed while the line was away.

60. **Eén lijn per tab, en een lijn die nooit opgeeft.** §60. A browser opens
    about six connections to one host over HTTP/1.1, and an open stream holds
    one of them for ever — so before round 29 a player with the archive in a
    few tabs could not switch tab until every window of the site was closed.
    Three things fixed it, in that order.

    **The prikbord gave up its own line.** A wall is a *place* on the site line
    (`board:{id}`, set by the page's `LivePage`), so the roster, what everyone
    is holding and the hands come for free, and "the wall moved" is a `changed`
    on the wall's own key. `/api/boards/[id]/live` is gone and
    `lib/boards/live.ts` is two functions forwarding to the site hub. **A tab
    nobody is looking at gives its socket back** after 45 s (`HIDDEN_CLOSE_MS`)
    — status `idle`, a quiet dot and no word beside it, never "geen
    verbinding", because nothing is wrong and `hello` replays the watch list
    and fires a `changed` for every key on the way back. **And the tabs elect a
    leader**: one holds `navigator.locks.request('low-live-leader')` and the
    one `EventSource`, and relays every frame over
    `BroadcastChannel('low-live')`. The others keep their own client id, watch
    list, place and name and post all of it themselves, quoting the leader's
    connection (`carriedBy`), so the hub still sees one person per tab and
    eight tabs cost one socket. When the leader closes, the lock releases and
    the next tab opens a line and everybody says everything again.
    `ONE_LINE_PER_BROWSER` in `LiveProvider.tsx` switches that third one off in
    one place, and without Web Locks or `BroadcastChannel` it falls back to a
    line per tab by itself.

    The election has four details that are each a bug that happened. The tab's
    own user id travels on the `BroadcastChannel` `line` message, so a follower
    ignores a leader from another login. Two 409s in a row make a follower
    `steal` the lock, because a leader that the server has forgotten is worse
    than no leader. A leader broadcasts `{t:'who'}` and the followers answer
    `seen`, so a fresh leader knows who is visible and never rests while any
    tab in the browser is being looked at. And `pagehide` drops leadership
    while `pageshow` re-elects, because a page in the bfcache is not a page
    holding a socket. An `alias` already held by another connection is refused,
    silently — claiming somebody else's name is not an error worth telling the
    claimant about.

    **And the line stopped giving up.** Backoff has a floor of 500 ms, a
    ceiling of 30 s and ±25 % of jitter, and **no road that returns 0** — a 409
    used to reset the counter, which is a hot loop against a server behind two
    processes, which is how one misconfiguration takes the whole archive with
    it. A failed POST no longer paints the whole tab dead, and any later 2xx
    says `live` again. `keepalive` is spent only on a small goodbye, never on
    keystrokes: the quota is 64 KiB per origin, and a Tiptap paste used to
    reject and then retry the same body for ever. An oversized batch is split,
    and a `sync` **replaces** the queue with one state-vector diff rather than
    looping — the document holds everything the queue held, so the difference
    covers the lot. A `refused` is tried twice before the editor goes
    read-only, because a reaped line says the same word as a turned dial.

    Server-side, no frame is written to a client that has stopped reading. The
    stream is built with `CountQueuingStrategy({ highWaterMark: 64 })` — with
    no strategy at all the mark is **one**, so `desiredSize` went to 0 whenever
    two frames were written in one tick and every pointer, ink and presence
    frame after the first was thrown away — and "behind" means sixty-four
    unread frames. Sight (a hand, a pen, a roster) is dropped then; a
    `changed`, `hello`, `sync`, `update` or `saved` is a fact and is always
    written. A `via` frame is judged on the frame *inside* it, or the one
    socket carrying eight tabs — by definition the busiest there is — would
    never drop anything. The saturation clock is reset by every write that
    leaves room, the heartbeat included, so the 15 s close means *continuously*
    behind; one sleeping laptop used to grow a buffer until pm2 restarted the
    server for everybody.

    `lib/live/wire.ts` holds every one of those decisions, pure and unit-tested
    (`tests/unit/live-wire.test.ts`), which is why `LiveProvider.tsx` has no
    numbers of its own. The wire: `changed` → `{ keys, at, by? }`, never sent
    to the tab named by `by`; `pointer` → `{ place, c, x, y, m (≤ 40), s }`;
    `via` → `{ to, e, d }`; the POST body gains `carriedBy`, `as`, `alias` and
    `cursor.s`; the channel speaks `ask`, `line`, `frame`, `down`, `rest`,
    `seen` and `who`.

61. **Een muur die nooit opgeeft.** §61. Het prikbord slaat op wat *deze hand*
    heeft aangeraakt, en niets anders: elke `commit` noteert de ids die hij
    verandert, en de POST draagt alleen die kaarten en draden mee, plus de
    expliciete verwijderingen en herstellen. Afwezigheid is nooit een
    verwijdering — dat is een grafsteen — dus een deelpatch is een geldige
    patch, en een scherm dat even niet mocht bijwerken kan de kaart die iemand
    anders verschoof niet meer terugzetten. Een opslag die niet antwoordt wordt
    na tien seconden afgebroken en opnieuw geprobeerd (1, 2, 4, 8, 15 seconden,
    met ruis); een kaart die het archief weigert (§50) gaat van de muur met de
    zin die het archief zelf stuurde, waarna de rest gewoon bewaard wordt; een
    reden die niet met wachten overgaat zegt dat, en probeert het opnieuw zodra
    iemand iets doet. En een binnenkomend document overschrijft nooit werk dat
    deze hand nog niet heeft kunnen opslaan (`sync.pending()`).

    `lib/boards/dirty.ts`, `lib/boards/retry.ts` en `lib/boards/place.ts` zijn
    puur; de muur zelf doet er niets aan geometrie of bookkeeping bovenop. The
    wire is `POST /api/boards/{id}` with
    `{ clientId, cards: [only the cards this hand changed], strings: [same],
    viewport?: only when this hand moved it, deletedCardIds, deletedStringIds,
    restoredCardIds, restoredStringIds }`, and a refusal is
    `400 { error, code: 'OTHER_SIDE', cardIds }`.

    Four smaller things travel with the rule. `freeSpotNear` moved into
    `place.ts`: the boxes are measured once, at most 40 × 40 candidates are
    weighed nearest-first and the cascade leaves early — a punaise on a
    300-card wall no longer freezes the tab. Tombstone overflow keeps the
    newest `TOMBSTONE_LIMIT` (500) by insertion order. `recomputeBoardMentions`
    runs at most once per board per 3 s and a revision snapshot at most once
    per hand per 10 s, both flushed on shutdown, so the last state is never
    left uncounted or unsnapshotted. And three guards found in review: an id
    that is in the incoming tombstones or in this hand's own deletions is never
    pushed back locally (`shouldReadd`), an id the archive cannot find is
    dropped after two tries (`UNFINDABLE_TRIES`), and the write clocks are
    pruned after ten minutes.

62. **Een tijdlijn is van twee handen tegelijk, en niets landt terwijl er één
    op de as ligt.** §62. A tag's side is a **hash of its own id**
    (`sideOfId` in `lib/timelines/time.ts`), never its place in the list: one
    gebeurtenis set in the middle used to flip every later tag across the axis
    on everybody else's screen while they were reading it. Ids are random, so
    the look is still about half up and half down — just not in turns.

    The canvas reports its own hand and draws everybody else's **in the axis's
    own coordinates** (`pointers={false}` on the page, because a fraction of
    the main column means nothing to somebody standing at another zoom): `x` is
    an absolute moment in seconds, `y` a fraction of the stage's height, and
    `m` is `{ [gebeurtenis]: [moment, 0] }` while a tag is carried, so the
    other screen sees it *travel* and not jump when it lands — sticky until the
    pull, the landkaart's rule for a carried speld. A frame is sight, never
    state (rule 20).

    While a hand is on the axis — a tag held, a streek being drawn, a picture
    going up, a blad open — the page takes §59's hold and nothing lands. The
    *list* is the finer question and only a drag or a stroke stops it, because
    a blad re-seeds the boxes nobody has touched and keeps the ones they have,
    with one grey line above the button (**"Iemand anders heeft dit ondertussen
    veranderd."**) and never a dialog. A gebeurtenis taken away under an open
    blad says so (**"Deze {gebeurtenis} is weggehaald."** + *Sluiten*) instead
    of vanishing, and the PATCH and DELETE routes answer 404 **"Deze
    gebeurtenis bestaat niet meer."** rather than the misleading 403 — **but
    only after the tijdlijn's own gate** (`eventAccess` in
    `lib/timelines/service.ts`: tijdlijn → exists → event), so somebody who may
    not see the tijdlijn gets the same answer for an id that exists and one
    that does not (rule 44's "gone, or not for you").

    **Typing in a gebeurtenis is not a change to the tijdlijn.** A `live` write
    that touched only the words leaves `timelines.updatedAt` alone and defers
    the mention index three seconds, so the other viewer hears `event:{id}` and
    pulls the list cheaply instead of re-rendering the whole page about once a
    second and losing their pan, their zoom and their open windows to it.

    Windows get lanes too (`placeWindows`, pure and tested), reckoned from one
    baseline per side so a window hanging off a far tag cannot lie across one
    hanging off a near one; a window with no headroom above opens downward
    instead of being clamped onto the ceiling; a click on the bare axis shuts
    the one opened **last**. Where a tag finds no lane at all the mark stays on
    the axis and a **"+n"** chip stands for the pile and zooms to its span. A
    phone has no double-click, so it has a **long press** (500 ms, no more than
    8 px of travel): **"Houd de as ingedrukt om hier een {gebeurtenis} te
    zetten"**, in the line under the axis and in the empty state. Keyboard: the
    stage is focusable; arrows pan (Shift faster), `+` and `−` zoom, `0` shows
    everything, Esc closes the last window.

63. **De voordeur gooit nooit weg wat je al getypt had, en heeft een tweede
    deur die je kunt zien.** §63. `<form action={…}>` met `useActionState` is een
    React-formulieractie, en React roept er `requestFormReset()` op zodra de
    actie klaar is — met opzet, want het gewone geval is een formulier dat
    lukte. Een wachtwoord van zeven tekens kwam dus terug met zijn zin *en* een
    lege uitnodigingscode en een lege naam, en dat tweede had met geen van beide
    iets te maken.

    Drie antwoorden, opzettelijk op elkaar gestapeld, in
    `app/(auth)/AuthForm.tsx`. De regels worden **eerst in de browser** gevraagd:
    `run()` is een client-functie die aan `useActionState` wordt gegeven, dus
    "te kort" en "die twee zijn niet hetzelfde" worden beantwoord zonder dat het
    archief iets gevraagd wordt. Dat is ook de enige reden dat de vakjes een
    wachtwoord mogen vasthouden — de echo verlaat deze machine niet, want `run`
    heeft de `FormData` nog in handen nadat de server geantwoord heeft, en de
    serveractie krijgt `{}` mee en nooit de vorige staat (argumenten van een
    serveractie reizen mee in het verzoek). Elk vakje leest daarna zijn
    `defaultValue` uit die echo, want een reset zet een vakje terug op zijn
    *attribuut*. En omdat dat ervan afhangt dat React in dezelfde commit reset,
    schrijft een `useEffect` de waarden er ook nog eens met de hand in: een
    effect loopt ná de commit en heeft dus het laatste woord. De vakjes staan
    `readOnly` zolang het archief antwoord geeft, want de echo is de `FormData`
    van het moment van verzenden en een letter die je er tijdens de rit in typt
    zou stil verdwijnen.

    De zin staat **onder het vakje waar hij over gaat** (`field` op `AuthState`)
    en de cursor springt erheen; een reden die van geen enkel vakje is — een
    snelheidslimiet, een archief dat nog niet ingericht is — staat onder de knop
    en verplaatst de cursor niet. De regels zelf staan in `lib/auth/rules.mjs`
    en `lib/auth/username.mjs`, twee bestanden die *niets* importeren, zodat de
    browser en de server onmogelijk van mening kunnen verschillen over "lang
    genoeg"; `lib/auth/password.mjs` exporteert ze opnieuw zodat elke bestaande
    aanroep blijft werken. Die zinnen zijn nu Nederlands — dit was de laatste
    hoek van het archief die in het Engels antwoordde, en hij deed het op het
    eerste scherm dat een nieuwe speler ooit ziet.

    De weg naar een account was acht grijze woorden onderaan de kaart, in
    precies hetzelfde `.small .muted` als de waarschuwing erboven. Het is nu een
    paneel met een stippellijn, een eigen kop (**Nog geen account?**), een knop
    over de volle breedte (**Registreer je nu**) en eronder de enige voorwaarde.
    Bewust géén tweede `btn-primary`: het rode stempel op die pagina is
    *Inloggen*. Het paneel is hard te missen door zijn *vorm*, niet door zijn
    kleur — wat dit archief overal doet.

    Twee prijzen, opgeschreven zodat niemand ze "repareert". `noValidate` staat
    aan: `required` blijft op de vakjes staan voor wie met een schermlezer
    werkt, maar een leeg vakje krijgt dezelfde Nederlandse zin op dezelfde plek
    als een te kort vakje, in plaats van een bel in de taal van de browser. En
    een client-functie aan `useActionState` betekent dat het formulier geen
    serveractie meer als `action` heeft, dus het verzendt niet meer met
    JavaScript uit. Dat was nooit een ondersteunde manier om dit archief te
    gebruiken en het was eerder per ongeluk waar; nu is het met opzet niet waar.

64. **Een punaise aan een draad houdt vast tot er iets op komt.** §64. §52 liet
    een draad die je op kaal kurk losliet een kale punaise achter, knoopte de
    draad eraan vast en opende de zoekdoos op die plek — maar hij onthield die
    punaise alleen in de *state* van die doos. Escape, een klik op het kurk en
    een binnengekomen pull van iemand anders maakten hem allemaal leeg, en de
    zoekbalk bovenaan de muur gaf helemaal geen plek mee. Wie dus een artikel
    koos dat nog niet in het dossier zat — het ene geval dat via
    `offerToFileEntry` en "Toevoegen aan {dossier}" loopt, en precies het geval
    dat gemeld werd — kreeg zijn kaart los in het midden van het beeld, met de
    punaise nog leeg aan de draad.

    De wachtende punaise staat nu in een **ref** (`pendingPin`, met
    `pendingPinHolds()` en `leadPlace()` puur in `lib/boards/place.ts`), gezet op
    het moment dat de kale punaise gemaakt wordt en niet wanneer de doos
    opengaat. Hij overleeft dus het sluiten van de doos, een pull, het wachten
    op `/api/preview`, het blad voor een nieuw artikel, de bevestiging en de
    `router.refresh()` erna. Er is **één** plek waar hij opgebruikt wordt
    (`takeLead()`, vanuit `putCard`, op het moment dat er echt een kaart hangt),
    dus een blad dat zonder opslaan dichtgaat laat de punaise, de draad en de
    vraag precies zoals ze waren. Beide zoekdozen — de zwevende en die in de
    balk — beantwoorden dezelfde wachtende draad, en de kaart erft de positie
    die de punaise *nu* heeft, niet waar de draad ooit viel.

    Afbreken laat de kale punaise en zijn draad staan en houdt de vraag open, in
    alle drie de afbreekwegen. Dat is wat §52 altijd deed (een spoor met een
    plek erop), een verkeerd getypte Escape mag geen net getrokken draad
    vernietigen, en het is wat de balk in staat stelt om te antwoorden.
    Loslaten is de handeling die er al was: trek de draad van de punaise af.
    Alleen het laatste spoor wordt vastgehouden.

    Eén regel die deze ronde aan `BoardCanvas.tsx` toegevoegd is en die geen
    hint is maar een les: **niets in `.board-tools` dat aan en uit kan gaan mag
    ruimte innemen.** De eerste versie zette er een regeltje bij zodra er een
    draad wachtte, de werkbalk werd daarvan hoger, en de hele muur schoof
    omlaag — waarop een e2e-spec die de kop van een speld één keer opmeet er bij
    de tweede sleep twintig pixels naast zat. De melding zit nu in de
    `placeholder` van het zoekvakje en in een `.visually-hidden` regel via
    `aria-describedby`, en het toegankelijke *label* verandert niet, want vier
    specs vinden dat vakje op zijn naam.

65. **De geschiedenis zegt wát er veranderd is.** §65. De geschiedenis onder een
    artikel was een lijst regels die elk een naam en een tijd zeiden en niets
    anders — "Iemand · 3 uur geleden", elf keer. Eén ervan openen gaf een
    regeldiff van de lopende tekst, en dat was het enige dat hij kón zeggen: een
    ronde werk die het artikel hernoemde, vier velden invulde en de omslag
    eraf trok las precies als een ronde die één typfout repareerde.

    Er wordt niets nieuws voor weggeschreven. `writeRevision` maakt al sinds het
    begin een momentopname van het hele artikel, dus wat een versie *deed* is
    het verschil tussen zijn momentopname en die van de versie eronder.
    `lib/entries/revisionDiff.ts` is die aftrekking, puur en getoetst
    (`tests/unit/revision-diff.test.ts`): naam, soort, eerste regel, tekst, elk
    veld in de infobox (in de eigen volgorde van de soort), tags, omslag,
    uitsnede, zichtbaarheid en Keeper-aantekeningen. De regel noemt de
    zelfstandige naamwoorden, eronder staat per ding wat ermee gebeurde, en het
    venster achter *Bekijken* zet diezelfde lijst boven de tekstdiff, zodat
    *Deze versie terugzetten* zegt waar het over gaat.

    **Vier dingen die niet gezegd worden.** Een koppeling wordt geteld en nooit
    genoemd: die velden houden ids, en een id naar een naam oplossen zou een
    lezer de naam van een artikel geven dat het archief misschien voor hem
    dichthoudt (regel 7). Zichtbaarheid en Keeper-aantekeningen zijn van de
    Keeper, en van de aantekeningen reizen de woorden niet eens mee uit de
    database. Uit een **tijdvak dat dicht stond** (`visibility: 'keeper'` aan één
    van beide kanten van de stap) wordt niets geciteerd: de naamwoorden blijven
    staan — dát er iets veranderde zegt de regel al door te bestaan — maar geen
    enkel antwoord van achter die deur wordt voorgelezen. Datzelfde tijdvak
    sluit nu ook de oude tekstdiff, wat een gat was dat deze ronde vond en niet
    maakte. En een lege lijst levert een **lege** zin op, die als niets
    afgedrukt wordt: "geen zichtbare wijziging" zou juist het teken zijn dat de
    Keeper aan de zichtbaarheid gedraaid heeft.

    Drie dingen aan de leeskant. `listRevisions` haalt tien `json_extract`-
    kolommen op in plaats van de blobs: de grootste sleutel in een momentopname
    is `body`, het hele ProseMirror-document, en beschrijven heeft daar niets van
    nodig — `bodyText` staat ernaast. Gemeten op honderd opnames van 17 KB is
    dat 0,75 ms tegen 6,36 ms. Hij leest **één rij voorbij de pagina**, want de
    onderste rij die je ziet heeft een rij onder zich nodig om door beschreven
    te worden, en of die rij bestaat is ook hoe de pagina het verschil weet
    tussen "hier begon het artikel" en "hier zijn we gestopt met lezen". En de
    tekst wordt niet met `diffLines` geteld maar als twee multisets van regels,
    lineair: de echte diff staat nog steeds één klik verderop.

    Twee reparaties in de momentopnames zelf, allebei nodig voordat die
    aftrekking de waarheid vertelt. `created_at` is hele seconden en een
    terugzetting schrijft er twee in dezelfde, dus de ordening heeft
    `rowid DESC` als tiebreak — de hele lezing hangt aan "elke rij is de stap
    vanaf de rij eronder". En `writeRevision` coalesceerde op de *nieuwe* notitie
    en nooit op die van de rij die hij overschreef, dus een Keeper die
    terugzette en dertig seconden later een typfout verbeterde zag de
    momentopname van de rij "teruggezet" stil vervangen worden; hetzelfde gold
    jarenlang voor "aangemaakt", dat in de praktijk vasthield hoe het artikel er
    vijf minuten ná het maken uitzag. Een rij met een notitie legt een
    *gebeurtenis* vast en wordt niet meer overschreven. Terugzetten schrijft
    sindsdien ook een momentopname van de staat die het terugzetten opleverde,
    zodat de keten sluit.

66. **Een stamboom is een venster, geen tweede plek waar verwantschap staat.**
    §66. De zesde soort ding in het archief — na het artikel, het dossier, het
    prikbord, de landkaart en de tijdlijn — en de eerste die erbij komt sinds
    het archief twee kanten heeft. Wie wiens ouder, kind of partner is, is een
    feit over een *persoon*, dus het staat op het artikel, in koppelingsvelden
    die een rol dragen. De stamboom onthoudt alleen wat van hemzelf is: wie
    erin staat, waar een hand hem heeft neergezet, de losse kaartjes die (nog)
    geen artikel zijn, en de lijnen die zo'n kaartje raken — want een los
    kaartje heeft geen pagina om een veld op te schrijven. Een lijn tussen twee
    *artikelen* wordt nooit in een stamboom bewaard: `normaliseTreeState` gooit
    hem weg, in de browser én op de server, want twee plekken die hetzelfde
    feit bewaren zijn twee plekken die het oneens kunnen worden. Wijst zo'n
    lijn naar een artikel dat níét in de boom staat, dan komt dat artikel er
    als **verwant** bij te staan — vaag, met een `+` — en wordt de lijn
    getekend (`buildFamilyGraph` neemt de uiteinden van de eigen lijnen mee in
    `wanted`). Zo'n verwant wordt verder niet uitgelezen: de velden op zíjn
    pagina blijven ongelezen tot iemand hem echt in de boom zet.

    Tabel `family_trees` (migratie `0023_family_trees`), adres
    `/stambomen/{slug}`, API `/api/family-trees`, overal in de code het woord
    `'family_tree'`, pictogram `tree`. Net als een prikbord en een tijdlijn
    draagt hij de twee knoppen van zijn maker (§17), `in_web` (§43),
    `keeper_only` (§44), een dossier, een prullenbak, een tekenlaag (§33),
    Keeper-aantekeningen, touwtjes en een tweeling (§44) — en hij wordt geboren
    op de kant waarop hij gemaakt is (§48; `POST /api/family-trees` is de
    zesde aanroeper van `keeperOnlyForNew` + `placeNewOnSide`). Zijn staat is
    één JSON-blok dat bij élk lezen genormaliseerd wordt, dus een nieuw veld op
    een lid krijgt zijn standaardwaarde in `normaliseTreeState` en dát is zijn
    migratie.

    **Een koppelingsveld met een rol.** In Beheer → Soorten kan een
    koppelingsveld (`entry_link` / `entry_links`) een **rol in een stamboom**
    krijgen: Ouder, Kind, Partner of Verwant (`FieldDef.role`). Het *label* van
    het veld is het woord dat op de lijn komt te staan, dus "Geschapen door" is
    gewoon een veld met de rol Ouder en heeft geen eigen code nodig. Alleen een
    koppelingsveld mag een rol dragen: retype je het veld, dan valt de rol eraf
    (`cleanFields` in `lib/fieldKinds.ts`). Het lezen zelf staat in
    `lib/families/roles.ts`, puur en zonder database, zodat het doek het net zo
    goed kan importeren: `roleFieldsOf` zegt welke velden meedoen,
    `edgesFromFields` maakt er lijnen van — een Ouder-veld wordt omgedraaid,
    zodat een lijn *altijd* van ouder naar kind loopt, welk uiteinde hem ook
    opgeschreven heeft — en `dedupeEdges` gooit de gespiegelde helft weg.

    **De server spiegelt.** "Kinderen: B" invullen op A is hetzelfde feit als
    "Ouders: A" op B, dus het archief schrijft de andere kant zelf bij: Ouder ↔
    Kind, Partner ↔ Partner. Verwant wordt wél getekend en met opzet níet
    gespiegeld — een aspect, een eed, een vermoeden is de claim van één kant.
    Weghalen spiegelt net zo goed. Het plan is puur
    (`mirrorPlan` in `lib/families/mirror.ts`), het uitvoeren gebeurt in
    `applyMirror` binnen `updateEntry` — dus ná de §38-poort en pas als de rij
    echt geschreven wordt, waardoor een voorstel spiegelt op het moment dat het
    wordt goedgekeurd en niet eerder. Drie dingen die het met opzet doet: het
    schrijft met een **rechtstreekse `db.update`** en nooit met een tweede
    `updateEntry` (dat zou terugspiegelen, en het zou een voorstel indienen dat
    niemand gedaan heeft), het bumpt alleen `updatedAt` en
    `recomputeFieldMentions` op de andere kant — geen revisie, geen feed,
    `updatedBy` blijft van wie er het laatst zelf typte — en het raakt nooit een
    artikel in de prullenbak. Het kiest het **eerste** veld van de andere soort
    dat de omgekeerde rol draagt, dus een soort met zowel "Ouders" als
    "Geschapen door" spiegelt in het bovenste van de twee. Terugzetten (§65)
    spiegelt ook, want een teruggezette infobox die "Kinderen: B" laat vallen
    zou anders "Ouders: A" op B laten staan.

    **Wat er geleverd wordt.** Achter het merkteken `seed:round-31-stamboom`
    (de vorm van §51: aanplakken, een bestaande sleutel overslaan, stoppen bij
    twintig velden, en een handgezette rij met rust laten) krijgen Personen en
    Onderzoekers **Ouders**, **Kinderen** en **Partner** (§67 zette er
    **Broers en zussen** naast en haalde **Achternaam** weer weg — zie daar);
    Abnormaliteiten en de vier pantheon-soorten krijgen die eerste drie plus
    **Geschapen door** (Ouder), **Schepselen** (Kind) en **Aspect van**
    (Verwant). De `ofType` van al die velden is dezelfde zeven soorten, met de
    soort zelf vooraan op het pantheon en `character` vooraan overal anders —
    want `ofType[0]` is wat "'X' aanmaken" maakt. Het bestaande veld
    **Familie** (§51) blijft wat het was: het kleurt de rand en noemt de tak,
    en een Familie-artikel mag zelf als banier in de boom staan. *Achternaam*
    was er in ronde 31 als tweede vakje naast die band — de geprinte naam van
    iemand die ingetrouwd of gevonden is — en dat is in ronde 33 teruggedraaid
    (§67): één naam op twee plekken is één naam die zichzelf kan tegenspreken.

    **Een Familie wijst naar zijn stamboom** (ronde 32). Niet elke stamboom
    hoort bij een familie — het pantheon hoort bij niemand, en een boom van een
    onderzoek hoort bij het dossier — dus de boom draagt geen familie-kolom.
    Maar een familie moet er wel een kunnen aanwijzen, en dat is een veld op het
    *artikel*: een nieuwe veldsoort `family_tree_link` (**Koppeling naar een
    stamboom**), die precies één boom bewaart of niets, nooit een lijst, want
    "welke" is de hele vraag die hij stelt. Families krijgt hem geleverd als
    **Stamboom** achter het merkteken `seed:round-32-stamboom-link`, in dezelfde
    vorm als §51's aanplakken; een Keeper mag hem op elke soort zetten. Hij
    draagt geen `ofType` en geen rol: een stamboom is geen artikel, dus er is
    geen soort om hem op te richten en geen verwantschap die hij kan betekenen.
    De waarde is `{ id, name, slug }` en níét het kale id dat een `case_link`
    bewaart — een dossier wordt op de server per lezer opgezocht
    (`resolveCaseRefs`), een stamboom niet, en het chipje in de infobox wordt
    rechtstreeks uit de infobox getekend. Een verwijzing is dus een *kopie*: een
    hernoemde of weggegooide boom laat een chipje achter dat naar een adres
    wijst dat 404 antwoordt, net als een verouderde `entry_link`, en dat is
    beter dan een pagina die niet wil tekenen. Kiezen doe je in
    `components/families/FamilyTreePicker.tsx`, de tweelingbroer van
    `CasePicker` op één punt na: er is met opzet **geen "'X' aanmaken"-rij**,
    want een boom die uit een infoboxvakje tevoorschijn komt is een lege boom
    die niemand ooit opent. Wat de lijst aanbiedt komt van `GET
    /api/family-trees`, dus alleen wat deze lezer mag openen en (§50) alleen van
    de kant waarop hij staat. De andere kant: `linkedFamiliesOf` in
    `lib/families/service.ts` zoekt de artikelen op die naar déze boom wijzen —
    een opzoeking, dus §46's `sideCondition` blijft eraf, maar
    `visibleEntryCondition` staat erin, zodat een Keeper-familie die hierheen
    wijst voor een speler simpelweg afwezig is (regel 1); de sleutel komt uit
    `entry_types.fields` en wordt daarom door `isFieldKey` gehaald en als
    parameter gebonden, nooit geïnterpoleerd. De boom drukt zo'n familie af **in
    het regeltje boven de kop, naast het dossier** (`· ⛨ De familie Boone`,
    `data-testid="tree-head-of"`) en niet in een eigen regel "Stamboom van …":
    de §34-kop is één rij, en een zin erbij duwde de titel eruit. In het web is
    het een **in de stamboom**-lijn van het artikel naar de boom, met het label
    van het veld erop (`treeLinksInFields`, de `caseLinksInFields` van de zesde
    soort ding) — en ontdubbeld tegen het lidmaatschap, want een familie die
    zelf ook als banier in de boom staat mag niet twee keer met dezelfde knoop
    verbonden worden. Er wordt géén rij in `entry_mentions` van geschreven, om
    de reden van `case_link`: het veld wijst naar een record, niet naar een
    artikel. En in de geschiedenis (§65) telt hij mee als koppeling en wordt hij
    nooit bij naam genoemd (`LINK_KINDS` in `revisionDiff.ts`, regel 7).

    **Een gesleept kaartje blijft staan; de rest schikt zichzelf.** De opmaak
    wordt nooit bewaard, alleen de vastgezette plekken: `layoutTree` in
    `lib/families/layout.ts` rekent hem opnieuw uit bij elke verandering, puur
    en deterministisch. Generaties langs de ouderlijnen (langste pad), partners
    naar dezelfde rij, ouderparen met de kinderen die ze delen als *verbintenis*
    (wie twee partners heeft zit in twee verbintenissen — dat is het hele idee
    van een tweede huwelijk), volgorde binnen een rij op zwaartepunt, en losse
    takken naast elkaar. Een Verwant-lijn stemt niet mee. Een lus laat de boom
    niet vastlopen: de terugkerende lijn wordt getekend en telt niet mee voor de
    generaties. Slepen zet een kaartje vast (`pinned`); het wordt daarna precies
    teruggelegd waar de hand het liet en duwt met opzet niemand opzij. "Opnieuw
    schikken" is één opslag die alle punaises weghaalt.

    **Eén balk, en de naam staat er niet in.** Boven de stamboom staat één rij
    (`.tree-tools`): het zoekvak waarmee je iemand erbij zet, wat je met de boom
    kunt doen, wie er verder op staat, of het bewaard is, en de zoom. De naam is
    de **kop van de pagina zelf** (§34) — `components/families/TreeTitle.tsx`
    zet er voor wie mag bewerken een invulvak in, in hetzelfde schrift en op
    dezelfde plek als de kop die er stond; blur of Enter slaat op met een
    `PATCH`, Escape zet hem terug, en daarna `router.refresh()`, want de plank,
    het kruimelpad en de knop Terug zijn allemaal servergetekend (de
    `LivePage` van de pagina kijkt daarom nu ook naar `family_tree:{id}`, zodat
    een hernoeming van een ander ook aankomt). Hij was er eerst twee keer — één
    keer in die kop en één keer in een eigen balk van het doek — en dat waren op
    een telefoon van 390 px twee rijen scherm om hetzelfde te zeggen. De balk
    staat er ook voor wie **alleen mag kijken**: alleen de bewerkgroep hangt
    achter dat recht, en het chipje *Alleen kijken* staat in de balk zelf.
    Onder 600 px laten de knoppen hun **letters** vallen (`.tree-tool-word`) en
    houden ze hun pictogram, hun `aria-label` en hun `title` — §64 verbiedt het
    veranderen van een toegankelijke naam, niet het verbergen van de letters, en
    het aantal schimmen blijft leesbaar naast de knop staan. De opslagstrip en
    het regeltje onder het doek gaan op een telefoon helemaal weg; ze zeggen
    daar niets dat de vorm niet al zegt.

    **Het doek** (`components/families/FamilyTreeCanvas.tsx`, op de §34-schil).
    Een gekozen kaartje krijgt drie ronde `+`-handvatten — boven een ouder,
    onder een kind, opzij een partner — en een `…`. Heeft de soort geen veld
    met die rol, dan staat het handvat er wél, maar uit, met
    *"Deze soort heeft geen veld met de rol Ouder — voeg het toe in Beheer →
    Soorten."* Een handvat opent een zwevend doosje: eerst de **schimmen** (wie
    er volgens de velden al bij hoort maar niet in deze stamboom staat), dan het
    archief (beperkt tot de `ofType` van dat veld, met de "'X' aanmaken"-rij),
    onderaan een los kaartje. Kies je een artikel, dan wordt er een **veld op
    dat artikel** geschreven. Elke naam op een kaartje is een echte link naar
    het artikel — middelklik en het rechtermuismenu doen dus wat ze overal doen
    — maar **de eerste klik kiest het kaartje en pas de tweede opent het
    artikel**: op een doek dat je aan het schikken bent is een klik in het
    midden van iets "dit bedoel ik", niet "neem me mee". Ctrl/⌘, een gesleepte
    druk en Enter op een link met de aandacht erop zijn de drie uitzonderingen,
    en alle drie worden bij het *loslaten* gevraagd. Een lijn aanklikken geeft
    *Lijn verwijderen* — een veld weg, of, bij een los kaartje, de lijn uit de
    boom. *Uit de stamboom*
    verandert niets aan het artikel en zegt dat ook. Slepen schuift, scrollen of
    knijpen zoomt van 25 % tot 250 %, *Alles in beeld* legt alles op tafel, en
    het beeld is van de lezer (`localStorage`, `tree:{id}:view`). Vijf randen:
    sterveling, godheid, huis, wezen, onbekend — de laatste is wat een los
    kaartje draagt. Ctrl+Z gaat over wat dit scherm bezit (plekken, kaartjes,
    lijnen, wie erin staat) en nooit over een veld op een artikel, om §29's
    reden: één iemands Ctrl+Z mag niet iets weghalen dat een ander net
    opschreef.

    **Eén weg naar een veld, en één weg naar een artikel.** Het `+`-handvat gaat
    via `POST /api/family-trees/[id]/relations` naar `writeRelation`, en die
    bouwt de hele nieuwe waarde van het veld en geeft hem aan `updateEntry` — de
    §38-poort, de spiegeling, de vermeldingen, de revisie en het voorstel
    ("Als voorstel ingediend.") gelden dus precies zoals wanneer iemand de naam
    met de hand in de infobox typt. Het recht dat gevraagd wordt is dat van het
    *artikel*, niet dat van de stamboom. Het is de hele array, nooit een delta,
    om §5's `mergeKeys`-reden. **Artikel aanmaken** op een los kaartje gaat via
    `POST …/promote`: elke lijn van dat kaartje wordt een veld — bij voorkeur op
    het nieuwe artikel zelf, anders op het andere uiteinde — een lijn naar een
    ánder los kaartje blijft een lijn en verhuist alleen van uiteinde, en een
    lijn waar geen van beide soorten een veld voor heeft wordt geteld en
    hardop gemeld (*"1 lijn is niet overgezet."*), want hem stil laten
    verdwijnen zou erger zijn dan hem kwijtraken.

    **De houder-helft.** `listFamilyTrees` is een lijst, dus §46's
    `sideCondition` staat erachter (ná de zichtbaarheid, nooit in plaats
    ervan); `getFamilyTreeById` / `…BySlug` zijn opzoekingen en vragen er niet
    naar. `listFamilyTreesForCase` is een opzoeking in lijstkleren en houdt het
    zijfilter wél, om de reden van `listTimelinesForCase`: sinds §50 draait de
    dossierpagina de lezer eerst naar zijn eigen kant. Verstoppen reist naar
    binnen (§48): een dossier dat naar de Keeperkant gaat neemt zijn stambomen
    mee (`hideWhatHangsIn`, de derde lus), en `setFamilyTreeCase` in een
    Keeper-dossier neemt de boom mee; geen van beide heeft een spiegelbeeld.
    Verhuizen naar een dossier vraagt twee rechten, net als bij een prikbord
    (§47): je mag de boom bewerken, *en* je mag dat dossier openen. `in_web`
    wordt op precies twee plekken gecontroleerd — `buildWebGraph` en
    `listMentions` — en **Genoemd in** telt alleen de *leden*: de lijnen ertussen
    zijn velden op die artikelen en staan al onder "In artikelen".

    **In het web.** Een stamboom is een knoop (violet, gevelvorm), hangt aan
    zijn dossier, en iedereen die erin staat is er met **in de stamboom** aan
    verbonden — een los kaartje ook, maar alleen als de notitie-schakelaar
    aanstaat (§47), en anders vallen de lijnen erdoorheen met hem weg.
    **verwantschap** is de tweede lijn en wordt gelezen uit de *artikelen*: elk
    koppelingsveld met een rol, van elke knoop in het web, of er nu een stamboom
    omheen staat of niet. Ouder→kind wijst altijd die kant op en het woord op de
    lijn is het label van het veld. **Een infoboxlijn wijkt voor een
    verwantschapslijn**: `yieldToLineage` in `lib/web/slice.ts` gooit een
    `field`-lijn weg zodra er een `lineage`-lijn tussen hetzelfde paar met
    hetzelfde woord staat — op *build time*, naast `collapseMentions`, want het
    aantal, het paneel en de tekening moeten naar dezelfde verzameling kijken.
    Zonder die regel zou elke familie twee keer getekend worden. `in_web` uit is
    geen knoop, geen lijn en geen "Genoemd in".

    **Op het prikbord** is een stamboom een kaart zoals een tijdlijn (§32) en
    een prikbord (§52) er een zijn: een kaart die alleen een id draagt
    (`familyTreeId`), per lezer opgezocht (`resolveBoardFamilyTrees` →
    `resolveFamilyTrees`), **Ontbreekt** als je hem niet mag openen, geen
    omslag, pictogram `tree`, de naam, het dossier eronder, en een deur naar
    `/stambomen/{slug}`. §50 weigert een stamboom van de andere kant.

    **Met z'n tweeën.** `useTreeSync` is de opslag én de pull in één haak: een
    opslag zegt alleen wat *deze* hand deed (§61), een binnengekomen document
    wordt om het nog niet opgeslagen werk heen gelegd, en er wordt niets geland
    zolang er een hand op de pagina ligt (§59). De hand zelf reist over de ene
    lijn van §60, in de wereldcoördinaten van de boom; `pointerFrame` in
    `app/api/live/site/route.ts` laat sindsdien een `:` toe in de sleutels van
    `m`, want wat een stamboom draagt is `entry:{id}` of `loose:{id}` en niet
    een kaal id — zonder dat werd de hand wel getekend en bleef het kaartje
    eronder stilstaan. Een `family_tree.changed`-regel in de activiteit wordt
    afgeknepen tot één per boom per persoon per minuut. En de tekenlaag: inkt op
    een stamboom is in **wereldmaten**, zoals op een prikbord
    (`screenWidth / zoom`), dus een streek is zo dik als hij eruitzag op de zoom
    waarop je hem trok — de vijfde vermelding in de lijst van §33's breedtes.
    De Keeperschakelaar van die laag hangt onder de vouw (`#tree-underfold`),
    zoals bij de landkaart, want in de rij nam hij 132 px van het doek af.

67. **De stamboom, tweede pas: één potlood, één manier van kiezen, en broers en
    zussen die niemand hoeft te typen.** §67. Ronde 31 zette de stamboom neer en
    ronde 32 verfde hem; deze ronde is de tweede pas eroverheen. Zeven dingen,
    en ze hangen aan één zin: *wat op meerdere doeken hetzelfde is, moet ook op
    één plek staan* — en wat het archief zelf kan uitrekenen, hoeft niemand vier
    keer in te vullen.

    **Eén potlood, vier plekken.** De tekenlaag (§33) hangt op een prikbord, een
    landkaart, een tijdlijn én een stamboom, en tot deze ronde bedraadde elk van
    de vier hem in zijn eigen bestand: dezelfde haak, hetzelfde effect dat de
    balk sluit als de Keeper de schakelaar omzet, dezelfde twee toetsen,
    dezelfde bevestigingsvraag met een ander zelfstandig naamwoord erin. Vier
    kopieën is vier kansen om er één verkeerd te doen, en de stamboom had er
    twee tegelijk verkeerd. Dus: `components/ink/useCanvasInk.tsx` is de hele
    bedrading (`useInk` + `useInkTool`, de Escape en de Ctrl+Z van de
    tekenmodus, de Keeperschakelaar met zijn *Tekenlaag wissen?*), en
    `components/ink/InkShell.tsx` tekent de twee stukken **in de enige volgorde
    die werkt: eerst het vangvel (`InkCapture`), dán de balk (`InkToolbar`)** —
    de balk staat er in z-index bovenop, dus hij moet er ook ná geschilderd
    worden. Wat van een doek zelf blijft is alleen wat écht van dat doek is:
    waar de laag in zijn DOM zit, wat het loslaat als het potlood tevoorschijn
    komt, en welke hoek de balk krijgt — en dat laatste is een *woord*
    (`InkShell`'s `corner`: `top-left` de tijdlijn, `bottom-left` de landkaart,
    `bottom-right` het prikbord en de stamboom), nooit een regel in de
    stylesheet van het doek. **Een doek zet `.ink-toolbar` nooit zelf neer.** De
    regel die hier stond (`.tree-ink-toolbar`) zette geen `top` en geen z-index
    boven `.ink-capture`, dus de balk was een strook over de hele hoogte van het
    doek *onder* het vangvel: met het potlood uit trok elke druk op de gum, op
    ongedaan maken en op het potlood zelf een streek. `#tree-underfold` en
    `#map-underfold` gaan door dezelfde `UnderFold` (§34: de Keeperschakelaar
    kostte 132 px doek), en de derde gedeelde helft is
    `components/ink/panZoom.ts`: één translate en één schaal, `project` en
    `toContent`, voor de drie doeken die zo'n wereld hebben (een tijdlijn houdt
    z'n eigen paar, want zijn x is een *moment*). Daar zat in alle drie de
    kopieën dezelfde fout in: een doek is `position: relative` **met een rand
    van 1 px**, een absoluut geplaatst kind wordt tegen de *padding*-doos gelegd
    en `getBoundingClientRect()` geeft de *rand*-doos, dus alleen `rect.left`
    aftrekken legde elke streek één pixel links en boven de hand die hem trok.
    `clientLeft` / `clientTop` zijn precies die rand en gaan er nu ook af.

    **Kiezen gaat overal hetzelfde.** Het gebaar dat het prikbord uitvond geldt
    nu overal: **shift-klik** zet er één bij of haalt er één af, **shift-slepen
    op kaal papier** trekt een vak open en alles wat het vak *raakt* is gekozen
    zodra het dichtgaat (raken, niet omvatten — "helemaal erbinnen" laat bij een
    veeg over een rij kaartjes juist de twee aan de uiteinden vallen, en dat
    leest als een fout), **gewoon slepen** schuift het doek, en **Escape** laat
    alles los. Eén druk op iets dat al gekozen is laat de hele groep staan: je
    staat op het punt hem te slepen, en een groep pakken bij één van zijn leden
    mag hem niet uit elkaar halen — dat wás de wrat op het prikbord, waar de
    selectie inklapte tot het aangedrukte kaartje terwijl de hele groep
    meereisde (zes kaartjes bewogen, één had een rand, de inspecteur zei "1
    kaart"). De rekensom staat in `lib/canvas/select.ts` (`normaliseRect`,
    `boxesTouch`, `hitsIn`, `toggleSelection`, `pressSelection`, `groupDelta`) en
    de React eromheen in `components/canvas/useMarqueeSelect.ts`; `lib/canvas/
    view.ts` is dezelfde beweging voor het beeld (`clampZoom`, `zoomAbout`,
    `toWorld`, `fitViewport`, `MIN_ZOOM` 0,25 en `MAX_ZOOM` 2,5) en
    `lib/families/layout.ts` exporteert het onder zijn oude namen door, zodat er
    in de boom niets voor hoefde te veranderen. Eén draaiknop mag een doek
    lager zetten: het prikbord houdt *Alles in beeld* op **1,2** in plaats van
    2,5, want een muur van vier kaartjes tweeënhalf keer opgeblazen leest als
    kapot. Wat elk doek zélf houdt, met opzet: ongedaan maken
    (`components/canvas/undoStack.ts` is alleen de boekhouding), welke ids een
    opslag mag beweren (§61), wie wat vasthoudt, de inspecteur, en wat een druk
    verder nog betekent. Het web is niet meegegaan: dat is één `<canvas>` met
    een zak veranderlijke staat en zijn vak leeft in schermruimte — bewust met
    rust gelaten.

    **Broers en zussen worden afgeleid, en het veld is de uitzondering.** Twee
    mensen met dezelfde ouders *zijn* broer en zus, en niemand hoort dat op vier
    pagina's te typen om een lijn te krijgen. Dus rekent het archief het uit
    (`lib/families/siblings.ts`, puur), uit het **eerste** veld met de rol Ouder
    van elke soort — hetzelfde veld waar de spiegeling in schrijft, en om een
    scherpe reden: een god draagt zowel *Ouders* als *Geschapen door*, en wie
    uit álle ouder-velden afleidt maakt van elk schepsel van één god de broer
    van elk ander. Drie uitspraken, en het archief zegt alleen wat het weet:
    **vol** als beide ouderverzamelingen gelijk zijn en er twee in staan (twee
    is de ondergrens, want één gedeelde moeder en verder niets zegt niets over
    de vaders), **half** als elke kant een opgeschreven ouder heeft die de
    andere mist én ze er minstens één delen, en **onbekend** als ze er één delen
    en de ene verzameling in de andere past. Geen gedeelde ouder is geen
    uitspraak. Alles per lezer, achter `visibleEntryCondition`: een ouder die
    deze lezer niet mag zien is er simpelweg niet, en twee halfbroers lezen op
    zo'n scherm als hele — dat is regel 1 die zijn werk doet, geen fout. En een
    afgeleide lijn maakt **nooit een schim**: hij loopt alleen tussen twee
    kaartjes die allebei al op het glas staan. Daarnaast is er één *getypt* veld,
    **Broers en zussen** (`broers_zussen`, rol `sibling`, geleverd op alle zeven
    stamboomsoorten achter `seed:round-33-broers-zussen`), voor precies het
    geval dat de afleiding niet kan bereiken: de ouders staan nergens. Die rol
    spiegelt op zichzelf, zoals Partner, en maakt **geen verbintenis** — een
    broer en een zus zijn geen paar en er hangt geen balk onder hen. Twee regels
    wegen de twee lezingen tegen elkaar (`reconcileSiblings`): een getypte
    koppeling tussen twee die al als **vol** afleiden is overbodig en valt uit
    de *tekening* — nooit uit het veld, precies zoals `yieldToLineage` in het
    web (§66) — en een getypte koppeling die de opgeschreven ouders
    *tegenspreken* (allebei hebben ouders, ze delen er geen) blijft staan en
    krijgt `contested: true`: het archief overstemt geen mens, het zet er een
    ringetje bij met *De ouders zeggen iets anders*. **Wat er getekend wordt is
    het kleinste eerlijke antwoord**: alleen **half** en **genoteerd** krijgen
    een dunne, gestreepte lijn. Vol heeft de gedeelde balk al — dezelfde waarheid
    twee keer tekenen is ruis — en onbekend betekent "ik weet niet welk van de
    twee", en een lijn die "misschien" zegt is erger dan geen lijn. Niet elke
    afgeleide waarheid krijgt een lijn. Een afgeleide lijn is ook van niemand om
    weg te halen: waar de knop *Lijn verwijderen* staat, staat bij zo'n lijn
    **Volgt uit de ouders** — er is geen veld om te ontschrijven, en een knop
    die stilletjes niets doet is erger dan geen knop. Op het artikel staat het
    veld zelf (chipjes, bewerkbaar) en eronder, per lezer op de server
    uitgerekend (`siblingsOf`), de afgeleide lijst onder het kopje **Volgens de
    ouders**, met achter elke naam *vol*, *half* of *onbekend*, en niet weg te
    halen: de weg om hem te veranderen loopt via de ouders.

    **Een kind met één of twee ouders.** Het model wist dit altijd al — een
    ouder-veld op een artikel is één naam en niets in de opmaak eist een tweede,
    en een verbintenis met één ouder erin tekent gewoon. Wat ontbrak was de
    *vraag*. Nu zijn er twee wegen naar hetzelfde en allebei zijn ze er: het
    `+ kind`-handvat sluit zijn doosje niet zodra het kind gekozen is maar wordt
    **Tweede ouder (optioneel) bij …**, met de partners van de bron als snelle
    rijen (*Partner van …*), het archief eronder, en **Overslaan** — die de
    focus krijgt, dus Enter is een overslaan en Escape ook. Er staat nooit iets
    voorgeselecteerd: **een partner is geen ouder**, en twee mensen die naast
    elkaar in een boom staan zijn daarmee niet de ouders van iemand. De andere
    weg: staan er precies twee kaartjes gekozen en dragen beider soorten een
    veld met de rol Kind, dan verschijnt er één `+` *tussen* hen in
    (`TreeSharedHandle`, *Kind van beide toevoegen: A en B*), en die schrijft
    het op allebei de pagina's — de vraag is dan al gesteld en beantwoord door
    de selectie. Verder kan een selectie precies twee dingen: samen slepen (één
    opslag, één stap terug) en samen uit de boom (**één** vraag die de leden en
    de losse kaartjes apart telt en beschrijft, **één** commit, **één** melding
    met *Ongedaan maken*) — en iedereen ziet wat deze hand gekozen heeft, als
    gekleurde ringen (`useTreeHolding`, `.tree-held`) en als het vak dat je
    opentrekt, allebei in wereldmaten.

    **De spiegel veegt bij weghalen alles.** Erbij schrijven landt nog steeds in
    het **eerste** veld van de andere soort met de omgekeerde rol (één veld dat
    één keer gekozen wordt, §66) — maar **weghalen veegt élk veld van die rol**.
    Anders blijft "Geschapen door: A" staan op een pagina waarvan de
    "Schepselen: B" net leeggemaakt is, of laat een Keeper die zijn velden
    sindsdien verplaatst heeft een lijn achter die niet meer weg te krijgen is.
    Te weinig weghalen is een lijn die niet te verwijderen valt; te veel is hier
    onmogelijk, want alleen het bron-artikel wordt ooit uitgeveegd. Twee kleine
    reparaties in dezelfde hoek: `coerceFieldValue` / `checkFieldPatch` weigeren
    een **zelfverwijzing** in een rolveld (niemand is zijn eigen ouder, kind,
    partner of broer — de rest van de lijst blijft staan en de sleutel wordt wél
    gemeld), en in de opmaak **wint de afstamming van een rij**: een partner- of
    broerlijn waarvan de twee uiteinden al door een ouderpad verbonden zijn doet
    niet mee aan het gelijktrekken, want anders duwden de twee regels elkaar
    tien rijen naar beneden (iemand die tegelijk ouder én partner van dezelfde
    persoon is — in een pantheon eerder regel dan uitzondering). De lijn wordt
    nog steeds getekend.

    **Een chipje wordt vers opgezocht, en je kunt niet weghalen wat je niet
    ziet.** Een `entry_link(s)` bewaart een `{ id, name, slug }`-*kopie* van het
    moment dat iemand koos. Drie dingen gaan er mis als je die afdrukt: een
    weggegooid artikel laat voor eeuwig een chipje achter naar een adres dat
    niets antwoordt, een hernoemd artikel houdt zijn oude naam, en — het ergste
    — een artikel dat deze lezer niet mag zien staat **met naam en al in hun
    HTML**; de naam ís het geheim. Dus zoekt de pagina ze per lezer opnieuw op
    (`resolveFieldRefs` in `lib/entries/derived.ts`, één query voor de hele
    infobox, achter `visibleEntryCondition`) en drukken beide gezichten alleen af
    wat daarin staat — afwezig, nooit ONTBREEKT (regel 1). De schrijvende helft
    is de andere kant van die regel: de bewerker stuurt de **hele** lijst terug
    (§5's `mergeKeys`), en een lijst die gebouwd is uit wat je kon zien is een
    lijst met het geheim eruit. Dus meet `keepUnseenRefs` in `updateEntry` het
    weghalen tegen wat deze hand écht kon zien: een id dat weg is en **bestaat
    maar onzichtbaar is voor deze schrijver** wordt teruggezet (in de prullenbak
    telt als onzichtbaar, met opzet: een teruggezet artikel hoort zijn band terug
    te krijgen — en voor een Keeper is dat meteen het énige geval, want die ziet
    alles wat niet in de prullenbak ligt), en een id dat helemaal geen rij meer
    heeft valt weg: dát is de ene plek waar een dood chipje wordt opgeruimd. Een
    vakje dat er maar één kan houden krijgt zijn onzichtbare id alleen terug als
    het **leeggemaakt** is; iemand anders kiezen is een antwoord op een vraag
    die deze hand kon zien staan. `writeRelation` (§66) rijdt over dezelfde weg
    en gehoorzaamt dit zonder het te weten. **En de kopie zelf reist ook niet
    mee**: de pagina geeft `fields` in z'n geheel door aan het clientonderdeel
    dat allebei de gezichten tekent, dus een bewaarde *naam* van een artikel dat
    deze lezer niet mag zien stond in de lading van de pagina — getekend door
    niets, leesbaar voor wie de bron opent. `scrubUnseenRefs`
    (`lib/entries/derived.ts`) snijdt de waarden terug tot wat de opzoeking
    beantwoordde vóór ze naar beneden gaan, en de artikelpagina geeft dat door
    als `shownFields`. Resolve-on-read heeft dus **drie** helften:
    `resolveFieldRefs` zegt wat een chipje tekent, `scrubUnseenRefs` wat de
    pagina meestuurt, en `keepUnseenRefs` wat een opslag terugzet — precies wat
    de eerste twee eraf haalden. Eén gat blijft, hier met naam genoemd:
    `approvePendingEdit` past een voorstel toe met de rechten van de
    *beoordelaar*, dus een voorstel dat een geheim mist wordt tegen de Keeper
    gemeten die het goedkeurt en niet tegen de speler die het maakte. En één
    regel opmaak hoort hier ook: binnen `.fields-compact` — en alleen daar — mag
    een `.entry-chip` **afbreken** en mag de rij eromheen krimpen. Een chipje is
    overal elders één woord dat niet doormidden mag, maar in een infobox staat
    het in een kolom van zo'n 220 px op een scherm van 390, en een naam van
    negenentwintig tekens droeg het kruisje *verwijderen* van het papier af: de
    knop was niet in te drukken en de hele pagina schoof opzij, wat niets in dit
    archief mag doen.

    **Achternaam is weer weg**, en dat draait een beslissing van ronde 31 terug.
    Eén naam op twee plekken is één naam die zichzelf kan tegenspreken; de band
    is het veld **Familie** (§51), dat de rand kleurt en de tak noemt. Een vers
    archief krijgt het veld niet meer (het staat niet meer in `ENTRY_TYPES`), en
    een bestaand archief raakt het kwijt via `seed:round-33-drop-achternaam` —
    **maar alleen als er nergens iets in staat**: één telling per soort over de
    artikelen die niet in de prullenbak liggen, en staat er ook maar één
    niet-lege `achternaam` in, dan blijft de velddefinitie staan, want dat is de
    tekst van de Keeper en niet van ons (§11). Het is bovendien een nauwe match
    — sleutel `achternaam` **en** kind `text` — dus wie de sleutel hergebruikt
    heeft voor iets anders houdt zijn veld. `surname` is uit de graaf, de knoop
    en het kaartje verdwenen; de marker valt hoe dan ook, want dit is een
    eenmalige opruiming en geen regel die elke start opnieuw langsloopt.

68. **Een verwijzing is een link, en de browser is de baas over elke knop
    behalve de linker.** §68. Vier kleine dingen aan het *lezen* van een
    archief, en drie ervan zijn dezelfde zin van drie kanten bekeken. Een
    chipje in een artikel is een `<a href>` met een echt adres — dat was het al
    sinds ronde 6 — maar het archief antwoordde op drukken die nooit van hem
    waren, en zag eruit als een etiket op plekken waar niemand aan het typen
    was.

    **De middelste knop opende twee tabbladen, en de rechter opende er één die
    niemand vroeg.** Eén oorzaak, en hij zit in ProseMirror: `handleClickOn`
    wordt niet vanaf `click` gevraagd maar vanaf `mouseup` — de `MouseDown` die
    op de weg naar beneden gemaakt wordt, vraagt het op de weg omhoog — en
    `mouseup` komt van *elke* knop. `RichEditor` las die gebeurtenis als
    `button !== 0 → dit is een tweede tabblad` en deed een `window.open`. Dus:
    de middelste knop opende er één via `auxclick` (waar hij hoort) en nog één
    via `mouseup`, waarvan de popup-blocker er meestal één opat — dát was de
    melding — en de rechterknop, die alleen maar het menu van de browser wilde
    laten zien, opende het artikel in een tabblad. Sinds deze ronde is
    `mineToAnswer(event)` (`event.button === 0`) de eerste vraag die
    `handleClickOn` stelt: **alleen de linkerknop is van het archief.** De
    middelste blijft van `auxclick`, de rechter raakt het archief niet aan, en
    er wordt geen `contextmenu` afgevangen — nergens in dat bestand. En een
    linkerdruk *mét* ctrl, cmd, shift of alt wordt nu op `click` beantwoord in
    plaats van op `mouseup`, want een `preventDefault` op een mouseup annuleert
    niets van wat een link doet: bij het openen mét de hand bleef de browser
    vrij om de anker óók te volgen. Dat was hetzelfde tweede tabblad, langs een
    andere weg.

    Dit gold **overal**, ook op de leesknop van een artikel — `handlers.mousedown`
    in ProseMirror is geen `editHandler`, dus hij loopt ook zonder caret.
    "Het is in artikelen al gerepareerd" klopte niet; er was één tabblad te veel
    dat niemand geteld had. `tests/e2e/round-34.spec.ts` telt ze, want met een
    selector is dit niet te zien.

    **Wat je léést draagt geen kadertje.** Het chipje — kader, vulling, vette
    letter, gekleurde stip — is gebouwd voor de hand die het net neerzette: met
    de caret erin is het één ondeelbaar teken dat met één Backspace weggaat, en
    dat moet je kunnen zien. In een alinea die je zit te lezen doet datzelfde
    chipje het omgekeerde van wat een verwijzing hoort te doen: drie in een zin
    hakken de zin in stukken. Dus **een `<a class="entry-chip">` is `var(--link)`
    en verder niets**, en het chipje blijft staan op precies drie plekken: in
    schrijfbare tekst (`.ProseMirror[contenteditable='true']` — ProseMirror
    schrijft die vlag zelf, dus de leesknop van §22 en die van een dossier
    krijgen blauw zonder een tweede vlag), naast een verwijderkruisje
    (`a.entry-chip:has(+ button)`, oftewel: je bent een rijtje aan het
    samenstellen en het kruisje moet zichtbaar bij dít chipje horen), en op een
    kaartje (`.board-card-text` — §45/§66: een kaart leest nooit de inkt van de
    pagina, en `--card-face` is in elk schema licht). Een `<span class="entry-chip">`
    blijft altijd papier, en dat onderscheid is het hele punt: een `<span>` is
    wat §48 tekent binnen een link, wat een dode naam krijgt, wat een gekozen
    Meerkeuze-antwoord is en wat een dossier krijgt dat je niet mag inzien — vier
    dingen waar je niet heen kúnt. Geen nieuw blauw: §45 geeft elk van de vier
    schema's al een `--link` dat op zijn eigen papier leest, en een vijfde zou
    het enige zijn dat niet meedraait als de Keeper de kleuren verzet.

    **De geschiedenis klapt uit tot de zinnen zelf.** §65 gaf elke regel de
    zelfstandige naamwoorden en een zin per ding ("Tekst — 3 regels erbij"), wat
    zegt wáár aan gewerkt is en niet wat er kwam te staan; de echte tekstdiff
    stond alleen achter *Bekijken*, en die vergelijkt met **nu** en niet met de
    versie eronder. Onder elke regel staat nu een dichtgevouwen *Wat er
    veranderde* met de hele lijst — onafgekapt, `HISTORY_DETAIL_LIMIT` geldt
    alleen voor wat open op de regel staat — en onder "Tekst" de regels die er
    bij kwamen en af gingen. Dichtgevouwen omdat honderd open blokken geen lijst
    meer zijn die je van boven naar beneden leest, en een `<details>` in plaats
    van een knop omdat de pagina op de server gemaakt wordt en dit geen
    javascript hoeft te kosten.

    Het rekenwerk is **geen tweede diff**. `bodyEdit` is dezelfde lineaire pas
    die §65 al gebruikte om te tellen — twee multisets van regels — alleen geeft
    hij nu ook de regels zelf terug, in de volgorde waarin ze staan, en
    `bodyPhrase` maakt er de zin van. Eén pas met opzet: twee manieren om
    dezelfde bewerking te tellen zijn twee antwoorden die het oneens kunnen
    worden, en ze zouden het oneens worden op de enige plek waar een lezer ze
    allebei tegelijk ziet. Wat het opgeeft tegenover een echte LCS is het
    koppelen — een regel waarin één woord veranderde leest als één regel eraf en
    één erbij — en dat is eerlijk, want allebei de helften worden afgedrukt; een
    LCS voor honderd versies per paginabezoek is dat niet. **Regel 2 van §65
    geldt onverkort**: uit een tijdvak dat dicht stond reist er geen regel mee
    (`lines` is er dan niet, de *telling* blijft staan), en er reizen er hoogstens
    tien per kant mee, elk hoogstens 240 tekens — het blokje staat in de HTML van
    elke bezoeker, of hij het openklapt of niet.

    **En het wiel op een tijdlijn sleept de as mee met de hand.** Het verticale
    wiel las als een scrollbalk — omlaag liep de tijd vooruit en schoof het
    papier naar links weg — terwijl de ás met de hand slepen altijd het
    omgekeerde deed (`origin: startOrigin - dx`, het papier volgt je hand). Eén
    teken omgedraaid en de twee manieren om langs een tijdlijn te bewegen spreken
    elkaar niet meer tegen. Een **zijwaarts** wiel blijft precies zoals het was:
    dat gebaar heeft een eigen richting die overal hetzelfde betekent, en het
    prikbord beantwoordt het als een scrollbalk (`x - deltaX`).

69. **Eén hand op elk canvas.** §69. Het archief heeft vier tekenvlakken — het
    prikbord, de landkaart, de tijdlijn en de stamboom — en ze zijn stuk voor
    stuk los gegroeid, in de volgorde waarin ze gebouwd werden. Dat is te zien:
    hetzelfde gebaar deed vier dingen, dezelfde knop heette drie dingen, en wie
    van de een naar de ander liep moest opnieuw leren wat zijn handen deden.
    Deze ronde is geen nieuwe functie maar één afspraak, en de afspraak is:
    **wat op één canvas waar is, is op alle vier waar — tenzij er een reden
    opgeschreven staat waarom niet.**

    Die uitzondering is het halve werk. `docs/canvas-contract.md` is de tafel
    waarin elk vakje een bestand en een regelnummer draagt, en elk verschil een
    stempel: **TOEVAL** (niemand koos dit), **BEWUST** (dit hoort zo, en hier
    staat welke regel het beschermt) of **OPEN** (Nick beslist). Wat hieronder
    staat is wat er van de TOEVAL-vakjes geworden is. Een vijfde canvas begint
    bij die tafel; een vakje dat er niet in staat, bestaat niet.

    **De camera is overal dezelfde.** `lib/canvas/view.ts` draagt nu ook de
    wielkromme (`wheelFactor`, `exp(−deltaY × 0.0015)` — het wiel van een muis
    en dat van een trackpad melden heel verschillende getallen, en een
    vermenigvuldiging per streepje is het enige wat voor allebei klopt), de
    knopstap (`ZOOM_STEP` 1,25 — hij was 1,6, 1,25, 1,25 en 1,4), de
    sleepdrempel (`DRAG_SLOP`, schuin gemeten met `passedSlop`) en de lucht bij
    "alles in beeld" (`FIT_PADDING` 48). `components/canvas/CanvasZoomControls.tsx`
    is het ene blok knoppen, met één stel namen — *Uitzoomen · Inzoomen · Alles
    in beeld*, waar de landkaart "Passend maken" zei — en het staat **ook op een
    telefoon**: het prikbord verstopte het onder 768 px, wat knijpen de enige
    weg naar binnen maakte en "alles in beeld" helemaal onbereikbaar. De drie
    cameratoetsen `+ − 0` leest `components/canvas/cameraKeys.ts`, één keer,
    voor alle vier — en ze worden op het *venster* beantwoord, niet op een
    stage die eerst focus moet hebben, want dat was de tijdlijn's stille
    afwijking. Een toets mét ctrl, cmd of alt is van de browser (§68's zin, een
    verdieping lager).

    **Twee getallen blijven van de landkaart, en dat is een beslissing.** Zoom 1
    betekent daar *één beeldpixel per schermpixel*, dus het gedeelde plafond van
    2,5 zou een tekening van 400 px een postzegel laten en de gedeelde vloer van
    0,25 een stafkaart van 4000 px nog steeds leesbaar. `MIN_ZOOM_FACTOR` 0,4 en
    `MAX_ZOOM` 8 blijven. En een landkaart neemt **`FIT_PADDING` niet**: de
    andere drie zijn tekeningen met dingen erover verspreid, waar een kaartje
    tegen het glas gelezen wordt als afgesneden, maar een landkaart is één
    rechthoek waar je *in* kijkt — en 48 px aan weerskanten van een telefoon van
    390 px is een kwart van het scherm weggegeven aan niets.

    **Leeg papier maakt waar dit vlak voor is.** Dubbelklikken op het prikbord
    en op de landkaart deed niets; de tijdlijn had het gebaar én de lange druk
    die een telefoon ervoor in de plaats krijgt, uitgeschreven in zijn eigen
    bestand. `components/canvas/useMakeOnEmpty.ts` is het nu één keer, want de
    lange druk is het lastige deel: hij mag niet afgaan tijdens een knijp, niet
    na een pan, en niet met het potlood in de hand (§33 — twee snelle stipjes
    zijn twee stipjes). Wat per plek verschilt is precies één ding, de
    `ignore`-selector: wat op dít vlak geen leeg papier is.

    **Weghalen vraagt niets meer, en de vraag staat in de melding erna.** Vier
    canvassen waren het hierover oneens — het prikbord haalde een kaartje van de
    muur zonder één vraag, de andere drie zetten er een blad voor — en van de
    twee antwoorden kost dít er niets als je het meende en één druk als je het
    niet meende. Wat het eerlijk maakt in plaats van alleen sneller: een speld
    en een gebeurtenis worden sindsdien **begraven en niet gewist**
    (`deleted_at`, migratie `0024_soft_delete_pins_events`), zodat *Ongedaan
    maken* dezelfde speld teruggeeft — zelfde id, zelfde hand, zelfde karakter,
    zelfde plaatje. Een nieuwe `addPin`/`addEvent` kon dat geen van alle: die
    munt een nieuw id, leest de schrijver af van wie op undo drukt, en de
    aanmaakroute van een gebeurtenis kan niet eens een `assetId` dragen.

    De prijs van een rij bewaren is dat **elke lezing moet zeggen dat hij hem
    niet wil**. `livePinCondition` en `liveEventCondition` staan er bij
    negentien leesplekken in, elk met een `§69`-commentaar — de vorm die
    `sideCondition` sinds §46 heeft — en `tests/unit/buried-rows.test.ts` vraagt
    ze allemaal na tegen een echte SQLite-file, want een vergeten filter valt
    nergens in de buurt van zichzelf op: de speld is van de landkaart en staat
    nog in het web, nog onder "Genoemd in", nog in de telling op de plank. Twee
    plekken kijken met opzet *wel* naar begraven rijen, allebei in
    `lib/admin/trash.ts`: wat een vernietiging gaat weghalen, en wat hij weghaalt.
    Dit is **niet de prullenbak** — die is voor de zes soorten houder die een
    Keeper bij naam terugzet — maar het geheugen achter één melding, en
    `sweepDeletedRows()` veegt het na een dag op.

    **Een houder vraagt nog wél.** Een heel prikbord, een hele tijdlijn: die
    gaan naar de prullenbak, en de vraag daar is niet "meende je dat?" maar
    "weet je wat erin hangt?".

    **Ongedaan maken bestaat op alle vier, en is grijs als er niets is.**
    `components/canvas/CanvasUndoButton.tsx`. De landkaart en de tijdlijn hadden
    er geen; het prikbord's knop droeg geen icoon en geen `aria-label`, dus op
    een telefoon — waar het woord wegvalt — was het een leeg vierkantje; en alle
    vier waren ze indrukbaar met een lege stapel, wat een mens leert de knop
    niet te vertrouwen. Wat er op de stapel gaat verschilt wél per plek, en dat
    is de kern: het prikbord en de stamboom bezitten een *document* en leggen er
    een momentopname op; een landkaart en een tijdlijn bezitten **rijen in een
    tabel waar twee handen tegelijk in schrijven**, dus daar gaat een *handeling
    om terug te draaien* op de stapel — waar deze speld stond, of welke speld op
    te graven. Een momentopname zou daar stilletjes het werk van de ander
    terugzetten. §29 staat overeind: undo verwijdert nooit aan de serverkant.

    **Wat zweeft, gaat op één manier dicht.** `components/ui/useDismiss.ts` —
    Escape, een druk buiten het paneel, en de caret terug naar de knop die het
    opende. Zes kopieën van dezelfde luisteraar, waarvan er drie Escape
    helemaal niet beantwoordden en driekwart zijn luisteraar bij de *montage*
    ophing in plaats van bij het opengaan. Vier van de negen zwevende dingen
    staan er met opzet niet op, elk om een reden die in dat bestand staat: de
    `@`-lijst zit in een portal, en drie panelen hangen boven een canvas dat de
    pointer capture pakt, waar een `pointerdown` op documentniveau vóór de
    allowlist loopt en dus de klik op de eigen rijen zou doden.

    **En één druk pelt één laag.** `lib/popoverStack.ts`, de vorm van
    `lib/sheetStack.ts` (§18b) een verdieping lager. Een kiezer die openstaat
    *in* een blad kon de Escape niet winnen hoe hij ook geschreven was, want
    `Sheet` luistert in de **capture**-fase op `document` en staat daarmee
    stroomopwaarts van alles: "Nieuw artikel" sloot met de half getypte naam
    erin omdat iemand de suggesties weg wilde hebben. Het blad *vraagt* het nu
    in plaats van te luisteren. Alleen Escape — Tab blijft van het bovenste
    blad, want een popover vangt geen focus, en een tik op de achtergrond sluit
    terecht allebei.

    **De vier makers vragen één keer wie er schrijft.** `ui.openMaker` in
    `UiProvider`: §18b's vraag hoort *vóór* het blad, want het antwoord is zelf
    een blad. De vier containerknoppen stelden hem helemaal niet, dus een
    venster zonder onderzoeker kreeg het twee keer te horen — de banner op de
    heenweg en de weigering van de server na een POST die nooit ging landen. De
    fout blijft nu in het blad staan (`error-note`) in plaats van als melding
    over een blad dat er nog staat, Enter maakt overal, en er is overal een
    `router.refresh()` na de `push`. En het **prikbord wordt ook via een blad
    gemaakt**, met een naam vooraf zoals de andere drie; de twee knoppen van §17
    verhuisden mee naar binnen en werden níét één knop met een vinkje, want het
    moment waarop je een muur maakt is het moment waarop je weet voor wie hij is.

    **Eén ring voor "gekozen", en dat is `--link`.** Blauw is in dit archief al
    de kleur van een weg naar iets anders (§39); `--stamp-red` is de stempel en
    leest als een waarschuwing, en een selectie is geen waarschuwing.
    `tests/unit/tree-contrast.test.ts` houdt de vloer vast in alle vier de
    paletten — 3:1 tegen het kaartje én tegen het paneel, want de ring ligt half
    op allebei — en dát is waarom dit een keuze was en geen hernoeming.

    **De contract-spec is de helft die een machine vasthoudt.**
    `tests/e2e/canvas-contract.spec.ts` stelt elk canvas dezelfde vragen uit één
    lijst, zodat een vijfde vlak een rij is en geen nieuw bestand, en zodat een
    vlak dat stilletjes stopt met antwoorden *daar* omvalt en niet in de eerste
    functie die er toevallig op leunt. Hij vond meteen drie afwijkingen die
    niemand gekozen had: de maker van het prikbord hing aan `interactive`
    (`!isPhone && !readOnly`, de poort op het *slepen* van een kaartje) zodat een
    telefoon niets kon neerleggen; de tijdlijn beantwoordde de cameratoetsen
    alleen met focus op de stage; en een inkt-bewering las de eerste tekening ná
    een herlaadbeurt in plaats van de tekening die klaar was.

    **Kiezen is één gebaar, op alle vier.** `components/canvas/useMarqueeSelect.ts`
    en `lib/canvas/select.ts` bestonden al sinds §67 voor het prikbord en de
    stamboom; deze ronde kwamen de landkaart en de tijdlijn erbij, en dat was
    het laatste vakje van tafel 1 dat nog TOEVAL zei. Shift-klik wisselt,
    shift-slepen over kaal papier veegt een kader, een gewone sleep pant,
    Escape laat los, een druk op iets dat al gekozen is laat de groep staan, en
    `Delete` haalt de hele keuze weg met één ongedaan-melding. **De wereld
    verschilt per vlak en dat is geen slordigheid**: een speld staat opgeslagen
    als een *breuk van de plaat*, een tag als *stage-pixels*, een kaartje als
    bordeenheden. Daarom rondt de landkaart het kader niet af voor de lijn zoals
    de hook doet — `Math.round` is verstandig in pixels en fataal in breuken —
    en daarom vult de tijdlijn zijn trefdozen tijdens het *tekenen*, zodat het
    kader meet tegen wat een lezer ziet staan.

    Twee dingen die op de tijdlijn anders moesten, allebei omdat een klik daar
    al iets betékende. Een gewone klik op een tag kiest hem én klapt zijn venster
    uit — er ging niets af. En **shift wisselt op de stip en de steel, niet op
    de naam**: die naam is een `<a>`, en shift-klik op een link is van de browser
    (§68). Een shift-druk kiest en klapt niets uit, want zes erbij kiezen hoort
    geen zes vensters op te leveren.

    **Wat over een canvas zweeft, kent de rand van het glas.**
    `lib/canvas/clamp.ts` — puur, en dus te bevragen, wat precies de reden is
    dat twee restjes van ronde 31 vier rondes bleven liggen: het rekenwerk stond
    in een `style={{}}`. `clampFloat` plaatst een paneel dat in stage-coördinaten
    staat op zijn **gemeten** hoogte (de kiezer van de stamboom werkte met een
    gok van 200 px, de zwevende `BoardPicker` met 90), en klapt liever bóven het
    punt dan eroverheen te schuiven — schuiven legt het paneel over het kaartje
    dat je aan het bekijken bent. `flipsNeeded` is voor een paneel dat aan een
    anker **in de wereld** hangt: dat staat onder een CSS-transform en heeft geen
    eerlijke stage-coördinaten, dus het wordt gemeten waar het landde en met een
    klasse de andere kant op gestuurd.

    **Een blad heeft één kruisje, en het zit in `Sheet`.** Acht bladen tekenden
    hun eigen in een kopregel van zichzelf; de andere twaalf tekenden er geen,
    dus of een blad met een aanwijzer te sluiten was hing af van wélk blad het
    was — en op een telefoon, zonder Escape en met een achtergrond van een paar
    pixels naast een blad van schermbreedte, betekende "geen" *vast*. Ook op de
    ja/nee-bladen: daar is het kruisje hetzelfde antwoord als *Nee*. Een vraag
    waar je niet van weg mag lopen is een vraag die anders gesteld moet worden,
    niet een dialoog met de uitgang eraf.

    **Wat je typte blijft staan.** `lib/sheetDraft.ts`: het artikel- en het
    dossierblad onthouden hun half getypte inhoud zolang de pagina leeft — geen
    `sessionStorage`, want een klad dat een herlaadbeurt overleeft komt terug in
    een ander archief, aan de andere kant van de Keeperkant, of nadat het artikel
    allang ergens anders gemaakt is. Een prefill wint van een klad en wist het:
    dat is een ander onderwerp, en terugkomen in een half getypt formulier onder
    iemand anders' naam is erger dan een leeg formulier.

    **↑ ↓ lopen elke suggestielijst, Enter kiest de rij.**
    `lib/search/suggestKeys.ts` en `components/ui/useSuggestKeys.ts`. De
    `@`-lijst kon dat sinds ronde 18; de vijf kiezers die dezelfde
    `.suggest-item`-rijen tekenen beantwoordden geen enkele toets, en de rij waar
    een haastige hand op landt is vaak `'X' aanmaken` — precies de val waar
    CLAUDE.md §6 elke spec omheen laat schrijven, en dezelfde val voor een mens.
    Enter pakt de eerste rij als er nog niets gemarkeerd is: iemand die een naam
    typt en Enter drukt bedoelt het ding bovenaan.

    **Een tekenvlak heet iets, en de kop ís het vak.**
    `components/canvas/CanvasTitle.tsx` — §66's vondst voor de stamboom, nu op
    alle drie. Een landkaart en een tijdlijn konden tot deze ronde alleen
    omgedoopt worden door een nieuwe te maken, wat geen omdopen is.

    **En de telefoon is gemeten, niet geraden.** Alle vier de vlakken hebben op
    390 px raakdoelen van 44 px (alleen dáár: de rest van het archief blijft
    zoals het was), het potlood staat overal in dezelfde hoek en `InkShell`
    beslist dat — niet een mediaregel per canvas — een vinger mag een kaartje
    dragen op het prikbord, en de panelen die naast hun ding zweefden komen van
    onderen op. **Die panelen zijn met opzet géén `Sheet`**: een `Sheet` is
    modaal, en een modale laag over een canvas betekent dat je niets meer kunt
    aanwijzen zolang er iets openstaat — op de twee vlakken waar "kies het
    volgende" is wat je hierna doet, is dat erger dan het probleem. Gedokt en
    niet modaal dus, met de regel die overal geldt voor wat over een canvas
    zweeft: het houdt zijn eigen pointer-events tegen, want de stage pakt de
    capture op de heenweg en een knop die dat niet doet is niet onhandig maar
    **onindrukbaar**.

70. **Een sectie hoort bij een *ding*, en wie het ding mag bewerken mag er een
    sectie bij zetten.** §70. Een sectie was sinds §9 de voorbereiding van de
    Keeper: een stuk tekst met een eigen kop en een eigen zichtbaarheid, alleen
    aan een artikel, alleen door een Keeper te maken. Een dossier had daar
    tegenover precies één vak tekst — de **Dossiernotities** — waar een artikel
    een lichaam had *en* zoveel secties als iemand erbij zette. Nick vroeg wat
    uit die twee dingen volgt: *"just like in articles, dossiers should have
    extra sections you can add with different headers"*, en een plek om op te
    schrijven wat één onderzoek opleverde zonder het vorige te overschrijven.

    Dus `entry_sections` heet nu `sections`, met `owner_kind` + `owner_id` in
    plaats van `entry_id` (migratie `0025_sections_and_pin_layer`). De **ids
    reizen ongewijzigd mee**, en dat weegt zwaarder dan het lijkt: de tekst van
    een sectie leeft in de kamer `section:{id}` (§20), dus elke kamer en elk
    Yjs-document staat er na de migratie nog. `entry_section_reveals` houdt zijn
    naam — die tabel hangt aan een sectie-id en had niets nodig, en een
    tabelkopie om een voorvoegsel te repareren is een risico dat je neemt voor
    een woord.

    **Twee rechten, niet één, en dat is de hele regel.** Maken, schrijven,
    ordenen en weghalen vraagt `canEditSections` → `viewerCanEdit(ownerKind,
    ownerId, viewer)`: de eigen §17-knoppen van het ding, niet meer
    `requireKeeper()`. **De geheimhoudingsknop en de onthullingen bleven van de
    Keeper**: een speler mag opschrijven wat een onderzoek opleverde, maar wie
    er aan tafel bij mag is voorbereiding, en voorbereiding is §9's. De route
    weigert het ook — *"Alleen de Keeper bepaalt wie een sectie mag lezen."*,
    403 — want de knop wegnemen is geen poort.

    Wat een **nieuwe** sectie dan is, volgt uit die splitsing en staat in
    `startingVisibility`: die van een Keeper begint op `keeper`, want een Keeper
    die er een maakt is aan het klaarzetten; die van ieder ander begint op
    `all`, want een speler heeft geen knop om hem later aan te zetten, en een
    aantekening die niemand kan lezen is geen aantekening.

    `canEditSections` vraagt ook **§10's slot**, en dat moet daar gevraagd
    worden in plaats van geërfd: het slot van een artikel wordt binnen
    `updateEntry` afgedwongen en een sectie gaat niet door `updateEntry` heen —
    zonder die regel bleven de secties van een gebout artikel beschrijfbaar door
    iedereen die het vóór het bouten mocht bewerken. Een dossier heeft geen slot
    van zichzelf, dus voor `case` zijn het alleen de knoppen. De kamer stelt
    dezelfde drie vragen in dezelfde orde (`sectionAdmission` in
    `lib/live/rooms.ts`): mag je de houder zien, mag je de sectie zien
    (`canSeeSection` — de knop van een sectie is *fijner* dan die van zijn
    houder, en dit is de helft die de kamer geen omweg om §9 maakt), en mag je
    schrijven.

    `lib/sections/service.ts` is de enige weg naar een sectie. De sectie-helft
    verhuisde daarheen uit `lib/entries/secrets.ts` en er wordt **niets**
    heruitgevoerd vanaf daar, want één weg is beter dan twee; alleen de
    onthullingen van een *artikel* bleven achter. En omdat de secties van een
    dossier meetellen onder "Genoemd in" (§27) en in het web getekend worden,
    wordt een `case`-rij bij het teruglezen opnieuw tegen zijn bron gehouden —
    `canSeeSection`, in **`listMentions` én `buildWebGraph`**, want de telling,
    het paneel en de tekening moeten naar dezelfde verzameling kijken.

    Eén ding dat bekend en bewust is: een sectie **zonder titel** is in
    `entry_mentions` niet te onderscheiden van de Dossiernotities, want de rij
    draagt alleen de titel. Beide lezers laten voor zo'n rij allebei de bronnen
    gelden, en dat is de veilige kant op: de notities zijn per definitie
    leesbaar voor wie zover gekomen is.

71. **Een speld heeft een laag, en een kluitje heeft een cijfertje.** §71. Een
    landkaart tekende zijn spelden in de volgorde waarin de tabel ze teruggaf,
    dus een dorp kon onder een huis belanden en daar was niets aan te doen.
    `map_pins.layer` is er nu: een geheel getal, hoger ligt voor, en de
    volgorde wordt volledig gemaakt door `createdAt` en daarna het id
    (`compareDrawOrder`), zodat twee spelden uit dezelfde seconde op **elk**
    scherm dezelfde kant op liggen. Een volgorde die per browser verschilt is
    een `+n` die ergens anders een andere naam draagt.

    **De rang is per speld, niet per soort.** Dat was Nicks beslissing en zijn
    reden staat erbij: *"it might be different per map how the ranking works"* —
    op de ene landkaart hoort een dorp boven een huis, op de andere is de kamer
    het onderwerp en hoort díe bovenaan. Er wordt dus niets afgeleid uit
    `entry_types`; de hand zegt het, met **Naar voren / Naar achter /
    Voorgrond / Achtergrond** in het blad van de speld zelf — het enige scherm
    dat over één speld gaat, en de plek waar de hand al is.

    Datzelfde getal doet **twee klussen**. De tekenvolgorde, en: wie het kluitje
    vertegenwoordigt. Staan er bij deze zoom spelden binnen een speldenkop van
    elkaar, dan wordt er één getekend met een `+n` ernaast, en dat is degene met
    de hoogste laag. Middelharnis (+10), niet het tiende huis.

    **Niets verdwijnt ooit.** Er is geen zoomband waarop een soort wegvalt: een
    speld die er gewoon niet is leest als een storing, en een lezer die weet dat
    er een huis staat gaat zoeken in plaats van klikken. Spelden gaan alleen
    samen, en één druk op het cijfertje zoomt precies zo ver in dat díe groep
    het glas vult, gecentreerd — daarna staan ze los.

    `lib/maps/cluster.ts` is het hele rekenwerk en het is zuiver en getest
    (`compareDrawOrder`, `clusterPins`, `viewForCluster`, `layerAfter`;
    `tests/unit/map-cluster.test.ts`). Meetkunde hoort in een zuiver bestand,
    dezelfde regel waar het web, de tijdlijn en de stamboom van leven. Twee
    dingen aan die module zijn dragend. **`tx`/`ty` doen niet mee**: schuiven
    verandert niets aan wie bij wie hoort, en een rooster dat met de pan
    meeschuift laat groepen knipperen onder je hand. En de landkaart geeft zijn
    **eigen** vloer, plafond en stap mee aan `viewForCluster`, want
    `clampZoom`/`fitViewport` in `lib/canvas/view.ts` klemmen op 0,25–2,5 en
    hier betekent zoom 1 één plaatpixel per schermpixel — een andere eenheid,
    dus een andere klem (§69: elk canvas heeft zijn eigen wereld).

    **Een nieuwe speld begint op laag 0, niet op `max + 1`.** Dat draait de
    opdracht om waarmee dit gebouwd werd, en Nicks eigen voorbeeld is de reden:
    een huis dat je *in* Middelharnis zet zou met `max + 1` meteen boven het
    dorp uitkomen en zelf de `+10` gaan dragen — je zou de ordening elke keer
    met de hand terug moeten zetten. Wat `max + 1` moest opleveren komt uit de
    tiebreak: bij gelijke laag ligt de nieuwste vóór.

    Drie dingen die bewust níet gebeuren. **Kiezen breekt een kluitje niet
    open** — alleen een speld *dragen* zet hem erbuiten, want een speld
    aanwijzen zou het kluitje uit elkaar laten springen terwijl je ernaar kijkt,
    en de weg naar wat eronder ligt is het cijfertje. De `+n` zegt **niet** welke
    spelden eronder liggen (dat is een tweede lijstje over iets waar je heen
    kunt zoomen), een gekozen speld onder een cijfertje krijgt geen ring, en een
    groep die op precies één punt ligt gaat nooit uit elkaar: de druk doet zijn
    ene stap en houdt op, want een klik waar niets van beweegt leest als stuk.

72. **Twee vingers zijn één knijp, en een knijp springt nooit.** §72. Nick,
    ronde 37: *"Zooming in and out with the pinching gesture sometimes teleports
    the camera somewhere else."* Het deed het op vier tekenvlakken om vier
    redenen, en alle vier waren dezelfde fout: **een gebaar dat iets onthield
    over een vinger dat niet meer waar was.** Het prikbord startte voor de
    tweede vinger óók een pan, zonder te vragen van wie die was, dus de eerste
    beweging van de eerste vinger werd gemeten vanaf waar de tweede neerkwam —
    gemeten: een sprong van 105 px nog vóór de knijp begon. De landkaart hield
    een vinger in zijn lijst wiens `pointerup` nooit terugkwam (een speld die
    onder de zoom in een kluitje opging, §71, nam hem mee) en las de volgende
    enkele vinger als een knijp tegen een geest; en een tweede vinger óp een
    speld verving de knijp door een speld-druk. De tijdlijn pakte na een knijp
    de pan weer op vanaf de laatste *render* in plaats van de laatste beweging.

    `lib/canvas/pinch.ts` is nu de hele knijp, zuiver en getest
    (`tests/unit/canvas-pinch.test.ts`), en `components/canvas/usePinch.ts` de
    bedrading. Drie regels. **De knijp is absoluut**: het beeld wordt altijd
    uitgerekend vanaf het beeld, het midden en de spreiding op het moment dat
    het paar ontstond, nooit door het vorige frame te vermenigvuldigen — dus
    een gemist of dubbel event telt niet op, en het punt van de tekening dat
    tussen de vingers lag blijft daar (twee vingers die samen schuiven, pannen
    dus ook). **Elke verandering in het aantal vingers begint opnieuw** vanaf
    het beeld zoals het nú is. **Een vinger waarvan niets meer gehoord wordt is
    vergeten, niet vertrouwd**: `window` luistert in de capture-fase naar
    `pointerup`/`pointercancel`, waar geen `stopPropagation` en geen verdwenen
    element tussen kan komen.

    De hook zit in de **capture-fase** op het glas (`onPointerDownCapture`), zodat
    de tweede vinger een knijp is vóór een kaartje, speld of kaartje in de
    stamboom eronder er een sleep van kan maken; wat de eerste vinger begonnen
    was — een pan, een sleep, een lange druk — wordt losgelaten
    (`onStart`), en een half verplaatst ding gaat terug. **Na een knijp blijft de
    laatste vinger stil** tot hij loslaat: zo doet elke foto-app het, en zo kan
    de laatste vinger van het glas het beeld niet wegslingeren. Een vinger op
    `.ink-capture` wordt niet tegengehouden, want het potlood moet de tweede
    vinger zien om zijn streek af te breken (§33). De tijdlijn is 1-D en houdt
    zijn eigen `zoomAt`, met dezelfde drie regels met de hand toegepast; het web
    is één `<canvas>` met zijn eigen knijp en was niet stuk.
    `tests/e2e/round-37-pinch.spec.ts` knijpt via de echte touch-pijplijn (CDP)
    en faalt op de code van ronde 36 met precies die 105 px.

73. **Lezen of Bewerken — op een telefoon begint alles in Lezen.** §73. Nick,
    ronde 37: *"Moving things accidentally is very easy. I think we need a Read
    and Edit mode on all things. Things that have a camera should start in
    editing mode on pc but reading mode on phone."* Elk glas — prikbord,
    landkaart, tijdlijn, stamboom en het web — heeft vooraan in zijn werkbalk
    `CanvasModeToggle`: twee radio's, **Lezen** en **Bewerken**, in één rand.
    `useCanvasMode(canEdit)` beslist: een bureau begint in Bewerken, een
    telefoon in Lezen, en **niets wordt onthouden** (Nicks keuze) — een ongeluk
    kan nooit van gisteren meekomen.

    Wat Lezen uitzet is op elke plek dezelfde lijst (Nicks keuze): **verplaatsen**
    (een kaartje, een speld, een gebeurtenis, een kaartje in de stamboom, een
    knoop van het web — en wat verplaatsen onder een andere naam is: het hoekje
    om te vergroten, een draad trekken, de laag van een speld, de `+`-handgrepen,
    Opnieuw schikken), **maken** (dubbelklik en lang drukken op leeg papier, de
    knoppen die iets nieuws op het glas zetten, plakken) en **het potlood**. Ook
    Delete/Backspace en Ctrl+Z zijn van Bewerken. Wat blijft: de camera, kiezen,
    en openen — een tik opent wat hij opende. De knoppen in een paneel blijven
    ook: dat is een bewuste druk, geen duim die ergens landt. **Een sleep die in
    Lezen op een ding begint schuift het papier**, op alle vier: op een vol
    prikbord of een dichte stamboom landt een duim bijna altijd op iets, en een
    camera die je dan niet kunt bereiken is erger dan het ongeluk.

    Twee regels. **Recht gaat voor stand**: wie het glas niet mag bewerken krijgt
    geen schakelaar en leest altijd; de stand vernauwt een recht, hij geeft er
    nooit een. En wie alleen mag kijken **houdt het potlood** — §33 geeft de
    tekenlaag ook aan kijkers, en die hebben geen schakelaar om hem terug te
    krijgen. De namen van de radio's veranderen nooit (§64), en het zijn radio's
    en geen knoppen, zodat ze nooit botsen met de vele `Bewerken`-*knoppen* in
    een paneel. De server tekent elk glas als een bureau; een telefoon draait
    op zijn eerste render naar Lezen, en `data-ready` op de schakelaar zegt
    wanneer dat gebeurd is (`editCanvas` in `tests/e2e/helpers.ts` wacht erop).
    Een link met `?place=` (landkaart, tijdlijn) zet Bewerken zelf aan, want
    daarmee vraag je om iets te zetten.

74. **Wat een tik opent komt op een telefoon van onderen op, en laat het glas
    staan.** §74. Nick, ronde 37: *"Opening some cards and images and timeline
    events is way too big on phone — if you open one it just covers the
    screen."* De ergste twee waren modale `Sheet`s (een speld op een landkaart,
    een knoop van het web: tot 92 % van het scherm, met een scrim die de
    tekening eronder onaanraakbaar maakte); de lade van de tijdlijn lag wel
    gedokt maar gaf vier vijfde van zichzelf aan een foto zonder maximale
    hoogte. `components/canvas/CanvasPeek.tsx` is nu de vorm, en alleen op een
    telefoon. **Klein eerst**: hoogstens ongeveer een derde van het scherm
    (`--peek-h`), met eerst wat het ding *is* (kop, soort, een paar regels, de
    hoofdknop) en daaronder de rest in hetzelfde scrollende lijf — er is geen
    tweede scherm. **Groter op verzoek**: een tik op de greep of een veeg omhoog
    geeft bijna het hele scherm, een veeg omlaag geeft het terug en sluit vanuit
    klein. **Nooit modaal**: geen scrim, geen focusval, en het glas erboven
    blijft pannen en de volgende speld is één tik — wat §69 al leerde over
    panelen boven een canvas. `role="dialog"` zonder `aria-modal`, genoemd naar
    de kop, dus `getByRole('dialog', { name })` vindt hem zoals het het
    bureaupaneel vindt; Escape sluit, tenzij een `Sheet` of popover erboven
    ligt. Een plaatje erin is een voorproefje (140 px, 45dvh als hij groot is);
    de zwevende `+` van de schil gaat weg zolang er een peek ligt.

    Waar hij staat: het blad van een **speld** (`.map-peek`), het paneel van het
    **web** (`.web-peek`, dat daarbij voor het eerst een naam kreeg — er was
    geen element met `id="web-panel-title"`), de open vensters van een
    **tijdlijn** (`.timeline-peek`, met *Alles inklappen* in de greeprij en de
    foto als duimnagel van 96 px) en de **foto van een prikbordkaartje**, die op
    een telefoon eerst als peek komt met *Groot bekijken* naar de volledige
    lightbox. Niet: de inspector van het prikbord en het knoopmenu van de
    stamboom (al klein), de legenda (een filter is een moment waarop je even
    niets anders doet) en de bewerkbladen (een formulier is een bewuste stap).

75. **Een overzicht is een pagina van de wiki die over de wiki gaat, en
    verwijzingen vanaf zo'n pagina lopen één kant op.** §75. Nick, ronde 38:
    *"I am currently in need for a main page when you click on 'Wiki' … the
    first thing that shows should be an intro page that players get to freely
    fill in … a full page with links to other 'home pages' … These home pages
    probably shouldn't appear in webs nor in other reference stuff. They are
    there purely to guide people around the wiki."* Dat is wat MediaWiki een
    *Portal* noemt en wat elke grote Fandom-wiki met de hand bouwt: een
    voordeur per onderwerp, náást de artikelen.

    **`/wiki` is de voordeur** (het thuisoverzicht, `is_home`, gemaakt door
    migratie `0026`) en **`/wiki/alles`** is de gesorteerde lijst die daar tot
    deze ronde stond. `TypeTabs` begint daarom met **Start**, dan **Alles**, dan
    de soorten; Start draagt geen telling, want een overzicht telt niets. Elk
    ander overzicht staat op `/wiki/overzicht/<slug>`, en `alles`, `overzicht`
    en `overzichten` zijn daarmee adressen die een soort niet meer mag pakken
    (`RESERVED_WIKI_SLUGS` in `lib/slug.ts`, gevraagd door `createType` én
    `renameTypeSlug`).

    **Een eigen tabel, geen soort artikel met een vinkje.** Dat is de hele
    beslissing, en het verschil is niet cosmetisch: een overzicht mag niet in
    het web staan, niet onder "Genoemd in", niet in een stamboom, niet op een
    landkaart en niet in een dossier. Als het een rij in `entries` was, moest elk
    van die uitsluitingen op veertien plekken onthouden worden; nu volgen ze uit
    het feit dat de rij daar niet staat. **Het enige dat met de hand geschreven
    is, is één regel in `recomputeOwnerMentions`** (`lib/sections/service.ts`):
    een sectie op een overzicht rekent geen mentions door. Een overzicht noemt
    dus artikelen, en die artikelen horen daar nooit iets van terug.

    **Zijn lijf is §70's secties**, ongewijzigd — hetzelfde component, dezelfde
    kamers (§20), dezelfde rechten, dezelfde geheimhouding per sectie. Wat er
    verder op staat is een naam en een inleiding, en verder niets: geen velden,
    geen infobox, geen omslagfoto, geen tags. Eén kolom over de hele breedte
    (`.overzicht-page`), want er is geen zijbalk om te vullen.

    **Iedereen mag hem schrijven**, en dat staat in een kolom en niet in een
    `if`: `overzichten.edit_mode` begint op `'all'` (waar een landkaart op
    `'private'` begint, §40), dus `viewerCanEdit` zegt ja tegen elke ingelogde
    hand tot iemand de knop terugdraait. De Keeper houdt de grendel
    (`access_locked`, §17) en de prullenbak (§43). **De voordeur zelf kan niet
    weg** — `deleteOverzicht` weigert `is_home`, want `/wiki` moet ergens op
    uitkomen — en zolang niemand er iets schreef stelt hij zich voor met
    `defaultIntro()` uit `lib/intro.ts`: getoond, nooit opgeslagen, zodat die
    tekst op één plek staat en de woordenlijst (§11) volgt.

    De rest van de ruggengraat is die van elk ander soort ding, want dezelfde
    regels gelden: §17's twee knoppen, §44's kant (`keeper_only`,
    `sideCondition`, `keeperRef`), §46's *een lijst filtert op kant, een
    opzoeking nooit*, §48's geboren-op-een-kant, §50's omslag vóór het renderen,
    en §43's zachte verwijdering. `tests/unit/overzicht-spine.test.ts` vraagt ze
    stuk voor stuk na — inclusief de dingen die een overzicht *met opzet* niet
    heeft (geen tekenlaag, geen `case_id`, geen mention-rij) en inclusief de ene
    val die niets anders vangt: `KeeperKind` staat twee keer geschreven, in
    `lib/keeper/kinds.ts` en in `lib/db/schema.ts`, en die twee moeten samen
    bewegen.

    Eén uitzondering op §44, met reden: **een overzicht heeft geen
    Keeperversie.** Een tweeling bestaat zodat één ding *in de wereld* twee
    gezichten kan hebben; een overzicht is geen ding in de wereld maar een
    wegwijzer ín de wiki, en een Keeper die een eigen wegwijzer wil maakt er
    gewoon een op zijn eigen kant. `makeOfKind` gooit daarom voor deze soort.

76. **Een plek krijgt een naam per kijker, of helemaal niet.** §76. Nick, ronde
    39: *"a page/indicator/popup menu where you can see all currently online
    people and what character they have selected … where they are right now,
    what they are doing on there, and if you click on it you get transported to
    the same page."* De strip in de hoek (§21) wist al waar iedereen stond, maar
    hij liet alleen mensen zien die stonden wáár jij stond — en dan valt er
    niets af te schermen: wie de pagina mag zien, mag zien wie er nog meer is.

    Een lijstje over het hele archief is het omgekeerde. *"Nick is op Het
    dagboek van Ysbrand"* beweert dát dat artikel bestaat, hoe het heet, en
    sinds §44 aan welke kant het staat — tegen iemand aan wie `canWatch` de
    sleutel geweigerd zou hebben. Daarom wordt het frame **per verbinding
    gebouwd** (`lib/live/roster.ts`, `rosterFor`) en niet één keer uitgewaaierd:
    elke rij gaat voor elke kijker langs `gate.ts`, dezelfde functie als de
    watchlijst, nooit een tweede regel die hier geschreven staat.

    Een plek die daar niet doorheen komt wordt **één vaste zin** —
    `presenceElsewhere`, standaard *"ergens anders in het archief"* — voor een
    Keeperartikel, een privé prikbord en de andere kant van een tweeling. Het
    verschíl is het lek: zeg "op een artikel" voor de één en "ergens anders"
    voor de ander en je hebt verteld welke verborgen dingen er zijn. En zo'n rij
    is **geen link**: een klik die in een 403 landt beantwoordt de vraag die de
    rij net weigerde te beantwoorden.

    Dit is O(mensen × mensen) en dat is goed. Tien vrienden aan één tafel is
    honderd puntopzoekingen in een synchrone SQLite-file, hooguit een paar keer
    per seconde. **Maak het niet slim.** De voor de hand liggende optimalisatie —
    één lijstje bouwen, naar iedereen sturen, de browser laten verbergen wat hij
    niet mag zien — *is* het lek, en niemand zou het ooit zien.

    Verder: een rij is een **venster** en geen account (§18b — twee onderzoekers
    in twee vensters zijn twee rijen, drie tabbladen met één karakter zijn er
    één); het werkwoord komt uit wat de POST tóch al draagt (typen, tekenen,
    slepen) en **vervalt** na twintig seconden, want anders staat er morgen nog
    dat je aan het typen bent; een venster dat zijn socket teruggaf (§60) staat
    er grijs bij met *even weg* en verdwijnt niet; wie wegging staat een half uur
    in het staartje eronder, zonder plek, want waar iemand wás is nergens meer.

    **De Keeper is stil.** Een speler ziet dát hij er is en niet waar — zijn
    plek is de vorm van de avond. Hij heeft als enige een schakelaar om
    helemaal onzichtbaar te zijn, en die woont in het geheugen van de hub en in
    `localStorage`, niet in een kolom: een vlag die de avond overleeft is een
    instelling waarvan niemand meer weet dat hij aanstaat.

    **Een uitnodiging ("Kom kijken") wordt gepoort op de ontvánger.** Iemand
    uitnodigen bij een deur die hij niet open kan krijgen is hetzelfde lek met
    een vriendelijker gezicht. Ze wordt nergens bewaard, nooit in de wachtrij
    gezet voor wie weg is, en is na twee minuten van het scherm. En ze wordt
    geadresseerd aan het **rij-id** dat het lijstje uitdeelde — een hash van
    account en gedragen naam — nooit aan een account: zo kun je alleen iemand
    vragen die het archief je al getoond heeft, staat er geen account-id op de
    lijn (wat `hub.ts` van `userId` belooft), en is een onzichtbare Keeper ook
    voor dít niet te vinden.

    Twee lekken zijn onderweg gevonden en gedicht, allebei door iemand die het
    van de andere kant vroeg. `canWatch` liet **elke** `/wiki/overzicht/<slug>`
    door op de vorm van het adres alleen, terwijl hetzelfde overzicht via zijn
    recordsleutel netjes langs de knoppen en de prullenbak ging: één ding, twee
    sleutels, twee antwoorden. En `nudge` antwoordde vrolijk voor een
    onzichtbare Keeper, wat in één klik verraadde dat hij er was.

77. **Een speler is een adres, en een paneel is een samenvatting met een deur.**
    §77. `/spelers/<slug>` is de voordeur van één persoon — niet van één
    onderzoeker: rechten zijn per account (§17, §18 regel 1), en een karakter is
    een naam die iemand draagt. De slug komt uit `lib/spelers/service.ts` en
    wordt in één pas over alle accounts berekend, zodat er precies één antwoord
    is op "wie is `jan-piet`" en twee namen die hetzelfde slugificeren niet om
    hetzelfde adres kunnen vechten. Er staat geen slug in een kolom: dan zou een
    hernoeming hem moeten bijwerken, en dat is een tweede ding om te vergeten.

    Wat de pagina toont is een **register** (`lib/spelers/panels.tsx`), en de
    regel van een paneel staat in dat bestand:

    > Een paneel is een samenvatting met een deur. Het toont het kleinste ware
    > ding — een saldo, drie portretten, de laatste vier regels — en linkt naar
    > de pagina die het bezit. Niets op een paneel is bewerkbaar, en niets woont
    > in een paneel dat geen eigen pagina heeft.

    Zonder die regel is het over een half jaar een la. De eerste die "snel iets
    uitgeven" aan het kamerpaneel hangt is een tweede, slechtere kamer-editor
    begonnen in een samenvatting, en die gaat er nooit meer uit. Een zesde
    paneel is één object in een array.

78. **Het archief onthoudt wat je hebt; de tafel beslist wat het doet.** §78, en
    er is nog niets van gebouwd. Wat er wél staat is de plek waar het komt: de
    sleutel `room:{id}` bestaat en `canWatch` **weigert** hem (geen tabel, dus
    het eerlijke antwoord is nee, en de ronde die de kamer bouwt vindt één
    functie om te veranderen); de woorden `room`, `slot` en `currency` staan in
    de woordenlijst zonder dat er iets aan hangt; en er is één leeg paneel.

    De grens waarbinnen dat gebouwd wordt, nu opgeschreven omdat het nu gratis
    is: **de site onthoudt wat je bezit, wat er in welke plek ligt, en wat dat
    ding zegt dat het doet. Hij rekent nooit een bonus uit, past er nooit een
    toe, en spreekt nooit recht over wat mag. Een saldo is de som van een
    grootboek, nooit een getal dat iemand bijwerkt. Voorwerpen zijn
    *artikelen* van een soort, geen eigen tabel — zodat iets in een kamer ook
    iets in de wereld is: foto's, geheimhouding per §9, een kant per §44,
    vermeldingen en het web, allemaal gratis.** En de munt is één woordsleutel:
    gulden, kristal of scherf is daarmee altijd een hernoeming van tien
    seconden, nooit een naam die in een tabel, een adres of een stylesheet is
    gaan zitten.

79. **Het archief is de plank en het grootboek; de tafel beslist wat een ding
    doet.** §79. Nick, ronde 40: *"Meta progression will be a currency that they
    can spend to upgrade their room. every investigator will have a room and
    there will be 'slots' in that room. And these slots can be filled up with
    things that provide buffs."* Rule 78 zette de grens en die is niet veranderd:
    **wat een voorwerp dóét is proza op zijn artikel.** Er staat in deze drie
    tabellen geen enkel getal dat iets uitrekent, en er is geen kolom waar een
    +2 in past. Wie er ooit een wil toevoegen leest eerst 78 nog een keer.

    **Een kamer hangt aan een onderzoeker, niet aan een account.** Eén rij per
    karakter-artikel, en de zichtbaarheid van dát artikel is de zichtbaarheid
    van de kamer: wie de onderzoeker niet mag zien, ziet de kamer niet. Daarom
    heeft `rooms` géén `deleted_at` — de prullenbak van het artikel *is* die van
    de kamer, en twee vlaggen die uit de pas kunnen lopen zijn erger dan één.
    En géén `keeper_only`: een kant bestaat zodat één ding twee gezichten kan
    hebben, en een Keeper draagt nooit een onderzoeker (§18). Dat is dezelfde
    vorm van uitzondering als §75's "een overzicht heeft geen Keeperversie".

    **De twee knoppen staan met opzet tegengesteld**: `view_mode` op `all` omdat
    een kamer bedoeld is om te laten zien — een munt heeft sociale waarde of
    geen — en `edit_mode` op `private` omdat alleen wie er woont hem inricht.

    **Het saldo is `SUM(delta)` over het grootboek en staat nergens
    opgeslagen.** Een vergissing van de Keeper is een regel erbij, nooit een
    regel die verandert; daarmee is het uitgeefscherm niets anders dan een lijst
    met een formulier eronder. Er staan tientallen rijen per persoon in: een
    saldo-kolom "voor de snelheid" is hier een manier om twee waarheden te
    krijgen.

    **Een aankoop is één transactie, en de controle zit ín de schrijfactie.**
    De UPDATE landt alleen `WHERE unlocked_at IS NULL`, dus een tweede klik —
    een dubbele tik, een herhaling na een trage lijn, twee tabbladen — koopt
    niets. Eerst lezen en dan schrijven is de versie hiervan die op een drukke
    avond twee keer afschrijft.

    **Elke plek die een kamer ooit krijgt bestaat vanaf dag één**, de meeste op
    slot met een prijs erop, want een kamer die alleen toont wat je al hebt
    geeft je niets om voor te sparen. De ladder staat in `lib/kamers/shape.ts`
    en mag alleen **aangroeien**: een trede herprijzen verandert stilletjes
    waarvoor iemand aan het sparen was, en ertussen schuiven geeft iemands
    plank aan een andere trede.

    **Een voorwerp is een artikel**, en dat is de spiegel van §75 om de
    omgekeerde reden: een overzicht kreeg een eigen tabel omdat het *niet* in
    het web of op een landkaart hoorde, en een lantaarn in je kamer hoort daar
    juist wél. Zo krijgt een voorwerp foto's, geheimhouding (§9), een kant
    (§44), vermeldingen, het web, zoeken en de prullenbak gratis. Wat een
    artikel tot voorwerp maakt is één **veld** met sleutel `plek` — niet een
    soort, zodat er later meer soorten in passen. Eén voorwerp ligt op één plek
    in het hele archief: een lantaarn is één ding in de wereld.

    **Een plek met iets erop dat jij niet mag zien is gevuld en naamloos** —
    dezelfde ene zin of het nu §9's geheimhouding of §44's andere kant is. Dat
    is §76's regel op een nieuwe plek, en de reden is dezelfde: het verschil zou
    het lek zijn. Nooit leeg: een lege plek die in werkelijkheid vol is, is een
    leugen die de eigenaar niet verteld heeft.

    **Wie de onderzoeker draagt, richt de kamer in** — live gevraagd aan
    `user_characters`, niet aan `rooms.created_by`. Die kolom is een kopie van
    dezelfde vraag, één keer opgeschreven, en een karakter dat van hand wisselt
    is het gewoonste dat een Keeper doet (§18c): met de kopie als antwoord zei
    één scherm tegelijk *Aagje woont hier* en *Bram mag het herschikken*, en kon
    Bram haar munten uitgeven.

    **Alleen de Keeper geeft uit, alleen de eigenaar geeft uit, en niemand komt
    onder nul.** Een negatieve regel mag (een diefstal aan tafel, een correctie);
    een schuld is een regel over het spel, en dit bestand maakt geen regels over
    het spel. Weghalen geeft niets terug: een teruggave is een tweede economie
    en een ruzie over wat dingen op de terugweg waard zijn.

80. **Een voorwerp wordt gevonden; huisraad wordt gekocht.** §80. Nick, ronde
    41: *"ik heb nieuwe artikelen nodig die alleen Keepers kunnen toevoegen en
    die gameplay dingen hebben als ze geplaatst worden in de kamer. Niet
    voorwerpen kapen, maar een nieuw ding."* Dus staat er naast §24's
    **Voorwerpen** — gevonden tijdens een onderzoek, verhalend, uniek — een
    tweede soort: **Huisraad**. Alleen de Keeper maakt ze, ze hebben een prijs,
    en ze zeggen wat ze je geven.

    Allebei dragen ze hetzelfde veld `plek`, en dat is geen toeval maar het hele
    ontwerp: **de kamer vraagt naar het veld en niet naar de soort**. Daardoor
    paste huisraad erin zonder één regel te veranderen aan §79, en daardoor kan
    de Keeper er zelf *Boeken* of *Relikwieën* naast maken.

    **Twee vlaggen op een soort, en de eerste heeft een naam om goed te lezen.**
    `keeper_made` staat op een *soort* en betekent "alleen een Keeper maakt hier
    nieuwe artikelen van" — dat is iets anders dan §44's `keeper_only`, dat op
    een *artikel* staat en zegt aan welke kant het hangt. Het geldt op twee
    plekken: de soort staat niet in de nieuw-artikel-lijst van een speler, én
    `createEntry` weigert het. Het scherm alleen is een slot aan de buitenkant
    van de deur — de browsertest vond precies dat, terwijl er in de code al een
    comment stond die beweerde dat het scherm het deed.

    `one_of_a_kind` is de subtiele. §79 hield één voorwerp op één plek in het
    hele archief met een unieke index, want een lantaarn is één ding in de
    wereld. Huisraad is het omgekeerde: twee onderzoekers mogen dezelfde
    leesstoel hebben. Dat is geen uitzondering die je in code erbij zet maar een
    eigenschap van de soort — en de garantie is niet weggehaald maar verhuisd
    naar `room_slots.claim`, die alleen gevuld wordt voor dingen waarvan er één
    is. Het schema zegt het dus nog steeds, en alleen over de dingen waarover
    het waar is.

    **Wat het geeft zijn regels tekst.** Eén effect per regel in een `longtext`,
    en de kamer zet ze onder elkaar onder de kop *Wat deze kamer je geeft*. Geen
    getal, geen optelling, geen totaal — zodra er een kolom `bonus: number`
    staat is optellen een kwestie van tijd, en dan is rule 78 gepasseerd. Het
    archief somt op; de tafel beslist. **En een versluierd ding draagt niets
    bij**: anders lekt §76's sluier alsnog — "er ligt iets" op de plek, en drie
    regels eronder staat wat het doet.

    **Kopen is de eerste schrijver van een grootboekregel die er al was**
    (`kind: 'item'`, sinds §79, nooit gebruikt). Dezelfde discipline als het
    openen van een plek: saldo gelezen ín de transactie, en de voorwaarde dat de
    plek leeg is staat in de UPDATE zelf. En "te koop" is **vijf** dingen —
    keeper-made, geprijsd, passend, zichtbaar, nog vrij — die de catalogus
    allemaal vraagt en waarvan de koopfunctie er eerst maar vier vroeg. §17's
    regel 4 in zijn makkelijkst te vergeten vorm: een lezer gebruikt de
    SQL-voorwaarde, een schrijver de boolean, en het moeten er evenveel zijn.

    **De Keeper mag nog steeds iets cadeau doen**, met `placeItem`: dat kost
    niets en schrijft geen regel. Die twee wegen naast elkaar zijn het verschil
    tussen *verdiend* en *gekocht*, en allebei horen te bestaan.

    Ten slotte sloot deze ronde de val van §79: **een veld kan nu een sleutel
    krijgen.** Een veld dat in díé bewerking nieuw is heeft een sleutelvakje,
    voorgevuld vanuit het label; de sleutel van een bestaand veld staat er als
    tekst en is nooit te wijzigen, want hernoemen zou elke al ingevulde waarde
    in `entries.fields` wees maken. Zonder dat vakje was elke soort die in een
    kamer past iets van de ontwikkelaar gebleven in plaats van van de Keeper.

81. **Een Keeper tekent met zijn eigen naam, en alle spelerspaginas staan bij
    elkaar.** §81. Nick, ronde 42: *"Keepers moeten gewoon hun account naam
    krijgen als ze een edit maken, niet 'Keeper edit' maar 'KEEPERACCOUNT
    edit'"* — en: *"is er een pagina waar ik alle speler-profielen kan zien?"*

    **Dit keert regel 5 van §18 om, en dat is met opzet.** Die zei: *een feed
    drukt `attributed()`-labels af, en een Keeper is altijd het woord van de
    Keeper.* Eén stem voor de tafel (§11), en verdedigbaar zolang er één Keeper
    is die nooit zijn eigen bewerking terug hoeft te zoeken. Maar een logboek
    beantwoordt **wie dit deed**, en een gedeeld woord is daar geen antwoord op.
    Sinds §21 deed de aanwezigheidsstrip het al andersom (`presenceNames`
    drukt de accountnaam af, met de redenering: *een kamer vol identieke
    "Keeper"-pijlen is geen naam*). Nu doen de feeds mee, en staat er één regel
    in plaats van twee.

    Wat **niet** verandert: een Keeper draagt geen karakter (§18), dus een
    `character_id` dat een rij toevallig meedraagt blijft voor hem genegeerd. En
    het woord *Keeper* blijft overal staan waar het een **rol** noemt — "een
    Keeper kan dit terughalen uit de prullenbak", "dit dossier is van de
    Keeper", de Keeperkant, Keepernotities. Het onderscheid is precies dat: een
    rol is geen handtekening.

    De parameter `keeperWord` is uit `displayNames`, `displayNameOf` en
    `attributed` verdwenen in plaats van ongebruikt te blijven staan. Een dode
    parameter is een uitnodiging om hem weer te gaan gebruiken.

    **En de hal.** §77 gaf iedereen een voordeur op `/spelers/<slug>` en liet de
    gang weg: je kwam er alleen via het lijstje (dus terwijl iemand toevallig
    online was) of via je eigen *Jij*. `/spelers` is nu die gang — bewust dun:
    een naam, de onderzoeker die diegene draagt, en een deur. Wie iemand is
    staat achter de deur, en §77's regel over panelen geldt net zo goed voor een
    lijst ervan. Het blijft de stille helft van dezelfde vraag: het lijstje
    (§76) zegt wie er *nu* is, de hal zegt wie er *zijn*.

82. **Een etalage: je kunt niet sparen voor wat je niet kunt zien.** §82. Nick,
    ronde 43: *"Can we get something browseable, something that shows all the
    things you can buy?"* §80 zette de catalogus ín de plek-kiezer, en dat
    beantwoordt de goede vraag op het goede moment — *wat past er op déze
    plank* — maar het is de verkeerde vraag voor wat een speler tussen twee
    sessies doet: alles bekijken, iets uitkiezen, ervoor sparen.

    `/winkel` toont daarom **alles wat je mag zien**, gegroepeerd per soort plek
    en per groep goedkoopste eerst. Wat je niet kunt betalen **staat erbij, met
    de prijs** — dat is precies waar een etalage voor is. Wat je al hebt zegt
    dat. Wat uniek is en al op andermans plank ligt zegt dát: een lantaarn die
    weg is, is niet zomaar afwezig uit de wereld.

    **Kopen vanuit de winkel is een gemak, geen tweede weg.** De knop zoekt de
    eerste vrije open plek van de juiste soort (`landsIn`) en koopt daar; de
    aankoop zelf gaat door `buyFurnishing` met alle vijf zijn voorwaarden. Een
    winkel die iets kan kopen wat de kamer zou weigeren is een winkel die liegt.
    Daarom staat er ook geen knop op een rij die `takenElsewhere` draagt, ook al
    heb je de munten en een vrije plank.

    **Eén beurs per onderzoeker.** Wie er twee draagt, kiest bovenaan voor wie
    hij koopt (`?kamer=`), en de twee beurzen raken elkaar nooit. De Keeper
    draagt niemand (§18) en heeft dus geen beurs en geen knoppen: hij leest een
    prijslijst, want hij zet dingen zelf neer. Iemand die nog geen onderzoeker
    draagt krijgt een **andere** zin dan de Keeper — die van hem zegt dat hij
    dingen zelf neerzet, en dat is voor een speler zonder kamer niet waar.

    Twee dingen gingen pas stuk onder een echte hand, en allebei zijn het §17's
    regel 4 met tijd ertussen. De soort *Huisraad* bleek **niet op te slaan**:
    migratie `0028` zette hem neer met een id dat niet zijn slug is — de enige
    rij in het archief waar dat zo is — en `renameTypeSlug` vergeleek het
    gewenste adres met het **id**, viel door zijn eigen kortsluiting heen en
    vond zichzelf als "al bezet". En `one_of_a_kind`, sinds §80 een vinkje in
    Beheer, liet `room_slots.claim` achter zoals die stond: de winkel bood iets
    aan dat de kamer weigerde. `updateType` vult die claims nu bij als de vlag
    aan gaat, en haalt ze weg als hij uit gaat.

83. **Een grootboek dat open ligt, een knop die de hele tafel betaalt, en twee
    grenzen die te strak stonden.** §83. Nick, ronde 44: *"Spelers mogen het
    'grootboek' ook wel kunnen inzien. Er moet een makkelijke 'mass coin
    distribution' komen voor keepers… Je mag best vaker hetzelfde ding in je
    kamer hebben staan. Ik wil dat je sommige items op meerdere verschillende
    plekken mag plaatsen."*

    **Het grootboek is van iedereen die de kamer mag zien.** §79 hield het voor
    de Keeper, wat een speler zijn eigen boekhouding ontzegde: het saldo staat
    bovenaan de pagina en waar het vandaan komt niet. Wat van de Keeper blijft
    is het formulier eronder, en dat onderscheid woont nu in `Grootboek` zelf —
    de lijst en de deur zijn één ding, en een pagina die de ene zonder de andere
    moest doorgeven is een pagina die het vergeet.

    En er kwam een sluier mee. Een regel met `kind: 'item'` draagt de **naam**
    van het artikel dat gekocht is, dus wie hier binnen mag maar dat ding niet
    mag zien las die naam alsnog — precies het lek waar `SlotView.veiled` voor
    bestaat. `ledgerOf` krijgt de kijker erbij en zo'n regel komt versluierd
    terug, met dezelfde zin als de plek zelf (§76: de variatie is het lek). Het
    **bedrag** blijft staan: het saldo is al zichtbaar en de plek zegt al dat er
    iets ligt, dus het getal vertelt niets nieuws — en een regel die verdween
    zou zelf de verklapper zijn.

    **De uitdeling.** `/uitdelen` is één getal bovenaan, één reden, en één regel
    per kamer: een vinkje, de naam, het saldo, een bedrag. Het globale getal
    overschrijft élk bedrag eronder, ook wat net met de hand is getypt — dat is
    letterlijk wat Nick vroeg, en het is iets wat je moet zien gebeuren. Het
    vinkje is het *wie* en het bedrag het *hoeveel*, en het globale getal raakt
    alleen het tweede: iedereen op 3 zetten mag niemand stilletjes weer
    uitnodigen die er net af gehaald was. Een 0, een leeg vak en een uitgezet
    vinkje betekenen alle drie hetzelfde, want als één ervan wél een regel
    schreef was die ene een val.

    `handOut` schrijft **gewone grants** — geen nieuwe soort regel, geen tweede
    tabel: een uitdeling *is* een handvol grants, en het grootboek hoort ze zo
    te tonen. In **één transactie**, en dat is de hele reden dat het geen lus
    over `grant` is: alles lukt of niets lukt. Een half uitgedeelde beloning is
    erger dan een weigering, want de Keeper ziet aan het scherm niet wie wel en
    wie niet.

    **Het lijstje is van kamers en niet van spelers**, en dat is de ene plek
    waar Nicks zin en het archief uit elkaar lopen. Een beurs hoort bij een
    onderzoeker (§79), dus wie er twee draagt heeft er twee, en een scherm dat
    mensen opsomde zou er stilletjes één van moeten kiezen. Elke regel leest
    *Onderzoeker (speler)*: de naam die hij zoekt staat er, en wat er
    aangevinkt wordt is het ding dat munten houdt.

    **Dubbel mag.** §80 weigerde een tweede leesstoel in dezelfde kamer met de
    redenering "twee identieke lampen op één raster is ook niemands bedoeling".
    Die redenering was van ons. Wat blijft is `one_of_a_kind`: één voorwerp is
    één ding in de wereld, de vraag wordt aan het hele archief gesteld en de
    unieke index op `claim` staat gewoon nog. Voor al het andere wordt er nu
    **niets** gevraagd — en de lezers verschoven mee, want dit is §17's regel 4:
    `catalogueFor` houdt alleen nog claims weg, en in de winkel is `owned` een
    *label* geworden in plaats van een weigering.

    **Een ding mag op meerdere soorten plek passen.** Het veld `plek` werd een
    `multiselect`, met migratie `0029` die de velddefinitie én elke opgeslagen
    waarde omzet — allebei of geen van beide, want een `multiselect` weigert bij
    het opslaan alles wat geen lijst is en de eerstvolgende bewerking had anders
    stil elke plek gewist. `plekKinds` is de ene lezer, en die **blijft een losse
    string aannemen**: een archief dat de migratie niet gezien heeft hoort niet
    stilletjes zijn kamers te verliezen, en dat kost één regel. In de winkel is
    `landsIn` daardoor **per soort plek** — een klok die aan de muur én op het
    bureau kan, met een volle muur en een vrij bureau, is in de ene groep niet te
    koop en in de andere wel — en zo'n ding staat in beide groepen.

    Drie dingen gingen pas stuk onder een echte hand of onder een test die ernaar
    zocht, en alle drie zijn ze dezelfde fout. De **plek-kiezer** vroeg het veld
    als enige in SQL (`json_extract(...) = 'bureau'`) en vond een lijst niet
    meer: hij bood ineens niets aan terwijl `placeItem` alles nog accepteerde.
    Die voorwaarde heet nu `plekMatches`, staat naast de andere lezers, en wordt
    van allebei de kanten getest. Het **grootboek** sorteerde op `id` terwijl
    zijn eigen comment `rowid` zei — en `lib/ids.ts` maakt een id uit zestien
    willekeurige bytes, dus twee regels in dezelfde seconde kwamen in geen enkele
    volgorde terug. Dat stond er sinds §79 en was onzichtbaar zolang alleen de
    Keeper keek; een uitdeling landt per ontwerp in één seconde. En de **e2e
    helpers** wezen naar `#field-plek`, dat er na de meerkeuze niet meer is: één
    `setPlekken`/`expectPlekken` in `tests/e2e/helpers.ts` is nu de plek die dat
    weet.

84. **Geld heeft een stem, een saldo is geen prijskaartje, en een deur ziet
    eruit als een deur.** §84. Nick, ronde 45: *"Make the UX of this shop and
    player page immaculate."* Drie agents liepen de feature eerst na — een
    routekaart, de visuele taal, en een echte doorloop met screenshots op
    1440 en 390 px, in licht en donker. Wat ze vonden was niet één fout maar
    één soort fout, drie keer: **wat er gebeurt is nergens te zien.**

    **Het saldo en de prijs waren hetzelfde component.** Allebei de `.stamp` —
    schuin, rood, omlijnd. *Wat je hebt* en *wat iets kost* stonden in één
    oogopslag naast elkaar en waren niet uit elkaar te houden, en een koop
    veranderde dus één cijfer in een ding dat eruitziet als een prijskaartje.
    De `.stamp` blijft van de prijs; de **beurs** (`components/kamer/Beurs.tsx`)
    is nieuw en staat rechtop, in gewone inkt, met een munt ervoor. Nooit rood —
    rood is in dit archief de kleur van een stempel en van de Keeper, en een
    saldo is geen van beide. Eén tekening op alle vier de plekken waar het getal
    staat; er waren er drie.

    **En hij staat in de hoek van élke pagina.** Dat is de tweede helft: de hele
    meta-progressie hing aan één menu-item (*Jij*), je eigen kamer was drie
    klikken diep en die van een ander vier, en `/you` noemde de winkel en de hal
    en **nooit de kamer of het saldo**. Nu is het één klik, vanaf overal — en
    daarmee is de beurs de voordeur van de feature geworden. Hij is *absent*
    voor wie niemand draagt en voor de Keeper (§18), niet leeg: een blokje dat
    "0 munten" zegt tegen iemand zonder kamer belooft een kamer. Op een canvas
    staat hij niet (§34: het glas krijgt het scherm), en op de kamer en de
    winkel ook niet — die dragen hun eigen, en twee keer hetzelfde getal naast
    elkaar is wat de browser als eerste liet zien.

    **Elke uitgave spreekt nu, vóór en na.** Vooraf zegt de knop wat hij kost
    (*Openen · 2 munten*, *Kopen · 5 munten*); achteraf zegt een melding waar
    het ding heen is (*"Staande klok ligt nu op je muur. −2 munten"*) met een
    deur die op díé tegel landt. Er is nog steeds **geen bevestigingsdialoog**,
    en dat is een keuze: dit doe je twintig keer op een avond, en een dialoog
    zou frictie zijn in plaats van zorg. De doorloop mat 174 ms tussen klik en
    nieuw saldo — de snelheid was nooit het probleem, de stilte was.

    **"Nog 3 munten nodig" was een `title`.** Drie keer, letterlijk in de code,
    alle drie op een uitgeschakelde knop — en een `title` bestaat niet op een
    telefoon. Het is de zin die iemand aan het sparen zet en dus precies de
    verkeerde om te verstoppen. Eén `shortfall()`, één woordsleutel, zichtbare
    tekst, en de knop is wég in plaats van dood: een knop die niets doet naast
    een zin die zegt waarom is er één te veel.

    **De winkel is één lijst met een filter, en dat keert regel 82 om.** §82
    groepeerde per soort plek met een goede reden — een etalage lees je naar
    wáár een ding zou gaan — en §83 haalde die reden onderuit zonder het te
    merken: sindsdien past een ding op meer dan één soort plek, dus stond het in
    twee groepen met twee knoppen, en ná één koop zei de ene rij *"geen vrije
    plek van deze soort"* en de andere, over hetzelfde voorwerp, *"staat al in
    je kamer"* boven een levende knop. Nu staat een ding er één keer, met chips
    die zeggen waar het past, en de chips erboven filteren. **De ontdubbeling
    zit in de pagina en niet in `shopFor`** — `landsIn` blijft per soort plek —
    en dat de bestaande `winkel.test.ts` zonder één wijziging groen bleef, is
    daar het bewijs van.

    Verder: **één vorm per betekenis.** `box` was de kist én de winkel én het
    tabblad *wat je al hebt* én de lege cover van elk stuk huisraad; `book` was
    de plank én de catalogus; `plus` was neerzetten, geven, uitdelen en de
    uitdeelknop. Vijf nieuwe vormen (`coin`, `shop`, `gift`, `shelf`, `desk`) en
    een tabel in `components/kamer/plekWords.ts` die een test leest. En **één
    werkwoord**: de knop onder het grootboek zei *Uitgeven*, wat het
    tegenovergestelde betekent van wat hij doet — uitgeven doe je in de winkel,
    de Keeper **geeft**.

    Drie dingen gingen pas stuk onder een test of een hand, en het zijn alle
    drie dingen die niemand ziet slijten. Het **donkere spelerspalet** droeg de
    rode inkt van het *lichte* palet, ongewijzigd: 2,4 tegen 1 op een gesloten
    tegel, waar `keeperDark` die correctie allang had. Een prijs van 30 munten
    was 's avonds niet te lezen, en een uitgeschakelde en een ingeschakelde
    *Kopen* waren bijna dezelfde kleur — nu is een tegengehouden primaire knop
    **omlijnd in plaats van gevuld**, wat een vorm is en dus in alle vier de
    paletten tegelijk werkt. De **FAB** hing over de onderste 132 px van elke
    pagina terwijl er 84 px vrij werd gehouden, en dekte op een telefoon de
    laatste Kopen-knop van de winkel af. En de rij deuren op *Jij* haalde de
    44 px niet — gevonden door de e2e-zaak die élke zichtbare knop opmeet in
    plaats van een lijstje dat iemand bijhoudt.

    En één die precies §83's les herhaalde: **`landsIn` landde op de verkeerde
    plek terwijl het comment erboven het goede zei.** Een ding dat op een muur
    én een bureau past hoort op de eerste vrije plek te komen, en dat is de
    vroegste sport van de ladder — maar de code liep over `PLEK_KINDS` (muur,
    plank, bureau, kist) terwijl `ROOM_SHAPE` met bureau begint. De klok hing
    dus aan de muur terwijl het vrije bureau twee sporten eerder kwam.
    `shopFor` vult `landsIn` nu in de volgorde waarin het de plekken toch al
    afloopt, en de rij leest die sleutelvolgorde.

    En één die alleen een schil kon vinden: **de beurs in de hoek kneep een
    prikbord smaller.** `.live-strip` is een `float: right` in de hoofdkolom en
    een tweede float ernaast neemt nóg een stuk van die kolom; op een landkaart,
    tijdlijn of stamboom gebeurt dat niet (die zijn `.page-canvas` en de strip
    hangt er absoluut), maar een wand is nog niet op §34's canvas-schil. Een
    muur die smaller wordt is een muur waarop elke coördinaat verschuift, en
    twee inkt-zaken op de telefoon liepen erop vast — twee tests die niets met
    geld te maken hebben.

    Twee kleinere dingen die bij de opruiming hoorden: het breekpunt van
    `kamer.css` en `spelers.css` stond op 560 px waar de hele app (en
    `useIsPhone`) 767 zegt, zodat die twee pagina's tussen 561 en 767 px in
    bureaubladopmaak stonden terwijl de app zichzelf een telefoon noemde; en
    `.spelers-kop` werd gedefinieerd in `app/kamer.css`, dat `/spelers` niet
    importeert — het landde alleen doordat Next de stylesheets samenvoegt.

    **Wat er níét veranderde**, en met opzet: rule 78 (het archief rekent nooit
    een bonus uit — ook niet "even handig" in een melding), §76 (de beurs toont
    alleen je eigen saldo, nooit dat van een ander), en §79's regel dat het
    saldo de som van het grootboek is — het scherm animeert naar het getal dat
    de server teruggeeft en telt zelf nooit mee.

85. **Eén rijhoogte, één zin per gebeurtenis, en een deur met een werkwoord
    erop.** §85. Nick, ronde 46: *"Next half please"* — de tweede helft van het
    kamer-contract, die hij in ronde 45 zelf had afgesplitst. Waar §84 over
    **geld** ging, gaat deze over **vorm**: het raster, het grootboek, de
    plek-kiezer, de uitdeler, de hal en de spelerspagina. En het resultaat van
    allebei de helften staat sinds deze ronde in `docs/kamer-contract.md`, veertig
    genummerde regels, naar het model van `docs/canvas-contract.md`.

    **Het raster brak bij de eerste koop.** Een tegel had alleen een
    `min-height`, dus de rij groeide mee met wat erin lag: een gevulde tegel met
    een staande omslag van 3:4 werd in een kolom van 9,5rem ruim tien rem hoog
    en duwde de drie lege tegels naast zich mee omhoog. Het brak dus precies op
    het moment dat je er het meest naar keek. Drie dingen repareren dat samen:
    `grid-auto-rows` zet de hoogte één keer voor alle vier de staten, een
    gevulde tegel draagt een **vierkante** uitsnede (die bestond al sinds ronde
    19 en is nooit hoger dan breed), en een lege of gesloten tegel draagt een
    groot gedempt merk — de soort plek, respectievelijk een slot — op de plek
    waar de omslag zou staan. De maat hoort bij de **tegel** en niet bij de
    klasse: `.plek .plek-cover`, want een winkelrij draagt dezelfde klasse op
    3rem breed, en een hoogte van 6,4rem maakte daar van elk omslagje een
    staande streep. Dat was in de kamer, waar de regel klopte, onzichtbaar.

    **Een grootboekregel is een zin over iets dat gebeurd is.** Er stond `Plek:
    plank` voor een geopende plek, een kale artikelnaam voor een koop, en voor
    een gift wat er getypt was met een liggend streepje als dat niets was: drie
    vormen, geen van drieën een zin. Nu *Plank geopend*, *Prent demo gekocht* en
    *Van de Keeper: Startgeld*, alle drie sjablonen in `lib/words.ts`. De
    vierde vorm — een versluierde regel — is met opzet níét meeveranderd: §76's
    regel is dat elk versluierd ding dezelfde ene zin zegt, en een eigen vorm
    zou juist de tell zijn. En het bedrag ernaast is geen `.stamp` meer: §84
    gaf het saldo een eigen vorm juist omdat een stempel een *prijs* betekent,
    en hier stonden er drie onder elkaar waarvan één met een `+` ervoor. Drie
    rode kaartjes lezen alle drie als een waarschuwing. Het boek staat
    bovendien ingeklapt op de laatste drie regels — `ledgerOf` haalt er vijftig
    op, dus onder een kamer van twaalf tegels stond een lijst van vier kamers
    lang.

    **De plek-kiezer opent op het tabblad dat iets te zeggen heeft.** *Wat je al
    hebt* is de goede eerste vraag zodra het antwoord bestaat, en een
    doodlopende weg daarvóór — dus op ieders eerste avond. Het omschakelen
    gebeurt nadat het antwoord binnen is en precies één keer per opening: een
    tabblad dat onder je hand terugspringt zodra je typt is erger dan een leeg
    tabblad. De twee chips werden bovendien **echte tabs** — ze droegen
    `aria-pressed`, het patroon van een *filter*, waarvan je er geen of drie
    tegelijk aan kunt hebben, terwijl er hier altijd precies één aan is — en het
    zoekvak staat nu boven allebei in plaats van in één van de twee.

    **De uitdeler zegt in een plakkende voet wat de knop gaat doen.** De som
    stond als `.tiny` aan het eind van de knop geplakt en las als een breuk
    (*"36 munten / 12"*): het ene getal dat een Keeper nakijkt vóór hij drukt,
    kleiner dan al het andere op de pagina en op een tafel van twaalf onder de
    vouw. Nu *36 munten naar 12 kamers*, met de knop ernaast, op 390 px in beeld
    zonder scrollen. Daarbij zebra-strepen, `accent-color` op de vinkjes, het
    saldo náást het bedrag in plaats van aan de andere kant van de rij, en de
    FAB die wijkt — twee dingen rechtsonder is er één te veel.

    **De hal kent jou en een onderzoeker wijst naar zijn kamer.** Je eigen regel
    staat bovenaan met *(jij)* erachter, met kolomkoppen erboven en het woord
    *online* voor wie er is — dat laatste uit de roster die de schil toch al
    heeft (§76), dus zonder tweede lijst en zonder tweede stel regels over wie
    genoemd mag worden. De panelen van een spelerspagina staan in een andere
    volgorde (**Kamer, Karakters, Aanwezig, Dossiers, Bijdragen**; de oude was
    die waarin ze per ronde gebouwd zijn en zette het paneel dat meestal leeg is
    vooraan), het kamerpaneel vult de hele eerste rij en elke regel erin is een
    deur die je kunt zien. En `/e/<slug>` van een gedragen onderzoeker draagt
    één regel onder de kop — de beurs en *Naar de kamer* — want dit was het
    enige scherm in het archief dat over een onderzoeker gáát en zijn kamer
    nergens noemde.

    **Elke deur draagt een werkwoord**, geen bestemming: *Naar de kamer*, niet
    *Kamer*. Een deur die naar zijn bestemming genoemd is leest als een kop. De
    deur van *Recente bijdragen* ging weg in plaats van er een te krijgen: hij
    wees naar `/`, de feed van iedereen, dus hij beloofde "meer hiervan" en gaf
    iets anders — §77's regel dat er niets in een paneel staat dat geen eigen
    pagina heeft, geldt ook voor de deur eronder.

    **De kiezer sprong élke keer naar de catalogus.** De nieuwe regel vraagt
    `items.length === 0`, en `items` begint leeg omdat er nog niets *gevraagd*
    is — wat niet hetzelfde is als "niets gevonden". In de tel tussen het
    openen en het antwoord was die voorwaarde dus altijd waar, ook voor iemand
    met een plank vol. Het is letterlijk de fout die §80 één tabblad verderop
    al had opgeschreven (daar staat `shop === null` voor "nog niet gevraagd",
    met een comment erboven waarom dat geen lege lijst is). Zes bestaande zaken
    vielen er tegelijk over om, en ik had ze bijna afgedaan als specs die een
    oude vorm aannemen — wat er in deze ronde ook twee wáren. **Als een handvol
    tests tegelijk omvalt, tel dan eerst hoeveel er gelijk hebben.**

    **Acht fouten onderweg, zeven gevonden door een screenshot, een meting of
    een test.**
    De vierkante uitsnede die in de winkel lekte (hierboven); het kruisje op een
    gevulde tegel dat er wél stond, 44 bij 44 was, en `--ink-muted` op
    `--paper-raised` binnen een tegel van `--paper-raised` — met een
    `opacity: 0` die pas bij hover wegging, terwijl een telefoon geen hover
    heeft; een `span 2` op het kamerpaneel dat een nieuw gat maakte in plaats
    van het oude te dichten (het is het kórtste paneel, dus het liet een gat ter
    hoogte van zijn buurman — `1 / -1` heeft geen buurman); een tegelknop die
    niet in een tegel paste en over twee regels brak, precies de uitlijning
    kapot die de ronde vroeg; en een winkelrij die op 390 px drie dingen in zes
    centimeter propte.

    En twee in de **tests zelf**, die hier staan omdat ze een soort zijn. De
    e2e-zaak van §84 riep "ligt onder iets anders" over een knop waar niets mee
    was: hij sloeg een knop over waarvan de ónderkant voorbij 844 px lag en
    mengde daarmee twee stelsels — `boundingBox()` meet vanaf de bovenkant van
    het *document*, `elementFromPoint` vanaf die van het *venster* — en hij hield
    geen rekening met de tabbalk, die de onderste 56 px vastgeplakt bezet.
    Zolang de knoppen 34 px waren viel daar niets in; zodra deze ronde ze op
    44 px zette landde er één in die band. De zaak scrollt elke knop nu eerst
    naar het midden van het scherm, wat een duim ook doet. **Een test die zegt
    dat het stuk is terwijl het werkt, is net zo duur als een die zwijgt terwijl
    het stuk is.** En twee zaken kochten elkaars huisraad, omdat
    `getByTestId('winkel-koop').first()` op de bovenste rij van de winkel klikt
    en de winkel het hele archief is.

    **Wat er níét veranderde**, en met opzet: rule 78 (het lopende totaal in de
    uitdeler is een echo van de vakjes die je zelf net ingevuld hebt, nooit een
    som over het archief), §76 (een versluierde grootboekregel hield exact
    dezelfde zin terwijl de drie andere zinnen werden), §79 (geen scherm rekent
    een saldo uit), en de tap-vloer bleef aan de **pagina's van deze feature**
    hangen in plaats van aan het hele archief — precies zoals §69 6.1 hem aan de
    tekenvlakken hing. Voor een scherm waar het bewijs niet voor geleverd is,
    verandert er niets.

    Eén ding uit het contract is bewust níét gebouwd: de catalogusrij is geen
    `WinkelRij` geworden. `CatalogueEntry` mist precies de zes velden die de
    kiezer al wéét omdat hij vóór één bepaalde plek staat, dus hergebruik vroeg
    om een verzonnen `landsIn` en een `unique: false` die niet waar hoeft te
    zijn. **Een leugen in een type is duurder dan een tweede component**, en hij
    wordt pas duur op de dag dat iemand hem gelooft. Wat het contract er echt
    mee wilde — dezelfde staten, dezelfde woorden, dezelfde zichtbare
    tekortzin — is er wel.

86. **Wie beslist of iets gemáákt wordt, beslist niet of het gevónden wordt.**
    §86. Nick, ronde 47: *"Get all characters unticked and then we can search.
    There will be more then 50 characters in this thing and coins belong to a
    character. Also right now you can only give to a character that is
    currently being used."*

    **Die laatste helft was niet waar, en de klacht was toch terecht.**
    `handOutTargets` leest `user_characters` — élk karakter dat een account
    *houdt*, niet het karakter dat het speelt, en niets met online-zijn te
    maken. Wie er drie draagt had altijd al drie rijen. Maar achter elke naam
    stond alleen de speler, dus een tafel van vijf spelers met acht karakters
    las als vijf spelers die toevallig acht regels vulden. **Een waarheid die
    nergens staat, is er voor de lezer niet.** Er staat nu bij of iemand het
    karakter draagt, of hij het nu speelt (*niet in gebruik*), en of er
    helemaal niemand achter zit.

    **Wat wél niet kon** is een karakter dat aan geen enkel account hangt: een
    figuur die de Keeper geschreven heeft en nog niet uitgedeeld. Die heeft
    geen kamer, want §17/§18 zegt dat een karakter een naam is die iemand
    draagt. Dat blijft staan; er kwam één uitzondering bij, en het is een
    **handeling**: op het artikel van zo'n onderzoeker staat voor de Keeper een
    knop *Een kamer geven*. Geen soort die er automatisch een krijgt, en
    vooral: geen kamer die ontstaat doordat iemand naar een artikel kíjkt —
    sinds §85 leest `roomSummary` op élk artikel of er een kamer is, dus een
    versoepeling van `getOrCreateRoom` had het hele archief een beurs gegeven.
    `roomIdFor` leest en maakt niets; de knop schrijft. En de kamer wordt
    **dicht** geboren (§48), want hij is van de Keeper.

    **De lijst begint leeg.** Bij twaalf rijen is "alles staat aan" een gemak;
    bij zestig is het een val — je raakt er vijf aan en vijfenvijftig mensen
    die er niet bij waren krijgen munten. Dus niets aangevinkt, een zoekvak dat
    op de naam van de onderzoeker én die van de speler filtert, een telling die
    over de héle lijst gaat (juist om te zeggen wat er búiten beeld aanstaat),
    en *Alles in beeld* — dat laatste geen extraatje maar wat §83's
    oorspronkelijke vraag ("iedereen krijgt drie omdat ze samen iets gedaan
    hebben") één gebaar houdt. En het globale bedrag raakt **alleen wat
    aanstaat**: anders staan er vijfenvijftig bedragen klaar die niets doen tot
    de dag dat iemand een zesde vinkje zet en er een getal in blijkt te staan
    dat hij nooit getypt heeft. Het vak heet daarom niet meer *Voor iedereen* —
    dat was het één ronde lang en het was niet meer waar.

    **De fout die de ronde zijn naam geeft.** `getOrCreateRoom` stelde de
    dragervraag vóór de opzoeking: `if (!owner) return null;` stond boven de
    `SELECT`. Vier rondes lang was dat hetzelfde antwoord, want zonder drager
    bestond er toch geen kamer. Zodra §86 er één kon openen werd die volgorde
    een stil lek: de kamer stond in `rooms`, de uitdeler vond hem — die leest
    `rooms` — en élke andere lezer (`roomSummary`, `viewRoomBySlug`, de deur op
    het artikel) zei dat er geen was. Je drukte op de knop en er gebeurde
    zichtbaar niets. Dit is §83's les voor de derde keer, nu in de volgorde van
    twee regels binnen één functie. En de unit-test die ik ervoor geschreven
    had vroeg `roomIdFor`, dus keek precies langs de kapotte functie heen; de
    e2e-zaak die de knop indrukt en daarna kijkt of er íéts veranderd is, vond
    hem in één run. **Een test die de kortste weg naar het antwoord neemt,
    bewaakt de weg niet die de app loopt.**

    Drie kleinere, alle drie uit een screenshot: het `<label>` om een vinkje —
    het raakvlak dat op dit scherm het vaakst aangeraakt wordt — was 25 px, en
    viel buiten élke meting van §84 en §85 omdat het geen knop en geen
    invoervak is (**het lijstje van *soorten* is ook een lijstje**); elke lege
    bedragrij las als een nul door een `placeholder="0"`, exact de fout die
    ronde 45 één kolom verderop had weggehaald; en de lijst kreeg eerst een
    eigen schuifvenster, dat met zestig rijen de onderste rij halverwege
    afsneed tegen de plakkende voet — een halve rij leest als kapot en niet als
    "er is meer".

    **Wat er níét veranderde:** rule 78 (het lopende totaal is een echo van je
    eigen vakjes), §79 (een kamer hangt aan een artikel en het saldo is de som
    van het grootboek — er kwam geen tweede soort kamer bij, alleen een tweede
    manier om er één te laten ontstaan), en §76 (de hal krijgt geen kolom met
    saldo's, hoe goed hij ook zou passen).

87. **Een voordeur is geen touwtje.** §87. Nick, ronde 48: *"De portaal
    paginas zijn bij de keeper en bij de spelers hetzelfde, dit moet niet. Ook
    deze moeten los zijn van elkaar."*

    Elk overzicht was al gescheiden — de tabel draagt `keeper_only` sinds §75
    en `listOverzichten` filtert erop. Behalve de voordeur: `/wiki` gaat langs
    `getHomeOverzicht`, en dat is een **opzoeking** (`WHERE is_home = 1`). §46
    zegt met zoveel woorden dat een lijst op kant filtert en een opzoeking
    nooit, en die regel is goed: een Keeper loopt van beide kanten over een
    touwtje naar één artikel, en dat artikel moet er dan staan, anders is het
    archief vanaf één kant kapot. Maar er was precies één rij met `is_home`,
    dus las de Keeper op zijn eigen kant de voorpagina van zijn spelers en had
    hij nergens een plek om te schrijven wat de tafel niet mag weten.

    **Een voordeur is geen record waar je naartoe loopt — het is de pagina van
    de kant waar je stáát.** Dat is het onderscheid dat §46 niet maakte, en het
    is de reden dat die regel hier een uitzondering krijgt in plaats van een
    reparatie: `getOverzicht` en `getOverzichtBySlug` filteren nog steeds niet
    op kant, want daar geldt de redenering wél.

    Migratie `0030_voorpagina_per_kant` zet er één bij voor de Keeper, met een
    vaste id, een eigen slug (de index erop is uniek; hij is nergens zichtbaar
    want `overzichtHref` geeft `/wiki` voor élke thuispagina) en een **lege**
    tekst — Nicks keuze: geen kopie van wat de spelers hebben, want die tekst
    is van hen. `getHomeOverzicht` draagt nu `sideCondition`, wat voor een
    speler niets doet en ook niets hoeft te doen: §44 haalt de Keeperkant er
    voor hem al uit. De terugval blijft wat hij was — `/wiki` valt terug op de
    lijst als er niets is — en vangt er één geval bij op, een kant zonder
    voorpagina. **Terugvallen op die van de andere kant zou precies de fout
    zijn die deze ronde weghaalt**, dus dat gebeurt niet en er staat een test
    op.

    Twee dingen die onderweg misgingen, allebei in de *test* en niet in de
    app — de wijziging zelf is klein genoeg dat het meeste werk in het bewijzen
    zat. **`/keeper` is geen tuimelschakelaar**: hij brengt je naar de
    Keeperkant, en terug gaat met `/api/keeper/flip?side=player` (§57's "één
    weg naar de kant", die ik zelf niet gelezen had). En **`locator.blur()` is
    niet het gebaar dat opslaat** — de lead van een overzicht slaat op als je
    ergens anders klikt, zoals elk los tekstvak in het archief; de bestaande
    zaak twee blokken hoger deed dat al goed, en hem kopiëren was beter geweest
    dan iets nieuws verzinnen.

88. **De naam in de tab is de naam van het archief.** §88. Nick, ronde 49:
    *"De naam van de website in de tab is nu 'Zeeland Case Files' Kan dit 'LoW:
    Land over Water Archief' worden? en is het mogelijk om ergens het icoontje
    aan te passen daarvan op de website zelf? In beheer voor keepers wellicht?"*

    De eerste helft was geen wens maar een fout die al sinds ronde 1 open
    stond. De naam van het archief is een **instelling** — Beheer → Site, rij 1
    van `site_settings` — en drie schermen lazen hem al: de mast in de
    zijbalk, de kop op Start, en de export. De `<title>` van de app niet: die
    stond als letterlijke tekst in `app/layout.tsx`. Je kon het archief dus
    hernoemen, alles in beeld volgde mee, en de tabbalk bleef de oude naam
    dragen zonder dat iets zei waarom. Dat is §17 regel 4 in zijn zuiverste
    vorm — **twee lezers van dezelfde zin, en er is er één die niet meebeweegt**
    — en de reden dat het vier rondes kon overleven is dat er niets van breekt.

    `generateMetadata()` in de wortel-layout leest nu `siteIdentity()`
    (`lib/admin/identity.ts`), en die functie is met opzet dom: één `SELECT` op
    rij 1, geen sessie, geen zichtbaarheidsvraag. De wortel draait **boven de
    inlogpoort**, dus ook voor de loginpagina, en een `getSessionUser()` daar
    zou élke pagina in het archief door de sessielaag trekken voor een titel.
    Een archiefnaam is ook geen geheim: wie op de deur staat mag weten waar
    hij aanklopt.

    Het **icoontje** is de tweede helft en staat in Beheer → Site, naast het
    logo, met hetzelfde gebaar: kiezen, vervangen, verwijderen, en dezelfde
    `fitUpload`-ceiling. Twee keuzes die geen van beide vanzelf spreken:

    - **Leeg betekent "val terug op het logo".** Wie een logo heeft geüpload
      wil dat vrijwel zeker ook in zijn tab, en twee keer hetzelfde plaatje
      moeten aanleveren is precies de kleine wrijving waar een Keeper nooit aan
      toe komt. De volgorde is favicon → logo → niets.
    - **Plakken blijft van het logo.** §30 vangt een geplakte afbeelding op
      deze pagina op; met twee plakbare vakken zou Ctrl+V een raadsel worden.
      Eén toetsaanslag kan maar één ding betekenen.

    De asset zelf zit **wel** achter de inlog — `/api/assets/[id]` geeft 401
    zonder sessie — en dat blijft zo. Een uitgelogde browser krijgt het
    standaardicoon van de browser, een ingelogde het jouwe. De tab is geen plek
    om een rechtenregel voor op te rekken.

    Migratie `0031_eigen_naam_en_icoon` zet de kolom `favicon_asset_id` erbij
    en hernoemt het archief — maar **alleen als het nog de naam van ronde 1
    draagt**. Die ene `WHERE name = 'Zeeland Case Files'` is de hele afspraak:
    een Keeper die zijn archief zelf een naam gaf, houdt die naam, en een vers
    archief krijgt de nieuwe naam rechtstreeks uit de seed en heeft niets te
    hernoemen. Er staat een test op, want dat is precies het soort `WHERE` dat
    een volgende migratie achteloos breder maakt.

89. **Een uitgelogde lezer ziet niets, en wat een lezer niet mag zien bestaat
    voor hem niet.** §89. Nick, ronde 50: *"I need to be sure that passwords
    cannot be leaked, keeper pages are invisible for all, not even through
    inspect element. No account → you can only see the login page. Players →
    can only see and change the things that they can, no exploits. Keepers →
    full access."*

    Vijf sloten, en geen ervan is de layout:

    - **Geen wachtwoord is leesbaar.** Alleen een argon2id-hash; de Keeper geeft
      een nieuw wachtwoord en niemand leest een oud (zie *A note on password
      recovery*). Een nieuw wachtwoord sluit alle andere sessies. Keepers zijn
      gelijken: niemand zet het wachtwoord van een andere Keeper.
    - **Uitgelogd is niemand.** `viewableCondition(_, null)` en
      `visibleEntryCondition(null)` zijn `0 = 1`. Er is geen publieke kant.
    - **Elke pagina is haar eigen poort.** `requireViewer()` staat bovenaan elke
      `page.tsx`; `middleware.ts` stuurt een browser zonder sessiecookie naar
      `/login` en weigert een schrijf naar `/api` van een andere herkomst. De
      layout redirect ook, maar een layout is geen slot: Next rendert hem niet
      opnieuw bij een navigatie en hij beslist niet of de pagina eronder
      rendert.
    - **Wat je niet mag zien, bestaat niet — ook niet als versie, chip of
      terugzet-knop.** Een versie uit een Keeper-tijdperk staat niet in de lijst
      van een speler en is niet terug te zetten; een `@`-naam die een
      onzichtbaar artikel raakt, geeft geen dode chip terug; een ongebruikte
      server action bestaat niet (een geëxporteerde `'use server'`-functie is
      een endpoint, ook zonder knop).
    - **Een document wordt schoongemaakt waar het binnenkomt** (`cleanDoc`), en
      de CSP laat de browser niets laden dat niet van het archief komt.

    `docs/sloten.md` is de dreigingstabel; `tests/unit/sloten.test.ts` bewaakt
    hem.
