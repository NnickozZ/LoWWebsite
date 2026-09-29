'use client';

import { createContext, useContext, useEffect, useId, type ReactNode } from 'react';

/**
 * §107, aangevuld in golf J: wat er in een onderdeel van Beheer nog niet is
 * opgeslagen.
 *
 * Tot golf J was alleen het actieve paneel gemount. Een tik op een ander
 * onderdeel gooide dus stil weg wat een Keeper aan een soort (of aan Woorden)
 * had veranderd: `beforeunload` vangt het verlaten van de pagina, niet een
 * wissel binnen Beheer. Nu meldt elk formulier met iets niet-bewaards zich
 * hier (`useNietBewaard(n)`), en `AdminTabs` houdt zo'n paneel gemount — verborgen —
 * tot het bewaard is. Terug op het onderdeel staat alles er nog, met de telling
 * in de voet; op de index en de strook staat een rood puntje bij de naam.
 *
 * Bewust geen vraag bij de wissel: er gaat niets verloren, dus er valt niets te
 * beslissen. De vraag van de browser bij het verlaten van de pagina blijft.
 */
type Melder = (paneel: string, bron: string, n: number) => void;

const Ctx = createContext<{ paneel: string; meld: Melder } | null>(null);

export function NietBewaardPaneel({ paneel, meld, children }: { paneel: string; meld: Melder; children: ReactNode }) {
  return <Ctx.Provider value={{ paneel, meld }}>{children}</Ctx.Provider>;
}

/** Een formulier in Beheer zegt hoeveel het nog niet bewaard heeft (0 = alles). */
export function useNietBewaard(n: number): void {
  const ctx = useContext(Ctx);
  const bron = useId();
  const paneel = ctx?.paneel;
  const meld = ctx?.meld;
  useEffect(() => {
    if (!meld || !paneel) return;
    meld(paneel, bron, n);
  }, [meld, paneel, bron, n]);
  // Weg (bijvoorbeeld een verwijderde soort): niets meer open.
  useEffect(() => {
    if (!meld || !paneel) return;
    return () => meld(paneel, bron, 0);
  }, [meld, paneel, bron]);
}
