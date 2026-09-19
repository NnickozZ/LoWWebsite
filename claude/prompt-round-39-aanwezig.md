# Prompt — ronde 39: Aanwezig, de spelerspagina, en een deur naar de kamer

**Claims §76 (Aanwezig) and §77 (de spelerspagina).** Repository `D:\LoWWebsite`
→ github.com/NnickozZ/LoWWebsite (`main`).

## Read first, before writing anything

`CLAUDE.md`, and then, in this order: `claude/live-everywhere.md` (§21 — the
line, places, `canWatch`, the rules about effect dependencies),
`claude/round-29-de-co-op-pass.md` (§59–§62 — the hold, one line per browser,
leader election, idle tabs), `claude/access-characters-maps.md` (§17–§19 —
rights per account, characters as worn names, `attributed()`),
`claude/round-38-het-overzicht.md` (§75 — the front-door pattern, and the
reasoning about "own table vs. a flag on an existing one").

Then read the code: `lib/live/keys.ts`, `lib/live/hub.ts`, `lib/live/gate.ts`,
`components/live/LiveProvider.tsx`, `components/live/LivePage.tsx`,
`components/live/LiveStrip.tsx`, `lib/characters.ts`, `lib/access.ts`,
`lib/words.ts`.

## What I asked for

> "A page/indicator/popup menu where you can see all currently online people and
> what character they have selected. I want the user to be able to see where they
> are right now, what they are doing on there, and if you click on it you get
> transported to the same page. Perhaps this user page in the future can contain
> more info? Meta progression stuff we will add for the Call of Cthulhu campaign."

The meta progression is now known in outline: every investigator gets a **room**
with **slots**; a currency (name undecided — gulden, kristal, scherf) buys both
new slots and the things that fill them, and those things give buffs. **None of
that is built this round.** This round builds the presence roster and the
spelerspagina, and reserves — honestly and minimally — the space the kamer will
occupy.

## Decisions already taken. Do not re-open them.

| Question | Decision |
|---|---|
| Shape | A popover off the existing `LiveStrip`, **plus** a spelerspagina per account |
| Someone in a place I may not see | One constant placeholder, never the kind, never the title, never clickable |
| How much activity | Place **and** a live verb ("typt", "tekent", "kijkt"), decaying |
| The Keeper | Players never see his location, only that he is there. He sees everyone's |
| Rows | One per **person**, not per tab; a second tab is a silent "+1" |
| Idle | An idle browser (§60) stays listed, greyed, "even weg" |
| Recently seen | A 30-minute tail below a rule: name, time, **no place** |
| Teleport | Same tab, client-side. A place you may not enter is not clickable |
| Nudge | "Kom kijken" — one-shot, expires ~2 min, never stored |
| Invisibility | None for players. One toggle for the Keeper, on his own page |
| Address | `/spelers/<gebruikersnaam>` — the account is the identity |
| Kamer | Per **investigator**; slots are both unlocked and filled with currency. Not built now |
| Words | *Aanwezig* (the feature), "Wie is er?" (the popover), *Spelerspagina* |

---

# Part A — §76, Aanwezig

## A1. The roster is per viewer, not a broadcast

`hub.ts` already knows every connection's place. What it has never done is say a
place **out loud**. That is the whole difficulty of this round: "Nick is op *Het
dagboek van Ysbrand*" asserts that the artikel exists, and on which side (§44),
to someone `canWatch` would have refused the key to.

So the roster frame is **built per connection**, not built once and fanned out.
For every other person on the line, the receiving viewer's own identity decides
whether the label is the real one or the placeholder. With this table that is on
the order of ten people times ten viewers; **that is fine, and it must stay
dumb**. Do not build a cache keyed on anything clever. One memoised map of
`placeKey → { label, kind, ids needed for the gate }`, invalidated when the
underlying change key fires, is as far as this goes.

Concretely:

- A new module `lib/live/roster.ts` owns: `labelOfPlace(placeKey)` (the real,
  ungated label + whatever the gate needs), and `rosterFor(viewer, people)`
  (applies `canWatch` per row and substitutes the placeholder).
- `gate.ts` is the **only** thing that decides visibility. Do not write a second
  rule here. If a place key has no branch in `canWatch`, it resolves to the
  placeholder — fail closed, and add the branch deliberately.
- Page places (`page:/wiki`, `page:/maps`, …) are labelled from `words.ts`, never
  from the raw path, and they are visible to everyone.

## A2. What a row carries

Per person: account id, the **worn character's** name via `lib/characters.ts`
(`attributed()` / `displayNameOf` — never `users.username` as the headline; the
account goes in the tooltip, exactly as the feeds do, rule 5 of
`access-characters-maps.md`), the person's live colour (same ink as the strip and
the board bars), the place label or the placeholder, the verb, an
active/idle/away state, and a `href` that is **null** when the place is not
visible.

The Keeper is always "de Keeper", with no character and no place — for players.
For a Keeper viewer, every row is fully resolved.

## A3. The verb

Derive it from what the line already carries; do not add new reporting from the
pages. A keystroke in a room frame → "typt". An ink frame → "tekent". A pointer
frame carrying `m` (a dragged thing) → "verplaatst iets". A pointer frame alone,
or nothing for a while → "kijkt". **Decay is mandatory**: a verb older than ~20 s
falls back to "kijkt", or the thing gets stuck on "typt" forever the moment
someone closes a laptop mid-sentence. The verb is presentation, never persisted,
and never part of a change key.

## A4. Who counts as online

§60 means one browser holds one line and elects a leader; tabs that nobody looks
at hand their socket back after 45 s. So:

- Group connections by **account**. One row per account.
- The row's place is the place of the **most recently interacted** tab of that
  account. If other tabs of the same account sit elsewhere, show "+1" (or +n) with
  no names of places — a person's other tab is not an invitation, and naming it
  doubles the leak surface for nothing.
- An account whose every connection is `idle` is listed greyed with "even weg".
  It is **not** dropped, and the strip's existing rule holds: idle is not an
  error and must never read as "geen verbinding".
- A person whose last connection closed goes into the tail for 30 minutes:
  name, worn character, "20 min geleden", **no place, no link**. The tail is
  in-memory in the hub — no migration, and a `pm2` restart emptying it is
  acceptable. (The hub is already single-process, `live-everywhere.md`, last
  section.)

## A5. The popover

`LiveStrip` keeps doing exactly what it does now — it is the glance. It becomes a
button that opens "Wie is er?" beneath it. The strip's own contents do not change,
and it must still not re-render on pointer frames (`useLiveBase`, §60).

The popover: heading, then rows (colour disc with the initial, character name,
account in a `title`, place-or-placeholder, verb), then a thin rule, then the
tail. Empty state when you are alone: something true and short, not "0 users
online". Escape closes it; it is portalled to `<body>` like every other overlay
(rule 7 in `access-characters-maps.md` — a sheet rendered inside the sticky side
menu ends up under the page); it traps focus and is reachable by keyboard; it
closes on navigation. On phone it opens as an ordinary `Sheet` from the bottom —
**the tab bar is full at seven tabs** (rule 9), so nothing new goes in it.

A row with an `href` navigates in the same tab with the app's normal client-side
navigation. A row without one is visibly inert: greyed, `aria-disabled`, no
pointer cursor, and it does not silently do nothing on click — it is obviously
not a link in the first place.

## A6. The nudge

"Kom kijken" on your own row's context (or a small button per row) sends one POST
on the existing line: `{ kind: 'nudge', to: accountId, place: <your place key> }`.

The server **refuses it if the recipient fails `canWatch` on that place** — do not
send someone an invitation to a door they cannot open; that is the same leak as
A1 wearing a friendlier hat. Refused means refused silently to the sender, with a
short honest message ("daar kan {naam} niet bij").

The recipient's strip shows one line — "Nick vraagt je bij *De Kelder*" — with a
jump and a dismiss. It expires after ~2 minutes on its own. It is never stored,
never queued for someone offline, never repeated, and there is a floor on how
often one account can nudge another (a few seconds) so nobody can drum on it.

---

# Part B — §77, de spelerspagina

## B1. The page

`/spelers/<gebruikersnaam>`. Every signed-in person may look at every spelerspagina;
what each **panel** shows is gated by the rules that already govern its own data
(a dossier you are not in does not appear in someone's dossier panel, the feed
panel shows only lines you could already see, and so on). The page must render
`<LivePage>` like everything under `app/(app)` — `tests/unit/live-everywhere.test.ts`
enforces that — which means `lib/live/keys.ts` needs a place for it in the same
shape as `overzichtPagePlace` (two segments; `PAGE_PLACES` is a fixed list and
this is not fixed). Standing on someone's spelerspagina is itself a visible place.

The existing *Jij* page stays what it is (settings, wardrobe, the character
switcher) and gains a link to your own spelerspagina. Two pages, one shape each —
do not merge them, and do not build a second wardrobe.

## B2. The panel registry — and the rule that keeps it honest

Panels are a registry (`lib/spelers/panels.ts` or similar): an id, a title from
`words.ts`, a loader that runs server-side with the viewer's identity, and a
component. Adding the kamer later is one object in an array.

> **A panel is a summary with a door.** It shows the smallest true thing — a
> balance, three portraits, the last four lines — and links to the page that owns
> it. Nothing on a panel is editable, and nothing lives in a panel that has no
> page of its own.

Write this into `CLAUDE.md`. Without it, the first person who adds "quick spend"
to the kamer panel has started a second, worse room editor inside a summary, and
it will never be removed.

## B3. The panels at launch

1. **Nu bezig** — the same row the roster shows, in full width: where they are (or
   the placeholder), the verb, or "niet online" plus the last-seen time.
2. **Karakters** — the characters this account has worn (`lib/characters.ts`),
   the active one marked, each a link to its artikel, with portraits where the
   artikel has a cover (§50 — resolve the cover before rendering).
3. **De kamer** — reserved. See Part C. An honest empty state, no fake numbers, no
   placeholder currency icon, no progress bar that measures nothing.
4. **Recente bijdragen** — the last handful of feed lines by this account, through
   the feed's existing visibility, printed with `attributed()` labels as the feed
   does.
5. **Dossiers** — the dossiers you and they are both in, or that are open to you.
   Nothing else.

Your **own** spelerspagina shows the same panels; it does not become a control
panel.

---

# Part C — the reservations for the kamer. Build nothing else.

No table, no migration, no currency column, no slots, no items. Exactly four
things, so that the kamer lands in a prepared place instead of a renovated one:

1. **`room:{id}` is accepted as a record key and a place key** in `lib/live/keys.ts`
   (`RecordKind`, `parseRecordKey`), with a branch in `canWatch` that — with no
   table to ask — refuses it. Fail closed. When the kamer lands it flips one
   function, and every roster, label and gate path already routes through it.
2. **Vocabulary** in `words.ts`: `room` / `roomPlural`, `slot` / `slotPlural`, and
   `currency` / `currencyPlural` left deliberately unnamed in the code (the string
   is a word key, never a table name, a route segment or a CSS class). Renaming
   "gulden" to "kristal" must stay a ten-second edit forever.
3. **The kamer panel**, empty, in the registry.
4. **A note in `CLAUDE.md`** stating the boundary the kamer will be built inside,
   so the next round inherits it rather than re-deciding it:

   > The site remembers what you own, what sits in which slot, and what the thing
   > says it does. It never computes a bonus, never applies one to a roll, and
   > never rules on what is legal. The table decides; the site is the ledger and
   > the shelf. A balance is the sum of a ledger, never a number someone edits.
   > Items are **artikelen** of a soort, not a private item table, so that a thing
   > in a room is a thing in the world: pictures, secrecy per §9, a side per §44,
   > mentions and webs for free.

---

# Rules that must not be broken

1. **A place is named per viewer, or not at all.** `rosterFor` applies `canWatch`
   to every row. A place key with no branch in `gate.ts` resolves to the
   placeholder. There is exactly one placeholder string and it never varies by
   kind — the variation *is* the leak.
2. **The placeholder is never a link.** A 403 or a 404 arriving after a click is
   an answer to a question the row refused to answer.
3. **A nudge is gated on the recipient, not the sender.**
4. **The Keeper's location is not shown to players**, and the roster never prints
   a Keeper's worn character (rule 5, `access-characters-maps.md`: a Keeper is
   always the Keeper's word).
5. **The verb decays.** Nothing on the wire may leave a person permanently
   "typt".
6. **Only stable functions from `useLive()` in dependency arrays** (§60, rule 6
   of `live-everywhere.md`, and the `reportPointer` trap in §29). The popover
   reads `useLiveBase`.
7. **One row per account.** Other tabs are a count, never a second place.
8. **A panel is a summary with a door** (B2).
9. **Nothing in Part C grows.** If the kamer starts appearing in this round's
   diff, stop and say so.

# Explicitly out of scope

The kamer itself, slots, currency, items, a ledger, the Keeper's granting UI.
Notifications outside the tab. A history of who was where. Per-page viewer counts
elsewhere in the UI. Anything on the phone tab bar. Search over people.

# What "green" means

- `tsc --noEmit` clean, `npm run build` clean, full Playwright desktop + phone
  (`per-place-crops.spec.ts:13` is red on untouched `main` since round 19 — that
  one is expected).
- **Unit**: `roster.test.ts` — every kind of place, asserted **from the other
  side**, the way `access.test.ts` does it: a player looking at a Keeper-only
  artikel, the far side of a §44 pair, a private prikbord, a dossier they are not
  in, an unknown key shape. Plus grouping (two tabs, one row), idle, tail
  expiry, verb decay, and the nudge refusal.
- **e2e** `aanwezig.spec.ts`: two browsers; B opens the popover and sees A's real
  place; A walks onto a Keeper-only artikel and B's row turns into the
  placeholder and stops being clickable; B clicks a visible row and lands on the
  same page; A's browser goes idle and the row greys instead of vanishing; a
  nudge appears on the other screen and expires. One phone-project run of the
  sheet variant.
- The unit test that walks `app/(app)` still passes with the new page.

# When it is done

Write `claude/round-39-aanwezig.md` in the house style: what I asked, the
decisions taken up front, what was built and why *that* way, the bugs found on the
way, the rules that must not be broken, what was deliberately left out, what was
tested, and the deploy line. List any file that must be `git rm`'d, since the
bridge cannot delete.
