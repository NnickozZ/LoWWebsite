/**
 * §97/§104 (ronde 67·herstel, F3): de naad waar een verwijzing wegviel.
 *
 * Wat een lezer niet mag zien is **niets** (§76, §89, §95, §97, §98): geen
 * doorhaling, geen grijze chip, geen teken dat daar iets stond. Maar de zin
 * eromheen werd wel geschreven mét die naam, en zonder hem las een speler
 * "begint bij , en wie", een alinea die met een spatie begon, en "( )". Dit
 * bestand is de ene plek die zegt hoe de woorden om zo'n gat heen netjes
 * sluiten — puur, zonder DOM en zonder database, zodat de lopende tekst (de
 * node-view in de browser), de korte vakken (`MentionText`), de platte
 * projectie op de server (`plainShort`), het fragment onder *Genoemd in*
 * (`snippetAround`) en de schrijfweg (`closeGaps`) hetzelfde antwoord geven.
 *
 * **Alleen de naad wordt aangeraakt.** Twee spaties die iemand elders typte,
 * blijven twee; een komma die niet tegen een gat staat, blijft staan. En het
 * resultaat is een lijst stukken *om weg te laten*, nooit een nieuwe tekst:
 * wat er opgeslagen staat, verandert hier niet (de kamer is gedeeld, en de
 * Keeper ziet de naam wél).
 *
 * De regels, voor één gat (een of meer verborgen stukken met alleen wit
 * ertussen):
 *
 *  1. Aan het begin van een alinea (of na een regeleinde) gaat al het wit weg,
 *     en een komma, puntkomma, dubbele punt of punt die er direct op volgt ook
 *     — "⟦x⟧, en toen" is "en toen".
 *  2. Aan het eind van een alinea gaat al het wit weg, en een komma of
 *     puntkomma ervoor ook — "met a, ⟦x⟧" is "met a".
 *  3. Vóór een sluitend leesteken (`, . ; : ! ? ) ] …` en de sluitende
 *     aanhalingstekens) staat geen wit — "bij ⟦x⟧, en" is "bij, en".
 *  4. Na een openend haakje of aanhalingsteken staat geen wit.
 *  5. Een haakje dat alleen nog het gat omsluit, gaat met het gat mee — "de
 *     sluis (⟦x⟧) en" is "de sluis en".
 *  6. Twee scheidingstekens tegen elkaar worden er één — "a, ⟦x⟧, c" is
 *     "a, c".
 *  7. Anders blijft er precies één spatie: de eerste die er stond.
 */

/** Eén stuk inline-inhoud, in volgorde. */
export type NaadStuk =
  /** Gewone tekst; alleen hieruit kan iets wegvallen. */
  | { tekst: string }
  /** Een verwijzing die deze lezer niet mag volgen (of die nog onderweg is): niets. */
  | { verborgen: true }
  /** Iets zichtbaars dat geen tekst is — een chip met een naam, een plaatje. Telt als een woord. */
  | { vast: true }
  /** Een harde regelovergang: een grens zoals het begin of eind van een alinea. */
  | { breuk: true };

/** Per stuk de stukjes `[van, tot)` die wegvallen — alleen bij tekststukken, en oplopend. */
export type NaadSneden = Array<Array<[number, number]>>;

const VERBORGEN = '\u0000';
const VAST = '￼';
const BREUK = '\n';

/** Wit dat in een gat mag verdwijnen (geen regeleinde: dat is een grens). */
const WIT = /[ \t   ]/;
/** Wat na een gat geen wit ervoor mag hebben. */
const SLUIT = new Set([',', '.', ';', ':', '!', '?', ')', ']', '…', '”', '’', '»']);
/** Wat vóór een gat geen wit erna mag hebben. */
const OPEN = new Set(['(', '[', '„', '“', '‘', '«']);
/** Scheidingstekens die aan het begin van een alinea met het gat meegaan. */
const LEIDEND = new Set([',', ';', ':', '.']);
/** Scheidingstekens die aan het eind van een alinea met het gat meegaan. */
const STAART = new Set([',', ';']);
/** Scheidingstekens die tegen elkaar één worden. */
const SCHEIDING = new Set([',', ';']);
const PAAR: Record<string, string> = { '(': ')', '[': ']' };

/**
 * Wat er rond elk gat weg moet. Puur: dezelfde stukken geven dezelfde sneden.
 */
export function naadSneden(stukken: readonly NaadStuk[]): NaadSneden {
  // Eén platte regel, met per teken van welk stuk het is en waar in dat stuk.
  let plat = '';
  const van: number[] = [];
  const op: number[] = [];
  stukken.forEach((stuk, index) => {
    if ('tekst' in stuk) {
      for (let i = 0; i < stuk.tekst.length; i++) {
        plat += stuk.tekst[i];
        van.push(index);
        op.push(i);
      }
    } else {
      plat += 'verborgen' in stuk ? VERBORGEN : 'breuk' in stuk ? BREUK : VAST;
      van.push(index);
      op.push(-1);
    }
  });

  const weg = new Array<boolean>(plat.length).fill(false);
  const gedaan = new Array<boolean>(plat.length).fill(false);
  const isTekst = (i: number) => op[i] >= 0;
  const inGat = (i: number) => weg[i] || plat[i] === VERBORGEN || (isTekst(i) && WIT.test(plat[i]));

  for (let h = 0; h < plat.length; h++) {
    if (plat[h] !== VERBORGEN || gedaan[h]) continue;
    let links = h;
    let rechts = h + 1;
    const rek = () => {
      while (links > 0 && inGat(links - 1)) links--;
      while (rechts < plat.length && inGat(rechts)) rechts++;
    };
    rek();

    // Regels 5, 6, 1 en 2 kunnen het gat groter maken; daarna opnieuw kijken.
    for (let ronde = 0; ronde < 8; ronde++) {
      const l = links > 0 ? plat[links - 1] : null;
      const r = rechts < plat.length ? plat[rechts] : null;
      const begin = l === null || l === BREUK;
      const eind = r === null || r === BREUK;
      const lt = l !== null && isTekst(links - 1);
      const rt = r !== null && isTekst(rechts);
      if (lt && rt && l && PAAR[l] === r) {
        weg[links - 1] = true;
        weg[rechts] = true;
        rek();
        continue;
      }
      if (lt && rt && l && r && SCHEIDING.has(l) && (SCHEIDING.has(r) || r === '.')) {
        // "a, ⟦x⟧, c" → "a, c"; "a, ⟦x⟧." → "a."
        if (SCHEIDING.has(r)) weg[rechts] = true;
        else weg[links - 1] = true;
        rek();
        continue;
      }
      if (begin && rt && r && LEIDEND.has(r)) {
        weg[rechts] = true;
        rek();
        continue;
      }
      if (eind && lt && l && STAART.has(l)) {
        weg[links - 1] = true;
        rek();
        continue;
      }
      break;
    }

    const l = links > 0 ? plat[links - 1] : null;
    const r = rechts < plat.length ? plat[rechts] : null;
    const geenWit =
      l === null || l === BREUK || r === null || r === BREUK || SLUIT.has(r) || OPEN.has(l);
    let gehouden = geenWit;
    for (let i = links; i < rechts; i++) {
      if (plat[i] === VERBORGEN) {
        gedaan[i] = true;
        continue;
      }
      if (weg[i] || !isTekst(i)) continue;
      if (!gehouden) {
        gehouden = true; // regel 7: de eerste spatie blijft
        continue;
      }
      weg[i] = true;
    }
  }

  // Terug naar sneden per stuk.
  const sneden: NaadSneden = stukken.map(() => []);
  for (let i = 0; i < plat.length; i++) {
    if (!weg[i] || !isTekst(i)) continue;
    const lijst = sneden[van[i]];
    const laatste = lijst[lijst.length - 1];
    if (laatste && laatste[1] === op[i]) laatste[1] = op[i] + 1;
    else lijst.push([op[i], op[i] + 1]);
  }
  return sneden;
}

/** Een tekst zonder de stukjes die wegvallen. */
export function snij(tekst: string, sneden: ReadonlyArray<readonly [number, number]>): string {
  if (!sneden.length) return tekst;
  let uit = '';
  let bij = 0;
  for (const [a, b] of sneden) {
    uit += tekst.slice(bij, a);
    bij = b;
  }
  return uit + tekst.slice(bij);
}

/**
 * De stukken als de woorden die de lezer leest: elk tekststuk gesneden, een
 * verborgen stuk niets, een vast stuk wat `vastAls` zegt (standaard niets) en
 * een breuk een regeleinde.
 */
export function naadTekst(stukken: readonly NaadStuk[], vastAls: (index: number) => string = () => ''): string {
  const sneden = naadSneden(stukken);
  return stukken
    .map((stuk, index) =>
      'tekst' in stuk ? snij(stuk.tekst, sneden[index]) : 'breuk' in stuk ? '\n' : 'vast' in stuk ? vastAls(index) : '',
    )
    .join('');
}

/**
 * §104 (golf H, D28): de hoofdletter na een weggevallen naam.
 *
 * Staat een verborgen verwijzing vooraan in een alinea, dan begon de alinea
 * voor een speler met een kleine letter: "⟦Lang⟧ heeft er tweemaal…" werd
 * "heeft er tweemaal…". Dit zegt welke letters in beeld een hoofdletter
 * krijgen — alleen de weergave (`text-transform`), de tekst blijft wat hij is.
 *
 * Alleen als de alinea met een gat begint: vóór de eerste zichtbare letter
 * staat niets dan een verborgen stuk en wit dat wegvalt. Die letter moet een
 * kleine letter zijn; een cijfer, een leesteken of een chip laat het zoals het
 * is. "ij" is in het Nederlands één letter: "ijsland" wordt "IJsland".
 *
 * @returns het stuk en de stukjes `[van, tot)` in dat stuk, of null.
 */
export function naadHoofd(
  stukken: readonly NaadStuk[],
  sneden: NaadSneden = naadSneden(stukken),
): { stuk: number; van: number; tot: number } | null {
  let gat = false;
  for (let index = 0; index < stukken.length; index++) {
    const stuk = stukken[index];
    if ('verborgen' in stuk) {
      gat = true;
      continue;
    }
    if (!('tekst' in stuk)) return null; // een chip of een regeleinde: er staat al iets
    const weg = sneden[index] ?? [];
    const valtWeg = (i: number) => weg.some(([a, b]) => i >= a && i < b);
    for (let i = 0; i < stuk.tekst.length; i++) {
      if (valtWeg(i)) continue;
      const teken = stuk.tekst[i];
      if (/\s/.test(teken)) {
        if (!gat) return null;
        continue;
      }
      if (!gat || !/\p{Ll}/u.test(teken)) return null;
      const ij = teken === 'i' && stuk.tekst[i + 1] === 'j' && !valtWeg(i + 1);
      return { stuk: index, van: i, tot: i + (ij ? 2 : 1) };
    }
  }
  return null;
}
