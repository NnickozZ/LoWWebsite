import Link from 'next/link';
import { Icon } from '@/components/Icon';
import type { Words } from '@/lib/words';
import { MEANING } from './plekWords';

/**
 * §84: de beurs — wat je hebt, en nadrukkelijk niet wat iets kost.
 *
 * Dit is de reparatie van de scherpste fout die de doorloop vond: het saldo
 * bovenaan een kamer en de prijs op een tegel waren **hetzelfde component** —
 * dezelfde `.stamp`, gedraaid, rood, omlijnd. *Wat je hebt* en *wat iets kost*
 * zagen er identiek uit, en een koop veranderde één cijfer in een ding dat
 * eruitziet als een prijskaartje. Niemand zag het gebeuren.
 *
 * Dus twee vormen, en het verschil is het punt:
 *
 *   - een **prijs** blijft de `.stamp`: schuin, rood, omlijnd, een kaartje dat
 *     aan een ding hangt;
 *   - een **beurs** staat rechtop, in gewone inkt, met de munt ervoor. Nooit
 *     rood — rood is in dit archief de kleur van de Keeper en van een stempel,
 *     en een saldo is geen van beide.
 *
 * Eén component voor alle plekken waar het staat (de schil, de kamer, de
 * winkel, de plek-kiezer), want de vorige ronde had er drie: een `.stamp` in de
 * kamer, een `.stamp` in de winkel en een grijze `.tiny` in de plek-kiezer —
 * drie tekeningen van één getal.
 *
 * `href` maakt er een deur van. In de schil is dat de hele functie: één tik van
 * élke pagina naar je eigen kamer, waar het er vóór ronde 45 drie waren.
 */
export function Beurs({
  balance,
  words,
  href,
  size = 'normal',
  title,
}: {
  balance: number;
  words: Words;
  /** Waar hij heen gaat. Zonder dit is het een blokje en geen knop. */
  href?: string;
  /** `small` in de schil en in een paneel; `normal` boven aan een pagina. */
  size?: 'normal' | 'small';
  /** Wat er hardop gelezen wordt. Standaard `words.purse`. */
  title?: string;
}) {
  const label = title ?? words.purse;
  const body = (
    <>
      <Icon name={MEANING.munt} size={size === 'small' ? 14 : 17} />
      <span className="beurs-getal">{balance}</span>
      <span className="beurs-munt">{balance === 1 ? words.currency : words.currencyPlural}</span>
    </>
  );

  /*
   * `key={balance}` op het getal is de hele animatie: React hangt een nieuw
   * element op zodra het bedrag verandert, en de CSS-animatie op `.beurs-getal`
   * loopt dan opnieuw. Geen timer, geen state, geen rekenwerk — en daarmee ook
   * geen manier om per ongeluk zélf een saldo uit te rekenen (§79 regel 1: het
   * saldo is de som van het grootboek, en dit scherm telt nooit mee).
   */
  const cls = `beurs beurs-${size}`;
  return href ? (
    <Link href={href} className={cls} data-testid="beurs" data-balance={balance} aria-label={`${label}: ${balance}`}>
      <span className="beurs-body" key={balance}>
        {body}
      </span>
    </Link>
  ) : (
    <span className={cls} data-testid="beurs" data-balance={balance} aria-label={`${label}: ${balance}`}>
      <span className="beurs-body" key={balance}>
        {body}
      </span>
    </span>
  );
}
