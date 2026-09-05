import type { Words } from '@/lib/words';

/**
 * The welcome on the start page.
 *
 * A Keeper writes their own under Beheer → Site; until they do, the archive
 * introduces itself in its own words — which follow the word list, so a
 * Keeper who renamed "artikel" is not welcomed with the old term. Pure: both
 * the start page (server) and the Site form (client) read it.
 */
export function defaultIntro(words: Words): string {
  return [
    `Welkom in het archief. Alles wat het gezelschap tegenkomt krijgt hier een plek: ${words.entryPlural} over personen, plekken, voorwerpen en aanwijzingen; ${words.casePlural} per zaak; ${words.boardPlural} om verbanden te leggen; en ${words.mapPlural} om alles een plaats te geven.`,
    `Begin bij een open ${words.case}, blader door de wiki, of druk op n voor een nieuw ${words.entry}.`,
  ].join('\n\n');
}

/** Plain text with blank lines between paragraphs → the paragraphs. */
export function introParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
