import '@/app/kamer.css';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { plekIcon, plekWord, munt } from '@/components/kamer/plekWords';
import { LivePage } from '@/components/live/LivePage';
import { KamerKiezer } from '@/components/winkel/KamerKiezer';
import { WinkelRij } from '@/components/winkel/WinkelRij';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { shopFor } from '@/lib/kamers/service';
import { PLEK_KINDS } from '@/lib/kamers/shape';
import { capitalise } from '@/lib/words';

export const dynamic = 'force-dynamic';

/**
 * §82: de winkel — alles wat er te koop is, op één plek.
 *
 * §80 put the catalogue *inside* the plek-picker, which answers "what fits
 * this plek" — the right question with an empty plank in front of you, and the
 * wrong one for the thing a player does between sessions: look at everything,
 * pick something, and save for it. You cannot save up for what you have to
 * open a drawer to see. So this page asks nothing and shows everything.
 *
 * Three decisions are visible in the shape.
 *
 * **It is grouped by soort plek and not by price.** A shop window is read by
 * where a thing would go — you are standing in a kamer with an empty muur, and
 * the question is what hangs there. Inside a group it is cheapest first, which
 * is `shopFor`'s own order and the order somebody saving up reads. Since §83 a
 * thing may fit more than one kind, and then it stands in each of their
 * groups — with the free plek, the state and the button of *that* group.
 *
 * **Nothing is hidden for being out of reach.** What you cannot afford stays
 * in the list with its price on it, greyed and held, and the button says how
 * much is missing. A shop that shows only what you can already pay for is a
 * till, not a window — the same rule the locked plek and §80's catalogue row
 * already keep, now in the place it matters most.
 *
 * **Every refusal is the service's.** A purchase goes through the plek's own
 * `buy` route and therefore through `buyFurnishing`, with all five of its
 * conditions asked again at the moment of the click. `landsIn` — the first
 * open, empty plek of the right kind — is a convenience this page offers and
 * never a decision it makes, so a shop that has gone stale refuses rather than
 * lies.
 *
 * The Keeper wears no onderzoeker (§18), so he has no purse here and no
 * buttons: he reads it as the price list it is for him, because he puts things
 * down for free (`placeItem`). That is `words.shopKeeper`, and it is the same
 * line anybody without an onderzoeker gets — the page has no purse to offer
 * either way, and inventing a second sentence for a state nobody is in would
 * be a word the Keeper cannot rename.
 */
export default async function WinkelPage({
  searchParams,
}: {
  searchParams: Promise<{ kamer?: string | string[] }>;
}) {
  const user = await getSessionUser();
  const query = await searchParams;
  /*
   * `?kamer=<id>` — which onderzoeker's purse is being spent. A repeated
   * parameter takes the first, an unknown id falls through to the first kamer
   * (`shopFor` resolves it), and no id at all is the same thing. Nothing
   * validates it here on purpose: the id is only ever matched against the
   * kamers this viewer actually wears, so a stranger's id is not a leak, it is
   * a miss.
   */
  const wanted = Array.isArray(query.kamer) ? query.kamer[0] : query.kamer;
  const shop = shopFor(user, wanted ?? null);
  const words = getWords();

  const canBuy = shop.rooms.length > 0 && shop.roomId !== null;
  const room = shop.rooms.find((candidate) => candidate.id === shop.roomId) ?? null;

  return (
    <div className="page winkel-page" data-testid="winkel-page" data-room={shop.roomId ?? ''}>
      {/*
       * §21: `entries` because everything for sale is an artikel and may be
       * renamed, re-priced, re-covered or hidden under somebody else's hand;
       * `characters` and `users` because whose purse this is, and whether
       * there is one at all, is a karakter somebody wears.
       */}
      <LivePage place="page:/winkel" watch={['entries', 'characters', 'users']} />

      <p className="eyebrow">{capitalise(words.room)}</p>
      <h1 className="winkel-title">{capitalise(words.shop)}</h1>

      {canBuy ? (
        <>
          {/* One onderzoeker is not a choice: just the purse. */}
          {shop.rooms.length > 1 && (
            <KamerKiezer rooms={shop.rooms} roomId={shop.roomId} words={words} />
          )}
          <p className="kamer-balance winkel-balance" data-testid="winkel-balance" data-balance={shop.balance}>
            <span className="stamp">{munt(shop.balance, words)}</span>
            {room && (
              <Link className="btn btn-small winkel-kamer-deur" href={`/kamer/${room.slug}`}>
                <Icon name="home" size={14} />
                {capitalise(words.room)}
              </Link>
            )}
          </p>
        </>
      ) : (
        <p className="small muted winkel-keeper" data-testid="winkel-keeper">
          {/*
           * §82: twee redenen om geen beurs te hebben, en maar één ervan is de
           * Keeper. Hij zet dingen zelf neer; iemand die nog geen onderzoeker
           * draagt kan ze juist nérgens kwijt. Dezelfde regel voor allebei zou
           * de tweede iets vertellen wat niet waar is.
           */}
          {user?.isKeeper ? words.shopKeeper : words.shopNoCharacter}
        </p>
      )}

      {shop.items.length === 0 ? (
        <p className="small muted" data-testid="winkel-leeg">
          {words.shopEmpty}
        </p>
      ) : (
        /*
         * The four kinds in `PLEK_KINDS`' own order — the ladder's order, the
         * one a kamer is built in — and not alphabetically, which is how the
         * service happens to sort. A group with nothing in it is not a heading
         * with a hole under it; it is simply not there.
         */
        PLEK_KINDS.map((kind) => {
          // §83: een ding dat op meerdere soorten plek past staat in élke
          // groep waar het in past — dat is wat een etalage per soort plek
          // betekent, en de rij krijgt de soort van zijn groep mee omdat zijn
          // vrije plek (en dus zijn knop) per soort verschilt.
          const items = shop.items.filter((item) => item.plekken.includes(kind));
          if (items.length === 0) return null;
          const label = plekWord(kind, words);
          return (
            <section key={kind} className="winkel-groep" data-testid="winkel-groep" data-kind={kind}>
              <h2 className="winkel-groep-title">
                <Icon name={plekIcon(kind)} size={14} />
                {capitalise(label)}
              </h2>
              <ul className="kamer-catalogus winkel-lijst" aria-label={capitalise(label)}>
                {items.map((item) => (
                  <WinkelRij
                    key={item.id}
                    item={item}
                    kind={kind}
                    roomId={shop.roomId}
                    roomSlug={room?.slug ?? null}
                    balance={shop.balance}
                    canBuy={canBuy}
                    words={words}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
