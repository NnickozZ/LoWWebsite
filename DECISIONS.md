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

## Phase 4 — Rights, characters, maps

**Rights are two dials, not a role system.**
Who may *look* and who may *touch*, each Iedereen / Gekozen personen / Privé.
Groups, roles and inheritance were all considered and all rejected: a campaign
has six people in it, and "these three" is a row of checkboxes, not a group to
name and maintain. Both dials default to Iedereen — the archive was open before
this and stays open until someone closes a door on purpose.

**Editing implies viewing, and the Keeper's secrecy is a separate layer.**
An edit grant on something you cannot see is nothing (`canEdit` asks `canView`
first), so nobody can be handed a pen for a page they are not allowed to read.
§9's *zichtbaarheid* (Keeper-only, revealed to chosen players) is not folded
into the dials: it is the Keeper's, they are the owner's, and a fiche is shown
only when *both* say yes. Two layers with one owner each is simpler than one
layer with two.

**Rights follow the account, not the character.**
A character is a name a person wears. If a private dossier were shared with
"Onderzoeker Van Dijk", it would open or close with a costume change — and a
player with two characters could see it as one and not the other. The
checkboxes show the character beside the account name so the owner can still
pick "Bram, who plays Van Dijk", but what is stored is Bram.

**Look-but-not-touch on a fiche is a proposal; on a dossier or a prikbord it is read-only.**
A fiche is prose, and §10 already had a queue for edits that need a second pair
of eyes — so a reader's change goes there, and the owner judges it on the fiche
itself instead of the Keeper in Beheer. A prikbord is a hundred small moves and
a dossier is a set of buttons; a proposal for "move this card left" is absurd,
so those simply lose their tools (403 from the API, no buttons on screen).

**One rule module, applied on the way in and on the way out.**
`lib/access.ts` gives every reader a SQL condition (`viewableCondition`) and
every writer a boolean (`viewerCanEdit`). The condition is ANDed into the two
visibility conditions the rest of the code already used, so the sixty places
that read entries did not need to learn a new rule — rule 1 of the README
simply got a second clause. A right enforced only in the UI is decoration.

**A Keeper can bolt the dials, not override them per person.**
The one thing a Keeper needed beyond "sees everything" was to stop an owner
from re-opening what the Keeper closed (or closing what the Keeper needs open).
`access_locked` freezes the dials as they stand; the owner still sees them, and
sees why they are grey. Per-person Keeper overrides would have been a third
layer for a case nobody described.

**The two prikbord buttons exist because a private wall must never be public first.**
"Create, then find the setting" leaves a window in which everyone saw the
board in the list. Openbaar / Privé at the moment of making it closes that
window and is one tap either way. Dossiers and fiches did not get the same
treatment: a fiche is empty at birth and a dossier is a name, so the window is
harmless there.

**A character is worn, not recorded.** *(Reversed in Round 11 — see §18b
below. The reasoning is kept because the old behaviour is still the fallback
for every row written before the change.)*
Attribution is resolved at display time from `users.active_character_id`, not
written into each activity row. Switching character therefore re-labels a
person's past as well — and for a campaign wiki that is the honest reading:
the person did those things, and this is who they are being. Recording the
character per act would have meant two names for one person in one feed, and a
migration for every existing row. The account name stays one tooltip away, and
Beheer shows who plays whom.

The thing that broke it was two windows. "Two names for one person in one
feed" was listed above as a cost; once a browser window may choose its own
onderzoeker it is the *point*, because it is two investigators at one table.
Round 11 writes the karakter into the row and keeps this paragraph as the
fallback: NULL means "written before the archive asked", nothing was
backfilled, and such a row still reads exactly as it read the day before.

**A Keeper is always the Keeper.**
`activeCharacter()` returns nothing for a Keeper and `addCharacter` refuses
them, so no log row can ever say "Van Dijk onthulde iets" when it was the
Keeper. The brief said Keepers always have Keeper selected; the code cannot say
otherwise.

**The switch lives under the masthead on a desktop and on the Jij page on a phone.**
It had to be visible without being in the way. Under the masthead it reads as a
byline — "Je speelt als Van Dijk" — which is what it is. The phone tab bar had
no room, and a person switches character once an evening, so the Jij tab is
where the wardrobe lives; the first fiche tied on is worn at once, so nobody has
to find a second button to start being someone.

**A map is a picture; pins are fractions of it.**
No tiles, no projection, no coordinates: the Keeper uploads a drawing and a pin
is `(x, y)` in 0..1 of that drawing. A redrawn map keeps every pin; a map twice
the size keeps every pin. The picture is kept to 3200 px rather than a cover's
1600 because a map is the one image people zoom into.

**A pin is a fiche or a note, and a fiche pin is behind the fiche's rules.**
The lighthouse on the map *is* the lighthouse's fiche, so the map is another
reader and `listPins` runs behind `visibleEntryCondition`. A Keeper-only fiche
pinned on the map would otherwise announce itself by its icon. Notes are for
everyone: they are the map's own margin.

**Whoever set a pin owns it; everyone may set one.**
A map with a hundred spelden is a shared thing, and "anyone may move anything"
would have made it a shared mess. Owner-or-Keeper for move, edit and pull is the
same shape as the rights on everything else, without a third pair of dials.

**The legend is remembered in the browser, per map.**
Which kinds of pin are switched off is a viewing preference, not a fact about
the archive, so it lives in `localStorage` under the map's id and is read
inside a `try` — a private window simply starts with everything on.

**The dossier prompt became a sheet because a toast is easy to miss.**
"Also file this in the dossier?" is the whole point of pinning to a case wall,
and a line in the corner was ignored. `ui.confirm()` is the app's own yes/no
sheet — never the browser's `confirm()`, which cannot be styled, cannot be
worded, and blocks the tab — and any screen may now ask a question with it.

**Sorting and filtering live in the URL.**
The bar writes `?sort=&status=&show=` and the page reads it back, so a filtered
list survives a reload and can be sent to someone. Filters are chips, not
dropdowns: a chip shows its state, and several of them show the whole state at
a glance. A single-choice group behaves like a radio that can also be switched
off; a multi-choice group joins its values with commas.

**Every filter is applied behind the visibility rules, never instead of them.**
"Van mij", "vertrouwelijk", "op een landkaart" — each is another `AND` on a
query that already carries `visibleEntryCondition`, so a filter can never show
someone a thing they could not open; `list-filters.test.ts` checks each one
from a player's seat as well as the Keeper's. The Keeper's secrecy filter is
simply ignored for a player who types it into the URL.

**"Landkaart", not "kaart".**
The board already calls its index cards *kaarten*, and a menu with two
different *Kaarten* in it is a menu nobody can use. *Landkaart* is
unambiguous, fits the island, and is one word in the list for a Keeper who
disagrees.

---

## Phase 5 — Live: hands on the wall, shared text

**A pointer frame is ephemeral and goes round the document entirely.**
Where someone's mouse is, and where the card in their hand is *right now*,
travels as its own event on the board's existing line — sixteen a second at
most, fanned out to everyone else, remembered by nobody. It is not a fact about
the board, so it never touches the merge, the tombstones or the save; the drop
that follows is what makes the position true. That keeps rule 3 ("the wire
carries a signal, never the document") intact: positions of cards are not
per-viewer secrets, and a frame contains nothing that is.

**A carried card stays where the hand left it until the save has been pulled.**
The obvious thing — clear the ephemeral position on mouse-up — snaps the card
back to where it started for one round trip and then jumps it forward. So the
receiver keeps carried positions until the `change` signal from *that* tab has
been pulled, and only then lets the document take over. A tab that dies
mid-drag is caught by a timeout.

**The drop saves now; typing still waits.**
A card everyone has just watched travel must not then lag its landing by a
debounce, so a drop goes out at once. Typing in a note card keeps a (shorter)
debounce because a keystroke is not a moment anyone is waiting for.

**Shared text is Yjs, over the same kind of line a board uses.**
A CRDT is the only honest answer to two people in one paragraph: last-write-wins
per field (§6) is fine for a name, and unacceptable for prose. Yjs is small,
proven, and Tiptap ships bindings for it. The transport is the one the boards
already have — server-sent events down, POSTs up — so there is still no second
server, no socket, no new port on the VPS, and every message goes through the
same session cookie.

**The room's membership is the visibility rule.**
Fanning one CRDT document out to everyone in a room would break README rule 1
if "everyone" were a loose word. It is not: a room admits exactly the viewers
`visibleEntryCondition`, `canSeeSection` and `visibleCaseCondition` admit, and
a hidden section has its own room — so a Keeper drafting "what is really in
the cellar" is seen by other Keepers and by nobody else, until it is revealed
and the players who may read it join that room. Keeper notes are deliberately
not a room.

**The archive stays the truth, and the room follows it.**
`entries.body` is what search, revisions, links, exports and the feed read, so
the room writes itself back through `updateEntry` like any other save — as the
last person who typed — and keeps its own CRDT state beside it only so a tab
that was away merges instead of clobbering. When the body is written around the
room (a revision restored, a proposal approved), the room is rewritten to match
and open tabs see it as one more update. The other direction never happens.

**Looking is live too; proposing is a copy.**
Someone who may see a fiche but not type in it gets the same live text,
read-only — they watch it change — and a button that opens their own copy to
edit and send as one proposal. The old behaviour (a proposal per autosave) would
have flooded the owner with fragments; a copy sent once is what "voorstel"
means.

**The document goes into the HTML.**
The page hands the editor the Yjs state as a prop, so the text is there before
the line is open and nothing flashes empty. It also means the room is warm by
the first keystroke. A Yjs update is idempotent, so the `sync` that follows
does no harm.

**Exactly one Yjs on the server, and none in the server-side render.**
Bundled, the server ended up with a copy of Yjs per chunk group — three — and
Yjs says so at start-up because a document that crosses copies fails its own
`instanceof` checks. `yjs` is now a server external (one module in Node's
cache) and the live editor is loaded on the client only (`next/dynamic`,
`ssr: false`; Tiptap renders nothing on the server anyway).

**Fixed by React's development double mount, twice.**
Strict Mode mounts, unmounts and mounts again, which is also what a reconnect
does. It found (1) a room's `leave()` deleting the *new* line's subscription
because both lines share a tab id — now only the line that owns the entry may
remove it, on boards as well; and (2) `awareness.setLocalStateField` being a
silent no-op once the local state has been cleared, so a remounted tab never
announced itself — the state is now set whole. Both would have bitten in
production on any reconnect.

## Phase 6 — Nick's list of 5 September

**"Fiche" became "artikel" by changing defaults, not keys.**
The word list was built for exactly this: the defaults in `lib/words.ts` now
say artikel, the keys still say `entry`, and a Keeper's override still wins.
The hard-coded sentences that had grown outside the list were moved into it
or rewritten, so rule 8 is closer to true than it was. Comments and internal
names keep saying fiche where they always did; renaming the code would have
been churn without a reader.

**"Personen" is a data change, so it has a marker.**
The soort's label lives in `entry_types`, which the Keeper can edit, so the
seed cannot simply overwrite it. A one-time marker (`seed:personen-label`)
renames "Personages" to "Personen" on the archives that still have the shipped
word and leaves any other word alone — the same trick as the Dutch-labels
changeover.

**A dossier's chosen few are "Toegewezen"; an artikel's stay "Gekozen
personen".**
The old dossier called its view list "toegewezen onderzoekers", and that is
the word that fits a case: people are assigned to it. On an artikel or a
prikbord the owner *chooses* who may look, which is a different act. The
`AccessEditor` takes the word as a noun (`nouns.some`) rather than knowing
about dossiers; `assigned` is in the word list so the Keeper can change it.

**A `Sheet` binds its handlers once and reads the latest `onClose` through a
ref.**
The focus-restore effect depended on `onClose`; every caller passes an inline
arrow, so the effect tore down and re-ran on each render — each keystroke
handed focus to the button that opened the sheet, then remembered *that*
button as the place to return to. A ref is the standard cure and fixes every
sheet at once; the alternative, asking each caller to memoise, would have
been forgotten by the next one.

**Pins are drawn in stage pixels, never inside the scaled picture.**
Counter-scaling a child of a transformed layer keeps its *size* right and its
*resolution* wrong: the browser rasterises the layer at the picture's scale,
so at 4x a pin was drawn at a quarter size and blown up. The pins now sit in
a layer of their own, positioned from the same view state, and the picture
alone is transformed. The e2e asserts a pin's box is the same before and
after zooming.

**"Speld zetten" is a list in the flow, not a dropdown.**
A floating suggestion list inside a sheet that scrolls is two scrolling things
fighting; the sheet grew a scrollbar for eight results. The list is now part of
the sheet, so the sheet grows with it, and the note and the new-artikel
choices are rows in the same list rather than a second tab. The note's text is
typed on the pin once it stands — one decision per screen.

**The legend folds, and starts folded.**
It covered a corner of the picture on every visit for a choice most visits
never make. Folded by default, remembered per browser (not per map: a person
who likes it open likes it open everywhere), and the folded button says "n uit"
when it is hiding something so a filtered map never looks like an empty one.

**Filters live behind one button; the ones that are on are chips.**
Six rows of chips between a title and its cards were the whole problem. The
groups moved into a panel (popover on a desktop, sheet on a phone) with a
badge for how many are on, and active filters are shown on the page as chips
with a × — visible status, hidden machinery, which is the shape list pages on
the web have settled on. The URL is unchanged, so every bookmark and every
test that reads the URL still holds. The soorten became tabs because they are
navigation between pages, not a filter on one.

**The artikel page borrows shapes people already know.**
Infobox beside the prose (Wikipedia, Fandom), an outline that scrolls along
(Notion, Craft, Google Docs), settings kept away from content (all of them).
The fields as a full-width form had pushed the text below the fold on every
artikel; as an infobox they are a glance. The outline is measured on scroll
rather than with an observer per heading, and the Keeper's block order still
decides the column. Nothing moved server-side: the reads are the same slots,
and the bin came along as one more.

**Two ceilings for uploads, and the proxy is part of the answer.** *(The two
numbers are 2 MB and 20 MB since Round 11, and the browser now shrinks rather
than refuses; everything else below still stands, including the probe and the
413-without-JSON reading.)*
10 MB for a player, 100 MB for a Keeper, decided by `uploadLimitFor(viewer)`
and checked twice (declared size, actual bytes). The number the browser can
send is also bounded by whatever sits in front of the server — nginx defaults
to 1 MB — so the deploy notes say so; a limit the app enforces but the proxy
refuses first would look like a broken button. It did, the same evening:
nginx's 413 is an HTML page, every upload did `response.json()` on it, and
the person read "Geen verbinding met het archief". Uploads now go through
`lib/upload.ts`, which reads the answer as text first and names the web
server when a 413 comes without JSON; and Beheer → Site has a probe that
posts growing bodies to `/api/health/upload` and prints the nginx line to
add. The probe's steps can be set in the URL (`?probe=1.5,11,25`) — for
pinning a ceiling down, and because a browser harness cannot carry 101 MB.

**The welcome is the Keeper's text, with a default that follows the word list.**
A column on `site_settings` (migration `0007`), edited in Beheer → Site next to
the name and tagline it belongs with. The default is built from the word list
so an archive that renamed "artikel" is not welcomed with the old word.

---

## Phase 7 — Live everywhere

**One line per tab, not one per thing.**
A board had its own line, and every piece of shared text its own. That is
fine for one editor and fails at an artikel with six sections: browsers allow
about six connections to one host, and the seventh waits for ever. The shell
now opens one `EventSource` (`/api/live/site`) and everything rides it —
change signals, presence, pointer frames, and every room of shared text as
multiplexed `room` frames. `useLiveDoc` kept its shape and lost its socket.
The board's own line was left alone: it works, it is tested, and a second
line on a board page is a cost we can afford.

**Every write announces itself at the database, because that is the only
place every write goes through.**
The alternative — a `touch()` in each service function — would have held
until the first function someone forgot. Drizzle has a `logger` hook that
sees every statement; `lib/live/changes.ts` reads the verb, the table and the
ids out of the SQL and turns them into change keys. It fires *before* the
statement runs, which is only safe because SQLite is synchronous and the
queue flushes on a zero timer, after the transaction. That is a real
dependency on the database being SQLite, and it is written down as rule 16.

**A change signal is gated like the record it names.**
"entry:abc moved" tells a player that entry abc exists and is being worked
on. So a tab does not receive signals for the world; it *watches* keys, and
each key is checked with the page's own visibility rule before it is watched.
The wire still never carries a document — rule 3 (boards) became a rule for
the whole site.

**Every page renders `<LivePage>`, and a test says so.**
"Deeply ingrained and universal" was the ask. A convention would have lasted
until the next page; a unit test that walks `app/(app)` and fails a page
without `<LivePage>` lasts. A page that wants less (a board draws its own
strip and hands) turns parts off with props rather than being exempted.

**Short fields are shared documents, not last-write-wins.**
Nick chose "true shared typing" over "last save wins, but live". A Y.Text per
field in one `fields` room per record; an `<input>` bound to it by turning
every browser change into one delete and one insert (`textDelta`); the caret
kept through other people's edits with Yjs relative positions. The room
persists through the same service functions as before (`updateEntry`,
`updateCase`, `updateMap`, `updatePin`) with `{ live: true }`, and a plain
write of a field resets *that field* in the room — never the whole record,
or the field someone is typing in would be pulled from under them. Board
note-card text is the one short text left as it was: it lives inside the
board's state JSON, and a room persisting into `mergeBoardState` needs a
"text only" patch that does not exist yet.

**The room half of the fields is client-only.**
`Awareness` starts a timer per instance; a Y.Doc made during a server render
is a leak per request and a second copy of Yjs on the server is what rule 13
forbids. `LiveFields.tsx` (imported by every page) carries no Yjs;
`LiveFieldsRoom.tsx` does, behind `next/dynamic(…, { ssr: false })`. Until it
loads, a `LiveField` is a plain input.

**A tab ignores its own echo.**
The home page watches `entries`; creating an artikel writes `entries`; the
page's refresh on that signal landed in the middle of the `router.push` to
the new artikel and cancelled it — found by an existing e2e test, on the
first run. The provider notes the tab's own non-GET fetches and `LivePage`
ignores a `changed` within 2.5 s of one. The tab has already refreshed
itself after a write wherever it needed to.

## Phase 8 — Two faces for an artikel

**A page that asks everyone to fill in a form.**
Every artikel was an editing page. The title was an input, the one-liner was a
textarea with a placeholder in it, and the infobox was a form with a blank row
for every field the soort could hold — whether you had come to write the thing
or to look up which street the lighthouse is on. Most visits to a wiki are
reads. So the page has two faces now: *lezen*, shaped like any wiki article a
reader has ever seen, and *bewerken*, the page that was already there.

**The setting is a preference, the toggle is a face.**
`users.article_mode` holds `''`, `'view'` or `'edit'`, and the empty string —
the default, and what migration 0008 gives every existing row — means "whatever
my role does". A Keeper writes the archive, so a Keeper lands in bewerken;
everyone else came to read, so they land in lezen. Both may say otherwise in
Jouw account, and the answer is a preference about *landing*, never a right:
the toggle in the header crosses over for anybody signed in, including a player
who may only propose. Their changes travel as proposals exactly as they did
(§10, §17); what the faces separate is intent, not permission.

A per-artikel toggle rather than a sticky one, on purpose. Wikipedia's Read and
Edit tabs work that way and the mental model is worth more than the two clicks
it costs a Keeper who is on a writing session — and that Keeper has a setting
that puts them in bewerken every time. The one override is `?new=1`: you have
just made this artikel, so you are here to fill it in.

**Amended in round 13: the setting is gone and everybody lands on lezen, a
Keeper included.** This is left standing because it is what was decided here,
and because the half of it that mattered still holds — the two faces, the
per-artikel toggle, and `?new=1` as the one override. What went is the *landing
rule* underneath: "a Keeper writes the archive, so a Keeper edits" turned out to
be a sentence about a job rather than about a visit. A Keeper reads the archive
far more often than they write it, and the setting that was supposed to fix that
was a thing nobody found. `users.article_mode`, `articleModeFor`,
`ArticleModePref`, `ArticleModeForm` and `setArticleModeAction` are all deleted;
`lib/entries/mode.ts` is now one paragraph of prose and a two-word type. The
column stays on the table, unread, with a comment saying why. Nothing about
rights moved: the toggle was always rendered for every signed-in viewer. See the
Round 13 chapter for what it cost the tests, and for the half of `?new=1` that
had to be built rather than kept.

**Reading has to be a harder no than "you may not edit".**
`LiveBody` took its answer from the room — `live.canEdit ?? canEdit` — which is
right for rights, because rights can change while you sit on the page and the
room is what knows. It is wrong for a face: a Keeper who chose to read would
have been handed a caret anyway, since the room quite correctly says they may
type. So `readOnly` is a separate, stronger prop that no room overrules, and
`SectionsEditor` takes the same one and falls into the read-only path it
already had for players. The two questions were being answered by one boolean;
they are different questions.

**An infobox is not a form with the labels showing.**
A form has to show every slot, because you cannot fill in a slot you cannot
see. An infobox only has to show what is *in* them — that is the whole
difference, and it is why a wiki's infobox is short. So `FieldsView` prints the
fields that are filled and drops the rest; an artikel whose fields are all
empty has no infobox at all while reading, rather than a box of blank labels in
its margin. The same rule runs down the page: a hand-filled list with nothing
in it is not rendered, an artikel with no picture has no empty frame, and the
editor's own furniture — its border, its paper, its 160 px of room to type
into — is gone, because an article that keeps it looks like a form somebody
forgot to submit.

**The picture moved to the right, and its tools went with it.**
It was 220 px in the header, beside the title. It is now the top of the box
whose lower half is "Meer info", in the sidebar that already held the infobox
and — at that point — the outline as well: the shape Wikipedia, Fandom and
everything after them settled on, so a reader arriving from any of those
already knows where to look. The frame lives on the wrapper rather than on each
half, so the two read as one box; either half may be missing. Below the width
at which there is a sidebar at all, the wrapper gives up its frame and the
picture sits under the header at its own width, where a phone wiki puts it.

Two numbers in that paragraph have since moved, and are left standing here
because they are what was decided *here*. §25, the next day, took the outline
out of the sidebar and stood it beside the text, so the sidebar holds the
picture and "Meer info" and nothing else; and round 12 moved the width from
1024 px to 1280 px. Both are in "Round 7", below.

The three image tools — replace, crop for lists, remove — were a row of three
buttons under the picture. In a 320 px column that wraps to three lines of
chrome standing between the reader and the facts, so they went behind one
"Afbeelding" button, with the Filters popover's manners: closes on an outside
click, closes on Escape. With no picture yet there is only one thing to do, so
that case stays a plain button rather than a menu of one.

**What it cost the tests.**
Four e2e specs assumed a signed-up player lands on an editing page, which is
exactly the assumption that changed. They ask for the face now, through
`editArticle()` in the helpers — which is what a person does. One of them got
*better* for it: `flow-5-keeper` asserted the player could see an artikel by
finding an input with its name in it, and now asserts the heading, which is the
stronger claim.

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

**`yjs`, `y-prosemirror`, `y-protocols`, `@tiptap/extension-collaboration`,
`@tiptap/extension-collaboration-cursor`** (Phase 5) — shared text needs a
CRDT, and writing one is not a weekend. Yjs is the one Tiptap binds to, pure
JavaScript, no native code, no runtime fetch. Added with the helm let go;
the transport around it is our own (no `y-websocket`, no extra server).

Deliberately *not* added, though each would have been the obvious reach:

- a positioning library (Floating UI, tippy.js) — the `@` / `[[` popup and the
  chip preview are positioned from the caret rect by hand;
- an icon package — `components/Icon.tsx` is 25 hand-written paths;
- a zip library — `lib/zip.mjs` is a small deflate writer and reader;
- `next/image` — assets are already resized by `sharp` and served by our own
  route handler behind the login.

---

## Round 7 — 5 September 2026: soorten, en de indeling van de artikelpagina (§25)

Round 7 (`47b9225`) changed 73 files and wrote not one line in this file, which
is how a decision that was made on purpose comes to look like a regression a day
later. Most of what it did is written down in the project note
`claude/round-7-soorten-en-indeling.md` and left there: two `case_only` soorten
and migration `0010`, the dossier printed in front of a clue's name rather than
stored in it, a bin for prikborden and landkaarten, and the two rights panels
merged into one with a line saying that both have to agree (README rule 24, the
other half of §25). What belongs *here* is the one thing somebody has since had
to reconstruct from a diff: why "Op deze pagina" stands where it stands.

**The title and the one-liner belong to the text, so they moved into the text
column.** The header used to run the full width above the grid, which pushed the
picture and *Meer info* a title-and-a-lead down the page: a lot of empty paper
beside a heading, and the two halves of the artikel beginning at different
heights. Nick's ask was "titel en korte beschrijving smaller, afbeelding en Meer
info bovenaan uitgelijnd", and moving the header inside `.entry-main` answers
both at once — everything starts at the top edge together, and the title wraps
at reading width instead of at screen width. It is also the truer statement: a
title is the first line of the text, not a banner over the furniture.

**The outline moved into the gap that opened, because it is a signpost for the
text and not a fact about the artikel.** An infobox is a list of facts; "Op deze
pagina" is a list of places in the prose. Standing it under the infobox said the
first thing about it and standing it beside the text says the second, and Nick
had already asked for it "naar links, in de negatieve ruimte" — which is exactly
where the space was: the 2.5rem gutter between the two old columns was the widest
piece of nothing on the page. So the wide artikel is three columns, left to
right: **text, signpost, facts**.

### 6 September: one wide layout, not two (round 12)

Nick reported that "Op deze pagina" was "again" sitting between the picture and
the text and feared the round-7 move had been undone. It had not: there is one
move in the history and no move back. What he was looking at was worse in a
quieter way — **the page had two different wide layouts**. `WIDE` in
`components/useIsPhone.ts` said 1024 px and the `@media` block around
`.entry-layout-wide` said 1280 px, so between those two widths React rendered
the rail and the stylesheet had nowhere to put it: the outline dropped back
under the infobox. Drag a window across 1280 px and the page rearranged itself
in front of you, which is indistinguishable from a bug. The top-of-file comment
in `EntryView.tsx` still described the pre-round-7 two-column design as well, so
the file contradicted itself for anyone checking.

So there is one wide layout now. The three columns begin at **1280 px**, the
1024–1279 exception is deleted, `WIDE` is 1280, and the dead
`.entry-aside-sticky` rule (nothing has carried that class since §25) went with
it.

**Why 1280, in numbers, because the exception existed for a real reason.** The
grid gets the screen less the 220 px sidenav and two 2rem page gutters —
`min(1200, V − 220 − 64)`. Three columns cost a fixed 563.2 px of that: a 12rem
rail, a 320 px sidebar and two 1.6rem gutters. What is left is the measure the
prose is read at (counting a character as the usual ≈8 px at 16 px type):

| Screen | Grid | Text measure | ≈ characters |
|---|---|---|---|
| 1024 px | 740 | 177 | 22 |
| 1208 px | 924 | 361 | 45 |
| 1280 px | 996 | 433 | 54 |

At 1024 px the text column is 22 characters wide, which is a newspaper column
with the newspaper taken away — that is why round 7 wrote the exception rather
than simply letting three columns run down to the sidebar's own breakpoint. The
true floor is about 1208 px, where the measure reaches the 45 characters a line
of prose wants at the bottom of its range; 1280 is the first round number above
it and leaves the reader some air. The cost is stated plainly: **a screen
between 1024 and 1279 px loses its sidebar** and reads at full width, with the
picture and the facts folded under the header and the outline as a row of chips
— which is not a new shape, it is the shape every screen below 1024 px already
had.

**Two numbers that have to be one number.** This is the general lesson and it is
worth more than the layout. `WIDE` in `useIsPhone.ts` decides whether the rail
and the sidebar are *rendered at all*; the `@media` block decides where the grid
*puts* them. Neither is wrong on its own and neither can be read from the other,
so the only thing keeping them honest is that somebody remembers. They are
1280 px in both places now and both places say so in a comment pointing at the
other. A layout split between a hook and a stylesheet has this failure mode
permanently available; the fix is to write the pairing down where each half
lives.

And an assertion that was simply missing. `round-7.spec.ts` checked the column
order at one width, which cannot see a page that has two wide shapes. The new
test asserts the order — and that the three columns still start level — at
**1300 px and 1440 px**, either side of nothing in particular, which is the
point: nothing may change shape anywhere above the breakpoint.

---

## Round 8 — 5 September 2026

Five things were wrong at once and they were fixed together. What follows is
why each was decided the way it was, in the order the answers matter.

**A picture arrives by one road.** Pasting worked in two places out of six, and
where it worked it read `clipboardData.files` only — so a screenshot, which is
the commonest picture anybody pastes, was silently ignored everywhere. The fix
was not six paste handlers but one reader (`imageFromClipboard`) and, per
place, the upload the file dialog already used. The temptation the code now
resists is checking the size in the paste handler: a second ceiling and a
second wording for "too large" is precisely how the two roads drift apart.
`lib/assets.ts` keeps both ceilings and the server weighs the bytes that
actually arrived, exactly as before.

**A frame with nothing in it is not a frame.** A notitie on a prikbord came
into the world with its picture frame open and nothing to put in it. Decided
twice on purpose: a creation default per card kind (`defaultShowImage`, pure)
and a render guard that refuses to draw an empty frame whatever the saved flag
says. No board was migrated — old walls repair themselves at draw time, which
is the version of this fix that cannot go wrong halfway.

**The cork stopped being text, and stopped scrolling.** Text selection on a
board fought the board's own selection rectangle over the same drag. Switching
it off exposed the older bug underneath: `.board-viewport` was `overflow:
hidden`, which still makes a *scroll* box, so any browser-initiated "reveal
this" slid the whole wall out from under the transform that is supposed to be
its only position — and nothing put it back. `overflow: clip` removes the scroll
box; the `onScroll` reset covers Safari 15. In the same family: a new card is
now laid down where you can see it, overlapping a little if it must, rather
than in the first clear spot which on a 390 px phone was reliably off-screen.
That one was found by a golden flow failing on the phone project only, and it
had been latent for months — the card used to be forty pixels taller, which was
just enough to keep its middle inside the view.

**Herkomst is a living reference.** §24 gave a voorwerp or a clue the dossier it
was born in, printed in front of its name so that two knives in two
investigations are two knives. It was written once and never again, so moving
the knife left the wiki lying. It now follows `case_entries` by itself — out of
the last dossier and the prefix goes with it — with `origin_pinned` for the
person who chose one on purpose. The alternative, deriving the prefix live from
`case_entries` and storing nothing, was rejected for one reason: then nobody can
*decide*, and a clue in three dossiers would take whichever the query answered
first. An artikel in no dossier at all keeps its plain name and gains a "Zonder
dossier" chip rather than a stale prefix, because the archive saying "this is
adrift" is more use than the archive quietly remembering somewhere it no longer
is.

**A soort's address is a Keeper's to change.** `Relieken` shipped as `object`
and `Voorwerpen` as `item`: the labels moved and the slugs could not. Renaming
was chosen over a redirect table — for forty people an old `/wiki/object` in
somebody's notes is worth a plain warning, not a second table and a permanent
migration path. `entry_types.id` *is* the slug, so it is a small cascade in one
transaction, and `seedBaseline` has to remember the rename or a restart puts the
old address back as a second, empty soort.

**"Genoemd in" counts everything now.** A dossier's notes, an infobox field, a
section, a card on a wall and a speld on a map all name artikelen and none of
them said so. `entry_mentions` is derived exactly like `entry_links` — rebuilt
from the source on every save, disposable, rebuilt from scratch at start-up when
empty. The one decision worth writing down is what a mention the reader may not
follow does: it is **absent**, not MISSING. Rule 19 stamps MISSING on a board
card because a wall you are already looking at has to say something; a list of
mentions has no such duty, and "an investigation you cannot see mentions you"
gives the investigation away whether it is named or not.

**A dossier's tabs became a decision.** They followed what happened to be filed,
so a fresh investigation had no Clues shelf until a clue existed somewhere else
to file — backwards. `cases.tab_types` null keeps the old behaviour for every
dossier that never asks; a list pins those shelves open. It is deliberately not
a filter: a soort with something filed here keeps its tab whatever the list
says, so a change of mind can never hide what is in a file.

**Two more fonts, and the stamps keep theirs.** Atkinson Hyperlegible and
OpenDyslexic, both bundled through `@fontsource` (nothing fetched at runtime,
§13). Two rather than one because the evidence for OpenDyslexic is thin and
people differ; the default stays the archive's own. `--stamp-face` is
deliberately untouched — a dyslexia setting that flattens the whole archive into
one font takes the archive away rather than making it readable.

**Requires `npm ci`.** `@fontsource/atkinson-hyperlegible` and
`@fontsource/opendyslexic`, both `^5.3.0`, both build-time asset packages like
the three already here.

## Round 9 — 6 September 2026: tijdlijnen (§32)

Nick asked for a tijdlijnen tool "like landkaarten and prikborden": its own tab,
live, linkable from anywhere, gebeurtenissen that are artikelen and
gebeurtenissen that are nothing but a mark, measured in anything from years to
seconds, folding out up-down-up-down along the axis. Three questions were put
to him first and the answers shaped everything below: *any* artikel may go on a
tijdlijn (not only the Gebeurtenissen soort), rights are the prikbord's (not
the landkaart's), and time is real calendar time (not a bare counter).

**Time is one integer and a precision, not a string and not six columns.**
Sorting needs one number; printing needs to know how much of it is known. So a
moment is seconds since 1970 in a proleptic Gregorian calendar with no time
zone — negative for the 1930s, which SQLite and JavaScript take in their stride
— and `precision` is which unit the person actually filled in. Both are read
through `lib/timelines/time.ts`, which is pure so the browser and the server
cannot disagree about what "12 maart 1931" is. A six-column shape was
considered and rejected: every list would need to build the number anyway, and
a nullable `hour` column says "unknown" no better than a precision does.
`Date.UTC` was rejected inside the conversion because it reads a year under a
hundred as nineteen-something; `setUTCFullYear` does not.

**The scale is a *measure*, and it clamps at read time.** A tijdlijn's `scale`
decides which boxes the date form offers and how the axis is ruled, and an
event on it is never printed finer than that measure. But the stored precision
is left alone: set a tijdlijn of a night back to days and every "14:30" is
hidden, not erased; set it to minutes again and it is all back. Rewriting the
rows on a scale change was the obvious alternative and the wrong one — a slip
of the radio button would have destroyed data nobody could get back.

**A note gebeurtenis is not a thing in the archive.** Nick's line was "non-
article events must be on a timeline and cannot be referenced somewhere else",
and the cleanest way to make something unreferenceable is to give it no
identity outside its table: a note has a row in `timeline_events` and nothing
else — no slug, no page, no card kind, no mention row *about* it. What it
*says* can still mention artikelen, exactly like a note card on a wall. And
like that card and like a speld, it turns into an artikel in place when it
turns out to matter (`convertEventToEntry`), so "was it important?" never has
to be answered up front.

**The tijdlijn keeps its own words.** "The details of an event on the timeline
are curated on the timeline, even if it has a grander article behind it" —
which is §8 for cards on a wall, re-stated. So `text`, the picture frame and
(for a note) the picture are columns of the gebeurtenis, and the artikel
behind an artikel gebeurtenis is read for its name and cover and never written
to from here. The one place the two touch is on the way *in*: picking an
artikel whose infobox has a date reads that date into the boxes, once, as a
courtesy (`parseDutchDate`, best-effort, prefill only).

**Alternating up, down, up, down — in time order, with lanes.** Nick asked
for it in those words. In time order rather than creation order, because a
tijdlijn is read left to right and the eye expects the rhythm to follow the
axis. Two tags on one side that would still collide step out a lane (three
lanes each side, then they overlap and the folded-out window sorts it out),
which is the smallest rule that keeps a busy week readable without a layout
engine. The geometry is pure (`placeTags`) and tested.

**The windows start folded, and they are not state.** Which windows are open
lives in the tab alone: a tijdlijn of forty gebeurtenissen with every window
open is a wall of paper, and two people would otherwise fight over which are
open. "Alles tonen" / "Alles inklappen" is one button that reads the current
answer. A window opens *away* from the axis and measures itself after the
first paint, because one near the top of the stage was climbing off the page —
the first e2e run caught a "Lees verder" button that was visible, stable and
outside the viewport. With no room above it is pushed down over its tag: a
window you can read beats one that keeps its place off screen.

**Rights are the prikbord's, not the landkaart's.** A landkaart is a picture
the Keeper hung and a speld belongs to whoever set it; a tijdlijn is something
anyone builds, in a dossier or loose, and a gebeurtenis on it belongs to
whoever may work on that tijdlijn — like a card on a wall. So `timeline` is the
fourth `AccessTargetType`, with the two dials, the bolt, the public-or-private
choice at creation, and the dossier's own rule on top. This is also why the
`event:{id}:fields` room is gated on the tijdlijn's edit dial rather than on
who set the gebeurtenis.

**Linkable from anywhere means four things.** A URL (`/timelines/{slug}`, and
`?event=` to land on one gebeurtenis); a fourth card kind on a prikbord with a
fourth resolver and no name in the JSON (rule 19); an "Op de tijdlijn" row and
a "Zet op …" action on the artikel page, mirroring the landkaart's; and a
"Genoemd in" group, derived like every other (rule 26). A dossier gets a
Tijdlijn tab beside Prikbord.

**A frame with nothing in it stays shut — on a wall now too.** Round 8 shut the
empty frame on a notitie. Nick asked for the same on a gebeurtenis *and* on the
prikbord: an artikel with no cover used to open every card with a grey box
holding its soort's icon. `defaultShowImage(kind, hasPicture)` says no when the
caller knows there is no picture, and the "Foto tonen" button is where the
soort's icon waits. Creation-time only, as before: no wall was migrated, and a
card whose caller did not know (`undefined`) gets the old answer.

**Two bugs found on the way, both older than this round.**
`tests/unit/entry-origin.test.ts` imported `lib/entries/origin` statically,
which opened `./data/app.db` — the real one — before the test set `DATA_DIR`;
it passed on a checkout with no `./data` and failed on the second run, once
that file held the keeper it inserts. (On a machine with a real archive it was
inserting three dossiers into it.) Fixed by importing after the environment is
set, like the rest of the file. The second was in `LiveFieldsRoom`: a sheet
that joins a fields room *without* a snapshot (`state=""` — a speld's, and now
a gebeurtenis's) has an empty local document until the line answers, and the
rule-25 handover took that emptiness for "nobody has typed here" and seeded
the parent's text into it — which the server's copy then landed on top of.
Every opening of a note speld's sheet doubled its name ("ProefspeldProefspeld"
on the second, three copies on the third). The handover now waits for
`synced`; `tests/unit/live-field-handover.test.ts` has the case. Existing
spelden whose names were doubled this way need a hand: nothing rewrites them.

**Not done, on purpose.** No dragging a gebeurtenis along the axis (the date
form is the one road, so a moment cannot be nudged by a slip of the hand). No
durations — a gebeurtenis is a moment; "from … to" would be a second column
and a bar, and nobody has asked. No crop on a gebeurtenis's picture (it fills
its frame). No `timeline:{id}:fields` room for the name and description — the
settings sheet saves with a button, like a landkaart's. Field rooms and
existing spelden with a doubled name are not repaired by the code.


## Round 10 — 6 September 2026: de tekenlaag (§33)

Nick asked for free-hand drawing on prikborden, landkaarten and tijdlijnen: a
simple brush with colours and sizes, a gum, everyone able to rub out everyone
else's lines, the strokes *behind* the cards, and a Keeper's switch per wall,
map and axis that stops all drawing universally. Eight questions were put to
him first and the answers shaped everything below: a **pixel-precise** gum
(not stroke-at-a-time); drawing for **everyone who may see** the thing (not
only who may edit); the switch **freezes** what is there rather than hiding or
wiping it; a **fixed row of eight** colours; on a tijdlijn ink **sticks to the
years**; a **potlood button** that stays on until Esc; strokes **anonymous** on
screen; Ctrl+Z, a Keeper's wipe and pen pressure in, an eye to hide the layer
out.

**A stroke is a record, and the gum is a stroke.** The pixel-precise gum was
the one answer that could have made this hard: cutting strokes in two means
geometry, splits that two people make at once, and a merge that is no longer
"append". Instead a gum is a stroke with `mode: 'erase'`, painted with
`destination-out`, and everything is painted in the server's time order — so
a gum takes away exactly what was under it when it was made, and a line drawn
afterwards sits on top again, which is what a real gum does. Nothing is ever
modified after it is saved; the merge is append, drop what is tombstoned, sort.
The cost is that erased ink stays in the row, invisible, which is why the layer
has a ceiling (2 000 strokes) and a Keeper's wipe, and why the message at the
ceiling says whom to ask.

**Seeing is the gate, and this is written down as an exception.** Every other
write in the archive asks `viewerCanEdit` (README rule 10). Nick's answer was
that a viewer without edit rights may draw and may rub out — the layer is a
shared scribble, not the work — so `lib/ink/service.ts` asks only whether the
viewer may *see* the prikbord, landkaart or tijdlijn. README rule 33 says so in
so many words, so that a future reader does not "repair" it, and
`tests/unit/ink-service.test.ts` asserts it from the side of a viewer the edit
dial shuts out.

**Its own table, its own key, its own line.** The first plan put the layer in
`boards.state` and in a column on `maps` and `timelines`. That would have made
every saved stroke a change to the prikbord (a pull of the whole wall for
everyone on it) and to the landkaart or tijdlijn (a `router.refresh()` of the
page for everyone watching it) — once a second while somebody draws. So the
layer lives in `ink_layers`, keyed by the thing's id, moves only `ink:{id}`
(gated like the thing it hangs on, in `lib/live/gate.ts`), and every one of the
three places pulls it through `useInk` on the site line. The board hub
(`lib/boards/live.ts`) is untouched; README rule 7 of §21 still holds.

**Frames are sight.** While a hand draws, the new points go out on the site
line every 60 ms as `ink` frames — the same idea as pointer frames — so the
others watch the line appear. A frame carries an id, a look and coordinates,
nothing about who; the save that follows the hand lifting is what makes the
stroke true, and a finished stroke is kept on the receiving screen ("settling")
until the pull brings the real one, so it never blinks out in between. One
pull when the line comes up closes the gap between the page's render and the
line being open (a stroke saved in that moment would otherwise be missed until
the next signal).

**Coordinates are the place's own.** A stroke on a prikbord is in board units,
on a landkaart in picture pixels, and on a tijdlijn its x is *seconds* and its
y a fraction of the stage's height — so a circle round 1887 stays round 1887
when the axis is shifted or zoomed, and still sits on the axis on a narrower
screen. Widths are stored in the same units (a tijdlijn's in screen pixels,
since the axis has no zoom in the cork's sense) and scale with the zoom like
the picture does. `InkCanvas` draws in screen pixels through a `project`
function the place hands it and knows nothing else; the saved part of the
layer is painted once into an offscreen canvas and copied, so a wall with a
thousand strokes is not repainted sixty times a second while someone draws.

**The hand.** The tekenmodus lays a transparent sheet over the stage that takes
the pointer; the cards, spelden and gebeurtenissen underneath get nothing, so
a drag draws instead of moving. Esc, the potlood again, or the Keeper's switch
going off under you takes it away. One pointer draws; a second one (a pinch)
abandons the stroke rather than drawing a line to wherever the second finger
landed — on a phone you pan and zoom with the potlood off. Pen pressure widens
the line (0.4–1× the chosen width); a mouse or a finger draws at 1.

**Undo is your own, this sitting.** Ctrl+Z in the tekenmodus lifts your own
last stroke by tombstone — the corkboard's rule, so a screen that still shows
it cannot send it back — and only the strokes of this tab-session, so a
reloaded page has nothing to undo. No redo. A viewer's Ctrl+Z is the ink's
even on a wall they may not edit; outside the tekenmodus it is the cards'.

**Not done, on purpose.** No shapes, no text, no straight lines. No layers per
person, no "only my strokes". No name on a stroke on screen (the row keeps the
account for the logbook). No eye to hide the layer for yourself. No export as
a picture (trivial later: canvas → PNG). No migration of anything: the table
is new and empty.


## Round 11 — 6 September 2026: gummen, draden, het volle scherm, de as (§34, §35), en wie er schrijft (§18b)

Seven things at once, and only two of them are new features. The rest are
places where an earlier answer had stopped being true: a gum with one size, a
draad with one thickness, an upload ceiling nobody could get under, a canvas
in a column built for prose, and — the one that runs through everything — an
account that was assumed to be one person.

**Three gummen, on the strip the brushes already had.** The single 22 px gum
was a compromise between rubbing out a stray line and clearing a corner, and
it was bad at both. Nick's numbers are 12, 24 and 48: each wider than the
brush of the same rank, because you erase a mistake rather than trace it, and
the widest takes a whole line away in one sweep. They live on the *same* three
dots as the brushes — with the potlood those dots are `INK_BRUSHES`, with the
gum they are `INK_ERASERS` — because a second row of dots wraps the toolbar on
a telephone and the two are never wanted at once. Three small things make the
strip honest about which of the two is in the hand: the eight colours dim while
the gum is out, the gum's dots are drawn as rings rather than discs (a disc is
ink you put down; a ring is ink you take away), and the group's name for a
screen reader changes from *Dikte* to *Gumdikte*.

Nothing on the wire changed, which is worth writing down because it is not
luck. A stroke's `width` was always a number clamped to 0.1–4000 in
`lib/ink/merge.ts`, never one of an enumerated set, and `/api/ink` never looks
at it at all — so every stroke drawn with the old gum still reads back as 22 px
and needs no migration and no special case. `ink-tool` in `localStorage` gained
an `eraser` index; a stored value from before it simply gets the middle gum.

**Four thicknesses and five kinds of draad, and no migration.** A wall of red
string all the same weight is a wall where nothing is emphasised. Four presets
rather than a slider (1.5 · 2 · 4 · 6.5, named *Dun · Normaal · Dik · Extra
dik*) because picking a thickness is a decision, not a dial, and *Normaal* is
exactly the 2 every board was already drawn with. The stored range is wider
than the presets (1–8, rounded to a tenth) so a value off the wire is clamped
rather than refused. Five kinds — *Vol · Streepjes · Stippels · Dubbel ·
Streep-stip* — stored as a key for the same reason a colour is: nothing a
client sends should end up inside a style attribute.

No migration, and none was needed: a board's state is one JSON blob normalised
on every read, so a board saved last month gets the defaults applied to it each
time it is opened and looks exactly as it always did.

Three things about the drawing were decided by a trap the colour fell into
once already (see "A string's colour is set on the element", above): a CSS
`stroke-width` rule beats a presentation attribute. So width and dash travel
as `--string-w` and `--string-dash` custom properties, and selection now
*adds* two units instead of replacing the width — a selected extra-thick string
must not go thin. The invisible hit path is the plain unbroken centre curve for
every kind, widening with the string (`max(18, width * 3)`), so a dashed thread
can be caught in its gaps as well as on its dashes. And a *dubbel* string is two
offset copies of the quadratic rather than a thin stripe knocked out of a thick
one — there is nothing to knock it out of, because the layer is transparent and
the gap would show the cork and whatever card is behind it.

Widths are **board units**, so a thread grows and shrinks with the zoom.
(The sentence that stood here — "deliberately unlike the tekenlaag, whose
widths are screen pixels: a piece of string is a thing on the wall, ink is on
the glass" — was wrong about the prikbord, and is corrected in Round 12 below.
Ink on a wall has always been in board units too, and always grew with the
zoom; the screen-pixel width was the *tijdlijn's* alone.) The string bar gave up
its "Sleep een uiteinde…" hint to make room (slepen still works, it was simply
the least useful thing in a bar that now holds a label, six colours, four
thicknesses, a kind and a delete), and between 768 and 1199 px it wraps
upward rather than pushing its delete button off the cork.

**Shrink rather than refuse.** The ceilings came down to 2 MB and 20 MB. On its
own that would have made the archive worse: a phone's photograph is three or
four megabytes, and a person handed "Die afbeelding is groter dan de limiet"
has no way to make the file smaller and no idea that they should. So the
browser makes it fit — `fitUpload` re-encodes to JPEG at 0.82, which alone
often halves a phone picture without losing a pixel, and only then walks down a
ladder of sizes (1 → 0.85 → 0.7 → 0.55 → 0.42 → 0.3), sending the first step
that fits so the picture keeps every pixel it can. It is throwing away nothing
anybody would have seen: the archive stores a 1600 px webp in the end anyway.

Two pictures are left alone on purpose. A **GIF** may be animated and a canvas
knows only its first frame, so a silently flattened animation is worse than a
refusal; an **SVG** has no pixels to shrink. Both get the ordinary sentence.

The shrinking sits at the single §30 gate — the one place the file dialog and
the clipboard both arrive at — and nowhere else, which is rule 30 doing exactly
the job it was written for: a second place that weighed a picture would be a
second wording for "too large". It is a courtesy in *front* of the ceiling and
never the ceiling: the server still weighs the declared size and the bytes that
arrived, and would refuse a browser that ran none of this.

The numbers themselves moved out of `lib/assets.ts` into `lib/upload.ts`.
`lib/assets.ts` opens the database and loads sharp, so a client component could
never import from it — and the browser needs the ceiling now. It re-exports
them, so every route reads them where it always did. Which ceiling applies is
the server's to know, so it travels down as `uploadLimitFor(me)` → `AppShell` →
`UiProvider` → `ui.uploadLimit`, and the sentence under the map field says the
reader's own number instead of a hard-coded one. The proxy line is
`client_max_body_size 25m;` (Apache `LimitRequestBody 26214400`) and the probe
climbs 1.5, 3 and 21 MB.

**Near-full-bleed, with a one-line header.** Nick's answer to "how much of the
screen should a landkaart have?" was: all of it bar a thin margin, with one
line of heading above it. Three things were eating that screen in plain sight,
and none of them knew about the other two — `.page-wide`'s 1200 px cap, the page's own gutter,
and a magic stage height that was a guess at what stood above it
(`.map-stage`'s `calc(100dvh - var(--tabs-h) - 12rem)`; the tijdlijn's was two
constants in TypeScript). `.page-canvas` undoes all three in one place: a
viewport-tall flex column that gives back half the gutter either side (a thin
margin, so the canvas's border still reads as a border rather than as the edge
of the screen) and stops at the tab bar plus `env(safe-area-inset-bottom)`.

**There was a fourth, and it hid behind the other three.** `.live-strip` — the
dot in the corner that says the line is open — is a `float: right` inside
`main.main`, and a `.page-canvas` is a flex container, which is to say an
independent formatting context, and a browser keeps one of those *clear* of a
float rather than letting it flow round. So the canvas was laid out beside the
strip in what was left: 26 px of column (the strip's 21.4 plus its 8 px left
margin, less its −3.2 right one) **and** both of the half-gutter negative
margins that had just been given back, on every screen and at every size. It
answers the same way the paddings did — by being named rather than guessed at:
on a page that is a canvas the strip leaves the flow altogether
(`.main:has(.page-canvas) .live-strip`, absolutely positioned in the column's
top-right corner, which `.main`'s own `position: relative` was already good
for) and `.canvas-head` reserves that corner with `padding-right: 2.5rem`. A
strip that has grown a word — "geen verbinding" — lies over the tail of the
description, which is what its own background is for.

The guessing is what made the old height fragile, so `.main`'s three paddings
are named (`--page-pad`, `--main-pad-t`, `--main-pad-b`) and the canvas
measures against them: change one and the canvas follows. `.page-canvas:last-child`
takes the bottom padding back, so a page that is *only* a canvas does not
scroll at all, while a page with the Keeper's tools after it keeps that padding
and puts them below the fold — right, because a landkaart is looked at far more
often than it is re-hung. `.canvas-head` is one wrapping baseline row (about
64 px against the old stacked block's 140), and the description is the first
thing to go under 768 px, where every line of it is a line off the canvas.

`MapCanvas` already measured itself. `TimelineCanvas` had `STAGE_H_DESKTOP =
460`, `STAGE_H_PHONE = 400` and an inline height, and now measures width and
height with one `ResizeObserver`. The measured height is used **exactly**,
unclamped in TypeScript, and that is the one decision in this half worth
defending: the ink canvas is drawn at those very pixels, so a floor applied in
the component and not in the CSS (or the other way round) puts everybody's
drawing out of register with the stage under it. The floor therefore lives in
`.timeline-stage`'s own `min-height` and nowhere else. Everything reckoned from
the old constant is reckoned from the measurement now, including how many lanes
of tags there is room for — never fewer than the three a short stage always
had, so a tall stage really uses its height rather than leaving it empty.

**And then the Keeper's switch came off the map.** The tekenlaag switch stood
in the canvas column, above the fold, where it is 132 px of *tool* on a
telephone — the difference between a map that has three-quarters of the screen
and one that has five-eighths. It belongs with the Keeper's other tools, so
`MapCanvas` portals `InkKeeperControls` into `#map-underfold`, an empty div the
map page renders between `.page-canvas` and `MapKeeperTools`. A portal rather
than a prop because the switch is wired to the canvas's own ink state and
moving the state would have been the larger change; put there after mount
rather than rendered where it stands, so the block never shows in the column
and then jumps out of it; and Keeper-only like the slot itself, so a player's
page is still nothing but the canvas and still does not scroll. The tijdlijn
never had the problem — its ink switch has always lived in the Instellingen
sheet, which is the same answer to the same question.

The numbers, because the whole claim is a measurement. A desktop stage of
1188 × 758 is 84% of the screen; a phone landkaart is 374 × 634, 75% of it,
where before the strip and the switch were dealt with it was 61.7%; a phone
tijdlijn is 374 × 574, 68%, the difference being the tab bar and the one line
of heading on a shorter screen. Nothing overflows sideways anywhere. And the
width has an invariant worth stating as one, because it is what says the strip
and the cap are really gone: **the stage is the main column less exactly one
page gutter** — the half-gutter margin on either side, and nothing else taken
off it.

Two things the tests taught. A new spec measures the whole claim
(`canvas-fills-the-screen.spec.ts`: most of the screen tall, the column wide
bar a margin, stopping *at* the tab bar on a phone, and nothing running off
sideways at any size — including a phone held sideways, where the stage's
`min-height` is more than the column has to give). And `placeAt` in
`maps.spec.ts` had to stop taking its fraction from the stage and take it from
`.map-world`: on a full-screen stage a fitted map leaves bare cork beside the
paper, and a tap there places nothing at all.

The prikbord is deliberately **not** in this round. `.board-viewport` still
carries its own magic numbers and should adopt `.page-canvas` when somebody has
the appetite to re-test the whole wall.

**A drag snaps to the gebeurtenis's own precision.** Round 9 wrote down "no
dragging a gebeurtenis along the axis (the date form is the one road, so a
moment cannot be nudged by a slip of the hand)". Nick asked for the drag
anyway, and the answer to the slip is not to refuse the gesture but to make it
coarse: a tag lands on a whole unit of **its own precision**, so an artikel
known only as "1931" steps a year at a time however finely the axis is ruled.
A drag must never invent a precision nobody has — that would be the archive
claiming to know the hour because somebody's hand was steady.

**The last drag wins.** Moving an artikel gebeurtenis rewrites
`entries.fields.date`, and editing that field moves every gebeurtenis of that
artikel on every tijdlijn. An artikel on four tijdlijnen therefore has one
date, the one the hand last put it on, and the other three tags follow — each
re-snapped to *its* gebeurtenis's precision and re-anchored to *its* tijdlijn.
The alternative was a per-tijdlijn moment, which is a second truth about when
a thing happened, and the whole point of §32 was that a moment is one integer.

Both legs go through one writer, `lib/timelines/moment.ts`, which moves rows
with plain drizzle rather than through `updateEntry`. Twice deliberate:
`updateEntry` calls into this module, so importing it back would be a cycle;
and `updateEntry` routes somebody who may see an artikel but not edit it into
`pending_edits`, which would have turned a drag by a person who *may* edit this
tijdlijn into a proposal against an artikel they were not editing. The
consequence is stated plainly in README rule 35 rather than left to be
discovered: **whoever may edit a tijdlijn may move an artikel's date through
it.** A module-level `busy` flag is what stops the two legs circling.

**The anchor fences the axis.** A tijdlijn measured finer than a day may say
which day it is *of* — "deze tijdlijn speelt op 3 oktober 1931" — as
`anchor_at` + `anchor_unit` (migration `0014_timeline_anchor`, null together,
always coarser than `scale`). It does two small total things. `applyAnchor`
overwrites every moment's components from the year down to the anchor's unit,
so a new gebeurtenis is asked only for its hour and minute and the rest is
printed as the fact it is. And the anchor is a **fence**, not a default: the
origin is clamped to its span and the zoom has a floor of one span in the view,
so 4 October cannot be panned or zoomed into sight. That was Nick's call, and
it is the right one — a tijdlijn *of* one night that will happily show you the
following week is not of anything. The same clamp is applied in the service,
because a fence that exists only on screen is decoration.

**And the fence is built on a ref, which is the fence and not a tidying-up.**
It was written the ordinary way — `fence()` a `useCallback` over `[span,
width]`, `moveView` a `useCallback` over `fence` — and the ordinary way was
wrong here. Both of those take a new identity the moment a tijdlijn is anchored
or the stage is measured, and by then `zoomAt` and `addEvent` have long since
closed over the *first* `moveView`: the one made on the first render, when
there was no span and no measured width, whose fence returns its argument
untouched. So panning was clamped and zooming was not, which is exactly the
shape of the bug — eight presses of the zoom-out walked an anchored tijdlijn
clean off its day and out to 22 sep – 15 okt, while dragging the same axis
sideways refused to leave it. Reading the span and the width out of a ref
instead makes `fence` and `moveView` stable for the life of the canvas, so
every caller, however old its closure, fences against the anchor *as it is
now*. What moves in the other direction is the effect that re-fences a view
already on screen: with `moveView` stable it has to name `span` and `width`
themselves, because they are what changed. The general lesson is worth keeping:
a callback that is captured once and called for ever must read the world it
guards, not the world it was born in.

**Placing is one click.** A double-click on the axis now hands the sheet a
finished moment, shown as a line of print with a *Wijzig* behind it rather than
an open form: you already said when, and the form is there for when the click
was not quite right. `?place=` reads the artikel's own date (or, failing that,
the tijdlijn's anchor) and simply puts the gebeurtenis down, folded open and
ready to be nudged.

**A canvas on a server-rendered page must ask for the page again after every
write.** `/timelines/[slug]` is a server component, so what the browser's own
Back button lands on is the RSC payload Next has cached since the moment that
URL was pushed. Every write on the canvas was a `fetch` plus a change to local
state — right for the screen in front of you, invisible to that cache — so
somebody who put a gebeurtenis down, opened the artikel behind it and pressed
Back found the tijdlijn as empty as they first found it, and reasonably
concluded that nothing had been saved. `addEvent`, `patchEvent` and
`removeEvent` therefore end with `router.refresh()`, which is what the
settings sheet had been doing all along; the rule is simply that the two have
to agree. Known and left for now: `components/maps/MapCanvas.tsx` does not do
this when a speld is moved, and has the same cache behind it.

**A radio's name is the word; the sentence under it is its description.** The
scale pickers in both tijdlijn sheets are a `<label>` wrapping a radio, a
`<strong>` with the word and a small line of hint — so the accessible name was
the whole lot. "Seconden — Tot op de seconde. De laatste twee minuten." is a
radio called *Minuten* every bit as much as the one above it, and "Uren — Tot
op het uur. Eén dag, één nacht." is one called *Eén dag*, colliding with the
anchor's own *Eén dag* two fieldsets down. The radios now carry `aria-label`
with the word alone and point at the sentence with `aria-describedby`. This is
not a concession to the tests, though it is what let `getByLabel` mean one
thing: a screen reader wants the choice announced and the explanation
available, in that order, which is the same thing the eye gets. The Dutch copy
on screen is unchanged.

Not done, on purpose: no ghosting of a drag in progress on other people's
screens (the drop is one PATCH and the change signal is what they see — a live
frame per drag is §8's pointer frames all over again, for a gesture that lasts
a second); no dragging between lanes, which are a layout result and not a
place; no dragging between tijdlijnen; no rubber-band; and
`convertEventToEntry` does not push its moment into the new artikel's date,
because a note becoming an artikel is not the same act as saying when it was.

**One window, one onderzoeker.** Everything above is small beside this one.
§18 gave an account a wardrobe and one karakter worn at a time, and that was
enough while one account meant one investigator. It stopped being enough at
the table it was built for: two players sharing a laptop, or one player
running two onderzoekers in two windows, and the archive filing all of it
under whichever costume was last picked.

So the choice moved off the account and onto the **browser window**. Every
window asks a player once — "Met wie ben je nu aan het schrijven?" — at the
first attempt to *type*, never on arrival, because somebody who opened the
wiki to look up a name should not be interrogated for it. `sessionStorage` is
exactly the lifetime the answer should have, and it travels on every
same-origin request as `X-Character`.

The header is never trusted. `lib/auth/author.ts` resolves it against the
fiches that account actually holds and it lands on `SessionUser.characterId`,
so not one route signature had to grow a parameter, and a forged header simply
writes as nobody in particular rather than raising. A Keeper always resolves to
null: a Keeper is always the Keeper, and now that is true of the wire as well
as of the wardrobe.

**Everything a player does is attributed, and nothing was backfilled.**
Migration `0015_character_attribution` adds a nullable `character_id` to
`entry_revisions`, `activity`, `audit_log`, `pending_edits`, `case_revisions`,
`board_revisions`, `map_pins` and `timeline_events`. Nullable and never filled
in, deliberately: NULL means "written before the archive asked" and keeps the
old display-time behaviour, so a feed from last month reads exactly as it read
last month, and everything from now on keeps its own name. `attributed()` and
`displayNames()` prefer the recorded id and fall through to the live lookup
when there is none.

One account may now appear twice in one feed under two names. That is the
feature, not a bug: two investigators at one table. It is also why the
revision-coalescing window — and the prikbord's once-a-minute revision — now
compares the karakter as well as the account. Coalescing on the account alone
would have quietly merged two investigators into one revision under whichever
name happened to be first, which is precisely the mis-filing this whole round
exists to stop.

**The gate is one line, in three kinds of place.** `requireAuthor` sits at the
top of every mutating handler under `app/api/` that a player can reach (the
Keeper-only ones pass it by definition) and answers a plain 400 carrying
`needsAuthor` — a *question*, not a failure, read once in the `fetch` patch
that already sees every request rather than at fifty call sites that each have
their own way of showing an error. The same rule reaches shared text through
one line in `admit()` in `lib/live/rooms.ts`, which drops `canEdit`: a player
with no onderzoeker may read a room and watch other people's carets and may not
type in it.

It is deliberately **not** in `lib/access.ts`. Rights there are per account,
and a Keeper never has a karakter, so every Keeper in the archive would have
failed the check. Three doors are open on purpose: `/api/characters`, which is
where a person *gets* an onderzoeker and where a gate would lock out exactly
the people it is meant to help; `/api/client-error`, because a browser that has
just thrown must still be able to say so; and the live and presence lines,
which are sight and not writing. `EventSource` cannot set a header, so
`/api/live/site` GET also takes `?as=<id>`, resolved by the same check and only
ever a name on a strip.

**A player may make their first onderzoeker.** The rule above, applied to
`POST /api/entries` as well, closes a circle round every new speler: they may
not write until they have an onderzoeker, and an onderzoeker *is* an artikel
somebody wrote. Until now the Keeper wrote it for them, which made the first
evening of a campaign wait on one person's keyboard. So
`requireAuthorOrFirstCharacter` lets a player who holds **none** create
artikelen — that route only — and tie one on. The exception is keyed on
holding none, so it closes behind them the moment there is a name to write
under; and it counts *visible* fiches (`listCharacters`) rather than tie rows,
so a fiche in the prullenbak cannot go on locking somebody out of the only road
they have. An artikel made this way records `character_id` NULL, which is the
honest answer: it was written before there was a name to put on it.

**Presence is a different question from a log, and it now answers per window.**
A log says what the Keeper *did* — one voice, one word, README rule 11 — so a
Keeper is always the Keeper's word there. A presence strip says *who is here*,
and a room full of identical "Keeper" arrows is not a name: two Keepers at one
prikbord could not tell each other apart, and neither could anyone watching
them. So `displayNames` was left exactly as it is and the live layer got its
own pair (`presenceNames` / `presenceNameOf`), where a Keeper is their account
name and a blank username falls back to the word. A page that needs both jobs
now builds two name maps where it used to build one; the maps and timelines
pages are the worked examples.

`presenceNameOf` was overtaken within the round by `windowPresenceName`, which
answers per *window* rather than per account, and every caller uses that one
now — otherwise a person playing two onderzoekers in two tabs would have stood
on the strip as one name twice. The per-account version is kept because it is
the honest primitive the window version is built on, and its own test is what
holds it.

**The order of two effects is load-bearing.** `AuthorProvider` sits *above*
`AppShell`, and calls `setWritingAs` from a `useState` initialiser **and** a
`useLayoutEffect`. The initialiser runs during that component's own render,
before any child renders; the layout effect runs before every passive effect in
the tree, including the one that opens the live line. Both are needed because
the window's answer has to be in the module box the `fetch` patch reads before
the first request leaves and before the `EventSource` is opened — otherwise the
first live line, and the name on the presence strip, carries the account's
default instead of this window's onderzoeker. Both writes are idempotent, which
is what makes React's Strict Mode double invocation a non-event.

And the account's `active_character_id` is deliberately **not** written when a
window answers. It is shared between windows: window B choosing would change
what window A paints on its next first render, which is exactly the confusion
the window-level choice exists to remove.

**A player with no onderzoeker gets a banner, not a locked door with no
handle.** Not a toast — gone before the person has worked out why the page will
not take a letter — and not a dialog either, because there is nothing to
answer. It stands at the top of every page inside the shell, says what is
wrong in one line, and points at the one thing they *can* do. Everything else
on the screen is switched off.

**The question is a sheet, so it is never asked from inside one.** This is the
part of §18b that took two goes. The gate has two doors and they are shaped
differently on purpose. `ask()` is for an editing *surface*: a caret lands in a
paragraph, the question comes up over the page, and the page is still there
when it is answered — nothing was held back, because nothing had started.
`ensureAuthor(then)` is for anything that would itself open a sheet, which in
practice means the two "nieuw …" roads. There the order is turned round: the
action is held, the question is asked alone, and the answer releases it in the
same commit that closes the question, so there is never a moment with two
sheets on the screen. Asked the other way about, the question arrived *on top
of* "Nieuw artikel", and Escape — which the blocking question rightly refuses —
went to the sheet underneath, closed that, and left the question standing over
a bare page. A window with nothing to answer (a Keeper, one that has already
chosen, a speler with no onderzoeker at all) runs `then` **synchronously**, so
the click that was going to open the sheet is not lost.

That fixes every road the app itself walks, and one road cannot be walked:
the archive's `needsAuthor` refusal arrives asynchronously, from a request
somebody started a moment ago, and it can land while any sheet is open. So the
primitive has to survive a pile whether or not we ever mean to build one, and
`lib/sheetStack.ts` is what settles the things two sheets had been sharing
silently. Escape and Tab belong to the top sheet alone — they used to belong to
all of them at once, because `stopPropagation` on a capture listener does not
silence the *sibling* listener on the same node (only `stopImmediatePropagation`
would, and that is a race over who registered first). So does the backdrop. The
scroll lock is taken by the first sheet to open and put back by the last to
close, where each sheet used to save and restore `overflow` for itself and the
first to unmount handed the page its scrollbar back underneath a sheet that was
still standing. And `z-index` counts up with the depth, because two portals at
the same one are ordered by the accident of which mounted first — before this
both backdrops sat at 60. The pile is module state rather than context: the
sheets are portals opened from providers at different heights and share no
parent, and the handlers read it at *event* time, where a render-time value is
already stale. No DOM in the module on purpose — the ordering is the part worth
testing and it is testable in a plain node (`tests/unit/sheet-stack.test.ts`).
The `n` shortcut joins in: it reached straight past an open sheet, because the
focus a sheet leaves behind is not a field and the "is somebody typing?" check
waved it through.

Worth writing down as debt rather than leaving to be discovered: the call sites
that stack sheets today now *survive* it, which is not the same as being right.
`MapCanvas` puts a confirm up from inside the speld-sheet (`removePin`) and
opens the new-artikel sheet from inside the new-speld sheet; `TimelineCanvas`
does the same with `removeEvent` and with the ink-clear confirm in its
Instellingen; `EventSheets` opens the new-artikel sheet from the
new-gebeurtenis sheet; `BoardCanvas` confirms the ink-clear from inside the
access sheet. `AddToCaseButton` is the one that already does it the right way
round. Turning the rest into ask-then-open is a candidate for a future round.

**Three gaps left open on purpose.** The "gezet door {naam}" labels on a
landkaart and a tijdlijn still re-derive per account, because the prop is keyed
by user rather than by pin or event — the rows now carry a `character_id`, so
this is a change to the props and not to the schema. An ink stroke still names
an account inside the layer JSON, which is what §33 always said it did (the row
keeps the account for the logbook; nothing is shown on screen). And
`updateEvent` / `updatePin` write no activity row at all, which is pre-existing
and unrelated to this round.

**What it cost the tests.** The existing e2e for presence passed for the wrong
reason: the seeded account is literally called *Keeper*, so "the account name"
and "the Keeper's word" were the same string. A new spec renames the word to
*Spelleider* first, after which the two claims can finally fail independently:
the feed row must say *Spelleider* with *Keeper* in its tooltip, and the strip,
the arrow and the hand on a card must all say *Keeper*. A feed row reading
"Keeper", or an arrow reading "Spelleider", is now a bug rather than a pass.
Several map and timeline specs had to
give their signed-up players an onderzoeker before they could write: a refusal
that is meant to be about *not being a Keeper* now meets the other question
first.

Two of the failures turned out to be product-shaped mistakes wearing a test's
clothes, and both are worth keeping as rules rather than as fixes.
`waitForURL('**/e/**')` is **already true** when the browser is standing on an
artikel, so the helper that makes three fiches one after another matched the
address it was on and handed back the previous path every time — every fiche
after the first was the first one again. A helper that navigates repeatedly has
to wait for the address to *change*, not for a shape it already has. And a gum
is a streek (§33): somebody who gums twice has two strokes on their own undo
stack, so the spec that gums twice presses Ctrl+Z twice before the undo button
is allowed to go dead. Asserting it after one press was asserting that the
second gum had never happened.

The rest was timing, and it has one house answer: do it again until it answers.
Two specs — round-6's "a card pinned from the artikel still asks about the
dossier" on a desktop, and `thumbnails` on a phone — failed once and passed on
a re-run, which is the same race in both cases: a page that has just navigated
is on the screen before React has picked its inputs up, and a `fill` that lands
in that gap is wiped by the render that follows. A person is far too slow to
hit that window; Playwright is not, which is why it shows up on one desktop run
in ten and never on the phone. So the e2e helpers gained `fillWhenReady` — fill,
wait a beat, and fill again until the field is still holding what it was given
— the counterpart of the press-it-until-it-answers loops the sheet helpers have
had since Phase 3. It is not applied everywhere on principle: on a field where
every change is a write, a second fill would be a second voorstel in the queue,
so a page that has already answered a click keeps its plain `fill`.

**Where Round 11 finishes.** 157 passed and 25 skipped across desktop and phone
against a production build (Round 10 finished at 137 / 21), 539 unit tests in 40
files (Round 10: 450 in 37), `tsc --noEmit` clean and `npm run build` clean.

---

## Round 12 — 6 September 2026: één brede indeling (§25), en inkt die met de as meegroeit (§33)

Two fixes Nick reported, and nothing else, on purpose. Round 11 was seven items
and ran to six hours; this one was scoped at two and about four, so that each
could be understood all the way down instead of patched at the surface. Both
turned out to be the same species of fault — **one thing measured in two units
at once** — which is worth saying before either is described, because that is
the shape to look for next time.

**"Op deze pagina" had not moved. The page had two shapes.** Nick saw the
outline back between the picture and the text and reasonably read it as the
round-7 layout being undone. It was not: there is one move in the history and no
move back. What there was is a hook and a stylesheet holding different numbers —
`WIDE` at 1024 px, the grid's `@media` at 1280 — so between those two widths
React rendered a rail the CSS had nowhere to put, and the page had a *second*
wide layout in which the outline stepped back under the infobox. The whole
argument, the arithmetic behind 1280 px and the assertion that was missing from
`round-7.spec.ts` are in the Round 7 chapter above, where the original decision
now lives as well.

The part worth keeping here is the diagnosis rather than the fix. Nobody
introduced a regression and nothing was moved back. Round 7 wrote its
`@media (max-width: 1279px)` exception into the stylesheet and left `WIDE` in
the hook at the 1024 px §22 had put there — so the page's shape was decided in
two files that had never been asked to agree, and one of them was updated. A
layout split between a hook and a stylesheet has this failure permanently
available, and the only defence is to name the pairing in both files, which is
now done in both files.

**A drawing on a tijdlijn was stretched by the zoom.** Nick: *"Op de tijdlijn is
het zoomen echt een probleem met de drawings. Die worden helemaal gestretched."*
A tijdlijn stroke was written in two spaces at once — its x an absolute moment
in seconds, its y a *fraction of the stage's height*. On the glass that is
`x·pxPerSecond` against `y·stageH`, and only one of those two factors is the
zoom. So a circle drawn round 1887 was an ellipse at every zoom but the one it
was made at, stretched horizontally by exactly the ratio of the two, and the
ratio is not small: a jaren-tijdlijn's zoom already spans 200×, and the whole
range from `MIN_PX_PER_SECOND` (a thousand years across a thousand pixels) to
200 px per second on a seconden-tijdlijn is nearly ten orders of magnitude. The
same mismatch squashed a drawing vertically on a telephone against a desktop,
because `stageH` is a measured height and not a shared unit at all.

**Nick's decision: a drawing grows and shrinks with the tijdlijn**, like ink on
a prikbord. The alternative — ink that keeps its size while the years slide
under it — is defensible for an annotation but wrong for a drawing: a circle
round a decade is a claim about that decade, and it has to stay round it and
stay the same shape. That needs both axes in one unit, and the only unit a
tijdlijn has is the second. Hence **format v1**: x is the absolute moment
(unchanged), y is *seconds from the axis*, the width is in seconds, and all
three are multiplied by the one `pxPerSecond` on the way to the screen. One
scalar on both axes and on the thickness is a similarity, so every angle and
every ratio survives every zoom, the drawing no longer knows how tall the stage
is, and the gum stays exactly over what it took away.

The arithmetic is a new pure module, `lib/timelines/inkSpace.ts` — `projectInk`,
`inkFromScreen`, `inkWidthScale`, `TIMELINE_INK_FORMAT` — with no React and no
canvas in it, so `tests/unit/timeline-ink-space.test.ts` (16 tests) can pin down
the shape of a drawing without a browser. That is where it belonged anyway: it
sits beside `time.ts` and `moment.ts`, the other two pure pieces of a tijdlijn.

**Old strokes are not rewritten, and the flag rides on the stroke.** Rule 33
says a stroke is immutable once saved and the merge is append, sort and
tombstone; a migration here would be the first thing in this archive to edit a
saved stroke. It would also have to *guess*: converting a v0 y back to seconds
needs the `stageH` it was drawn at, which is not recorded and was never the same
twice — a telephone, a desktop and a rotated telephone are three different
numbers. So `v` lives on each stroke (`v: 1`, absent means v0), never on the
layer, and a tekenlaag holds both formats side by side for ever. `normaliseStroke`
copies it deliberately, because a whitelist that dropped it would read an old
stroke back as v0 — or a new one as v0 — and draw it in the wrong place for good.

**The seam is accepted and named.** A v1 gum drawn over v0 ink drifts apart when
the axis is zoomed, because the two are no longer in one space. It can only
happen to a drawing that was already on disk before this round, it is visible
only *while* zooming, and the answer if it ever bites somebody is a Keeper
wiping that layer — which is one click and already exists. Writing that down is
the point: an accepted seam that nobody has written down is just a bug waiting
to be rediscovered.

**The clamp was the trap in this round.** `INK_MAX_WIDTH`'s 0.1–4000 is a fence
around a number of board units or picture pixels, and it is nonsense around a
number of seconds. A 3 px brush at the finest zoom is 0.015 s, which the 0.1
floor would have fattened to twenty pixels on the glass; the same brush at the
coarsest is about 10⁸ s, which the 4000 ceiling would have shaved to something
invisible. Three decimal places are equally meaningless at 10⁻². So v1 has
bounds of its own (`INK_V1_MIN_WIDTH` 1e-6 … `INK_V1_MAX_WIDTH` 1e12) and keeps
six *significant figures*. And the same treatment had to reach `readInkFrame`,
not only `normaliseStroke`: a frame is what everybody else's screen draws while
a hand is still moving, so a v1 stroke read back through v0 bounds would arrive
twenty pixels thick and snap to its real size the moment the hand lifted.

**`InkCanvas` still knows nothing about places, which is what made this cheap.**
It was already given a `project` from the place; it is now also given each
stroke's `v` as an opaque third argument, and `widthScale` may be a number (one
rule for the whole layer) or a function of `v` (a layer holding two formats).
`BoardCanvas` and `MapCanvas` were **not edited at all** and still compile,
because a function of two parameters satisfies a type of three and a number
still satisfies the union. A component that had learned what a tijdlijn is would
have had to learn what a prikbord is too.

**Which corrects something Round 11 wrote down.** That chapter says the
tekenlaag's widths are screen pixels, "a piece of string is a thing on the wall,
ink is on the glass". That was never true of a prikbord: `useInk` stores
`screenWidth / widthScale` and `BoardCanvas` passes `viewport.zoom`, so ink on a
wall is in board units and has always grown with the zoom exactly as a draad
does. Round 10 had it right — "widths are stored in the same units … and scale
with the zoom like the picture does" — and the tijdlijn's screen-pixel width was
the one exception, because `widthScale` there was the literal `1`. After this
round there is no exception left: on all three surfaces a streek is in the
place's own units and grows with the view.

**The test that could not have caught it.** "a tijdlijn takes ink that sticks to
the years" pans the axis and reloads the page, and neither can see this bug: a
pan leaves `pxPerSecond` alone, and it is the *only* factor that differs between
the two spaces. It zooms now, and asserts the two things v1 promises — the
y-extent grows with the axis, and the aspect ratio holds (a ratio because
zooming about the middle of the stage also moves the drawing, and a ratio is
blind to that). A second spec draws a line, gums across it, zooms out and
asserts that the share of the line that is gone is the share that was gone
before — which is the gum's *width* being in the same space as the ink, and
would drift the moment it was not. Both were proved by reverting to v0 and
watching them fail, which is the only way to know a regression test regresses.

**Where Round 12 finishes.** Deliberately small: one new pure module, one new
unit file of 16 tests, a new column-order assertion at two widths in
`round-7.spec.ts`, and two zoom assertions in `ink.spec.ts` — plus the two
comments that had been contradicting the code they stood on. No migration, no
new dependency, no schema change, and nothing on the wire that an old client
could not read. The suite figures belong with the round note for this round in
the Claude project, where they are the number the full run actually produced.

## Round 13 — 6 September 2026: zeven dingen (§38, §39, §40, §41, §18c)

Seven items from Nick, in one go. He was told what it came to before it started
— about twenty-seven hours, three of the seven a round on their own — and asked
for all of it anyway, on the reasoning that the four small ones are worth
nothing separately and that the two map items are one item pretending to be two.
That is his call to make and it is written down here because CLAUDE.md §2 exists
precisely so it *is* his call: the size goes next to each line, and then the
person paying for it chooses. Eight agents built it in four waves, none of them
allowed to touch these four documents; this chapter is the fold-in, checked
against the code rather than against what the agents said they did.

Five of the seven earned a numbered rule: **38** the typed infobox, **39**
spelden that stand for landkaarten, **40** a landkaart's own dials, **41** a card
that can be made bigger, **42** (§18c) who hands out an onderzoeker. The other
two — the "nieuw artikel" button in a dossier, and everybody landing on the
reading face — are a button and the *removal* of a rule, and neither wants a
number: the second is an amendment to rule 18 and to the Phase 8 chapter above,
where it is written down as an amendment rather than as a contradiction.

**A dossier had no visible way to make anything.** The box at the top of a
dossier said "Voeg iets toe aan dit dossier…" and was a full-width unlabelled
input, which on a page of cards reads as layout rather than as a control. The
road to making something new existed but only *after* you typed — it was the
last suggestion under the box — so the one thing a fresh investigation needs
most was invisible until you had already guessed it was there. The box is half
width now in a `row-wrap` with a `btn-primary` beside it, and the two are
deliberately different sentences: **the bar attaches something that exists; the
button makes something that does not.** The button's words are built from
`words.entry` and `words.case` (rule 8), never typed.

One asymmetry in there is on purpose and looks like a bug. The button omits
`onCreated`, so the sheet lands you on the new artikel; the "'X' aanmaken"
suggest-row keeps it, so the new thing is attached and you stay on the dossier.
The difference is where the answer belongs: you typed into a box *on this page*,
so the result belongs back on this page — where a button that says "maak" should
end up where the thing is. And the placeholder string is byte-identical on
purpose: five e2e specs locate that box by it, and a copy change would have been
five unrelated test failures in a round that already had enough.

**Nick's decision: everything scales with a card.** A card on a prikbord can be
made bigger — 50% to 500%, one number and not one per axis, so a card zooms like
a photograph rather than reflowing. The border and the shadow scale with it,
which was the question actually asked, and the answer is that the wall's own
zoom has always done exactly that to a card's border: a card at 200% should look
like the same card seen at 200% zoom, and a magnified photograph magnifies its
frame. The alternative — a hairline that stays a hairline — makes a big card
look like a different kind of object.

The interesting part of that feature is not the size, it is the **seam**. A
scaled card is painted with a CSS `transform`, and a transform grows a box about
its *centre*, so `card.x` stops being the card's corner the moment the scale is
not 1. Every piece of geometry on that wall reads `card.x` — the hit test, the
marquee, "Alles in beeld", `freeSpotNear`, the held-by overlay someone else's
hand draws, `headOf` where a string ties, the grip itself — and each of them
would have been subtly wrong in its own way. So `cardBox(card)` is the one place
allowed to work it out, everything goes through it, and at scale 1 it returns
the old numbers to the pixel. The same slip in a second place: the crop divisor
needed `card.scale` beside the board's zoom, or dragging the picture inside a
250% card moved it two and a half times too fast.

Two controls, and the second one is the point. A corner grip is the natural way
to resize something and a phone has no drag to spare — the board already turns
dragging off there — so the four presets in the inspector (Klein · Normaal ·
Groot · Extra groot) are not a convenience, they are the only road on a
telephone. No migration: board state is one JSON blob normalised on every read
(rule 5's §5), so a card with no `scale` reads back as 1 and always will.

**A punaise's label had been lying.** Clipped at 76 units with an ellipsis and
no tooltip, so "de man met de grijze jas" arrived as "de man met…" and nothing
on the wall said the rest existed — a note taken during play, silently truncated.
The tag wraps now and the pin grows downward, capped at 132 so a long label does
not lay a banner across the cork. The wrap is *estimated*, in a pure module,
which is a compromise worth naming: `lib/boards/merge.ts` has no DOM to measure
against and must not grow one. It guesses the line height generous (18 against a
painted 15.1) because guessing short is the dangerous direction — the whole
document reasons in `cardSize`, and a tag that paints taller than the model says
leaves gaps in the geometry that nothing knows about.

**Everybody lands on the reading face, and the setting is gone.** The Phase 8
chapter's landing rule — "a Keeper writes the archive, so a Keeper lands in
bewerken" — was a sentence about a job, not about a visit. A Keeper reads the
archive far more often than they write it, and the account setting that was
supposed to answer that was a thing almost nobody found. So the whole dial goes:
`ARTICLE_MODE_CHOICES`, `articleModeFor`, `cleanArticleModePref`,
`ArticleModePref`, `ArticleModeForm`, `setArticleModeAction`. `mode.ts` is now a
paragraph of prose and a two-word type.

Nothing about rights changed, and it is worth saying why not: the toggle was
always rendered for *every* signed-in viewer (`canToggle` is `Boolean(viewerId)`),
so a player who may only propose could always open the editing face and always
had their changes travel as proposals. The face was never a permission.

`?new=1` is the only override left, and removing the role fallback is what
turned it from a convenience into load-bearing. `UiProvider` pushed a new
**dossier** to a bare `/c/${slug}` and let the Keeper's role do the rest — which
worked for exactly as long as a Keeper landed in bewerken. It pushes `?new=1`
now, and `CasePage` reads it, so making a dossier still puts you in front of the
form you just asked for. The column `users.article_mode` stays on the table,
unread, with a retirement comment on it: this repo never edits an old migration,
and SQLite's `DROP COLUMN` on an indexed table is fragile for no gain.

What it cost the tests: **nine e2e specs** needed an `editArticle()` or
`editCase()` inserted before they could type — the helpers already existed from
Phase 8, which is the tell that this reverses a Phase 8 decision rather than
inventing a new problem. A tenth (`round-6`) asserts the opposite, that reading
shows neither the add-box nor the new button.

**Nick's decision: the larger of the two field-type options.** The infobox could
have had three new kinds and nothing else, in about an hour. He took the bigger
one, and it is the right shape: the kinds are the visible half, and the gate is
the half that makes them mean anything. Without it a `number` is a suggestion —
`updateEntry` merged whatever arrived into `entries.fields`, so a hand-rolled
PATCH or a client that dropped `field.whatever` into a live room could store a
key and a shape the archive has no word for, and the new kinds would have been
three more shapes nobody was holding to.

The gate is pure, and it sits at the single `updateEntry` / `createEntry` seam
so that one check covers every door — the artikel page's autosave, the §21
fields room (whose `field.*` sweep out of the Yjs document is precisely the road
that could invent a key), an approved voorstel, the roads that change a soort.
Two decisions inside it are the ones to remember. **A key has two sources**:
`entry_types.fields[].key`, and every hand-filled `links` block's own key. A
gate that knew only the first would have quietly emptied every hand-filled list
on every artikel on its next save — a data-loss bug that would have looked like
a UI bug for a week. And **a refusal is silent in a live room and named on a
PATCH**: a CRDT handed a 400 resends for ever, while a person saving a form
deserves to be told which key went nowhere, so the PATCH answers 200 with
`rejectedFields` beside the saved artikel.

Nothing stored is destroyed by any of it. Only the incoming patch is filtered,
so a field taken away in Beheer → Soorten keeps its value and brings it back
when the field returns — `TypeEditor` has always promised that — and a *retype*
is not a coercion: a `text` that becomes a `number` leaves the old `"veertien"`
exactly where it was. Two writers stay outside the gate deliberately and are
commented as such: `writeEntryDate` (§35's one writer, which would be a cycle
through `updateEntry` and would turn a drag into a voorstel) and
`restoreRevision` (putting a version back is meant to be exact, not corrected).
The one road that deletes is the new **"Oude waarden"** panel in Beheer →
Soorten, which counts what is still stored under a key the soort no longer has,
per key, and asks before it wipes — because the courtesy of keeping orphaned
values was also completely invisible, and a Keeper who renamed a field twice had
no way to know the archive was carrying the first two.

Three kinds, each with a small decision in it. **Getal** stores a real number
rather than the text of one, so a page can print it in Dutch and a sort could
one day compare it. **Ja/nee** is a real boolean and nothing that resembles one
— not `1`, not `"ja"`, not `"true"`, because a page that had to guess which of
those counted as yes would guess differently in two places — and on the reading
face `true` prints "Ja" while `false` prints **nothing at all**, which follows
rule 18: an infobox lists what is so, and "nee" is the empty answer, not a fact.
**Meerkeuze** drops a member that is off the Keeper's list and keeps the rest,
following `entry_links` rather than `select`: taking an option away in the type
editor must not start refusing every save of every artikel that still names it.

**A Datum stays free text.** This one was decided against the obvious: a native
date picker is right there, and it would forbid "oktober 1934" and "ergens in de
zomer", both of which are dates somebody means in a 1930s archive. §35 depends
on the field keeping exactly what was typed — `writeEntryDate` puts `formatWhen`
output in and `parseDutchDate` reads it back — so a picker would have broken the
round trip as well as the prose. What the field gets instead is a quiet hint,
after the box is left, saying that a tijdlijn will not be able to place what is
in it. A hint, never a refusal.

**Nick's decision: landkaarten need dials before landkaarten can be nested.**
The two map items arrived as two requests and were built as one, in that order,
because the second is unsafe without the first. A landkaart had **no `view_mode`
at all** — the one thing in the archive with no dial — so every signed-in person
saw every map, a plattegrond could not be kept back until the players found the
house, and `resolveBoardMaps` had been carrying a `_viewer` argument it never
used. A speld pointing at another landkaart, built on top of that, would have
been a second way to publish the name of a map the Keeper was keeping back.

The defaults are the whole of the migration's argument. `view_mode = 'all'`, so
**every landkaart already hanging stays exactly as visible as it was**: a dial
nobody has touched must change nothing, and a migration that hides work people
are already using is an outage with a version number. `edit_mode = 'private'`,
because §19 has always said only a Keeper renames, redraws or takes down a
landkaart and every map's owner is a Keeper — so the dial writes an existing rule
down rather than loosening it, where `'all'` would have handed every player the
rename and the delete. `access_grants` needed no new table; it has been one table
for every kind since 0005.

What the round actually cost was the *finding*: thirteen reads across five
modules had to be tracked down and given the viewer — the shelf, the map's own
URL, board cards, "Genoemd in", the fields room, the tekenlaag, the two
`…ForEntry` lookups. That is the lesson worth having as rule 40 rather than as a
war story: a new kind of thing gets its `visible<Thing>Condition` on the day it
is built, applied to every read, with a `viewer` argument that is **required and
not optional**. An optional viewer is how a dial goes missing for four rounds,
and a `_viewer` nobody uses is the tell that it already has.

**A speld may stand for a landkaart, and cycles are allowed.** One column,
`map_pins.target_map_id`, never a second meaning for `entry_id` — the same
separation a card on a prikbord already keeps. Three decisions in it. The
target resolves through the **viewer's own** `visibleMapCondition`, in the
join's `ON` clause, so a speld to a map you may not open is absent rather than
stamped: this is the sight rule, and the whole reason the dials came first. The
speld's **name is read from the target on every read and never stored**, so a
rename travels — the same reasoning as rule 23's "stored short, printed long".
And **only the self-pin is refused**: A→B→A is not a cycle bug, it is the way
back up, the speld on the harbour map that returns to the island, and nothing
renders recursively — navigation is a click and `listPins` is one level deep.
A speld on itself is refused only because it opens the page you are on.

Two smaller shapes went with it. A tap on such a speld opens the **sheet**, not
the other map, because everything a speld has — "gezet door", the drag hint,
"weghalen" — lives in the sheet, and the button inside it is the road; that also
makes it word for word the entry speld's behaviour. And `listMapsPinningMap`
gives the chip in the other direction ("Op de grotere landkaart: Zeeland"),
derived and behind the same condition, because a plattegrond with no way out is
a dead end and a phone does not always have a Back button. Dossier and tijdlijn
spelden are deliberately out of scope: this is one column, not a polymorphic
target, and the moment it is two the column has to become a pair.

Fixed in passing, and it belongs to that chip: `MapCanvas` now calls
`router.refresh()` after a speld is **created** and after one is **removed**.
Walking down a landkaart speld and coming back up is a navigation, and the RSC
payload the browser held was from before the speld existed — so the road §39
had just built ended on a page that did not have the door on it. A speld that
has merely been **moved** still does not refresh; that gap is real and stays
named in CLAUDE.md §5 and §8, narrowed rather than closed.

**Nick's decision: the Keeper hands out onderzoekers, but nobody waits to
start.** A speler who could tie any fiche they can see to their own account
could give themselves a second, a third, the NPC in the next dossier, and the
archive would go on printing each of those names as if the Keeper had meant it.
Casting is a decision about the table. But the door round 11 opened stays open —
a speler holding **nobody** may still make their first onderzoeker and tie it on
— because an onderzoeker *is* an artikel somebody tied on, and closing that too
would leave every new arrival waiting on the Keeper's keyboard for their own
beginning. This **narrows** rule 36's exemption; it does not reverse it, and the
exemption is unchanged in its own terms: keyed on holding none, so it shuts
behind them.

Both halves ask the question the same way on purpose — `listCharacters`, the
fiches this person can actually see, never a count of tie rows — because a fiche
in the prullenbak leaves its knot behind, and a knot to a fiche nobody can see
must not be what locks somebody out of the only road they have. One unit test
runs both gates over the same people so they cannot drift apart later. The
Keeper's screen is the account list in Beheer, which is where the `userId` that
`whose()` and `addCharacter` have always accepted is finally sent from: the
argument had existed for rounds with no screen behind it.

**One thing here was the building agent's judgement, not Nick's instruction**,
and it is flagged rather than buried: `removeCharacter` is Keeper-only. The
argument for it is real — a player who could untie their last onderzoeker would
be back at "holds nobody", which is the one state that opens the door above, so
the self-assignment road would never actually close, and you could take one off
and put a different one on as often as you liked. But nobody asked for it, and
taking a karakter *off* in the sense a player means it is `setActiveCharacter
(null)`, which is untouched and still theirs. If it costs more than it buys it
is one line.

**The autosave patch flattened the infobox, and only somebody else could see
it.** Found by the fix pass at the end of this round, and it is the one failure
of the eight that was the product's rather than a spec's. `useAutosave` collects
changes for 800 ms and merged them with `{ ...pendingPatch.current, ...patch }`.
That is exactly right for a name, a body or a cover — one value, and the second
answer to it is the answer — and it was wrong for `fields` from the moment the
infobox held more than one box. Filling in a Getal and then ticking a Ja/nee
inside one window sends `{ fields: { tonnage } }` and then
`{ fields: { vermist } }`, and replacing the bag threw the Getal away before it
had ever been sent: **one PATCH went out carrying only the last box anybody had
touched.** The editing face still looked correct, because it renders its own
state — the loss showed on **somebody else's screen**, which is why no existing
test caught it and why the new typed-fields e2e did.

The principle worth recording is the one that decides which keys get the new
treatment: **`fields` is a bag of independent answers, so two boxes filled in
one window are two answers and not two versions of one; every other patch key
still replaces, deliberately, because a body or a cover is one value and the
second answer to it is the answer.** The fix is therefore an opt-in and not a
deep merge: `mergePatch(waiting, arriving, mergeKeys)` — pure and exported, so
the rule can be read and tested without a component around it — merges a key
named in `mergeKeys` one level deeper when both its old and its new value are
plain objects, and leaves every other key replacing. `EntryView` passes
`mergeKeys: ['fields']`, which is the whole of the list so far. The merge stops
at one level on purpose: a list *inside* the bag still replaces, or unticking a
Meerkeuze option would never reach the server — `tests/unit/autosave-merge.test.ts`
holds that case among its seven.

This is the twin of §38 and belongs beside it. The gate says **what** may be
stored; `mergeKeys` says **that all of it arrives**. A gate is no use on a patch
that has already lost half the infobox on the way to it.

The other three causes behind those eight failures were the specs' own, and each
is now a bullet in CLAUDE.md §6 rather than a story here: the "'…' aanmaken" row
of a suggest list is on screen before the real suggestions are, so a
`.suggest-item` filtered on the name you typed picks the *create* row;
`?new=1` lands on the editing face, where the name is `#entry-name` and there is
no heading to assert on; and a bare `getByText` can match the side menu's hidden
copy of a karakter's name exactly as a bare `data-testid` has always been able
to. Rule 37 said it first and this round said it again — a spec that fails is a
wrong sentence about the product about as often as it is a race.

**Where round 13 finishes.** Two migrations (`0016_map_access`,
`0017_pin_targets`), one new pure module (`lib/entries/fieldValues.ts`), one new
visibility module (`lib/maps/visibility.ts`), four new unit files
(`field-values.test.ts`, `map-visibility.test.ts`, `map-pins.test.ts`, and
`autosave-merge.test.ts` from the fix pass), one unit file deleted
(`article-mode.test.ts`, whose subject no longer exists), and no new dependency.
Nothing on the wire an older client cannot read: a card with no `scale` is a
card at 1, a speld with a null `target_map_id` is the speld it always was, and a
landkaart with `view_mode = 'all'` is the landkaart everybody could already see.
