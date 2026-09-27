/**
 * §101 — van de titel van een sectie naar de tekst van diezelfde sectie.
 *
 * Sinds §90 zet *Sectie toevoegen* de caret in de titel. Wat daarna hoort te
 * gebeuren is één `Tab`: titel, dan tekst. In de DOM staat tussen die twee een
 * prullenbak, drie zichtbaarheids-chips en (voor een Keeper) de onthul-kiezer,
 * dus `Tab` liep langs vier knoppen en de zin die je intypte verdween. Gemeten
 * na golf 3, rij 13 — het enige "moeten raden" dat in de tabel overbleef.
 *
 * De volgorde wordt rechtgezet bij de titel zelf en niet met `tabIndex`: een
 * positieve `tabIndex` haalt een veld uit de volgorde van het document en zet
 * het vóór alles wat er geen heeft, wat op een pagina met een infobox en een
 * lopende tekst een tweede, ergere raadpartij oplevert. Shift+Tab blijft wat
 * het was, dus de prullenbak en de chips zijn vanuit de tekst nog gewoon te
 * bereiken — één toets terug in plaats van één toets vooruit.
 *
 * Puur, zodat de regel een test is en geen toetsaanslag op een telefoon
 * (`tests/unit/ronde-64-losse-eindjes.test.ts`).
 */

/** Waar de tekst van een sectie staat, binnen het vak van die sectie. */
export const SECTION_TEXT_SELECTOR = '.editor-body [contenteditable="true"]';

type KeyLike = {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

/**
 * Is dit de toets die "en nu de tekst" betekent? Een kale `Tab`, vooruit. Met
 * Shift gaat hij terug (naar de knoppen), en met een andere toets erbij is het
 * de browser zijn eigen gebaar — een tabblad verder, bijvoorbeeld — en daar
 * gaat een tekstvak niet tussen staan.
 */
export function movesToSectionText(event: KeyLike): boolean {
  return (
    event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
  );
}
