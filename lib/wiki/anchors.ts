import { slugify } from '@/lib/slug';

/**
 * §104, ronde 67 (L7): een kop in de tekst heeft een adres.
 *
 * `…/e/veere#de-haven` wijst naar de kop *De haven*, zoals op elke wiki. Het id
 * komt uit de tekst van de kop (`slugify`, dezelfde als voor een adres), zodat
 * het leesbaar is en blijft staan zolang de kop blijft staan. Twee koppen met
 * dezelfde tekst krijgen `-2`, `-3` in de volgorde van de pagina — zoals
 * Wikipedia doet — en een id dat de pagina al voor iets anders gebruikt
 * (`block-body`, `section-…`) wordt nooit gepakt.
 *
 * Puur, zodat de regel in een test te lezen is; `HeadingAnchors` in
 * `components/entry/` hangt hem aan de koppen die de lezer ziet.
 */
export function headingIds(texts: readonly string[], taken: (id: string) => boolean = () => false): string[] {
  const used = new Set<string>();
  return texts.map((text) => {
    const base = anchorBase(text);
    let id = base;
    for (let n = 2; used.has(id) || taken(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}

/** Het id dat één kop zou krijgen als hij de enige was. */
export function anchorBase(text: string): string {
  const slug = slugify(text.trim());
  // `slugify` valt terug op 'entry' voor iets zonder letters; een kop heet dan 'kop'.
  return !text.trim() || (slug === 'entry' && !/entry/i.test(text)) ? 'kop' : slug;
}

/** Het adres dat een kop-anker kopieert: de pagina van het artikel, met de kop erachter. */
export function headingHref(origin: string, slug: string, id: string): string {
  return `${origin}/e/${slug}#${id}`;
}
