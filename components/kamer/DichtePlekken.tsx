'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { MEANING } from './plekWords';

/**
 * §103 golf H (T11/D7): de plekken die nog op slot zitten, apart en kort.
 *
 * Tot nu toe stonden ze in hetzelfde raster als wat je hebt, even hoog als een
 * gevulde tegel, en zei elke tegel vier keer dat hij dicht was. Op een
 * telefoon waren negen van de twaalf tegels dicht: zes rijen van samen ±1250 px,
 * met pas daaronder het grootboek. Het eerste scherm liet zien wat je nog níét
 * had.
 *
 * Nu staan ze onder hun eigen etiket (*Op slot*), in een raster met een korte
 * rijhoogte: etiket, stempel, *Openen*. Op een telefoon staat van elke soort
 * alleen de eerstvolgende als tegel (de pagina markeert de rest met
 * `data-rest`), en de rest zit achter één regel met een vouw: *Nog 6 plekken
 * op slot · 8 tot 30 munten*. Op een breed scherm is er ruimte voor allemaal,
 * en staat de vouw er niet: twee korte rijen zijn daar rustiger dan een zin
 * die iets verstopt waar plaats genoeg voor is.
 *
 * De vouw is een knop en geen `<details>`: de tegels staan in één lijst, en
 * alleen de CSS van een telefoon verbergt de rest zolang hij dicht is.
 */
export function DichtePlekken({
  title,
  rest,
  summary,
  children,
}: {
  /** Het etiket boven de lijst — `words.slotLocked`. */
  title: string;
  /** Hoeveel tegels er op een telefoon achter de vouw staan. */
  rest: number;
  /** De regel van de vouw: *Nog 6 plekken op slot · 8 tot 30 munten*. */
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="kamer-dicht" data-testid="kamer-dicht" data-open={open ? 'ja' : undefined} aria-labelledby="kamer-dicht-title">
      <h2 id="kamer-dicht-title" className="tiny muted kamer-dicht-title">
        {title}
      </h2>
      <ul className="kamer-grid kamer-grid-dicht" aria-labelledby="kamer-dicht-title">
        {children}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          className="kamer-dicht-vouw"
          data-testid="kamer-dicht-vouw"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          <span className="kamer-dicht-vouw-zin">{summary}</span>
          <Icon name={MEANING.vouw} size={14} />
        </button>
      )}
    </section>
  );
}
