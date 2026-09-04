# DECISIONS

Open UX and technical choices, and one line of reasoning each. Where the brief
said "pick the option with fewer taps", that is what won.

---

**Cover crop is stored as focal point + zoom, not four edges.**
`{ x, y, zoom }` in 0..1 carries the same information as a rectangle but maps
directly onto CSS (`object-position` + `transform-origin` + `scale`), so a card,
a thumbnail and the full-width entry header all agree without recomputation. The
uploaded image is never cropped on disk, so the crop can be redone forever. The
crop tool is a square viewfinder; cards render 3:4 around the same focal point.

**No "Save" button anywhere, and no confirm dialog on delete.**
Autosave at 800 ms plus an undo-able soft delete. Fewer taps, and §12 forbids
confirm dialogs for reversible actions.

**Revisions coalesce within five minutes for the same author.**
Autosave would otherwise write a revision every time someone paused typing, and
History would be unreadable. A distinct author, a five-minute gap, or an explicit
note (a restore) always starts a new revision.

**Search ranks names in JS and only sends body text to FTS5.**
A campaign wiki is a few thousand short strings, so scoring every name in memory
is both fast and far more forgiving than an FTS prefix query — it survives typos
("harbourmster"), diacritics and initialisms ("wkl" → Westkapelle Lighthouse).
Body text still goes through FTS5, as a clearly separate second section.

**Visibility filtering was built in Phase 1 even though the UI is Phase 3.**
One `visibleEntryCondition()` sits in front of every query — lists, search,
autocomplete, backlinks, feeds, previews and direct URLs. Retrofitting that later
is exactly how something leaks. Keeper notes are stripped server-side before the
props are serialised, so they never reach a player's HTML.

**The type of an existing entry cannot be changed.**
Not in the brief, and the default answer is no. Easy to add later if it turns out
players file things under the wrong chip.

**Dates are free text, not a date picker.**
In-world dates are things like "the night of 9 February 1934" and "three days
after the drift". A calendar widget would fight the fiction.

**Tag counts are computed in JS rather than with `json_each`.**
Keeps the visibility rule in exactly one place, at a cost that does not matter at
this size.

---

## Phase 2

**Empty type tabs are hidden, so Overview carries a universal add box.**
§7 hides empty tabs, but §15's flow 3 asks to add entries "from the People tab
search" — which on a brand-new case would not exist yet. Overview's box adds an
entry of any type; each type tab appears as soon as it has something in it, with
its own scoped search. Fewer taps than a tab strip full of empty tabs, and
nothing becomes unreachable.

**One tab per entry type that has entries, not only the six §7 names.**
People merges characters and investigators exactly as the brief says. Factions,
events, lore and session reports get a tab of their own when a case holds one,
rather than being filed somewhere invisible.

**Whoever opens a case is assigned to it.**
Otherwise flipping a case to "assigned" would lock its own author out until a
Keeper intervened.

**A new board card lands on a free patch of cork, not exactly at the centre.**
§8 says the viewport centre. Taken literally, the second card buries the first
and its pin becomes unclickable. Cards land at the centre when it is free and
otherwise step outward on a grid, preferring spots still on screen.

**A drag on empty cork pans; shift-drag draws a marquee.**
§8 asks for both "pan with drag on empty cork" and "multi-select with … a
marquee". Panning is the far more frequent action, so it gets the bare drag.

**Dropping a string is hit-tested by geometry, not by what is under the cursor.**
A card overlapping another, or a transparent overlay, would otherwise swallow the
drop and silently lose the connection.

**A drag that moves a card does not also open its entry.**
The card follows the cursor, so a drag ends with press and release on the same
cover — which the browser reports as a click. Movement past a few pixels
suppresses it.

**A board save whose response is older than the screen is discarded.**
Every local change bumps a counter; a merge response carrying a stale counter is
thrown away rather than applied. Without it, a save that was already in flight
when a drag started would snap the card back to where it was.

**Board strings are drawn on one large SVG layer aligned to board coordinates.**
A zero-sized `<svg>` with `overflow: visible` does not reliably paint in
Chromium, and offsetting every path to a small viewport would be worse.

**Pointer handlers read their refs before calling a state updater.**
`setViewport(current => ({ ...current, x: pan.current.from.x + … }))` reads the
ref when React runs the updater, not when the event fired — by which time
pointerup has set it back to null, and Strict Mode runs it twice for good
measure. Every handler now computes its numbers from the ref up front and passes
plain values into the updater.

**`E2E_DEV=1 npm run test:e2e` runs the same specs against `next dev`.**
The default run builds for production, where React does not double-invoke
updaters — so a whole class of development-only bug is invisible to it. Worth a
slower run after touching anything that holds state in a ref.

**Board cards carry no `data-entry-id`.**
That attribute is what summons the hover preview, and a floating copy of the
card you are already looking at is noise on a corkboard. Chips in prose keep
theirs.

**The viewport is stored on the board but only applied on first load.**
`boards.state` carries it as §8 says, but yanking another player's view to
wherever you scrolled would be hostile.

---

## The board's editing suite

**One inspector, docked to the board, rather than a menu on every element.**
Strings need a label, a colour and a delete; cards need crop, photo and delete.
Two separate mechanisms — a kebab on each card and a popover on each string —
would be two things to learn and twice the clutter, so there is one bar at the
foot of the cork showing whatever is selected. The per-card kebab is gone.

**Selecting works on a phone; the first tap selects and the second opens.**
§8 turns *dragging* off under 768 px, not selecting. Without selection the
inspector would be unreachable there, which would mean no cropping, no photos
and no deleting on a phone at all. A card's cover and name still open the entry
— one tap later. The guard is asked at click time, not render time: the
pointerdown that precedes a click has already selected the card, so a boolean
prop would always read "selected" by then.

**String colours are a palette of six, stored as a key.**
`red · ink · blue · green · gold · violet`, all at home on this board. Storing
the key rather than raw CSS keeps a client from putting arbitrary text inside a
style attribute, and lets the palette move with the theme.

**String labels are HTML chips above the cards; the string itself stays behind.**
A string running behind a card is what a real board looks like, but its label
has to stay readable when two cards sit shoulder to shoulder — and a chip you
can tap beats eleven pixels of SVG text with a stroke around it.

**A newly drawn string selects itself.**
The inspector is then already open on the label field, which is what you wanted
to type next anyway.

**A card's picture is stored as focal point and zoom, exactly like an entry
cover.** Same shape, same maths, same gestures — drag to reposition, scroll or
pinch to zoom. Notes and photo cards converge: any card that is not an entry can
carry a picture, gain one later, be re-cropped, or have it taken off again.

**A string's colour is set on the element, and the CSS class must not name one.**
An SVG presentation attribute loses to any CSS rule, so `.board-string { stroke:
… }` silently overrode every per-string colour — the label picked it up, the line
did not. The class now carries width and cap only. The test that missed this
asserted the `stroke` attribute rather than the painted colour; it reads
`getComputedStyle(...).stroke` now, which is the thing a player can see.

**Thumbnails are a wrapper that clips, never a class on the image.**
A crop with zoom above 1 puts a `transform: scale()` on the `<img>`, and a
transform paints outside the element's own box. As a bare class on the image
there was nothing to clip against, so one zoomed cover sprawled across the whole
home feed. `<Thumb>` in `components/Cover.tsx` is now the single way to draw a
small cover, and `tests/e2e/thumbnails.spec.ts` pins the invariant.

**Undo now cancels queued deletions.**
Deletions are sent to the server as explicit ids, and the merge applies them
after the upserts. Undo restored the card locally but left its id in the queue,
so the next save deleted it again on the round trip. `forgetDeletions()` clears
the queue whenever undo runs. `tests/e2e/board-editing.spec.ts` removes a string,
undoes, and reloads.

---

## Borders, per-place crops and string anchors

**A border is a thing, not a line style.**
Ten treatments, each a physical object from the period rather than a CSS
keyword: a photograph's white margin (people), a warrant card's rounded double
rule (investigators), a map's dashed edge with a compass rose (places), an
evidence tag's perforation and reinforced hole (objects), a ledger's thick-and-
thin rule (clues), a censor's hatching (abnormalities), gummed tape across the
top corners (factions), an album page's photo corners (events), a foxed old page
(lore), and plain. One neutral ink throughout — the type colour already carries
the icon, and several of the seeded colours are too pale to read as a hairline.
Every treatment draws inside a border-box card, and anything laid over the
picture is a pseudo-element with `pointer-events: none`, so switching one never
reflows a grid, moves a pin, or steals a click. The keys in the database stayed
the same; only the drawing and the labels changed.

**A single click on a board card never opens it.**
§8 said the cover opens the entry. In use, one stray click on the wall threw you
off the board, and every drag started with a click. One click now selects — the
inspector's "Open entry" is right there — and a double-click on the picture or
the name opens. Photos open full size the same way. On a phone, where double-tap
is unreliable, the first tap selects and the second opens, as before.

**A press only reaches the undo stack once something moves.**
Every press on a card used to push a snapshot, so a double-click left two
"drags" in undo that did nothing. The snapshot is taken at press time and pushed
only when the pointer has moved a few pixels.

**A board card inherits its entry type's border and may override it.**
Inheritance is the default and the picker says what it is inheriting
("Border: from type (Dashed)"), so a wall of cards reads by type until someone
deliberately makes one different. A note with no entry behind it simply picks its
own; there is nothing to inherit.

**The entry shows the whole picture; only lists crop.**
A tall portrait, a wide map and a scan of a letter are all different shapes and
all worth seeing whole. Lists are the opposite problem — they need one uniform
shape or the grid falls apart — so the 3:4 crop moved behind a "Crop for lists"
control and stopped being what the entry page shows. The cover column widened to
220 px to give a whole picture somewhere to be legible.

**Every placement keeps its own crop.**
The entry's crop is the default; `case_entries.crop` is that case's own; a board
card's `crop` is that card's own. A face cropped tight on one board leaves every
other list alone, and clearing a placement's crop falls back to the entry's. The
file on disk is still never touched, so any of them can be redone forever.

**A lead with no card is a bare pin — a thing on the wall, not a loose end.**
The first cut stored a string end dropped on cork as a bare coordinate. That
was invisible until you happened to drop something there, could not be moved
without moving the string, could not be labelled, and could not have a second
string tied to it. The right mouse button was floated for placing one, but the
right button is the context menu on every platform and fighting that is a losing
game. So a pin is now a *card kind*: a red head to run string from and a paper
tag to drag it by and write on. There are two ways to get one, and neither is a
mode or a modifier: the toolbar's **Pin** button pushes one in at the centre of
the view, and dropping a string end on bare cork pushes one in right there and
ties the string to it. Old boards with coordinate ends still load; moving such
an end turns it into a pin.

**An unlabelled pin comes out with its last string.**
Pull the only string off a bare pin that nobody has named and the pin goes too —
nobody leaves an empty pin in the wall on purpose. A labelled pin stays put,
because someone wrote on it.

**Filing an entry into the case is offered, not done.**
A board hanging off a case is that case's wall, so pinning someone to it usually
means they belong in the file — but not always, and quietly filing things is how
a case file fills up with things nobody put there. The offer is a toast with one
button, it only appears when the entry is genuinely not filed yet, and it is
asked once. Turning a note into an entry on a case board asks the same question.

**The picture frame can be switched off.**
A card that is only a name and a line of text is a legitimate thing to want on a
board, and hiding an empty grey frame is better than filling it with a
placeholder nobody chose.

**Cards are served a 900 px picture, not the 400 px thumbnail.**
§6's 400 px thumbnail is right for the feed's 42x56 and the search list, and
wrong for a 3:4 card that can be 260 CSS px wide on a 2x screen with a 2x crop
on top — that is an eightfold blow-up, and it looked like one. There are three
variants now: `thumb` (400) for the small lists, `card` (900) for every card on
a page or a board, `full` (1600) for the entry page, the lightbox, the crop
frames and any board card zoomed past 1.05. The card variant is made at upload
and, for pictures uploaded before it existed, once on first request.

**A case file has the same picture box as an entry.**
`cases.cover_asset_id` was in the schema from the start but nothing drew it.
The dossier now has the entry's cover editor on the left — whole picture, "Crop
for lists" — and `cases.cover_crop` squares it off on the Case Files grid.

---

## Dutch, and a polish pass

**The interface is Dutch, and the glossary is the contract.**
`GLOSSARY-NL.md` fixes the words: a wiki entry is a *fiche* (an index card in
the archive), a case is a *dossier*, a board is a *prikbord*, a bare pin a
*punaise*, red string *draad*, and the Keeper stays the Keeper. Informal `je`,
sentence case, real ellipses. Code comments, identifiers, database keys and the
developer docs stay English. §12's Phase-4 "Dutch toggle" would now mean
extracting these strings into a table; that was not built, because a toggle
nobody asked for is a setting, and §16 says no.

**The seed owns the seeded types' words until a Keeper can edit a type.**
Labels, field labels and select options are updated to the Dutch seed on every
start, and entries filed with the English option values ("alive") are brought
over once ("levend"). Phase 3's type editor must switch this off the moment it
lands, or it would overwrite a Keeper's edits.

**One string between any two things.**
A second string between the same pair is never what anyone meant. The model
drops the later twin (keeping the first with its label and colour), and on the
board dropping onto an already-joined pair selects the existing string and says
so, rather than silently doing nothing.

**Home lists the open dossiers.**
The "Phase 2 arrives later" placeholder had outlived Phase 2 by three commits.

**Filter chips scroll sideways on a phone.**
Two rows of types and four of tags were pushing the first card below the fold.
On a desktop they still wrap.

**Cards that are links lift on hover; buttons and chips darken.**
Small, consistent, and honoured `prefers-reduced-motion`. A case card is a
working surface with its own menu, so it stays put.

**The boards index shows a scrap of cork with a pin per card.**
A board is the one thing here that is a picture rather than a text, and the list
looked like a list of files. The counts come from SQLite's `json_array_length`
over the stored state, so nothing is parsed on the way to the index.

---

## Phase 3 — Keeper tools

**A section revealed to named players writes nothing to the feed.**
§9 says hidden things must not leak into activity feeds. The home feed has one
rule per *entry*, not per section, so a row saying "de Keeper onthulde iets in
Het Gemaal" would tell everyone who can see the entry that a secret exists — and
which entry to go looking at. A section switched to `all` is genuinely public
news and does get a row; a reveal to named players is silent, and those players
find it by opening the entry.

**A player is handed only the sections they may read.**
`listSections` filters on the server, so a hidden section is not in the props,
not in the HTML, and not in the client bundle's hands. The reveal lists and the
pickers are Keeper-only for the same reason: who a secret was told to is itself
a secret. Golden flow 5 asserts the raw HTML, not just what is on screen.

**The reveal picker offers cases as a shortcut, not as a stored rule.**
§9 asks for "all assigned investigators of case X". Storing that as a live rule
would mean a reveal that silently widens when someone joins the case later.
Instead the case chip ticks its members' boxes right now, and what is stored is
the list of people. What the Keeper saw is what the Keeper gets.

**Approving a proposal applies it as the Keeper.**
An approved edit runs back through `updateEntry` with the Keeper as the actor —
which is the only way it lands at all, since the entry is locked and any other
actor would just queue it again. It also means the revision history records the
change honestly, with the Keeper as the one who let it in.

**The review queue diffs per field, not the whole entry.**
A proposal is a per-field patch (§6's last-write-wins), so the queue shows only
the fields it actually touches, each with what the entry says now beside what
the proposal would make it. Fields whose before and after match are dropped —
they are usually the ones the player never touched.

**A type with entries under it cannot be deleted.**
The entries would have nothing to be. There is no "move them all somewhere else"
flow, because that is a second screen for a rare act: refile them first, and the
button only appears once the count is zero.

**The seed stops writing type labels the moment the Keeper can edit them.**
Until this phase the seed owned those words, and rewrote them on every start —
which is how the English archive became Dutch without a migration. With the type
editor in place that would overwrite a Keeper's work every restart, so the
changeover now runs exactly once behind a marker row in `schema_migrations`.

**Admin is eight panes behind one chip strip.**
§11 asks for eight. One long scroll buries the useful ones and eight nav entries
is a second navigation to learn, so they share the chip idiom the case dossier
already uses: wraps on a desktop, scrolls sideways on a phone. Every pane is
rendered on the server; the chips only choose which is on screen.

**The accent colour repaints the stamp red, and nothing else.**
§11 asks for an accent colour. Letting a Keeper repaint the whole palette is a
theme editor; letting them change the one rubber-stamp red is the setting they
actually want, and it cannot make the archive illegible.

**The board's case tray is a list of rows, not a grid of cards.**
Building a board for a case meant typing every name into the search box from
memory. The drawer shows what the case holds that is not on the wall yet — drag
one onto the cork and it lands where you dropped it, or tap it and it lands in
the middle, which is the only thing that works on a phone. It started as a
column of 3:4 cards and two of them filled the drawer; a 34 px thumbnail and a
name fits ten, and ten is the point. No border treatments in there either: at
that size they are noise, and the type is spelled out on the row.

**A soort fiche decides what its page is made of, not just which fields it has.**
The type editor could rename a soort and give it fields, but every page was the
same five blocks in the same order. "Leden van deze factie" was a thing a Keeper
could only get by typing every member into a list by hand and then keeping it
true. So a soort now owns its page: which blocks, in what order, and two kinds
of list it can have as many of as it likes — one filled by hand, one that fills
itself out of a field on other fiches. Rearranging a page is now a five-minute
job in Beheer rather than a change to this repository, which is the whole point.

**The five built-in blocks can be hidden but never deleted.**
An empty `blocks` column has to mean "the standard page" — that is what every
existing soort has — so it cannot also mean "a page with nothing on it".
`cleanBlocks()` puts back any built-in a saved list is missing, which makes the
column safe to trust everywhere downstream and makes a page with no body to type
in unreachable, however the JSON got mangled. Hiding a block is a flag, so
turning it back on returns it to where it was in the order.

**A hand-filled list stores its values in `entries.fields`, under its own key.**
It could have had a table. It did not need one: a list of chosen fiches is
exactly what an `entry_links` field already is, so a list block borrows the
field's picker, the field's chips and the ordinary autosave, and gains the
field's best property for free — remove the block and put it back and the values
come with it. The key is assigned once, from the heading, and never changes
again: renaming "Bondgenoten" to "Vrienden" must not orphan what is filed there.

**A self-filling list is a query, run per page, and nothing is stored.**
The alternative was a reverse-index table kept in step on every save, which is a
second source of truth and a new way for the archive to be quietly wrong. A
campaign wiki is a few thousand rows; one indexed scan per block per page view
is nothing, and the list is never stale. It goes through
`visibleEntryCondition()` like every other read, so a Keeper-only member is
absent from a player's page rather than greyed out on it.

**The JSON path is validated *and* bound.**
The field a derived list follows comes from a Keeper's dropdown, but it is stored
JSON and reaches SQLite as a path. It is checked against `/^[a-z0-9_]+$/` on the
way in and passed as a bound parameter on the way out — either alone would do,
which is why it does both. The `json_type` guards around `json_each` are the
other half: handed a field holding a bare string where a link was expected,
SQLite raises "malformed JSON" and takes the page with it, so the query never
walks anything it has not first established is an array.

**Every word the interface repeats lives in one file, with the Keeper on top.**
`lib/words.ts` is a list of about forty terms — fiche, dossier, prikbord,
punaise, the menu, the main buttons, the names of the Beheer tabs — each with the
Dutch the archive shipped with as its default. Beheer → Woorden overrides any of
them. Only the *changes* are stored: a word that merely agrees with its default
is dropped on save, so clearing a box is how a word is undone, and improving a
default still reaches an archive that had once re-typed it. The file is pure so
client components can import it; `lib/admin/words.ts` is the half that touches
the database.

**Boards are live, and the merge rule did not have to change to do it.**
`mergeBoardState` had merged by id, kept cards the sender had never heard of and
applied deletions explicitly since phase 2 — the hard half of collaborative
editing, with 42 tests pinning it down. What was missing was any reason to
*look*: a client only learned about someone else's card when it happened to save
its own. So this is one open line per board and two rules about when to listen to
it, and not one line of the merge changed.

**Server-sent events, not a WebSocket.**
SSE is a `Response` with a stream in it, so it lives in an ordinary App Router
route handler, behind the same session cookie and the same `getBoard()` check as
every other read. A socket would need a custom Node server, which means a new
Dockerfile, a new dev script and a second thing to authenticate — real cost, for
a channel that only ever needs to talk one way. The client writes back over
plain POSTs. If entry bodies ever go collaborative, that calculation changes and
this is the paragraph to revisit.

**The wire carries a signal, never the document.**
"The board moved" is broadcast; each client then asks for its own copy. That
looks like an extra round trip and it is: it is also the only way to keep rule 1.
Board cards are *resolved per viewer* — a card whose entry the viewer may not
see comes back stamped MISSING — so one merged state fanned out to every
listener would hand a player the name of a Keeper-only fiche through a channel
nobody thinks of as a query. The extra GET is the price of not having two
visibility rules.

**Presence lives in memory and never touches SQLite.**
Who is at a wall and which card they are holding is worth nothing a second after
it stops being true, and writing it would mean a table churning once per drag
under a database whose whole point is that it fits in one file. It is a `Map` in
the process, reaped after thirty seconds so a closed laptop stops holding a card.
One container is the deployment (see the README), so the hub is the whole of the
infrastructure; `lib/boards/live.ts` is also the single file that would have to
grow a real bus if that ever stopped being true.

**A person's colour is a hash of their account, not their arrival order.**
"The green one is Anneke" has to stay true across boards, sessions and reloads,
which a palette handed out in join order cannot manage. Six pigments that all
read on cork.

**Nothing lands while a hand is on the board.**
Two guards, and between them the whole reason live editing is not maddening:
*paused* (a drag, a crop, a string, a marquee) and *dirty* (unsaved local work).
A change that arrives during either is remembered, not dropped, and applied the
moment the board goes quiet — a dirty client is about to save anyway, and the
save returns the merge. Without this, someone else adding a card yanks the card
you are holding back to where it started.

**Last write still wins on a single card, and that is the right answer.**
Two people dragging the same card is the one case this does not solve, and
solving it properly means a CRDT. Cards are discrete objects that people
naturally divide between themselves, so the fix is not consensus but *sight*:
a coloured border round whatever someone else is holding, which is what a
spreadsheet does for the cell someone else has selected. You can see it coming.

**Fixed while building the tray: `.brd` decorations anchored to the wrong box.**
Tape, photo corners, the evidence-tag hole and the compass rose are
pseudo-elements, so they position against the nearest *positioned* ancestor.
`.brd` deliberately does not set `position: relative` (that would override
`.board-card`'s `absolute`), so a bordered element that was not positioned
itself threw its decoration into whatever ancestor was — in the tray, the punched
hole landed in the drawer's header. `.brd:not(.board-card)` now positions the
host.

---

## Dependencies

§13 says to ask before adding a dependency. Three additions, all of them serving
requirements rather than adding features. Say the word and any of them can go.

**`@fontsource/source-serif-4`, `@fontsource/source-sans-3`,
`@fontsource/archivo-narrow`** — §12 asks for a humanist serif, a legible sans
and a condensed grotesk, all self-hosted; §13 forbids fonts from a CDN. These are
build-time asset packages: the woff2 files are bundled into the app, and nothing
is fetched at runtime. The alternative was shipping a system font stack, which
would not have matched §12.

**`@node-rs/argon2` instead of `argon2`** — the same argon2id, but it ships
prebuilt binaries for Windows, macOS and Linux, so `npm install` never needs a
native toolchain. §13a is explicit that a dependency which fails to compile on
Windows or macOS should be swapped for one that does not.

Deliberately *not* added, though each would have been the obvious reach:

- a positioning library (Floating UI, tippy.js) — the `@` / `[[` popup and the
  chip preview are positioned from the caret rect by hand;
- an icon package — `components/Icon.tsx` is 25 hand-written paths;
- a zip library — `lib/zip.mjs` is a small deflate writer and reader;
- `next/image` — assets are already resized by `sharp` and served by our own
  route handler behind the login.
