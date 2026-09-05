'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';

export type OriginCaseLite = { id: string; slug: string; name: string };

/**
 * §24, on the artikel's own page: the eyebrow above the title that says which
 * dossier this came out of — and, for somebody who may edit, the dial that sets
 * it by hand.
 *
 * Two shapes of the same fact live on this page and both are meant:
 *
 *   - the eyebrow here names the **herkomst**, the one dossier the artikel came
 *     from, which is what every list in the archive prints in front of its name;
 *   - the "In: …" chips further down list **every** dossier it is filed in,
 *     which is a different question with a different answer.
 *
 * The lists print `Zaak Vlissingen: De brief`; the page does not. A heading that
 * repeated the dossier would read as part of the artikel's name, and the page
 * already has room to say it properly, on its own line, as a link.
 *
 * §18: reading, this is a line of print — a folder, a name, a link, no controls.
 * The menu only exists on the editing face, and only for somebody the server
 * would let write (`canEdit`); the API checks that again in any case (§10).
 *
 * §1: the dossiers offered are the ones the *server* resolved for this viewer
 * behind `visibleCaseCondition` — the same lookup `nameTheirCases` uses — so an
 * investigation this person may not open is never named here, and choosing one
 * by id would be refused on the way in.
 */
export function OriginLine({
  entryId,
  origin,
  pinned,
  cases,
  canEdit,
  reading,
}: {
  entryId: string;
  /** The dossier it came from, when there is one this viewer may be told about. */
  origin: OriginCaseLite | null;
  /** §24: true when a person chose it, so nothing moves it on its own. */
  pinned: boolean;
  /** Every dossier it is filed in that this viewer may see. */
  cases: OriginCaseLite[];
  canEdit: boolean;
  reading: boolean;
}) {
  const ui = useUi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const words = ui.words;

  const mayChoose = canEdit && !reading;
  // Nothing to say and nothing to set: the reading face prints what is filled
  // in and leaves the rest out (rule 18).
  if (!origin && !mayChoose) return null;

  async function choose(patch: { originCaseId?: string | null; originPinned: boolean }) {
    setBusy(true);
    try {
      const response = await fetch(`/api/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        ui.toast(data.error ?? 'Dat lukte niet.');
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minWidth: 0 }}>
      <p className="eyebrow entry-origin">
        <Icon name="folder" size={13} />
        {origin ? (
          <>
            <span>{words.fromCase}:</span>
            <Link href={`/c/${origin.slug}`}>{origin.name}</Link>
          </>
        ) : (
          <span className="muted">{words.noCase}</span>
        )}
        {mayChoose && (
          <button
            type="button"
            className="btn btn-small btn-ghost entry-origin-set"
            aria-expanded={open}
            aria-haspopup="menu"
            disabled={busy}
            onClick={() => setOpen((was) => !was)}
          >
            {/* Not an icon on its own: "waar komt dit vandaan" is the whole
                point of the line, and a bare pencil beside a dossier name reads
                as "rename the dossier". */}
            {pinned ? 'Wijzigen' : 'Kiezen'}
          </button>
        )}
      </p>

      {mayChoose && open && (
        <ul className="entry-origin-menu" role="menu" aria-label={`${words.fromCase}: kiezen`}>
          {cases.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                className="btn btn-small btn-ghost"
                disabled={busy}
                aria-current={origin?.id === item.id ? 'true' : undefined}
                onClick={() => void choose({ originCaseId: item.id, originPinned: true })}
              >
                <Icon name="folder" size={14} />
                {words.fromCase}: {item.name}
              </button>
            </li>
          ))}
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="btn btn-small btn-ghost"
              disabled={busy}
              onClick={() => void choose({ originCaseId: null, originPinned: true })}
            >
              <Icon name="file" size={14} />
              Geen {words.case}
            </button>
          </li>
          {/*
            The way back. Unpinning is not "clear it": it hands the artikel back
            to the rule — the oldest dossier it is filed in — and that answer is
            worked out on the spot, so the page comes back with it already
            filled in.
          */}
          {pinned && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="btn btn-small btn-ghost"
                disabled={busy}
                onClick={() => void choose({ originPinned: false })}
              >
                <Icon name="clock" size={14} />
                Volgt vanzelf
              </button>
            </li>
          )}
          {!cases.length && (
            <li role="none">
              <p className="tiny muted" style={{ margin: '0.3rem 0.45rem' }}>
                Dit artikel staat in geen enkel {words.case}. Voeg het ergens aan toe, dan kun je
                kiezen waar het vandaan komt.
              </p>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
