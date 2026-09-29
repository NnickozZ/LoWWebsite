'use client';

import { useState, type CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import type { TypeLite } from '@/components/admin/PageBlocksEditor';
import { fill, type Words } from '@/lib/words';

/**
 * §107: een keuze uit de soorten — chips met een kruisje voor wat gekozen is,
 * en een kiezer met een zoekvak voor de rest. Leeg betekent "elke soort".
 *
 * Golf i3 gaf dit aan de doel-soorten van een koppelveld; de pagina van een
 * soort (`PageBlocksEditor`) had nog de oude rij van negentien chips, twee keer:
 * *Kijk in deze soorten* bij een lijst die zichzelf vult en *Alleen deze
 * soorten mogen erin* bij een eigen lijst. Golf J geeft ze alle drie dezelfde
 * kiezer (§107, aangevuld in golf J), zodat de soort-editor één manier heeft
 * om soorten te kiezen.
 */
export function SoortKiezer({
  types,
  chosen,
  words,
  lead,
  testId,
  onChange,
}: {
  types: TypeLite[];
  chosen: string[];
  words: Words;
  /** De zin ervoor: wat de keuze betekent. */
  lead: string;
  testId: string;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const picked = types.filter((option) => chosen.includes(option.slug));
  const needle = query.trim().toLowerCase();
  const shown = types.filter((option) => !needle || option.label.toLowerCase().includes(needle));
  const toggle = (slug: string) =>
    onChange(chosen.includes(slug) ? chosen.filter((s) => s !== slug) : [...chosen, slug]);
  return (
    <div className="admin-oftype" data-testid={testId}>
      <div className="row-wrap admin-oftype-head">
        <span className="tiny muted">{lead}</span>
        <span className="small admin-oftype-chosen">
          {picked.length
            ? picked.map((option) => (
                <span
                  key={option.slug}
                  className="chip chip-soort doel-chip"
                  style={{ ['--soort' as string]: option.colour } as CSSProperties}
                >
                  {option.icon && <Icon name={option.icon} size={12} />}
                  {option.label}
                  <button
                    type="button"
                    className="doel-weg"
                    aria-label={fill(words.soortDoelWeg, { soort: option.label })}
                    onClick={() => toggle(option.slug)}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </span>
              ))
            : words.typeTargetsAll}
        </span>
        <button
          type="button"
          className="btn btn-small btn-ghost admin-oftype-pick"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          <Icon name="chevron" size={13} />
          {words.typeTargetsPick}
        </button>
      </div>
      {open && (
        <div className="doel-kiezer">
          <input
            type="search"
            className="input doel-zoek"
            value={query}
            placeholder={words.soortDoelZoek}
            aria-label={words.soortDoelZoek}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (shown.length === 1) toggle(shown[0].slug);
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              }
            }}
          />
          <div className="doel-lijst">
            {shown.map((option) => {
              const on = chosen.includes(option.slug);
              return (
                <button
                  key={option.slug}
                  type="button"
                  className={`doel-optie${on ? ' doel-optie-aan' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggle(option.slug)}
                  style={{ ['--soort' as string]: option.colour } as CSSProperties}
                >
                  <span className="doel-vink" aria-hidden="true">
                    {on && <Icon name="check" size={12} />}
                  </span>
                  {option.icon && <Icon name={option.icon} size={14} className="soort-inkt" />}
                  {option.label}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setOpen(false)}>
            {words.soortDoelKlaar}
          </button>
        </div>
      )}
    </div>
  );
}
