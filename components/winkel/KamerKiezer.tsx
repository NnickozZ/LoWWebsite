import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Beurs } from '@/components/kamer/Beurs';
import type { ShopRoom } from '@/lib/kamers/service';
import type { Words } from '@/lib/words';

/**
 * §82: voor wie je koopt, als je meer dan één onderzoeker draagt.
 *
 * Links and not a form, for the reason §46 and §57 keep finding: the whole
 * page is the answer to this question — the purse, what is within reach, where
 * each thing would land — so switching is a navigation and the address has to
 * be able to say which one you are looking at. `?kamer=<id>` is therefore
 * shareable, bookmarkable and survives the Back button, and the page reads it
 * as `searchParams` with no state anywhere.
 *
 * Every chip carries its own purse, because that is the number the choice is
 * made on: somebody with two onderzoekers is deciding *whose* munten to spend
 * before they decide what on.
 *
 * With one onderzoeker there is no switcher at all (the page does not render
 * this) — a choice of one is not a choice, it is a thing to read past.
 */
export function KamerKiezer({
  rooms,
  roomId,
  words,
}: {
  rooms: ShopRoom[];
  roomId: string | null;
  words: Words;
}) {
  return (
    <div className="winkel-kiezer" data-testid="winkel-kiezer">
      <p className="tiny muted winkel-kiezer-label" id="winkel-kiezer-label">
        {words.shopFor}
      </p>
      <div className="row-wrap kamer-tabs" role="group" aria-labelledby="winkel-kiezer-label">
        {rooms.map((room) => {
          const here = room.id === roomId;
          return (
            <Link
              key={room.id}
              href={`/winkel?kamer=${encodeURIComponent(room.id)}`}
              className={`chip chip-selectable${here ? ' chip-active' : ''}`}
              data-testid="winkel-kiezer-kamer"
              data-room={room.id}
              data-here={here ? 'ja' : 'nee'}
              aria-current={here ? 'true' : undefined}
            >
              <Icon name="person" size={13} />
              {room.name}
              {/* §90 (E6): de chip ís de beurs — dezelfde vorm als overal,
                  zodat er onder de kiezer geen tweede saldoblok hoeft te staan. */}
              <span className="winkel-kiezer-saldo">
                <Beurs balance={room.balance} words={words} size="small" title={room.name} />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
