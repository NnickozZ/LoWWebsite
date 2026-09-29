/**
 * §90, aangevuld in golf J (stuk 5): waar de tekst staat als je gaat typen.
 *
 * Na *Aanmaken* geeft `EntryView` de caret aan de lopende tekst. De browser
 * schuift een veld dat focus krijgt maar net in beeld, dus op een telefoon
 * landde het tekstvak met zijn bovenrand op y = 815 — onder de tabbalk, die
 * bij 785 begint. De caret stond erin, en wie typte zag niet wat hij typte.
 *
 * Puur, zodat de regel een unit-test is en geen tik op een telefoon: gegeven
 * waar het blok staat (de werkbalk erbij) en waar de caret staat, hoeveel moet
 * de pagina schuiven zodat de caret met een paar regels ruimte **boven** alles
 * staat wat de onderrand bedekt (de tabbalk, straks het toetsenbord)?
 *
 * - Staat het al goed — de bovenrand van het blok in beeld en de caret met
 *   ruimte boven de bedekte rand — dan schuift er niets (0). Op een computer is
 *   dat bijna altijd zo, en een pagina die zomaar verspringt is erger dan een
 *   vak dat al in beeld stond.
 * - Anders komt de bovenrand van het blok op een vijfde van wat zichtbaar is.
 *   Niet helemaal bovenaan: dan zou de kop (Lezen, het opslaan-woord) erover
 *   liggen. En hoog genoeg dat een toetsenbord dat de onderste helft neemt de
 *   caret niet bedekt.
 */

/** Hoeveel ruimte er onder de caret moet zijn: een paar regels tekst. */
export const TYPING_ROOM = 72;
/** Waar de bovenrand van het blok komt, als deel van wat zichtbaar is. */
export const TYPING_TOP_SHARE = 0.2;

export type TypingViewInput = {
  /** Bovenrand van het schrijfblok (met zijn werkbalk), in viewport-px. */
  blockTop: number;
  /** Waar de caret begint, in viewport-px. */
  caretTop: number;
  /** Hoogte van wat zichtbaar is (`visualViewport.height`). */
  viewHeight: number;
  /** Hoeveel px aan de onderrand bedekt is (de tabbalk op een telefoon). */
  coverBottom: number;
};

/** Hoeveel px de pagina moet schuiven (positief = omlaag lezen). 0 = niets. */
export function typingScroll({ blockTop, caretTop, viewHeight, coverBottom }: TypingViewInput): number {
  const visibleBottom = viewHeight - Math.max(0, coverBottom);
  if (blockTop >= 0 && caretTop + TYPING_ROOM <= visibleBottom) return 0;
  return Math.round(blockTop - visibleBottom * TYPING_TOP_SHARE);
}
