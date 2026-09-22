'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { SideChoice } from '@/components/keeper/SideChoice';
import { MentionOverlay, MentionPopover, MentionPreview } from '@/components/ui/MentionPopover';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { freshHref } from '@/lib/canvas/memory';

/** What comes back when a stamboom has been made. */
export type CreatedFamilyTree = { id: string; name: string; slug: string };

/**
 * §66/§69: the sheet that makes a stamboom, on its own.
 *
 * It lived inside `NewFamilyTreeButton` until round 35, which is fine while
 * there is exactly one road to it. There are two now: the button on the shelf
 * and in a dossier, and the "'X' aanmaken" row in `FamilyTreePicker` — the row
 * `EntryPicker` and `CasePicker` have had since §6 and §48, and which a
 * koppelingsveld aimed at a stamboom did not, so filling one in meant leaving
 * the artikel, making the tree and coming back.
 *
 * The two roads differ in exactly one thing, and it is `onCreated`:
 *
 *  - from the **button**, making a stamboom means going to it, so the sheet
 *    pushes and refreshes;
 *  - from a **picker**, the person is filling in a field on a page they are in
 *    the middle of. Walking them away from it would throw away whatever else
 *    they had typed, so nothing navigates: the caller takes the new tree and
 *    puts it in the box.
 *
 * Everything else — the §48 side choice, the §17 open-or-private pair, the
 * §69 `error-note` that stays in the sheet, Enter making it — is the same
 * either way, which is the reason this is one component and not two.
 */
export function NewFamilyTreeSheet({
  caseId,
  caseKeeperOnly,
  initialName = '',
  onClose,
  onCreated,
}: {
  caseId?: string;
  caseKeeperOnly?: boolean;
  /** Seeded from what was typed in a picker, so the row's name is not retyped. */
  initialName?: string;
  onClose: () => void;
  /**
   * Called with the new stamboom instead of navigating to it. Leave it out and
   * the sheet goes to the tree it just made.
   */
  onCreated?: (tree: CreatedFamilyTree) => void;
}) {
  const ui = useUi();
  const router = useRouter();
  const words = ui.words;
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState('');
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  /* §69: the refusal stays in the sheet — see `NewTimelineButton` for why. */
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
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
        setError(data.error ?? `Nieuwe ${words.familyTree} aanmaken is niet gelukt.`);
        return;
      }
      const data = (await response.json()) as { tree: CreatedFamilyTree };
      onClose();
      if (onCreated) {
        onCreated(data.tree);
        return;
      }
      // §94 (O1): een vlak dat je net maakte opent in Bewerken.
      router.push(freshHref(`/stambomen/${data.tree.slug}`));
      // §69: the shelf behind this sheet is server-rendered — without this the
      // Back button lands on the list from before this stamboom existed.
      router.refresh();
    } catch {
      setError('Geen verbinding met het archief. Probeer het zo opnieuw.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} labelledBy="new-family-tree-title">
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
        {/*
          §69 (4.8): één omschrijvingsveld, in de vorm die de landkaart al had.
          Het was hier een `<input>` van één regel met een vraag als label, en
          op de landkaart een `<textarea>` met `@` — dezelfde kolom in de
          database, twee verschillende dingen op het scherm. Het label heet nu
          overal `Omschrijving`, en de drie `@`-delen horen erbij: de lijst
          terwijl je typt, de chip over de letters zelf (§56), en de klikbare
          rij eronder (§54).
        */}
        <div>
          <label className="label" htmlFor="new-family-tree-description">
            Omschrijving
          </label>
          <div className="mention-field">
          <textarea
            id="new-family-tree-description"
            ref={descriptionRef}
            className="input"
            rows={2}
            value={description}
            placeholder="Eén regel, om hem terug te vinden"
            onChange={(event) => setDescription(event.target.value)}
          />
          <MentionPopover forRef={descriptionRef} />
          <MentionOverlay forRef={descriptionRef} value={description} />
          {/* §92: out of focus, the chips without brackets; no row under it. */}
          <MentionPreview forRef={descriptionRef} value={description} />
          </div>
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
        {error && <p className="error-note">{error}</p>}
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
  );
}
