import type { ReactNode } from 'react';
import { Icon } from '@/components/Icon';

/**
 * §106 (golf i2): de voordeur als toegangskaart.
 *
 * Inloggen en aanmelden zijn het eerste wat iemand van het archief ziet, en ze
 * waren een kaal formulier op een effen vlak. Nu is het een kaart uit de
 * kaartenbak: papier op een lade met haarlijnen, een rode lijn onder de kop
 * zoals de 404 (§102, golf h1), een zegel en een schuine stempel *Toegang*.
 * Rustig en in de huisstijl — geen plaatje, en de stempel ligt stil tot een
 * inschrijving naar het archief gaat (§106, na review 4, M12).
 *
 * Wat hier níét verandert: §63. Het formulier is `AuthForm`, met zijn echo en
 * zijn zinnen onder het vak; dit is alleen de lijst eromheen. En §89: er staat
 * niets op dat een uitgelogde lezer niet mag zien — de naam en de ondertitel
 * van het archief (`siteIdentity`, §88) en de woorden.
 */
export function Voordeur({ stamp, children, signup = false }: { stamp: string; children: ReactNode; signup?: boolean }) {
  return (
    <main className="auth-page voordeur">
      <div className={`auth-card voordeur-kaart${signup ? ' voordeur-inschrijven' : ''}`}>
        <span className="voordeur-zegel" aria-hidden="true">
          <Icon name="lock" size={22} />
        </span>
        <span className="stamp voordeur-stempel" aria-hidden="true">
          {stamp}
        </span>
        {children}
      </div>
    </main>
  );
}
