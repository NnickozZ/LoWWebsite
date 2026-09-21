/**
 * §90: waar een tag heen gaat.
 *
 * Een tag-chip op een artikel wees tot ronde 51 naar `/wiki?tag=…`. Sinds §75
 * (ronde 38) is `/wiki` de voordeur en staat de lijst op `/wiki/alles` — en de
 * voordeur kijkt niet naar `?tag=`, dus elke tag-chip in het archief landde op
 * de welkomsttekst. De vraag die een tag beantwoordt is "wie zit er nog meer in
 * de haven?", en die vraag gaat over *dezelfde soort*: de lijst van die soort,
 * gefilterd op die tag. Zonder soort de hele wiki.
 *
 * Puur, zodat de pagina, de oude `/wiki?tag=`-omleiding en een test hetzelfde
 * adres uitrekenen.
 */
export function tagListHref(tag: string, typeSlug?: string | null): string {
  const list = typeSlug ? `/wiki/${encodeURIComponent(typeSlug)}` : '/wiki/alles';
  return `${list}?tag=${encodeURIComponent(tag)}`;
}
