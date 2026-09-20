import Link from 'next/link';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { munt, plekIcon, plekWord, shortfall } from '@/components/kamer/plekWords';
import type { ShopItem } from '@/lib/kamers/service';
import type { PlekKind } from '@/lib/kamers/shape';
import { fill, type Words } from '@/lib/words';
import { BuyButton } from './BuyButton';

/**
 * §84: welke van de zes dingen een rij in de etalage is — nu één keer per ding.
 *
 * §82 groepeerde de winkel per soort plek, en dat was een goede redenering: een
 * etalage lees je naar wáár een ding zou gaan. §83 haalde hem onderuit zonder
 * het te merken — sindsdien mag een ding op meer dan één soort plek passen, en
 * dus stond het in twee groepen, met twee koopknoppen. Na één koop zei de ene
 * rij "geen vrije plek van deze soort" en de andere, van hetzelfde ding, "staat
 * al in je kamer" boven een levende knop. Twee rijen, één ding, tegengestelde
 * boodschappen.
 *
 * Dus: één rij per ding, met chips die zeggen waar het past, en een filter
 * boven de lijst voor de vraag die de groepen beantwoordden. Dat keert §82's
 * groepering om en dat staat met zoveel woorden in regel 84 en in `DECISIONS.md`.
 *
 * De zes toestanden, in deze volgorde gevraagd, en de volgorde ís de regel:
 *
 *  - `list` — er is helemaal geen beurs (de Keeper, §18, die niemand draagt).
 *    Een prijslijst, en geen knop ergens op de pagina.
 *  - `owned` — er is er **één van** en die ligt al in deze kamer. Alleen voor
 *    `one_of_a_kind` een weigering; voor al het andere is "je hebt er al een"
 *    een *mededeling* naast een levende knop (§83).
 *  - `taken` — er is er één van en een ander heeft hem. Hardop gezegd, want een
 *    lantaarn die weg is, is niet zomaar afwezig uit de wereld.
 *  - `dear` — je kunt hem niet betalen. **Staat er nog steeds, met de prijs**,
 *    en met de zin die zegt hoeveel je tekortkomt — zichtbaar, niet in een
 *    `title`, want een `title` bestaat niet op een telefoon en dit is precies
 *    de zin die iemand aan het sparen zet.
 *  - `noslot` — je kunt het betalen en je hebt er nergens plek voor. Een deur
 *    terug naar de kamer, waar een plek geopend kan worden.
 *  - `buy` — alles klopt tegelijk.
 *
 * `dear` gaat met opzet vóór `noslot`: wie iets niet kan betalen heeft niets aan
 * de mededeling dat hij er ook geen plank voor heeft, en de prijs is het feit
 * waarvoor hij kwam.
 */
export type WinkelState = 'list' | 'owned' | 'taken' | 'dear' | 'noslot' | 'buy';

/**
 * Waar dit ding zou landen: de eerste vrije plek, in de volgorde van de ladder.
 *
 * `shopFor` vult `landsIn` door de plekken van deze kamer op `sort_order` af te
 * lopen, dus de **sleutelvolgorde** ís de ladder — en dat is hier de hele
 * afspraak. Lopen over `PLEK_KINDS` zou de volgorde van een constante zijn
 * (muur, plank, bureau, kist) en niet die van de kamer (bureau, plank, muur),
 * en een klok die op een muur én een bureau past landde dan aan de muur terwijl
 * het vrije bureau de eerdere sport was. Een e2e-zaak vond dat; het comment
 * boven deze functie zei het goede en de code deed het andere (§83's les).
 */
export function landing(item: ShopItem): { kind: PlekKind; slotId: string } | null {
  for (const [kind, slotId] of Object.entries(item.landsIn)) {
    if (slotId) return { kind: kind as PlekKind, slotId };
  }
  return null;
}

export function winkelState(item: ShopItem, canBuy: boolean): WinkelState {
  if (!canBuy) return 'list';
  // §83: al hebben houdt je alleen tegen als er één van in de wereld is.
  if (item.unique && item.owned) return 'owned';
  if (item.takenElsewhere) return 'taken';
  if (!item.affordable) return 'dear';
  return landing(item) ? 'buy' : 'noslot';
}

/**
 * §82/§84: één ding dat te koop staat.
 *
 * Dezelfde vier dingen in dezelfde volgorde als de catalogusrij in de
 * plek-kiezer, want het is dezelfde vraag in een ruimere kamer: de afbeelding,
 * de naam met zijn ene regel, wat het zegt dat het geeft, en — rechts — de
 * prijs met wat eraan te doen valt. Wie spaart leest een etalage in die
 * volgorde, en een tweede volgorde zou een tweede gewoonte zijn.
 *
 * De naam is een link naar het artikel, want een stuk huisraad *is* een artikel
 * (§79, regel 3) en dit is niet een tweede plek waar het woont. De effectregels
 * worden getoond en nooit opgeteld (rule 78): het archief somt op, de tafel
 * beslist.
 *
 * Niets wordt hier uit elkaar gehouden met kleur — `dear` is `--ink-muted` en
 * een gestreepte rand, en de toestand die een test leest is `data-state`. §45
 * heeft vier kleurschema's en een Keeperkant erbovenop, dus een kleur is nooit
 * een feit.
 */
export function WinkelRij({
  item,
  roomId,
  roomSlug,
  balance,
  canBuy,
  words,
}: {
  item: ShopItem;
  /** De kamer waarvoor gekocht wordt, of null als er geen beurs is (de Keeper). */
  roomId: string | null;
  /** De slug van die onderzoeker, voor de weg terug én voor de deur in de melding. */
  roomSlug: string | null;
  balance: number;
  canBuy: boolean;
  words: Words;
}) {
  const state = winkelState(item, canBuy);
  const lands = landing(item);

  return (
    <li
      className={`kamer-koop winkel-rij${state === 'dear' ? ' kamer-koop-dear' : ''}`}
      data-testid="winkel-rij"
      data-entry-id={item.id}
      data-kinds={item.plekken.join(' ')}
      data-price={item.price}
      data-state={state}
      /* §80's attribuut, hetzelfde gespeld zodat de twee rijen gelijk lezen. */
      data-afford={item.affordable ? 'ja' : 'nee'}
    >
      <Cover
        assetId={item.coverAssetId}
        shape="square"
        alt=""
        icon={plekIcon(item.plekken[0] ?? 'kist')}
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
        {/*
          §84: waar het past, als chips. Dit is wat de groepen van §82 zeiden,
          en het is nu een eigenschap van het ding in plaats van van zijn plaats
          in de lijst — waarmee hetzelfde ding niet meer twee keer op het scherm
          kan staan en zichzelf tegenspreken.
        */}
        <p className="tiny winkel-plekken" data-testid="winkel-plekken">
          {item.plekken.map((kind) => (
            <span key={kind} className="winkel-plek-chip" data-kind={kind}>
              <Icon name={plekIcon(kind)} size={11} />
              {plekWord(kind, words)}
            </span>
          ))}
        </p>
      </div>

      <div className="kamer-koop-buy">
        <span className="stamp kamer-koop-price" data-testid="winkel-prijs">
          {munt(item.price, words)}
        </span>

        {/*
          §83: "dit heb je al" is een *feit*, en alleen voor een uniek ding ook
          een weigering. Het staat dus ook naast een levende knop — wie een
          tweede stoel koopt hoort te weten dat er al een staat.
        */}
        {item.owned && (
          <span className="tiny muted winkel-state" data-testid="winkel-owned">
            {item.ownedCount > 1
              ? fill(words.shopOwnedCount, { n: String(item.ownedCount) })
              : words.shopOwned}
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
              /* De weg terug: er moet eerst een plek van de goede soort open,
                 en dat gebeurt in de kamer zelf. Een knop en geen kale link —
                 een zin die navigeert hoort eruit te zien als iets wat je
                 indrukt (§84). */
              <Link className="btn btn-ghost btn-small" href={`/kamer/${roomSlug}`} data-testid="winkel-geen-plek-deur">
                {words.shopNoSlot}
              </Link>
            ) : (
              words.shopNoSlot
            )}
          </span>
        )}

        {state === 'dear' && (
          <span className="tiny winkel-short" data-testid="winkel-short">
            {shortfall(item.price, balance, words)}
          </span>
        )}

        {state === 'buy' && roomId && lands && (
          <BuyButton
            roomId={roomId}
            slotId={lands.slotId}
            entryId={item.id}
            name={item.name}
            kind={lands.kind}
            price={item.price}
            roomSlug={roomSlug}
            words={words}
          />
        )}
      </div>
    </li>
  );
}
