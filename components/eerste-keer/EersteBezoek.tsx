'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { FIRST_VISIT_COOKIE, firstVisitKey, withSeen, type FirstVisitPlace } from '@/lib/eerste-keer/stappen';

const YEAR = 60 * 60 * 24 * 365;

function readCookie(): string {
  const hit = document.cookie.split('; ').find((part) => part.startsWith(`${FIRST_VISIT_COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(FIRST_VISIT_COOKIE.length + 1)) : '';
}

/**
 * §106 (golf i2): één regel bij het eerste bezoek aan de kamer, de winkel en de
 * wiki — wat dit is, in één zin — die daarna niet meer terugkomt.
 *
 * Per browser, in `localStorage` (`lw:eerste-bezoek:<plek>`), want het is een
 * gemak voor deze kijker en geen staat die iemand anders moet zien (CLAUDE.md
 * over opslag). Het teken "gezien" gaat erin op het moment dat de regel er
 * staat, niet pas bij *Begrepen*: een regel die bij elk bezoek terugkomt tot je
 * hem wegklikt, is de uitleg die de hele tijd blijft staan, en dat is precies
 * wat deze ronde weghaalt. *Begrepen* legt hem nu al weg.
 *
 * De server tekent hem al bij de eerste lading (`firstUnseen`, uit een koekje
 * dat `localStorage` spiegelt): een regel die pas na de hydratatie verschijnt,
 * duwt de pagina een regel omlaag, precies wanneer iemand op een tegel tikt.
 * Opslag die niet mag (een privévenster, geblokkeerde sitedata) laat de regel
 * weg in plaats van hem elke keer te tonen: `try/catch` om lezen en schrijven.
 */
export function EersteBezoek({
  place,
  text,
  gotIt,
  firstUnseen,
  eligible,
}: {
  place: FirstVisitPlace;
  text: string;
  gotIt: string;
  /** Wat de server uit het koekje las: nog nooit gezien in deze browser. */
  firstUnseen: boolean;
  /**
   * §106 (na review 4, M9): alleen een nieuw account krijgt de regel ooit
   * (`isNewAccount`). Een veteraan op een nieuw toestel niet.
   */
  eligible: boolean;
}) {
  const [shown, setShown] = useState(eligible && firstUnseen);

  useEffect(() => {
    if (!eligible) return;
    try {
      const key = firstVisitKey(place);
      const seenBefore = Boolean(window.localStorage.getItem(key));
      if (!seenBefore) window.localStorage.setItem(key, String(Date.now()));
      // De spiegel voor de server, ook als hij er al was maar het koekje weg is.
      document.cookie = `${FIRST_VISIT_COOKIE}=${encodeURIComponent(withSeen(readCookie(), place))}; path=/; max-age=${YEAR}; samesite=lax`;
      setShown(!seenBefore);
    } catch {
      /* geen opslag: dan ook geen regel, want hij zou nooit weggaan */
      setShown(false);
    }
  }, [place, eligible]);

  if (!shown) return null;
  return (
    <p className="eerste-bezoek" role="note" data-testid="eerste-bezoek" data-plek={place}>
      <Icon name="info" size={16} />
      <span>{text}</span>
      <button type="button" className="eerste-bezoek-weg" onClick={() => setShown(false)} data-testid="eerste-bezoek-weg">
        <Icon name="check" size={14} />
        <span className="eerste-bezoek-woord">{gotIt}</span>
      </button>
    </p>
  );
}
