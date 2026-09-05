'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';

/** One soort as the sheet offers it: what it is, and what is already filed. */
export type CaseTabSoort = {
  slug: string;
  label: string;
  icon: string;
  colour: string;
  /** §24: a soort that only exists inside a dossier. Offered first. */
  caseOnly: boolean;
  /** How many artikelen of this soort are in this dossier right now. */
  count: number;
};

/**
 * §30: "Tabbladen" — which soorten this dossier has shelves for.
 *
 * A dossier's tabs are otherwise a report of what is already in it, which
 * leaves a fresh investigation without the one shelf it needs: no Aanwijzingen
 * tab until a clue exists, and clues are made *in* dossiers. So the Keeper
 * (or whoever may edit this file) can say up front what kind of investigation
 * this is, and the empty shelves appear with their add-boxes.
 *
 * A soort that is only made inside a dossier stands at the top of the list,
 * because a voorwerp and an aanwijzing are what an investigation produces.
 *
 * Every tick is saved at once — there is no Bewaren here, the same way the
 * status chips above have none — and the write goes through the ORM, so a
 * second person looking at this dossier gets the new tab strip without
 * touching anything (§21).
 */
export function CaseTabsButton({
  caseId,
  soorten,
  tabTypes,
  onChanged,
}: {
  caseId: string;
  soorten: CaseTabSoort[];
  /** `cases.tab_types`: null is "automatisch". */
  tabTypes: string[] | null;
  onChanged: () => void;
}) {
  const ui = useUi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<string[] | null>(tabTypes);

  // §21: somebody else may change this list while this sheet is open — the
  // page is re-rendered from the server and the new list arrives as a prop.
  // Take it over unless a save of our own is still in flight.
  const signature = tabTypes === null ? null : tabTypes.join(',');
  useEffect(() => {
    if (busy) return;
    setChosen(signature ? signature.split(',') : null);
    // `signature` rather than the array itself: a fresh array every render
    // would put this effect in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // §24 first, under their own heading: a voorwerp and an aanwijzing are what
  // an investigation produces, so they are the obvious things to ask for. The
  // rest keep the archive's own order, which `listEntryTypes` sorted them into.
  const made = soorten.filter((soort) => soort.caseOnly);
  const rest = soorten.filter((soort) => !soort.caseOnly);

  async function commit(next: string[] | null) {
    const before = chosen;
    setChosen(next);
    setBusy(true);
    try {
      const response = await fetch(`/api/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tabTypes: next }),
      });
      if (!response.ok) {
        // §10: the API is the rule, not the hidden button. Put the chip back
        // rather than leaving the sheet saying something that never landed.
        setChosen(before);
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        ui.toast(data.error ?? 'Opslaan is niet gelukt.');
        return;
      }
      onChanged();
      router.refresh();
    } catch {
      setChosen(before);
      ui.toast('Opslaan is niet gelukt.');
    } finally {
      setBusy(false);
    }
  }

  function toggle(slug: string) {
    const list = chosen ?? [];
    const next = list.includes(slug) ? list.filter((item) => item !== slug) : [...list, slug];
    // An empty list is not "no tabs" — it is back on automatic, which is what
    // the server does with it too (`cleanTabTypes`).
    void commit(next.length ? next : null);
  }

  const automatic = chosen === null;

  const chip = (soort: CaseTabSoort) => {
    const on = (chosen ?? []).includes(soort.slug);
    return (
      <button
        key={soort.slug}
        type="button"
        disabled={busy}
        aria-pressed={on}
        className={`chip chip-selectable${on ? ' chip-active' : ''}`}
        onClick={() => toggle(soort.slug)}
      >
        {on ? (
          <Icon name="check" size={13} />
        ) : (
          <Icon name={soort.icon} size={13} style={{ color: soort.colour }} />
        )}
        {soort.label}
        {soort.count > 0 && <span className="tiny muted">{soort.count}</span>}
      </button>
    );
  };

  return (
    <>
      <button
        type="button"
        className={`chip chip-selectable${automatic ? '' : ' chip-active'}`}
        onClick={() => setOpen(true)}
        aria-expanded={open}
        title="Welke soorten horen in dit dossier"
      >
        <Icon name="file" size={13} />
        {automatic ? 'Tabbladen: automatisch' : `Tabbladen: ${chosen?.length ?? 0}`}
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="case-tabs-title">
          <div className="row" style={{ marginBottom: '0.5rem' }}>
            <h2 id="case-tabs-title" style={{ margin: 0, fontSize: '1.2rem' }}>
              Welke soorten horen in dit dossier?
            </h2>
            <div className="spacer" />
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Sluiten"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          <p className="small muted" style={{ marginTop: 0 }}>
            Wat je hier aanvinkt krijgt altijd een tabblad, ook als er nog niets in staat — met de
            zoekbalk om er meteen iets in te leggen. Wat je weglaat maar wél in het dossier zit,
            houdt zijn tabblad: er raakt niets zoek.
          </p>

          <div className="row-wrap" style={{ marginBottom: '0.9rem' }}>
            <button
              type="button"
              disabled={busy}
              aria-pressed={automatic}
              className={`chip chip-selectable${automatic ? ' chip-active' : ''}`}
              onClick={() => void commit(null)}
            >
              {automatic && <Icon name="check" size={13} />}
              Automatisch
            </button>
          </div>

          {made.length > 0 && (
            <>
              <p className="eyebrow">Wat een onderzoek oplevert</p>
              <div className="row-wrap" role="group" aria-label="Soorten die in een dossier gemaakt worden">
                {made.map(chip)}
              </div>
            </>
          )}

          <p className="eyebrow" style={{ marginTop: made.length ? '0.9rem' : 0 }}>
            Alle soorten
          </p>
          <div className="row-wrap" role="group" aria-label="Alle soorten">
            {rest.map(chip)}
          </div>

          <p className="tiny muted" style={{ marginTop: '0.7rem' }}>
            <strong>Automatisch</strong> laat de tabbladen volgen wat er in het dossier ligt — zoals
            het altijd al ging.
          </p>
        </Sheet>
      )}
    </>
  );
}
