'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { plekIcon, plekWord } from '@/components/kamer/plekWords';
import type { ShopItem } from '@/lib/kamers/service';
import { PLEK_KINDS, type PlekKind } from '@/lib/kamers/shape';
import type { Words } from '@/lib/words';
import { WinkelRij } from './WinkelRij';

/**
 * §84: de etalage als één lijst, met een filter erboven.
 *
 * §82 groepeerde per soort plek — "een etalage lees je naar wáár een ding zou
 * gaan" — en dat klopte, tot §83 een ding op twee soorten plek liet passen. Toen
 * stond hetzelfde ding in twee groepen, met twee knoppen, en na één koop zeiden
 * die twee rijen tegengestelde dingen over één voorwerp.
 *
 * Het filter houdt §82's vraag in leven zonder het antwoord te dupliceren: je
 * kunt nog steeds vragen *wat hangt er aan een muur*, maar een ding staat maar
 * één keer op het scherm en draagt zelf de chips die zeggen waar het past.
 *
 * Het telt erbij hoeveel er in elke soort zitten, want een filter dat naar een
 * lege lijst leidt is een filter dat je twee keer moet proberen. Een soort
 * waar niets van te koop is staat er niet — een kop met een gat eronder is geen
 * kop.
 *
 * De keuze leeft in de component en niet in het adres. Een `?plek=` zou een
 * deelbare link zijn naar *een filter*, en dat is niet iets wat iemand deelt;
 * het is een gebaar, geen plaats. En daarmee blijft de pagina één server-render
 * (`shopFor` draait één keer) in plaats van een navigatie per chip.
 */
export function WinkelFilter({
  items,
  roomId,
  roomSlug,
  buyerName = null,
  balance,
  canBuy,
  words,
}: {
  items: ShopItem[];
  roomId: string | null;
  roomSlug: string | null;
  /** §90 (E2): voor wie je koopt, bij meer dan één onderzoeker. */
  buyerName?: string | null;
  balance: number;
  canBuy: boolean;
  words: Words;
}) {
  const [kind, setKind] = useState<PlekKind | null>(null);

  const counts = useMemo(() => {
    const out = new Map<PlekKind, number>();
    for (const item of items) for (const k of item.plekken) out.set(k, (out.get(k) ?? 0) + 1);
    return out;
  }, [items]);

  const shown = kind ? items.filter((item) => item.plekken.includes(kind)) : items;

  return (
    <>
      <div className="row-wrap winkel-filter" role="group" aria-label={words.shop} data-testid="winkel-filter">
        <button
          type="button"
          className={`chip chip-selectable${kind === null ? ' chip-active' : ''}`}
          aria-pressed={kind === null}
          data-testid="winkel-filter-chip"
          data-kind=""
          onClick={() => setKind(null)}
        >
          {words.shopAll}
          <span className="winkel-filter-count">{items.length}</span>
        </button>
        {PLEK_KINDS.map((option) => {
          const count = counts.get(option) ?? 0;
          if (!count) return null;
          return (
            <button
              key={option}
              type="button"
              className={`chip chip-selectable${kind === option ? ' chip-active' : ''}`}
              aria-pressed={kind === option}
              data-testid="winkel-filter-chip"
              data-kind={option}
              onClick={() => setKind(kind === option ? null : option)}
            >
              <Icon name={plekIcon(option)} size={12} />
              {plekWord(option, words)}
              <span className="winkel-filter-count">{count}</span>
            </button>
          );
        })}
      </div>

      <ul className="kamer-catalogus" aria-label={words.shop}>
        {shown.map((item) => (
          <WinkelRij
            key={item.id}
            item={item}
            roomId={roomId}
            roomSlug={roomSlug}
            buyerName={buyerName}
            prefer={kind}
            balance={balance}
            canBuy={canBuy}
            words={words}
          />
        ))}
      </ul>
    </>
  );
}
