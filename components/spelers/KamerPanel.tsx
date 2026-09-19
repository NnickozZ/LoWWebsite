import Link from 'next/link';
import { munt } from '@/components/kamer/plekWords';
import type { Words } from '@/lib/words';

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
          <Link className="feed-item speler-feed-row" href={room.href} data-testid="kamer-panel-deur">
            <span className="small" style={{ display: 'block', fontWeight: 600 }}>
              {room.name}
            </span>
            <span className="tiny muted" style={{ display: 'block' }} data-testid="kamer-panel-samenvatting">
              {munt(room.balance, words)} &middot; {room.filled} van {room.open}{' '}
              {room.open === 1 ? words.slot : words.slotPlural} gevuld
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
