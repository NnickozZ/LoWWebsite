/**
 * Golf J (stuk 12 van de meting na golf I): een druk vóór de hydratatie.
 *
 * De meting zag één keer geen schrijfvraag in een vers venster (Bram, Domburg,
 * telefoon). Nagespeeld met een trage CPU: de vraag zelf werkt altijd, maar
 * *Bewerken* was getikt voordat React de pagina had overgenomen. Een
 * `<button type="button">` doet dan niets: het artikel bleef in Lezen, de
 * tekst kreeg geen caret, en in Lezen vraagt niets naar de schrijver (§102).
 * Een tweede tik werkte wel — "de herhaling vroeg wél".
 *
 * Dit script (inline, meteen na de knop in de HTML) onthoudt zo'n vroege druk
 * op een element met `data-vroeg="<naam>"`; het onderdeel vraagt hem na de
 * hydratatie op met `takeEarlyPress(naam)` en doet dan alsnog wat de druk
 * bedoelde. Daarna luistert het script niet meer (`__lwWakker`): vanaf dan is
 * React de enige die een klik afhandelt.
 */

type EarlyWindow = Window & { __lwVroeg?: string | null; __lwWakker?: boolean };

/** Het inline script. Eén keer per document; doet niets als het er al is. */
export const VROEGE_KLIK_SCRIPT =
  "(function(){try{var w=window;if(w.__lwVroeg!==undefined)return;w.__lwVroeg=null;" +
  "document.addEventListener('click',function(e){if(w.__lwWakker)return;var t=e.target;" +
  "var b=t&&t.closest?t.closest('[data-vroeg]'):null;if(b)w.__lwVroeg=b.getAttribute('data-vroeg');},true);" +
  '}catch(_){}})();';

/**
 * Na de hydratatie: was er een vroege druk op `name`? Zet meteen het script
 * uit en wist de druk, zodat hij maar één keer telt.
 */
export function takeEarlyPress(name: string, win: EarlyWindow | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  if (!win) return false;
  win.__lwWakker = true;
  const hit = win.__lwVroeg === name;
  win.__lwVroeg = null;
  return hit;
}
