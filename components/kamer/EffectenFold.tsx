'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * §90 (E13): "Wat deze kamer je geeft", op een telefoon ingeklapt.
 *
 * §85 zette het blok bóven het raster, en dat was goed: het is het antwoord op
 * "waar was al dat sparen goed voor". Maar op 390 px duwde het bij twee dingen
 * het raster naar y≈400 en bij zes onder de vouw — het antwoord stond nu in de
 * weg van de kamer zelf. Dus op een telefoon is het één regel met een telling
 * (*Wat deze kamer je geeft · 2*) die openklapt; op een breed scherm staat het
 * open, zoals §85 het wilde.
 *
 * De server tekent het open en de telefoon klapt het dicht zodra hij weet dat
 * hij een telefoon is: wat zonder JavaScript leest, leest dan alles. Het is een
 * `<details>`, dus openen en dichtdoen is een gebaar dat de browser al kent en
 * dat een schermlezer al kan voorlezen; de regels staan er altijd in (§76's
 * sluier zit in `RoomView.effects`, niet hier).
 */
export function EffectenFold({
  title,
  count,
  titleId,
  children,
}: {
  title: string;
  count: number;
  titleId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // K15: hetzelfde breekpunt als de rest van de app.
    if (window.matchMedia('(max-width: 767px)').matches) setOpen(false);
  }, []);

  return (
    <details
      className="kamer-effecten-fold"
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="kamer-effecten-summary" data-testid="kamer-effecten-summary">
        <h2 id={titleId} className="kamer-effecten-title">
          {title}
          <span className="muted kamer-effecten-telling"> · {count}</span>
        </h2>
      </summary>
      {children}
    </details>
  );
}
