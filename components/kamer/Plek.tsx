import Link from 'next/link';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import type { SlotView } from '@/lib/kamers/service';
import type { Words } from '@/lib/words';
import { ClearButton } from './ClearButton';
import { PlaceButton } from './PlaceButton';
import { UnlockButton } from './UnlockButton';
import { MEANING, munt, plekIcon, plekWord, shortfall } from './plekWords';

export type PlekState = 'locked' | 'empty' | 'filled' | 'veiled';

/** Which of the four things this plek is. `veiled` is asked first: it is a *filled* plek. */
export function plekState(slot: SlotView): PlekState {
  if (slot.veiled) return 'veiled';
  if (slot.locked) return 'locked';
  return slot.item ? 'filled' : 'empty';
}

/**
 * §79: one plek, in one of four states, and each has to read differently at a
 * glance — which is the whole of this file's job.
 *
 *  - **locked** — its kind, its price, and a button for a hand that may spend.
 *    The price is there for *everybody*, including somebody who will never buy
 *    it: a kamer that shows only what you already own gives you nothing to look
 *    at and nothing to save up for.
 *  - **empty** — its kind, and a way in for a hand that may arrange.
 *  - **filled** — the voorwerp's own cover and name, linking to its artikel,
 *    because a voorwerp *is* an artikel (rule 3 of the round) and this is not a
 *    second place where it lives.
 *
 *    §80 asked whether the price belongs here too, and the answer is **no**.
 *    What a filled plek cost is already written down twice — once in the
 *    grootboek, where the spend is a line, and once in the catalogue, where
 *    the same thing is still for sale to somebody else. A third copy on the
 *    tile turns a kamer into a price list, and the tile has exactly the room
 *    for a picture and a name. The price belongs where it is a *decision* (the
 *    locked plek, the catalogue row), not where it is a memory.
 *  - **veiled** — `words.slotVeiled`, and nothing else.
 *
 * That last one is §76's rule standing in a new place and it is the most
 * important line on the page. A plek holding something the looker may not see
 * is drawn **filled and nameless**: no name, no picture, no link, no kind, no
 * price, no button, and the same single phrase whether the voorwerp is
 * Keeper-only (§9) or on the other side (§44). Two things are being kept apart
 * here and both matter — showing it as *empty* would be a lie the owner never
 * told, and showing it as *anything more* would leak. The variation itself is
 * what leaks, which is why even the kind is left off: it is the one difference
 * that would let two veiled plekken be told apart, and nothing on this screen
 * needs that.
 *
 * The four states are distinguished by shape and by a dashed-or-solid rule in
 * `app/kamer.css`, never by a colour of their own: §45 has four colour schemes
 * and a Keeperkant on top of them.
 */
export function Plek({
  slot,
  roomId,
  balance,
  canArrange,
  words,
}: {
  slot: SlotView;
  roomId: string;
  balance: number;
  canArrange: boolean;
  words: Words;
}) {
  const state = plekState(slot);

  /*
   * The veiled plek returns early and on purpose: there is no shared frame to
   * fall through into, because every line of the frame below it (the kind, the
   * icon, the price, the buttons) is a thing this state may not say. An early
   * return is harder to add a leak to than a conditional inside a body.
   */
  if (state === 'veiled') {
    return (
      <li
        className="plek plek-veiled"
        data-testid="plek"
        data-state="veiled"
        data-plek={slot.id}
        data-sort={slot.sortOrder}
      >
        <p className="small plek-veiled-line" data-testid="plek-veiled">
          {words.slotVeiled}
        </p>
      </li>
    );
  }

  const kind = plekWord(slot.kind, words);

  return (
    <li
      className={`plek plek-${state}`}
      data-testid="plek"
      data-state={state}
      data-kind={slot.kind}
      data-plek={slot.id}
      data-sort={slot.sortOrder}
      /* §84: waar de *Bekijk* van een koopmelding naartoe springt. Eén anker
         per plek, zodat de winkel kan zeggen "ga kijken" en de kamer weet waar. */
      id={`plek-${slot.id}`}
    >
      <p className="tiny plek-kind" data-testid="plek-kind">
        <Icon name={plekIcon(slot.kind)} size={12} />
        {kind}
      </p>

      {state === 'locked' && (
        <>
          <p className="plek-price" data-testid="plek-price" data-price={slot.price}>
            <span className="stamp">{munt(slot.price, words)}</span>
          </p>
          <p className="tiny muted plek-locked-line">{words.slotLocked}</p>
          {/* §85: dezelfde greep als bij een lege plek — zie `.plek-slot-merk`. */}
          <span className="plek-slot-merk" aria-hidden="true">
            <Icon name={MEANING.openen} size={28} />
          </span>
          {/*
            §84: één van de twee, nooit allebei en nooit geen van beide.
            
            Tot ronde 45 stond hier altijd een knop, uitgeschakeld als je hem
            niet kon betalen, met de reden in een `title` — en een `title`
            bestaat niet op een telefoon. Wie twee munten tekortkwam zag dus een
            grijze knop en geen enkele uitleg. Nu staat de zin er gewoon, en de
            knop is weg in plaats van dood: een knop die niets doet naast een
            zin die zegt waarom is er één te veel.
          */}
          {canArrange &&
            (balance >= slot.price ? (
              <UnlockButton
                roomId={roomId}
                slotId={slot.id}
                kind={slot.kind}
                price={slot.price}
                words={words}
              />
            ) : (
              <p className="tiny plek-short" data-testid="plek-short">
                {shortfall(slot.price, balance, words)}
              </p>
            ))}
        </>
      )}

      {state === 'empty' && (
        <>
          {/*
            §85: een lege plek toonde één woord — "Leeg" — en verder niets, en
            een raster van die tegels leest als een pagina die nog aan het laden
            is. Het icoon van de soort, groot en gedempt, zegt hetzelfde met de
            vorm die de tegel toch al heeft: dit is een plank, en er ligt niets
            op. Het staat waar bij een gevulde tegel de omslag staat, zodat de
            twee staten dezelfde hoogte houden zonder dat iemand die hoogte
            ergens opschrijft.
          */}
          <span className="plek-leeg-merk" aria-hidden="true">
            <Icon name={plekIcon(slot.kind)} size={34} />
          </span>
          <p className="tiny muted plek-empty-line" data-testid="plek-empty">
            {words.slotEmpty}
          </p>
          {canArrange && (
            <PlaceButton
              roomId={roomId}
              slotId={slot.id}
              kind={slot.kind}
              kindLabel={kind}
              balance={balance}
              words={words}
            />
          )}
        </>
      )}

      {state === 'filled' && slot.item && (
        <>
          <Link className="plek-item" data-testid="plek-item" href={`/e/${slot.item.slug}`}>
            {/*
              §85: **vierkant**, en dat is de hele reparatie van het raster.
              Een 3:4 omslag is in een tegel van 9,5rem breed ruim 10rem hoog,
              dus de rij waar iets in gekocht werd sprong open en het raster
              brak bij de eerste koop. Een vierkante uitsnede bestaat al
              (`SHAPES.square`, ronde 19) en is nooit hoger dan breed — de rij
              houdt zijn hoogte en de foto houdt zijn eigen kader.
            */}
            <Cover
              assetId={slot.item.coverAssetId}
              crop={slot.item.coverCrop}
              shape="square"
              alt=""
              icon={slot.item.typeIcon}
              colour={slot.item.typeColour}
              variant="thumb"
              className="plek-cover"
            />
            <span className="small plek-item-name">{slot.item.name}</span>
          </Link>
          {canArrange && (
            <ClearButton
              roomId={roomId}
              slotId={slot.id}
              label={words.slotClear}
              name={slot.item.name}
              compact
              words={words}
            />
          )}
        </>
      )}
    </li>
  );
}
