import { splitShort } from '@/lib/entries/shortTokens.mjs';
import { textDelta } from '@/lib/live/textDelta';

/**
 * §92, ronde 53: de korte vakken — pure helpers, zonder React en zonder DOM.
 *
 * Een kort vak (de korte beschrijving, de samenvatting van een dossier, een
 * infoboxveld Tekst of Lange tekst, een maakblad, een kaartje, een gebeurtenis,
 * een speld) bewaart een platte tekst waarin `[[Naam]]` en `@Naam` een artikel
 * noemen. Drie dingen die de schermen erom heen nodig hebben, en die hier staan
 * omdat ze te testen zijn zonder browser:
 *
 * 1. `dropDanglingOpeners` — een half getypte `[[Jac` wordt bij het verlaten
 *    van het vak `Jac` (A4). Zonder haakjes, want wat er zonder `]]` staat is
 *    geen vermelding en zou letterlijk in het archief belanden.
 * 2. `previewSegments` — hoe het vak zich buiten focus toont: als lopende
 *    tekst met chips en zonder haakjes (c+). Elk stuk weet waar het in de ruwe
 *    tekst staat (`raw`/`rawEnd`), voor wie het ooit terug moet vertalen.
 * 3. `placeSuggestList` — waar een lijst met namen hangt: onder of boven zijn
 *    anker, gemeten tegen het *zichtbare* deel van het scherm (op een telefoon
 *    met open toetsenbord is dat `visualViewport`, niet het venster). De
 *    lopende tekst (`SuggestionPopup`) en de korte vakken (`MentionPopover`)
 *    lopen allebei hierlangs: één algoritme, twee lijsten.
 *
 * §95, ronde 56: de korte beschrijving, de samenvatting en een infoboxveld
 * Tekst / Lange tekst zijn nu een editor die zelf chips tekent (`ShortEditor`).
 * Die neemt 1 en 3 over zoals ze zijn, en krijgt er 4 bij (`alignedDelta`: een
 * wijziging snijdt nooit door een chip). 2 blijft bestaan voor de vakken die
 * nog `[[Naam]]` schrijven — een kaartje, een speld, een gebeurtenis, en de
 * maakbladen van een landkaart, een tijdlijn, een stamboom en een overzicht.
 */

/* ------------------------------------------------------ 1. losse `[[` */

/**
 * Elke `[[` waarna op dezelfde regel geen `]]` komt vóór de volgende `[[`,
 * valt weg. De rest blijft letter voor letter staan — een `@` ook, want een
 * `@` is ook een e-mailadres en een los apenstaartje is geen haakje dat open
 * blijft staan.
 */
export function dropDanglingOpeners(text: string): string {
  if (!text.includes('[[')) return text;
  let out = '';
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf('[[', at);
    if (open < 0) {
      out += text.slice(at);
      break;
    }
    out += text.slice(at, open);
    const rest = text.slice(open + 2);
    const lineEnd = rest.indexOf('\n');
    const nextOpen = rest.indexOf('[[');
    const limit = Math.min(lineEnd < 0 ? rest.length : lineEnd, nextOpen < 0 ? rest.length : nextOpen);
    const close = rest.indexOf(']]');
    if (close >= 0 && close <= limit) {
      // Een echte vermelding: haakjes en al door.
      out += text.slice(open, open + 2 + close + 2);
      at = open + 2 + close + 2;
    } else {
      // Los: de haakjes weg, de letters blijven.
      at = open + 2;
    }
  }
  return out;
}

/* ------------------------------------------------ 2. het vak buiten focus */

/** Eén vermelding zoals `/api/mentions` hem terugstuurt (zie `MentionPopover`). */
export type ShortSpan = {
  start: number;
  end: number;
  name: string;
  entryId: string | null;
  slug: string | null;
  icon: string | null;
  colour: string | null;
};

/** Een stuk van de voorvertoning. `raw` is waar het in de ruwe tekst begint, `rawEnd` waar het ophoudt. */
export type PreviewSegment =
  | { kind: 'text'; text: string; raw: number; rawEnd: number }
  | { kind: 'chip'; span: ShortSpan; raw: number; rawEnd: number }
  /** Nog geen antwoord van het archief: de naam zonder haakjes, als tekst. */
  | { kind: 'pending'; text: string; raw: number; rawEnd: number };

const BRACKETED = /\[\[([^\]\n]{1,120})\]\]/g;

/** Klopt de span nog met de letters waar hij over gaat? (Zie `spanIntact` in `MentionPopover`.) */
function intact(text: string, span: ShortSpan): boolean {
  const raw = text.slice(span.start, span.end);
  return raw === `[[${span.name}]]` || (raw.startsWith('@') && raw.slice(1) === span.name);
}

/**
 * `(tekst, spans)` → wat de voorvertoning tekent. Met `spans === null` (het
 * antwoord is onderweg) worden de `[[…]]`-stukken alvast zonder haakjes
 * getoond, zodat het vak nooit even zijn leestekens laat zien.
 */
export function previewSegments(text: string, spans: ShortSpan[] | null): PreviewSegment[] {
  const out: PreviewSegment[] = [];
  const push = (from: number, to: number) => {
    if (to > from) out.push({ kind: 'text', text: text.slice(from, to), raw: from, rawEnd: to });
  };
  let at = 0;
  if (spans === null) {
    for (const m of text.matchAll(BRACKETED)) {
      const from = m.index ?? 0;
      push(at, from);
      out.push({ kind: 'pending', text: m[1].trim(), raw: from, rawEnd: from + m[0].length });
      at = from + m[0].length;
    }
    push(at, text.length);
    return out;
  }
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start < at || span.end <= span.start || span.end > text.length) continue;
    if (!intact(text, span)) continue;
    push(at, span.start);
    out.push({ kind: 'chip', span, raw: span.start, rawEnd: span.end });
    at = span.end;
  }
  push(at, text.length);
  return out;
}

/** Heeft de voorvertoning iets te laten zien dat het vak zelf niet laat zien? */
export function previewWorth(segments: PreviewSegment[]): boolean {
  return segments.some((segment) => segment.kind !== 'text');
}

/* ------------------------------------------------- 3. waar de lijst hangt */

export type Rect = { left: number; top: number; bottom: number; width: number };

/**
 * Het zichtbare deel van het scherm, in de coördinaten waarin `position: fixed`
 * rekent (de layout viewport). Op een telefoon met open toetsenbord is
 * `height` kleiner dan het venster; `layoutHeight` is het venster zelf, nodig
 * om een lijst die omhoog klapt met `bottom` te plaatsen.
 */
export type View = { left: number; top: number; width: number; height: number; layoutHeight: number };

export type ListPlace = {
  left: number;
  width: number;
  /** Omlaag: `top` staat vast. */
  top?: number;
  /** Omhoog: `bottom` staat vast, zodat de lijst tegen zijn anker blijft staan hoe lang hij ook is. */
  bottom?: number;
  maxHeight: number;
  up: boolean;
};

/**
 * Het algoritme dat `SuggestionPopup` sinds ronde 6 had (klap om als er onder
 * minder dan `want` ruimte is en boven meer), met twee dingen erbij: de ruimte
 * wordt tegen het zichtbare deel gemeten, en de lijst krijgt een `maxHeight`
 * die in die ruimte past — anders hangt de onderste rij onder het toetsenbord.
 */
export function placeSuggestList(
  anchor: Rect,
  view: View,
  options: { gap?: number; want?: number; cap?: number; minWidth?: number; maxWidth?: number; margin?: number } = {},
): ListPlace {
  const gap = options.gap ?? 4;
  const want = options.want ?? 220;
  const cap = options.cap ?? 260;
  const margin = options.margin ?? 8;
  const viewTop = view.top;
  const viewBottom = view.top + view.height;
  const below = viewBottom - anchor.bottom - gap - margin;
  const above = anchor.top - viewTop - gap - margin;
  const up = below < want && above > below;
  const room = Math.max(0, up ? above : below);
  const maxHeight = Math.max(Math.min(cap, room), Math.min(cap, 88));

  const minWidth = options.minWidth ?? 260;
  const maxWidth = options.maxWidth ?? 360;
  const width = Math.max(0, Math.min(Math.max(minWidth, Math.min(maxWidth, anchor.width)), view.width - 2 * margin));
  const leftMost = view.left + margin;
  const rightMost = view.left + view.width - margin - width;
  const left = Math.min(Math.max(leftMost, anchor.left), Math.max(leftMost, rightMost));

  return up
    ? { left, width, bottom: view.layoutHeight - anchor.top + gap, maxHeight, up }
    : { left, width, top: anchor.bottom + gap, maxHeight, up };
}

/** Het zichtbare deel van dit scherm, of het venster waar er geen `visualViewport` is. */
export function currentView(): View {
  const layoutHeight = typeof document !== 'undefined' ? document.documentElement.clientHeight || window.innerHeight : 0;
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (vv) return { left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height, layoutHeight };
  const width = typeof window !== 'undefined' ? window.innerWidth : 0;
  const height = typeof window !== 'undefined' ? window.innerHeight : 0;
  return { left: 0, top: 0, width, height, layoutHeight: layoutHeight || height };
}

/* ------------------------------------------ 4. §95: een chip is één ding */

/**
 * The smallest edit from `from` to `to`, widened so it never starts or ends in
 * the middle of a token — a chip is one thing in the document and must go or
 * come whole.
 */
export function alignedDelta(from: string, to: string): { at: number; remove: number; insert: string } | null {
  const delta = textDelta(from, to);
  if (!delta) return null;
  let start = delta.at;
  let endFrom = delta.at + delta.remove;
  let changed = true;
  while (changed) {
    changed = false;
    for (const part of splitShort(from)) {
      if (part.kind !== 'chip') continue;
      if (part.start < start && start < part.end) {
        start = part.start;
        changed = true;
      }
      if (part.start < endFrom && endFrom < part.end) {
        endFrom = part.end;
        changed = true;
      }
    }
    const tail = from.length - endFrom;
    const endTo = to.length - tail;
    for (const part of splitShort(to)) {
      if (part.kind !== 'chip') continue;
      if (part.start < start && start < part.end) {
        start = part.start;
        changed = true;
      }
      if (part.start < endTo && endTo < part.end) {
        endFrom += part.end - endTo;
        changed = true;
      }
    }
  }
  const tail = from.length - endFrom;
  return { at: start, remove: endFrom - start, insert: to.slice(start, to.length - tail) };
}
