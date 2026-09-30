'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useUi } from '@/components/ui/UiProvider';
import { fill } from '@/lib/words';
import { spelerPast, spelerTellingen, type SpelerSoort } from '@/lib/beheer';
import { UserRow, type UserLite } from './UserRow';

/**
 * Golf M (C3): Beheer → Gebruikers met een zoekvak, drie filterknoppen en een
 * telling. Nick: "eventually we will get a lot of players".
 *
 * In de browser, over de lijst die de pagina al helemaal meestuurt — honderden
 * rijen filteren is geen vraag om de server te stellen (dezelfde afweging als
 * de uitdeler, §86). Een rij die niet past krijgt `hidden` en blijft gemount
 * (§96): een half ingevuld wachtwoordblad of een open karakterkiezer in die
 * rij overleeft een letter in het zoekvak.
 *
 * Op een computer staat de caret meteen in het vak, zoals in Woorden (§107):
 * wie Gebruikers opent, komt iemand zoeken. Niet op een telefoon: daar zou het
 * toetsenbord de lijst meteen half bedekken. Geen *Online*-knop: wie er nu is,
 * weet alleen de live-lijn in de browser, niet de pagina.
 */
export function SpelersLijst({ users, meId }: { users: UserLite[]; meId: string }) {
  const { words } = useUi();
  const [query, setQuery] = useState('');
  const zoekRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) {
      zoekRef.current?.focus({ preventScroll: true });
    }
  }, []);
  const [soort, setSoort] = useState<SpelerSoort>('alle');
  const tellingen = useMemo(() => spelerTellingen(users), [users]);
  const past = useMemo(() => new Set(users.filter((user) => spelerPast(user, query, soort)).map((user) => user.id)), [users, query, soort]);
  const zoekt = query.trim().length > 0 || soort !== 'alle';

  const knoppen: { soort: SpelerSoort; label: string }[] = [
    { soort: 'alle', label: words.spelersAlle },
    { soort: 'keepers', label: words.spelersKeepers },
    { soort: 'uit', label: words.spelersUit },
  ];

  return (
    <div className="spelers-beheer" data-testid="spelers-beheer">
      <div className="spelers-zoek-rij">
        <input
          ref={zoekRef}
          type="search"
          className="input spelers-zoek"
          value={query}
          placeholder={fill(words.spelersZoek, { karakter: words.character })}
          aria-label={fill(words.spelersZoek, { karakter: words.character })}
          data-testid="spelers-zoek"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter hoort hier niets te versturen; Escape maakt het vak leeg.
            if (event.key === 'Enter') event.preventDefault();
            if (event.key === 'Escape' && query) {
              event.preventDefault();
              event.stopPropagation();
              setQuery('');
            }
          }}
        />
        <div className="row-wrap spelers-filter" role="group" aria-label={words.spelersFilter} data-testid="spelers-filter">
          {knoppen.map((knop) => (
            <button
              key={knop.soort}
              type="button"
              className={`chip chip-selectable${soort === knop.soort ? ' chip-active' : ''}`}
              aria-pressed={soort === knop.soort}
              data-soort={knop.soort}
              onClick={() => setSoort(knop.soort === soort ? 'alle' : knop.soort)}
            >
              {knop.label}
              <span className="spelers-filter-telling">{tellingen[knop.soort]}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="tiny muted spelers-telling" data-testid="spelers-telling" aria-live="polite">
        {fill(words.spelersTelling, { n: String(past.size), totaal: String(users.length) })}
      </p>
      {zoekt && past.size === 0 && (
        <p className="small muted spelers-geen" data-testid="spelers-geen">
          {query.trim() ? fill(words.spelersGeen, { zoek: query.trim() }) : words.spelersGeenFilter}
        </p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {users.map((user) => (
          <UserRow key={user.id} user={user} isSelf={user.id === meId} hidden={!past.has(user.id)} />
        ))}
      </ul>
    </div>
  );
}
