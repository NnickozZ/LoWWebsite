import { PLEK_KINDS, type PlekKind } from '@/lib/kamers/shape';
import { fill, type Words } from '@/lib/words';

/**
 * §79/§11: the four kinds of plek, as words and as shapes.
 *
 * `lib/kamers/shape.ts` holds the *keys* and says so; this is the one place
 * that turns a key into something a person reads. A component never writes
 * "muur", because the Keeper may call it something else in Beheer → Woorden,
 * and neither the database nor this page would notice.
 */
const WORD_KEY: Record<PlekKind, string> = {
  muur: 'plekMuur',
  plank: 'plekPlank',
  bureau: 'plekBureau',
  kist: 'plekKist',
};

/**
 * §84: één icoon per betekenis, en deze tabel is de hele lijst.
 *
 * Vier vormen voor vier soorten plek — vormen en geen kleuren, want §45 heeft
 * vier kleurschema's en een kamer moet in alle vier te lezen zijn.
 *
 * Wat er hiervóór stond deelde vormen met de rest van de feature: `book` was de
 * plank én het tabblad *Catalogus*, `note` was het bureau én een notitie op een
 * prikbord, `box` was de kist én de winkel én "wat je al hebt" én de lege cover
 * van elk stuk huisraad. Een icoon dat twee dingen betekent betekent er geen.
 *
 * **Voeg hier nooit een icoon toe dat al in `MEANING` staat**, en zet elk
 * nieuw icoon dat deze feature gebruikt er wél in — `tests/unit/kamer-contract.test.ts`
 * leest deze twee tabellen en vergelijkt ze met wat de componenten tekenen.
 */
const ICON: Record<PlekKind, string> = {
  muur: 'pin',
  plank: 'shelf',
  bureau: 'desk',
  kist: 'box',
};

/**
 * §84: elke andere betekenis die deze feature een icoon geeft, en welke.
 *
 * Eén sleutel per *betekenis*, niet per knop: "kopen" en "de prijs" zijn beide
 * de munt, en dat is precies goed — het is één idee. Twee betekenissen die
 * dezelfde vorm krijgen zijn dat niet, en daar valt de test over.
 */
export const MEANING = {
  /** Wat je hebt en wat iets kost. */
  munt: 'coin',
  /** De winkel als plaats. */
  winkel: 'shop',
  /** De kamer als plaats. */
  kamer: 'home',
  /** Wat de Keeper doet: geven, uitdelen. */
  geven: 'gift',
  /** Iets neerzetten dat je al hebt. */
  neerzetten: 'plus',
  /** Iets weghalen. */
  weghalen: 'close',
  /** Een plek openen. */
  openen: 'lock',
  /** De catalogus — wat er te koop is. */
  catalogus: 'book',
  /** Eén onderzoeker, als beurshouder. */
  onderzoeker: 'person',
} as const;

/** De vormen die deze feature bezet houdt: de vier plekken plus elke betekenis. */
export const CLAIMED_ICONS: readonly string[] = [
  ...PLEK_KINDS.map((kind) => ICON[kind]),
  ...Object.values(MEANING),
];

export function plekWord(kind: PlekKind, words: Words): string {
  return words[WORD_KEY[kind]] ?? kind;
}

export function plekIcon(kind: PlekKind): string {
  return ICON[kind] ?? 'box';
}

/**
 * §79, rule 8: the munt has no name in the code. Every amount on this screen
 * goes through here, and the singular is only ever used for exactly one.
 */
export function munt(amount: number, words: Words): string {
  return `${amount} ${Math.abs(amount) === 1 ? words.currency : words.currencyPlural}`;
}

/**
 * §84: wat er nog aan ontbreekt, als zichtbare tekst.
 *
 * Deze zin stond tot ronde 45 **drie keer letterlijk** in de code — in de
 * tegel, in de plek-kiezer en in de winkelrij — en alle drie de keren als
 * `title` op een uitgeschakelde knop. Een tooltip bestaat niet op een telefoon,
 * en dit is de zin die iemand aan het sparen zet: precies de verkeerde zin om
 * te verstoppen. Eén plek, één woordsleutel, overal zichtbaar.
 */
export function shortfall(price: number, balance: number, words: Words): string {
  return fill(words.shortfall, { n: munt(Math.max(0, price - balance), words) });
}

/**
 * §84: de prijs ín de knop.
 *
 * "Openen" en "Kopen" zeiden niet wat ze kostten, en beide zijn onomkeerbaar en
 * zonder bevestiging (met opzet — een dialoog is frictie op iets wat je twintig
 * keer per avond doet). Dan hoort het bedrag op de knop zelf te staan: de
 * uitgave is expliciet op het moment dat je hem doet, en dat is dezelfde
 * bescherming zonder de klik.
 */
export function withPrice(label: string, price: number, words: Words): string {
  return price > 0 ? `${label} · ${munt(price, words)}` : label;
}
