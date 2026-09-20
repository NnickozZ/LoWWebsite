import Link from 'next/link';
import { Cover } from '@/components/Cover';
import { munt } from '@/components/kamer/plekWords';
import type { ShopItem } from '@/lib/kamers/service';
import type { PlekKind } from '@/lib/kamers/shape';
import type { Words } from '@/lib/words';
import { BuyButton } from './BuyButton';

/**
 * Which of the five things a row in the shop window is.
 *
 * They are asked in this order and the order is the whole rule:
 *
 *  - `list` — there is no purse at all (the Keeper, §18, who wears nobody).
 *    A price list, and not one button anywhere on it.
 *  - `owned` — there is one of it and it is already lying in the kamer being
 *    shopped for. **Only for a thing there is one of** (§83): since ronde 44
 *    you may own two of the same stoel, so for everything else this is a line
 *    of text beside a live button rather than a state.
 *  - `taken` — there is one of it and somebody else has it. Said out loud,
 *    because a lantaarn that is gone is not simply missing from the world.
 *  - `dear` — you cannot pay for it. **Still listed, still priced**, with a
 *    held button saying how much is missing. That is the whole point of a shop
 *    window, and it is `UnlockButton`'s and the catalogue's rule in a third
 *    place.
 *  - `noslot` — you can pay for it and there is nowhere to put it. A line and
 *    a door back to the kamer, where a plek can be opened.
 *  - `buy` — everything is true at once.
 *
 * `dear` deliberately beats `noslot`: somebody who cannot afford a thing is
 * not helped by being told they also have no shelf for it, and the price is
 * the fact they came to read.
 *
 * §83 made this per **kind of plek**, because a thing may fit several and its
 * free plek is not the same answer in each: a row under *muur* with a full muur
 * says `noslot` while the very same thing under *plank* says `buy`.
 */
export type WinkelState = 'list' | 'owned' | 'taken' | 'dear' | 'noslot' | 'buy';

export function winkelState(item: ShopItem, canBuy: boolean, kind: PlekKind): WinkelState {
  if (!canBuy) return 'list';
  // §83: owning one only stops you when there is one of it in the world.
  if (item.unique && item.owned) return 'owned';
  if (item.takenElsewhere) return 'taken';
  if (!item.affordable) return 'dear';
  return item.landsIn[kind] ? 'buy' : 'noslot';
}

/**
 * §82: één ding dat te koop staat.
 *
 * The same four things in the same order as §80's catalogue row, because it is
 * the same question asked in a wider room: the cover, the name with its one
 * line, what it says it gives, and — to the right — the price with whatever
 * may be done about it underneath. Somebody saving up reads a shop window in
 * that order, and a second order would be a second habit.
 *
 * The name is a link to the artikel, because a stuk huisraad *is* an artikel
 * (§79, rule 3) and this is not a second place where it lives. The effect
 * lines are shown and never added up (rule 78): the archive lists, the table
 * decides.
 *
 * Nothing here is told apart by colour — `dear` is `--ink-muted` and a dashed
 * rule, and the state a test reads is `data-state`. §45 has four colour
 * schemes and a Keeperkant on top of them, so a colour is never a fact.
 */
export function WinkelRij({
  item,
  kind,
  roomId,
  roomSlug,
  balance,
  canBuy,
  words,
}: {
  item: ShopItem;
  /**
   * §83: the group this row is drawn in. A thing that fits a muur and a plank
   * is drawn twice — once under each — and the free plek, and therefore the
   * button, is that group's own.
   */
  kind: PlekKind;
  /** The kamer being shopped for, or null when there is no purse (the Keeper). */
  roomId: string | null;
  /** That kamer's onderzoeker-slug, for the way back when there is no free plek. */
  roomSlug: string | null;
  balance: number;
  canBuy: boolean;
  words: Words;
}) {
  const state = winkelState(item, canBuy, kind);
  const short = item.price - balance;
  const landsIn = item.landsIn[kind] ?? null;

  return (
    <li
      className={`kamer-koop winkel-rij${state === 'dear' ? ' kamer-koop-dear' : ''}`}
      data-testid="winkel-rij"
      data-entry-id={item.id}
      data-kind={kind}
      data-price={item.price}
      data-state={state}
      /* §80's attribute, kept spelled the same way so the two rows read alike. */
      data-afford={item.affordable ? 'ja' : 'nee'}
    >
      <Cover
        assetId={item.coverAssetId}
        shape="portrait"
        alt=""
        icon="box"
        variant="thumb"
        className="plek-cover winkel-cover"
      />

      <div className="kamer-koop-body">
        <p className="kamer-koop-name">
          <Link href={`/e/${item.slug}`} data-testid="winkel-naam">
            <strong>{item.name}</strong>
          </Link>
        </p>
        {item.shortDescription && (
          <p className="tiny muted clamp-2 kamer-koop-line">{item.shortDescription}</p>
        )}
        {item.effect.length > 0 && (
          <ul className="tiny kamer-koop-effect" aria-label={words.roomEffects}>
            {item.effect.map((line, index) => (
              <li key={index} data-testid="winkel-effect">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="kamer-koop-buy winkel-buy">
        <span className="stamp kamer-koop-price" data-testid="winkel-prijs">
          {munt(item.price, words)}
        </span>

        {/*
          §83: "dit heb je al" is a *fact*, and only for a unique thing is it
          also a refusal. So it is printed beside a live button as well —
          somebody buying a second stoel deserves to know they own one.
        */}
        {item.owned && (
          <span className="tiny muted winkel-state" data-testid="winkel-owned">
            {words.shopOwned}
          </span>
        )}

        {state === 'taken' && (
          <span className="tiny muted winkel-state" data-testid="winkel-taken">
            {words.shopTaken}
          </span>
        )}

        {state === 'noslot' && (
          <span className="tiny muted winkel-state" data-testid="winkel-geen-plek">
            {roomSlug ? (
              /* The door back: a plek of this kind has to be opened before
                 this can be bought, and that is done in the kamer itself. */
              <Link href={`/kamer/${roomSlug}`} data-testid="winkel-geen-plek-deur">
                {words.shopNoSlot}
              </Link>
            ) : (
              words.shopNoSlot
            )}
          </span>
        )}

        {state === 'dear' && (
          <button
            type="button"
            className="btn btn-small btn-primary"
            data-testid="winkel-koop"
            data-entry-id={item.id}
            disabled
            title={`Je hebt nog ${munt(short, words)} nodig.`}
          >
            {words.buy}
          </button>
        )}

        {state === 'buy' && roomId && landsIn && (
          <BuyButton roomId={roomId} slotId={landsIn} entryId={item.id} label={words.buy} />
        )}
      </div>
    </li>
  );
}
