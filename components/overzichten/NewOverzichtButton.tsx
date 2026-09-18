'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { SideChoice } from '@/components/keeper/SideChoice';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';

/**
 * §75: iedereen mag er een maken. Dat is de beslissing van deze ronde, en hij
 * staat hier alleen in de zin dat deze knop voor iedereen getekend wordt — het
 * *recht* komt van de knoppen op de tabel (§17), niet van dit component.
 *
 * `SideChoice` is er voor een Keeper, om dezelfde reden als op elke andere
 * maker (§48): een Keeper die op zijn eigen kant staat maakt een voordeur voor
 * een deel van het archief waar de tafel nog niet is.
 */
export function NewOverzichtButton({ keeperSideDefault = false }: { keeperSideDefault?: boolean }) {
  const ui = useUi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [keeperOnly, setKeeperOnly] = useState(keeperSideDefault);
  const [busy, setBusy] = useState(false);

  async function make() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/overzichten', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, keeperOnly }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        ui.toast(data.error ?? `${ui.words.overzicht} maken is niet gelukt.`);
        return;
      }
      const data = (await response.json()) as { overzicht: { href: string } };
      setOpen(false);
      setName('');
      router.push(data.overzicht.href);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-small" onClick={() => setOpen(true)}>
        <Icon name="plus" size={15} />
        Nieuw {ui.words.overzicht}
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="new-overzicht-title">
          <h2 id="new-overzicht-title" style={{ marginTop: 0 }}>
            Nieuw {ui.words.overzicht}
          </h2>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            Een pagina die over de wiki gaat in plaats van over de wereld: waar je begint, wat bij
            elkaar hoort, wat je nog mist. Hij staat niet in het web en niet onder “Genoemd in”.
          </p>
          <label className="label" htmlFor="new-overzicht-name">
            Naam
          </label>
          <input
            id="new-overzicht-name"
            className="input"
            value={name}
            placeholder="Bijvoorbeeld: Het eiland, of Waar begin je?"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void make();
              }
            }}
          />
          <SideChoice show={ui.isKeeper} keeper={keeperOnly} onChange={setKeeperOnly} words={ui.words} />
          <div className="row" style={{ marginTop: '1rem' }}>
            <div className="spacer" />
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Annuleren
            </button>
            <button type="button" className="btn" onClick={() => void make()} disabled={busy || !name.trim()}>
              Maken
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
