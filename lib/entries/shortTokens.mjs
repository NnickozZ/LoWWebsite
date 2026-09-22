/**
 * §95, ronde 56: één regel, één id — de vorm van een kort vak, zonder database,
 * zonder React en zonder DOM. Gedeeld door de browser (de editor, `MentionText`),
 * de server (`lib/entries/shortRefs.ts`) en de CLI (`shortUpgrade.mjs`, de
 * migratie, `scripts/restore.mjs`) — regel 4: een `.mjs` is wat alle drie lezen.
 *
 * Een kort vak (de korte beschrijving, de samenvatting van een dossier, een
 * infoboxveld Tekst of Lange tekst) is een **string**. Een vermelding erin is
 * één token, `⟦h⟧`: U+27E6, een *handvat* van zes tot tweeëndertig tekens, U+27E7.
 * Het handvat staat in `mention_handles` en zegt welk artikel er bedoeld is. De
 * naam staat nergens in de tekst: die wordt bij het lezen per kijker opgezocht
 * (§67), en een handvat dat de lezer niet mag volgen, is voor hem niets (rule 1).
 *
 * Waarom een handvat en niet het id van het artikel: een kort vak is een `Y.Text`
 * in een kamer die per record naar iedereen gaat die het record mag zien, en een
 * CRDT kan niet per kijker geschrapt worden. Een willekeurig handvat per
 * vermelding zegt in zo'n kamer niet wíé er genoemd wordt en ook niet of twee
 * chips hetzelfde artikel noemen — alleen dat er op die plek iets staat, en dat
 * ziet de lezer toch al aan het gat in de zin.
 *
 * Wat er vóór deze ronde stond, `[[Naam]]` en `@Naam`, heet hier *legacy*: de
 * migratie `0034_een_id` zet het om met precies het leesalgoritme van toen
 * (`legacySpans`), en de vakken buiten deze ronde (een kaartje, een speld, een
 * gebeurtenis) schrijven het nog.
 */

export const OPEN = '⟦';
export const CLOSE = '⟧';

/** Een geldig handvat: wat `newHandle` maakt, met ruimte eromheen. */
const HANDLE = /^[A-Za-z0-9_-]{6,32}$/;

/** @param {unknown} value */
export function isHandle(value) {
  return typeof value === 'string' && HANDLE.test(value);
}

/** @param {string} handle */
export function tokenFor(handle) {
  return `${OPEN}${handle}${CLOSE}`;
}

const TOKEN = /⟦([A-Za-z0-9_-]{6,32})⟧/g;

/** @param {string} text */
export function hasTokens(text) {
  return typeof text === 'string' && text.includes(OPEN) && new RegExp(TOKEN.source).test(text);
}

/**
 * De tekst in stukken: letters en chips, in volgorde, met hun plek in de string.
 *
 * @param {string} text
 * @returns {({ kind: 'text', text: string, start: number, end: number } | { kind: 'chip', handle: string, start: number, end: number })[]}
 */
export function splitShort(text) {
  /** @type {any[]} */
  const out = [];
  if (!text) return out;
  let at = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > at) out.push({ kind: 'text', text: text.slice(at, start), start: at, end: start });
    out.push({ kind: 'chip', handle: match[1], start, end: start + match[0].length });
    at = start + match[0].length;
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at), start: at, end: text.length });
  return out;
}

/**
 * Elk handvat in de tekst, één keer, in volgorde.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function handlesIn(text) {
  if (!text || !text.includes(OPEN)) return [];
  const seen = new Set();
  for (const match of text.matchAll(TOKEN)) seen.add(match[1]);
  return [...seen];
}

/**
 * Een `⟦` of `⟧` die geen deel is van een geldig token, gaat weg. Een token
 * blijft staan. Wat een browser stuurt, is nooit vanzelf een token.
 *
 * @param {string} text
 */
export function dropStrayDelimiters(text) {
  if (!text || (!text.includes(OPEN) && !text.includes(CLOSE))) return text;
  return splitShort(text)
    .map((part) => (part.kind === 'chip' ? tokenFor(part.handle) : part.text.replace(/[⟦⟧]/g, '')))
    .join('');
}

/**
 * De tekst met elk token vervangen door wat `nameOf(handle)` zegt — of door
 * niets, als dat `null` is. Een weggevallen chip laat geen dubbele spatie
 * achter. Voor de zoekindex, de geschiedenis, een lijst die geen chip kan tekenen.
 *
 * @param {string} text
 * @param {(handle: string) => string | null | undefined} nameOf
 */
export function projectShort(text, nameOf) {
  if (!text || !text.includes(OPEN)) return text ?? '';
  const parts = splitShort(text);
  let out = '';
  for (const part of parts) {
    if (part.kind === 'text') {
      out += part.text;
      continue;
    }
    const name = nameOf(part.handle);
    if (name) out += name;
    else if (/ $/.test(out)) {
      // "de brief van ⟦x⟧ aan" → "de brief van aan", niet "van  aan".
      const next = parts[parts.indexOf(part) + 1];
      if (next && next.kind === 'text' && /^ /.test(next.text)) out = out.slice(0, -1);
    }
  }
  return out;
}

/* ------------------------------------------------------------- legacy */

/**
 * Where the n-th whitespace-separated word of `rest` ends, counted in `rest`.
 * @param {string} rest
 * @param {number} n
 */
function endOfWord(rest, n) {
  const word = /\S+/g;
  let end = 0;
  for (let i = 0; i < n; i++) {
    const m = word.exec(rest);
    if (!m) break;
    end = m.index + m[0].length;
  }
  return end;
}

/**
 * Het leesalgoritme van ronde 6 tot en met 55, woord voor woord zoals het in
 * `lib/entries/mentions.ts` stond (`mentionSpans` roept nu dit aan): `[[Naam]]`
 * is een vermelding, ook als hij niets vindt; `@Naam` alleen als hij iets vindt,
 * en dan de langste reeks woorden die een naam is. `byName` is naam (klein) → id.
 *
 * @param {string} text
 * @param {ReadonlyMap<string, string>} byName
 * @returns {{ start: number, end: number, name: string, entryId: string | null, source: 'bracket' | 'at' }[]}
 */
export function legacySpans(text, byName) {
  if (!text) return [];
  /** @type {{ start: number, end: number, name: string, entryId: string | null, source: 'bracket' | 'at' }[]} */
  const spans = [];
  /** @param {string} name */
  const idFor = (name) => byName.get(name.trim().toLowerCase()) ?? null;

  for (const match of text.matchAll(/\[\[([^\]\n]{1,120})\]\]/g)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length, name: match[1].trim(), entryId: idFor(match[1]), source: 'bracket' });
  }

  for (let at = text.indexOf('@'); at !== -1; at = text.indexOf('@', at + 1)) {
    const here = at;
    if (spans.some((s) => here >= s.start && here < s.end)) continue;
    const line = text.slice(at + 1, at + 1 + 120).split('\n')[0];
    const words = line.split(/\s+/).filter(Boolean).slice(0, 8);
    for (let n = words.length; n > 0; n--) {
      const raw = words.slice(0, n).join(' ');
      const candidate = raw.replace(/[.,;:!?)\]}'"]+$/, '');
      const id = idFor(candidate);
      if (!id) continue;
      const end = at + 1 + endOfWord(line, n) - (raw.length - candidate.length);
      spans.push({ start: at, end, name: candidate, entryId: id, source: 'at' });
      at = end - 1;
      break;
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

/**
 * `[[Naam]]` en `@Naam` → `⟦h⟧`, voor elke vermelding die op `byName` iets
 * vindt. `mint(entryId)` geeft het handvat (de migratie maakt er per vermelding
 * een). Wat niets vindt, blijft letter voor letter staan. Een tekst die al
 * tokens heeft, is geen probleem: een token bevat geen `[[` en geen `@`, dus een
 * tweede ronde vindt niets en verandert niets.
 *
 * @param {string} text
 * @param {ReadonlyMap<string, string>} byName
 * @param {(entryId: string) => string} mint
 * @returns {{ text: string, changed: boolean }}
 */
export function upgradeLegacy(text, byName, mint) {
  if (typeof text !== 'string' || !text || (!text.includes('[[') && !text.includes('@'))) {
    return { text, changed: false };
  }
  const spans = legacySpans(text, byName).filter((span) => span.entryId);
  if (!spans.length) return { text, changed: false };
  let out = '';
  let at = 0;
  for (const span of spans) {
    if (span.start < at) continue;
    out += text.slice(at, span.start) + tokenFor(mint(/** @type {string} */ (span.entryId)));
    at = span.end;
  }
  out += text.slice(at);
  return { text: out, changed: out !== text };
}
