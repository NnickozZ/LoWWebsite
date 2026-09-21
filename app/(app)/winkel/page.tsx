import '@/app/kamer.css';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Beurs } from '@/components/kamer/Beurs';
import { MEANING } from '@/components/kamer/plekWords';
import { LivePage } from '@/components/live/LivePage';
import { KamerKiezer } from '@/components/winkel/KamerKiezer';
import { WinkelFilter } from '@/components/winkel/WinkelFilter';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { shopFor } from '@/lib/kamers/service';
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
 * **§84: het is één lijst met een filter, en niet meer één groep per soort
 * plek.** §82 koos die groepering met een goede reden — een etalage lees je
 * naar wáár een ding zou gaan — en §83 haalde hem onderuit zonder het te
 * merken: sindsdien past een ding op meer dan één soort plek, dus stond het in
 * twee groepen met twee knoppen, en na één koop zeiden die twee rijen over
 * hetzelfde voorwerp tegengestelde dingen. Het filter houdt de vraag in leven
 * zonder het antwoord te verdubbelen; de chips op de rij zeggen waar het past.
 * Dit keert regel 82 om, en dat staat in regel 84 en in `DECISIONS.md`.
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
  const user = await requireViewer();
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

      {/*
        §84: de eyebrow zei op drie verschillende pagina's "Kamer" — hier, in de
        kamer zelf en op de uitdeler. Een kruimelpad dat overal hetzelfde zegt,
        zegt niets. Hier staat nu voor wíé je koopt, wat ook precies de vraag is
        die iemand met twee onderzoekers zich stelt.
      */}
      <p className="eyebrow" data-testid="winkel-eyebrow">
        {room ? room.name : capitalise(words.room)}
      </p>
      <h1 className="winkel-title">{capitalise(words.shop)}</h1>

      {canBuy ? (
        <>
          {/* One onderzoeker is not a choice: just the purse. */}
          {shop.rooms.length > 1 && (
            <KamerKiezer rooms={shop.rooms} roomId={shop.roomId} words={words} />
          )}
          <p className="kamer-balance winkel-balance" data-testid="winkel-balance" data-balance={shop.balance}>
            {/* §84: de beurs en niet nóg een stempel. Wat je hebt ziet er
                anders uit dan wat iets kost — zie `components/kamer/Beurs.tsx`. */}
            <Beurs balance={shop.balance} words={words} />
            {room && (
              <Link className="btn btn-small winkel-kamer-deur" href={`/kamer/${room.slug}`}>
                <Icon name={MEANING.kamer} size={14} />
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
        <WinkelFilter
          items={shop.items}
          roomId={shop.roomId}
          roomSlug={room?.slug ?? null}
          balance={shop.balance}
          canBuy={canBuy}
          words={words}
        />
      )}
    </div>
  );
}
