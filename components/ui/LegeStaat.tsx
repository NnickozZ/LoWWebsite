import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';

/**
 * §106 (golf i2): één familie voor elke lege plek in het archief.
 *
 * Een lege lijst was overal een ander stippelkader met een andere zin, vaak
 * zonder weg verder ("Nog niets onder personen.") en soms met een weg die niet
 * klopte ("Druk op n" op een telefoon). NN/g noemt drie dingen die een lege
 * staat moet doen, en dit zijn ze, in deze volgorde:
 *
 *   1. **status**: één zin in de stem van het archief (`zin`);
 *   2. **leren**: hooguit één regel over wat hier komt (`uitleg`);
 *   3. **directe weg**: één werkwoord-knop die er echt heen leidt (`children`),
 *      of niets als er voor deze lezer geen weg is (een speler bij de
 *      landkaarten: die hangt de Keeper op).
 *
 * De tekening is een ronde archiefstempel met het icoon van wat hier hoort,
 * in de inkt van `.stamp`, schuin en licht. Geen emoji, geen plaatje van
 * buiten. Een servercomponent: de knoppen zijn de enige cliënthelft
 * (`components/eerste-keer/Deuren.tsx`).
 *
 * Elke zin komt uit `lib/words.ts` (§11); dit onderdeel typt zelf niets.
 */
export function LegeStaat({
  icon,
  zin,
  uitleg,
  children,
  klein = false,
  testId = 'lege-staat',
  soort,
}: {
  icon: IconName;
  zin: string;
  uitleg?: string;
  /** De ene deur. Leeg laten als er voor deze lezer geen weg is. */
  children?: ReactNode;
  /** Voor een zijkolom (de feed op Start): de stempel kleiner, alles gecentreerd. */
  klein?: boolean;
  testId?: string;
  /** Welke lege plek dit is, voor specs en voor wie de pagina leest: `data-leeg`. */
  soort?: string;
}) {
  return (
    <div className={`lege-staat${klein ? ' lege-staat-klein' : ''}`} data-testid={testId} data-leeg={soort}>
      <span className="lege-staat-stempel" aria-hidden="true">
        <Icon name={icon} size={klein ? 20 : 26} />
      </span>
      <div className="lege-staat-tekst">
        <p className="lege-staat-zin">{zin}</p>
        {uitleg ? <p className="lege-staat-uitleg">{uitleg}</p> : null}
        {children ? <div className="lege-staat-deur">{children}</div> : null}
      </div>
    </div>
  );
}
