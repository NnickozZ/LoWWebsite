'use client';

import { useEffect, useRef } from 'react';

/**
 * §100: *Nieuw prikbord* (en tijdlijn, landkaart, stamboom) in het palet.
 *
 * De maakbladen van de vier vlakken wonen in hun eigen knop op hun eigen lijst
 * — daar weet het blad van dossier, kant en rechten. Het palet bouwt ze niet na
 * (§5: één weg): het gaat naar die lijst met `?maak=1`, en de knop daar opent
 * zichzelf, langs dezelfde `openMaker` die een klik neemt (§69: eerst vragen
 * met wie je schrijft, dan het blad). Het vlaggetje gaat meteen van het adres
 * af (`replaceState(null, …)`, zoals §94), zodat terug of herladen het blad
 * niet opnieuw opent.
 */
/** Rung by the palet when you are already standing on the list it would go to. */
export const MAKE_EVENT = 'low:maak';

export function useMakeOnArrival(open: () => void, enabled = true) {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('maak') !== '1') return;
    url.searchParams.delete('maak');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    openRef.current();
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const onMake = () => openRef.current();
    window.addEventListener(MAKE_EVENT, onMake);
    return () => window.removeEventListener(MAKE_EVENT, onMake);
  }, [enabled]);
}
