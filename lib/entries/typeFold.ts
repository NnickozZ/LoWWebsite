/**
 * §92/§101, aangevuld in golf J (stuk 7, raden 8, rij 20): waar de soorten in
 * het maakblad vouwen.
 *
 * De soorten lopen door over regels, en na een paar regels vouwt de rij: twee
 * op een computer, drie op een telefoon. Er valt alleen een héle regel weg —
 * nooit een chip die half onder de rand hangt — en *Alle soorten* zegt hoeveel
 * er onder de vouw staan. Puur: de component meet de chips (hun boven- en
 * onderrand ten opzichte van de rij) en dit zegt hoe hoog de rij mag zijn.
 */

export const TYPE_ROWS_DESK = 2;
export const TYPE_ROWS_PHONE = 3;

export type TypeChipBox = { top: number; bottom: number; chosen?: boolean };

export type TypeFold = {
  /** Hoe hoog de gevouwen rij is, in px: tot en met de onderrand van de laatste getoonde regel. */
  height: number;
  /** Hoeveel soorten onder de vouw staan. 0: alles past, er vouwt niets. */
  hidden: number;
  /** Staat de gekozen soort onder de vouw? Dan opent het blad met alles zichtbaar (§101). */
  chosenHidden: boolean;
};

/** Twee chips op dezelfde regel verschillen hooguit zoveel px in hun bovenrand. */
const SAME_ROW = 4;

export function typeFold(chips: readonly TypeChipBox[], rows: number): TypeFold | null {
  if (!chips.length || rows < 1) return null;
  // De bovenranden van de regels, van boven naar beneden.
  const tops: number[] = [];
  for (const top of chips.map((chip) => chip.top).sort((a, b) => a - b)) {
    if (!tops.length || top - tops[tops.length - 1] > SAME_ROW) tops.push(top);
  }
  const bottomOfAll = Math.max(...chips.map((chip) => chip.bottom));
  if (tops.length <= rows) return { height: Math.ceil(bottomOfAll), hidden: 0, chosenHidden: false };
  const cut = tops[rows] - SAME_ROW;
  const shown = chips.filter((chip) => chip.top < cut);
  const hidden = chips.filter((chip) => chip.top >= cut);
  return {
    height: Math.ceil(Math.max(...shown.map((chip) => chip.bottom))),
    hidden: hidden.length,
    chosenHidden: hidden.some((chip) => chip.chosen),
  };
}
