import { splitShort } from '@/lib/entries/shortTokens.mjs';
import { naadSneden, snij, type NaadStuk } from './naad';

/**
 * §104, ronde 67 (L3): de zin waarin een naam staat.
 *
 * *Genoemd in* noemde tot deze ronde alleen de bron: "Westkapelle Lighthouse".
 * Een lezer die iets zoekt (Lydon-Staley's "hunter") wil weten *waarom* die
 * bron hier staat, en dat staat in de zin eromheen. Obsidian en Gwern tonen hem
 * daarom meteen onder de naam. Dit is die zin, puur: een tekst met tokens
 * `⟦handvat⟧` (§95/§97) in, een fragment van ongeveer {@link SNIPPET_WIDTH}
 * tekens uit.
 *
 * Drie afspraken, en de eerste is de hele reden dat dit bestand bestaat:
 *
 *  1. **Wat de lezer niet mag zien, is niets** (rule 1, §95). Een ander handvat
 *     in het fragment wordt de naam die `nameOf` geeft, of verdwijnt. Er staat
 *     geen handvat in wat hier uitkomt, en het venster wordt geknipt *na* die
 *     projectie, zodat zelfs de lengte van een verborgen naam niets verraadt.
 *  2. **De naam van dít artikel staat vet** (`own`), elke keer dat hij in het
 *     venster valt.
 *  3. **Geknipt op een woordgrens, met `…`**, en liever op het begin van de zin
 *     als dat in het venster valt: dan is het een zin, geen snipper.
 */

export type SnippetPart = { text: string; own?: true };

export type Snippet = {
  parts: SnippetPart[];
  /** Er stond tekst vóór het fragment (er staat een `…` vooraan). */
  cutStart: boolean;
  /** En erna. */
  cutEnd: boolean;
};

/** Ongeveer zoveel tekens rond het handvat, de naam meegeteld (L3). */
export const SNIPPET_WIDTH = 120;

/** Het teken dat zegt: hier liep de tekst door. */
export const ELLIPSIS = '…';

type Options = {
  /** Is dit handvat een vermelding van het artikel waar de lezer op staat? */
  isOwn: (handle: string) => boolean;
  /** De naam van dat artikel, zoals de pagina hem draagt. */
  ownName: string;
  /** Een ander handvat, zoals déze lezer het mag lezen — of null: dan is het niets. */
  nameOf: (handle: string) => string | null | undefined;
  width?: number;
};

/** Een zinsgrens: een punt (met wat er mag volgen) en wit, of een nieuwe alinea. */
const SENTENCE_END = /[.!?…]["'”’)\]]*(?=\s)|\n/g;

/**
 * De tekst zoals de lezer hem leest, als één regel met de plekken van de eigen
 * naam erin. Alinea's blijven een `\n`, zodat een zin niet over een alinea
 * heen gelezen wordt; ze worden pas bij het uitgeven een spatie.
 */
export function projectForSnippet(
  text: string,
  { isOwn, ownName, nameOf }: Omit<Options, 'width'>,
): { flat: string; own: [number, number][] } {
  /*
   * Elke tekst in één regel wit, elk handvat een naam of niets. Een naam is
   * een vast stuk (een woord), wat de lezer niet mag zien een verborgen stuk,
   * en de woorden eromheen sluiten volgens de ene regel van `naad.ts`: geen
   * spatie vóór een komma, geen aan het begin van een alinea, nooit twee.
   */
  const parts = splitShort(text ?? '');
  const names: (string | null)[] = [];
  const pieces = parts.map((part): NaadStuk => {
    if (part.kind === 'text') {
      names.push(null);
      return { tekst: part.text.replace(/[ \t\r\f\v]+/g, ' ').replace(/ *\n[\s]*/g, '\n') };
    }
    const name = isOwn(part.handle) ? ownName : nameOf(part.handle) || null;
    names.push(name);
    return name ? { vast: true } : { verborgen: true };
  });
  const cuts = naadSneden(pieces);

  let flat = '';
  const own: [number, number][] = [];
  pieces.forEach((piece, index) => {
    if ('tekst' in piece) {
      let words = snij(piece.tekst, cuts[index]);
      // Twee stukken tekst die elkaar raken (een naam ertussen viel weg en er
      // bleef een spatie aan beide kanten): één spatie, en een alineagrens blijft er een.
      if (/\s$/.test(flat) && /^\s/.test(words)) {
        const lead = /^\s+/.exec(words)![0];
        words = words.slice(lead.length);
        if (lead.includes('\n') && !flat.endsWith('\n')) flat = `${flat.replace(/ +$/, '')}\n`;
      }
      flat += words;
      return;
    }
    const name = names[index];
    if (!name) return;
    const part = parts[index];
    if (part.kind === 'chip' && isOwn(part.handle)) {
      const start = flat.length;
      flat += name;
      own.push([start, flat.length]);
    } else flat += name;
  });
  return { flat, own };
}

/**
 * Het fragment rond de eerste vermelding van dit artikel, of null als de tekst
 * het niet (meer) noemt.
 */
export function snippetAround(text: string, options: Options): Snippet | null {
  const width = options.width ?? SNIPPET_WIDTH;
  const { flat, own } = projectForSnippet(text, options);
  if (!own.length) return null;

  const [s, e] = own[0];
  const len = flat.length;
  const budget = Math.max(0, width - (e - s));
  // Iets meer ná de naam dan ervoor: een zin loopt door waar hij over gaat.
  let before = Math.floor(budget * 0.4);
  let after = budget - before;
  if (s < before) {
    after += before - s;
    before = s;
  }
  if (len - e < after) {
    before = Math.min(s, before + (after - (len - e)));
    after = len - e;
  }

  let start = s - before;
  let end = e + after;

  /* Het begin: liever het begin van de zin, anders een woordgrens. */
  let sentenceStart = -1;
  for (const match of flat.slice(start, s).matchAll(SENTENCE_END)) {
    sentenceStart = start + (match.index ?? 0) + match[0].length;
  }
  const startsSentence = start === 0 || sentenceStart >= 0;
  if (sentenceStart >= 0) {
    start = sentenceStart;
    while (start < s && /\s/.test(flat[start])) start += 1;
  } else if (start > 0 && !/\s/.test(flat[start - 1])) {
    const space = flat.slice(start, s).search(/\s/);
    start = space >= 0 ? start + space + 1 : s;
  }

  /* Het eind: het eind van de zin als dat in het venster valt, anders een woordgrens. */
  let endsSentence = false;
  const tail = flat.slice(e, end);
  let lastEnd = -1;
  for (const match of tail.matchAll(SENTENCE_END)) {
    const at = match[0] === '\n' ? match.index ?? 0 : (match.index ?? 0) + match[0].length;
    lastEnd = at;
  }
  if (end >= len) {
    end = len;
  } else if (lastEnd >= 0 && e + lastEnd > e) {
    end = e + lastEnd;
    endsSentence = true;
  } else if (!/\s/.test(flat[end]) && !/\s/.test(flat[end - 1] ?? ' ')) {
    const cut = flat.slice(e, end).search(/\s\S*$/);
    end = cut >= 0 ? e + cut : e;
  }

  // Een andere vermelding van dit artikel die over de rand valt: niet half vet.
  for (const [a, b] of own) {
    if (a < end && b > end) end = a;
    if (a < start && b > start) start = b;
  }

  const cutStart = !startsSentence;
  const cutEnd = end < len && !endsSentence;

  // Wat tussen [start, end) valt, in stukken: gewoon en vet.
  const parts: SnippetPart[] = [];
  let at = start;
  for (const [a, b] of own) {
    if (b <= start || a >= end) continue;
    if (a > at) parts.push({ text: flat.slice(at, a) });
    parts.push({ text: flat.slice(a, b), own: true });
    at = b;
  }
  if (at < end) parts.push({ text: flat.slice(at, end) });

  // Alinea's worden spaties; wit aan de randen gaat weg; een komma voor de `…` ook.
  for (const part of parts) part.text = part.text.replace(/\n/g, ' ');
  if (parts.length && !parts[0].own) parts[0].text = parts[0].text.replace(/^\s+/, '');
  const last = parts[parts.length - 1];
  if (last && !last.own) {
    last.text = last.text.replace(/\s+$/, '');
    if (cutEnd) last.text = last.text.replace(/[,;:–—-]+$/, '');
  }
  const kept = parts.filter((part) => part.text.length > 0);
  if (cutStart) kept.unshift({ text: ELLIPSIS });
  if (cutEnd) kept.push({ text: ELLIPSIS });
  return { parts: mergeText(kept), cutStart, cutEnd };
}

/** Twee gewone stukken naast elkaar zijn één stuk. */
function mergeText(parts: SnippetPart[]): SnippetPart[] {
  const out: SnippetPart[] = [];
  for (const part of parts) {
    const prev = out[out.length - 1];
    if (prev && !prev.own && !part.own) prev.text += part.text;
    else out.push({ ...part });
  }
  return out;
}

/** Het fragment als platte tekst, met de eigen naam tussen `**` — voor tests en voor een `title`. */
export function snippetText(snippet: Snippet | null): string {
  if (!snippet) return '';
  return snippet.parts.map((part) => (part.own ? `**${part.text}**` : part.text)).join('');
}
