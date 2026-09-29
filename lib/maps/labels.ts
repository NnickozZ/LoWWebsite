/**
 * Golf K (M3): een plaatser voor de namen onder de spelden.
 *
 * `clusterPins` (§71) neemt spelden samen waarvan de *koppen* elkaar raken.
 * De naam onder een kop is breder dan de kop — tot 140 px — en twee spelden
 * die net niet samengaan, schreven hun namen over elkaar heen: "MIDDELBURG"
 * en "ARNEMUIDEN" werden één grijze vlek. Hier kiest elke naam een plek.
 *
 * Puur en in schermpixels, zodat het te toetsen is zonder een landkaart. Per
 * speld vier plekken, in deze volgorde: onder de kop (waar hij altijd stond),
 * rechts ervan, links ervan, erboven. De eerste plek die geen andere naam en
 * geen andere kop raakt, wint. Past er geen, dan is de naam `weg`: de speld
 * blijft, en de naam komt terug bij hover, focus en als de speld gekozen is
 * (app/vlakken.css, golf k). Wie eerst mag kiezen: de gekozen spelden, dan
 * van voor naar achter — wat bovenop getekend wordt, houdt zijn naam het
 * langst.
 *
 * De maten volgen `.map-pin` in app/globals.css: de knop staat met zijn
 * onderkant op het ankerpunt, de kop (28 px) bovenaan, dan 2 px ruimte en de
 * naam met 4 px marge. Een andere plek is een `translate` van de naam; de knop
 * zelf blijft staan, zodat een speld nooit verspringt omdat zijn naam dat doet.
 */

export type LabelSpot = 'onder' | 'rechts' | 'links' | 'boven' | 'weg';

export type LabelPin = {
  id: string;
  /** Het ankerpunt op het scherm (de `left`/`top` van `.map-pin`). */
  x: number;
  y: number;
  /** De breedte van de naam zoals de browser hem zette; 0 als hij nog niet gemeten is. */
  width: number;
  /** Gekozen spelden kiezen eerst. */
  chosen?: boolean;
};

export type LabelPlace = { spot: LabelSpot; dx: number; dy: number };

/** De kop van een speld, in px. */
export const PIN_HEAD = 28;
/** Ruimte tussen kop en naam (`gap` + `margin-top` van `.map-pin-label`). */
const HEAD_GAP = 6;
/** Hoe hoog een naam is (0,62rem in één regel, met rand). */
export const LABEL_H = 16;
/** Lucht tussen twee namen, en tussen een naam en een kop. */
const AIR = 3;

type Box = { x: number; y: number; w: number; h: number };

function touch(a: Box, b: Box): boolean {
  return a.x < b.x + b.w + AIR && b.x < a.x + a.w + AIR && a.y < b.y + b.h + AIR && b.y < a.y + a.h + AIR;
}

/** De kop, iets ruimer dan 28 px: hij staat een achtste gedraaid. */
function headBox(pin: LabelPin): Box {
  const top = pin.y - (PIN_HEAD + HEAD_GAP + LABEL_H);
  return { x: pin.x - 17, y: top - 3, w: 34, h: PIN_HEAD + 6 };
}

/**
 * De verschuiving die een plek vraagt, vanaf waar de naam van nature staat
 * (gecentreerd onder de kop, met zijn onderkant op het ankerpunt).
 */
export function labelOffset(spot: Exclude<LabelSpot, 'weg'>, width: number): { dx: number; dy: number } {
  const headMid = -(PIN_HEAD + HEAD_GAP + LABEL_H) + PIN_HEAD / 2;
  // De naam staat van nature met zijn bovenkant op -LABEL_H.
  const midY = headMid - LABEL_H / 2 - -LABEL_H;
  switch (spot) {
    case 'onder':
      return { dx: 0, dy: 0 };
    case 'rechts':
      return { dx: PIN_HEAD / 2 + 4 + width / 2, dy: midY };
    case 'links':
      return { dx: -(PIN_HEAD / 2 + 4 + width / 2), dy: midY };
    case 'boven':
      return { dx: 0, dy: -(PIN_HEAD + HEAD_GAP + LABEL_H + 2) };
  }
}

const ORDER: Exclude<LabelSpot, 'weg'>[] = ['onder', 'rechts', 'links', 'boven'];

/**
 * Voor elke speld een plek voor zijn naam. `pins` in tekenvolgorde (van achter
 * naar voren, zoals `clusterPins` ze geeft). Een naam die nog niet gemeten is
 * (`width` 0) staat onder zijn kop en telt niet mee: de eerste verf is die van
 * vóór deze ronde, en de tweede kiest.
 */
export function placeLabels(
  pins: readonly LabelPin[],
  /**
   * Het glas, als het bekend is. Een naam die naar rechts, links of boven zou
   * uitwijken en daar over de rand van het glas valt, doet dat niet — dan is
   * hij beter weg dan half. Onder de kop mag hij, zoals altijd, afgesneden zijn.
   */
  stage?: { width: number; height: number },
): Map<string, LabelPlace> {
  const out = new Map<string, LabelPlace>();
  const heads = pins.map(headBox);
  const placed: Box[] = [];
  const order = pins
    .map((pin, index) => ({ pin, index }))
    .sort((a, b) => Number(Boolean(b.pin.chosen)) - Number(Boolean(a.pin.chosen)) || b.index - a.index);

  for (const { pin, index } of order) {
    if (!pin.width) {
      out.set(pin.id, { spot: 'onder', dx: 0, dy: 0 });
      continue;
    }
    let found: LabelPlace | null = null;
    for (const spot of ORDER) {
      const { dx, dy } = labelOffset(spot, pin.width);
      const box: Box = { x: pin.x - pin.width / 2 + dx, y: pin.y - LABEL_H + dy, w: pin.width, h: LABEL_H };
      const outside =
        spot !== 'onder' &&
        stage !== undefined &&
        (box.x < 0 || box.y < 0 || box.x + box.w > stage.width || box.y + box.h > stage.height);
      const clash =
        outside ||
        placed.some((other) => touch(box, other)) || heads.some((head, j) => j !== index && touch(box, head));
      if (!clash) {
        found = { spot, dx, dy };
        placed.push(box);
        break;
      }
    }
    if (!found && pin.chosen) {
      // Een gekozen speld houdt zijn naam, ook als hij iets raakt.
      found = { spot: 'onder', dx: 0, dy: 0 };
      placed.push({ x: pin.x - pin.width / 2, y: pin.y - LABEL_H, w: pin.width, h: LABEL_H });
    }
    out.set(pin.id, found ?? { spot: 'weg', dx: 0, dy: 0 });
  }
  return out;
}
