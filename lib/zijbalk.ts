/**
 * Golf O (Nick, 1 oktober: *"Ik wil de sidebar in en uit kunnen klappen met
 * een knop"*): de zijbalk op een computer, open of dicht.
 *
 * Een koekje en geen `localStorage`, om dezelfde reden als §106's eerste
 * bezoek: de server tekent de schil, en een zijbalk die pas na de hydratatie
 * dichtklapt, schuift de hele pagina onder de lezer opzij. Het koekje is van
 * deze browser; een andere computer kiest zelf. Puur, zodat de schil (een
 * client-component) en de layout (de server) hetzelfde woord lezen.
 */
export const ZIJBALK_COOKIE = 'lw-zijbalk';
export const ZIJBALK_DICHT = 'dicht';

/** Wat het koekje zegt: is de zijbalk dicht? */
export function zijbalkDicht(value: string | undefined | null): boolean {
  return value === ZIJBALK_DICHT;
}

/** Het koekje voor een keuze: een jaar lang bewaard, of meteen weg bij open. */
export function zijbalkCookie(dicht: boolean): string {
  return dicht
    ? `${ZIJBALK_COOKIE}=${ZIJBALK_DICHT}; path=/; max-age=31536000; samesite=lax`
    : `${ZIJBALK_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
