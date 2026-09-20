import Link from 'next/link';
import { Beurs } from '@/components/kamer/Beurs';
import { fill, type Words } from '@/lib/words';

export type KamerPanelData = {
  /** One line per onderzoeker this account wears whose kamer the *reader* may open. */
  rooms: {
    entryId: string;
    name: string;
    /** `/kamer/<slug>` — `roomSummary`'s, so there is one answer to where a kamer lives. */
    href: string;
    balance: number;
    /** How many open plekken hold something. */
    filled: number;
    /** How many plekken are open at all. Locked ones are not counted: they are not shelf yet. */
    open: number;
    /** §85: and how many there are in total, locked ones included — "3 van 12". */
    total: number;
  }[];
};

/**
 * §77, paneel 3: de kamer. §79 filled it in.
 *
 * **A summary with a door, and nothing on it is spendable.** That is §77's rule
 * and it is the one this panel is most tempted to break: a balance and a row of
 * plekken is exactly the thing somebody will want a quick "open die plek"
 * button on, and the moment there is one there are two roads to a spend — one
 * of them on a page that is not the kamer, and two roads to one fact are two
 * roads that can disagree. So this reads and points, and every verb lives on
 * `/kamer/<slug>`.
 *
 * The second half of that rule is kept too: nothing lives here that has no page
 * of its own. Until §79 there was no such page, which is why this file used to
 * be one sentence (`words.roomEmpty`) and no furniture.
 *
 * A panel is per *account*, and a kamer is per **onderzoeker** (§17/§18: a
 * karakter is a name somebody wears, and the kamer dies with them), so an
 * account wearing three fiches gets three lines. `roomSummary` is asked once
 * per fiche and returns null for a karakter the reader may not see, so the
 * narrowing is the archive's own and not a second copy of it here.
 *
 * **§85 made each line a door you can see.** It was a `.tiny muted` sentence
 * reading `6 munten · 1 van 3 plekken gevuld` — the balance drawn in the same
 * grey as the count beside it, at the size the archive uses for timestamps.
 * The beurs is the one number on this panel that a person is looking for, and
 * since §84 the archive has a shape for exactly that, used in the shell, the
 * kamer, the winkel and the plek-kiezer. Using it here too costs nothing and
 * makes the fifth place the same as the other four.
 *
 * What is still true is §77's rule: **nothing on it is spendable.** A beurs is
 * a reading of `roomSummary`'s balance, not a control, and the whole row is
 * one link to the kamer where the verbs live.
 */
export function KamerPanel({ data, words }: { data: KamerPanelData; words: Words }) {
  if (data.rooms.length === 0) {
    // An honest empty line: there is no kamer, which is not the same as a kamer
    // with nothing in it (`words.roomEmpty`, which belongs on the page itself).
    return (
      <p className="small muted" style={{ margin: 0 }}>
        Nog geen {words.room}.
      </p>
    );
  }

  return (
    <ul className="speler-feed" aria-label={words.roomPlural} data-testid="kamer-panel">
      {data.rooms.map((room) => (
        <li key={room.entryId}>
          <Link className="feed-item speler-kamer-rij" href={room.href} data-testid="kamer-panel-deur">
            <Beurs balance={room.balance} words={words} size="small" />
            <span className="speler-kamer-woorden">
              <span className="small speler-kamer-naam">{room.name}</span>
              <span className="tiny muted" data-testid="kamer-panel-samenvatting">
                {fill(words.roomPanelLine, {
                  open: String(room.open),
                  alle: `${room.total} ${room.total === 1 ? words.slot : words.slotPlural}`,
                  gevuld: String(room.filled),
                })}
              </span>
            </span>
            <span className="speler-kamer-pijl" aria-hidden="true">
              &rarr;
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
