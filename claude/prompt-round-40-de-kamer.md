# Prompt — ronde 40: de kamer, de plekken en het grootboek

**Claims §79.** Repository `D:\LoWWebsite` → github.com/NnickozZ/LoWWebsite (`main`).
Built on top of ronde 39 (§76–§78), which reserved everything this round fills in.

## Read first, before writing anything

`CLAUDE.md` (all of §1, §3, §5 and §6), then **`README.md` rule 78** — that rule
is the boundary this round is built inside and it is not up for renegotiation.
Then `claude/round-39-aanwezig.md` (what was reserved and why),
`claude/access-characters-maps.md` (§17/§18 — rights are per account, a karakter
is a name somebody wears), and `claude/round-38-het-overzicht.md` (§75 — the
"own table vs. a flag on `entries`" reasoning, which this round answers the
*other* way for voorwerpen and the same way for kamers).

Then the code: `lib/live/keys.ts` (`room:{id}` exists), `lib/live/gate.ts` (the
`case 'room'` that returns `false`), `lib/live/roster.ts` (`labelOfPlace`),
`lib/spelers/panels.tsx` + `components/spelers/KamerPanel.tsx` (the empty
panel), `lib/words.ts` (the reserved words), `lib/access.ts`, `lib/characters.ts`,
`lib/db/schema.ts`, and one recent migration for house style.

## The boundary, restated because everything else depends on it

> The site remembers what you own, what sits in which plek, and what the thing
> *says* it does. It never computes a bonus, never applies one to a roll, and
> never rules on what is legal. The table decides; the site is the ledger and
> the shelf.

If at any point this round starts wanting a `bonus` column, a `+2`, a stat name
or a dice term in a schema, **stop and say so**. The effect of a voorwerp is
prose on its artikel, written by whoever writes artikelen, and read by people.

## The four decisions (Nick's answers). Do not re-open them.

| Question | Answer |
|---|---|
| What a kamer looks like | **A grid of plekken.** Not a canvas, not an illustration — locked (with a price), empty, or holding a voorwerp |
| Where the munt comes from | **The Keeper hands it out**, as a line in a grootboek: amount, reason, date |
| Plekken | **They have kinds.** A voorwerp declares which kind it needs |
| Who may look | **The whole table.** A kamer is open to anyone signed in |

Carried from ronde 39 and equally fixed: a kamer belongs to an **onderzoeker**,
not to an account, and dies with them; a plek is both **unlocked and filled**
with the munt; the munt's *name* stays a word key and is not chosen in code.

## The model — migration `0027_kamers`

Four tables, and each one earns its place. Follow the house style of the most
recent migration exactly (`lib/db/migrations.mjs`, the `.sql` beside its
siblings, runs at startup, nothing by hand).

### `rooms`
One per onderzoeker. `entry_id` is the karakter's artikel (unique), plus the
§17 dials, §44's `keeper_only`, §43's `deleted_at`, and the usual stamps.

- **Made lazily**, on the first visit to a karakter that is tied to an account
  (`user_characters`) — not by a migration walking the table, and not by the
  Keeper pressing anything. `getOrCreateRoom(entryId)` is the only door.
- **The dials start open for looking and shut for writing**: `view_mode: 'all'`,
  `edit_mode: 'private'`. The table looks; the owner arranges.
- **It follows its artikel into the bin and back out** (§43). An onderzoeker in
  the prullenbak takes their kamer with them; restoring brings it back. That is
  the whole of "the room dies with them" — no second delete path, no cascade
  written by hand.

### `room_slots`
The plekken. `room_id`, `kind`, `sort_order`, `price`, `unlocked_at`,
`entry_id` (the voorwerp in it, nullable), `placed_at`.

**Every plek a kamer will ever have is seeded when the kamer is made**, some
unlocked and the rest locked with a price. That is deliberate: a room has to
*show you what you could have* or there is nothing to save up for. The seed list
is one constant in `lib/kamers/shape.ts` — kinds, prices, order — and changing
it later must not disturb a kamer that already exists (write the seeding so it
is additive: new kinds appear as new locked plekken, existing rows are never
re-priced).

The kinds, as a first cut Nick can rename in one place: **muur**, **plank**,
**bureau**, **kist**. Put them in `lib/words.ts`, not in a `CHECK`.

### `room_ledger`
`room_id`, `delta` (signed integer), `reason` (short text), `kind`
(`'grant' | 'slot' | 'item'`), `actor_id`, `created_at`, and the id of whatever
it paid for.

**The balance is `SUM(delta)` and is never stored.** A mistake is corrected by
adding a line, not by editing history, and the Keeper's screen is then just a
list with a form at the bottom. If you find yourself adding a `balance` column
to `rooms` for speed: this table has tens of rows per person. Don't.

### The voorwerp is an artikel
No item table. A voorwerp is an artikel of a **soort** (seed one: *Voorwerpen*),
which is what gives it a picture, a description, §9 secrecy, a §44 side,
mentions, the web, search and the prullenbak for nothing. `room_slots.entry_id`
points at it.

The soort carries one field the kamer reads: **which kind of plek it needs**
(`lib/db/schema.ts`'s `FieldDef` on the soort — a keuze-veld, not a new column).
Nothing else about a voorwerp is special.

## The spending — one function, one transaction

`lib/kamers/service.ts`, and the whole of the money lives there:

- `unlockSlot(slotId, actor)` — the owner only (a Keeper may always). Refuses a
  slot already unlocked, refuses when `balance < price`, and writes the ledger
  line **and** the `unlocked_at` in **one** SQLite transaction. Two clicks must
  not buy it twice: make the guard a condition of the write, not a read before
  it.
- `placeItem(slotId, entryId, actor)` — the owner only. Refuses a voorwerp that
  needs a different kind of plek, refuses one already in another plek of the
  same kamer, refuses an artikel the actor may not see (`visibleEntryCondition`),
  and refuses one that is not of the *Voorwerpen* soort.
- `grant(roomId, delta, reason, actor)` — **Keeper only**, and the one road in
  for a positive line. A negative grant is allowed (a correction, a theft at the
  table) but the balance may never go below zero.
- `clearSlot(slotId, actor)` — the owner takes something out. **No refund**:
  refunds are a second economy and an argument. Say so in the docblock.

Every one of these ends in a `logActivity` line so the feed and the Keeper's
logboek say what happened, exactly as every other write in the archive does.

## The pages

### `/kamer/<slug>`
`<slug>` is the karakter's artikel-slug — one address per onderzoeker, already
unique, and it reads well. `notFound()` for a karakter nobody wears.

It renders `<LivePage place={roomKey(room.id)} watch={[...]} />`. **`roomKey`
already exists in `lib/live/keys.ts`.**

The page: a heading naming the onderzoeker (linking to their artikel), the
balance in `words.currency`, then the grid. A plek is one of three things and
each reads differently at a glance — **locked** (its price and, for the owner, a
button), **empty** (its kind, and for the owner a way to put something in), or
**filled** (the voorwerp's cover, name, and a link to its artikel).

Under it, for the Keeper only: the grootboek and the granting form.

### One rights decision this round has to make, and it is §76's lesson again
A kamer is public, and a voorwerp is an artikel that can be **secret** (§9) or
on the **other side** (§44). So: what does a plek holding something the looker
may not see look like?

**Show it as filled, with no name, no picture and no link** — one constant
phrase, the same for a Keeper-only voorwerp and one on the other side. That
*somebody owns four things* is theirs to show; *which* four is the artikel's own
business. Never show it as empty: an empty plek that is really full is a lie the
owner did not tell. Route it through the same discipline as `rosterFor` — ask
`visibleEntryCondition`, and let one constant be the answer to every refusal.

### The panel, and the two one-line promises ronde 39 left
1. `lib/live/gate.ts`'s `case 'room'` stops returning `false` and asks the kamer
   the same question every other kind is asked (`loadAccessRow` + `canView` +
   the bin, or the service if you give it one). **This is the line the
   reservation existed for** — nothing else in the live layer changes.
2. `lib/live/roster.ts`'s `labelOfPlace` grows a `room` case, so the roster can
   say *"Bram is in de kamer van Van Dijk"* — gated per viewer like every other
   place, for free.
3. `components/spelers/KamerPanel.tsx` stops being an empty state and becomes a
   **summary with a door** (§77's rule, which still holds): the balance, how
   many plekken are filled of how many, and a link to `/kamer/<slug>`. **Nothing
   on it is spendable.** If a "quick spend" appears on that panel, §77 has been
   broken and the round is wrong.

## Rules that must not be broken

1. **The site is the shelf and the ledger, never the referee** (rule 78).
2. **The balance is the sum of the grootboek.** Never a column, never edited.
3. **A voorwerp is an artikel.** No item table, no duplicate name, no second
   picture.
4. **A plek holding something you may not see is filled and nameless** — one
   constant phrase for every reason it is hidden (§76's rule, applied here).
5. **Only the Keeper grants; only the owner spends; nobody goes below zero.**
6. **A kamer follows its onderzoeker into the bin** (§43). No second delete.
7. **The seed shape is additive.** A new kind of plek never re-prices or removes
   a plek somebody already owns.
8. **The munt has no name in the code.** `words.currency`, everywhere.

## Explicitly out of scope

Buffs that do anything. Trading or giving between players. A shop (the Keeper
makes a voorwerp as an artikel and grants the munt; choosing from a catalogue is
a later round). Inheritance when an onderzoeker dies. A second currency.
Anything on the phone tab bar.

## What "green" means

- `tsc --noEmit` silent, `npm run build` clean, full Playwright desktop + phone
  (`per-place-crops.spec.ts:13` is red on untouched `main` since ronde 19 — that
  one is expected).
- **Unit** `tests/unit/kamer.test.ts`, in the discipline of `access.test.ts` and
  `roster.test.ts` — **every rights assertion made from the side of the person
  who may not**: another player trying to unlock, to place, to grant; a Keeper
  who may; a voorwerp of the wrong kind; a voorwerp the actor cannot see; a
  double unlock; a spend that would go below zero; the balance after a
  correction; a kamer following its artikel into the bin and back; and the
  hidden-voorwerp phrase being the same for §9 and §44.
- **e2e** `tests/e2e/kamer.spec.ts`: the Keeper grants, the owner unlocks a plek
  and puts a voorwerp in it, a second player opens the same kamer and sees it,
  and a second player sees the constant phrase instead of a secret voorwerp.
  One phone case for the grid.
- The migration runs on a fresh archive **and** on a copy of the real one.

## When it is done

Write `claude/round-40-de-kamer.md` in the house style: what was asked, the
decisions taken up front, what was built and why *that* way, the bugs found on
the way, the rules that must not be broken, what was left out, what was tested,
and the deploy line — including that this one **does** have a migration.

And add **rule 79** to `README.md` in the same voice as 76–78, plus the §5
pointer in `CLAUDE.md`. Rule 78 stays exactly as it is: it is the boundary, and
79 is what was built inside it.
