'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { SideChoice } from '@/components/keeper/SideChoice';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';

/**
 * §66: a new stamboom.
 *
 * It asks less than a tijdlijn does — there is no measure to choose, because a
 * stamboom is measured in generations and the archive works those out itself —
 * so the sheet is a name, a line or two, and the two choices every container
 * makes: open or private (§17), and which side of the archive it is born on
 * (§48).
 */
export function NewFamilyTreeButton({
  caseId,
  caseKeeperOnly,
}: {
  caseId?: string;
  caseKeeperOnly?: boolean;
} = {}) {
  const ui = useUi();
  const router = useRouter();
  const words = ui.words;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  /*
   * §48: a dossier of the Keeper's takes the choice away — what is made inside
   * something Keeper-only is the Keeper's, and nobody may overrule that. The
   * dossier page hands its own answer down (`caseKeeperOnly`); `caseHere` is
   * the same fact when the sheet is opened from inside the dossier itself.
   */
  const here = ui.caseHere && ui.caseHere.id === caseId ? ui.caseHere : null;
  const sideLocked = Boolean(caseKeeperOnly || here?.keeperOnly);
  const [keeperSide, setKeeperSide] = useState(sideLocked || ui.side === 'keeper');

  async function create(isPrivate: boolean) {
    setBusy(true);
    try {
      const response = await fetch('/api/family-trees', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || (isPrivate ? `Privé ${words.familyTree}` : `Nieuwe ${words.familyTree}`),
          description: description.trim(),
          caseId,
          isPrivate,
          // §48: ignored for anyone who is not a Keeper.
          keeperOnly: ui.isKeeper ? sideLocked || keeperSide : undefined,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        ui.toast(data.error ?? `Nieuwe ${words.familyTree} aanmaken is niet gelukt.`);
        return;
      }
      const data = (await response.json()) as { tree: { slug: string } };
      setOpen(false);
      router.push(`/stambomen/${data.tree.slug}`);
    } catch {
      ui.toast('Geen verbinding met het archief. Probeer het zo opnieuw.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-primary btn-small" onClick={() => setOpen(true)}>
        <Icon name="plus" size={15} />
        {caseId ? `Maak nieuwe ${words.familyTree} voor dit ${words.case}` : `Nieuwe ${words.familyTree}`}
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="new-family-tree-title">
          <div className="stack">
            <h2 id="new-family-tree-title" style={{ margin: 0 }}>
              Nieuwe {words.familyTree}
            </h2>
            <div>
              <label className="label" htmlFor="new-family-tree-name">
                Naam
              </label>
              <input
                id="new-family-tree-name"
                className="input"
                value={name}
                autoFocus
                placeholder="bijv. Het huis Den Hollander"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !busy) {
                    event.preventDefault();
                    void create(false);
                  }
                }}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-family-tree-description">
                Waar gaat het over?
              </label>
              <input
                id="new-family-tree-description"
                className="input"
                value={description}
                placeholder="Eén regel, om hem terug te vinden"
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>
              Wie familie van wie is staat op de {words.entryPlural} zelf, in velden als Ouders en Partner. Een{' '}
              {words.familyTree} tekent wat daar staat.
            </p>
            <SideChoice
              show={ui.isKeeper}
              keeper={sideLocked || keeperSide}
              locked={sideLocked}
              lockedWhy={`${here?.name ?? `Dit ${words.case}`} is van de ${words.keeper}.`}
              onChange={setKeeperSide}
              words={words}
            />
            <div className="row-wrap" style={{ gap: '0.4rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={busy}
                onClick={() => void create(false)}
                title="Iedereen mag kijken en tekenen"
              >
                <Icon name="plus" size={15} />
                {caseId ? `${cap(words.familyTree)} aanmaken` : `Openbare ${words.familyTree}`}
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={busy}
                onClick={() => void create(true)}
                title="Alleen jij en de Keepers, tot je het openzet"
              >
                <Icon name="lock" size={14} />
                Privé {words.familyTree}
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
