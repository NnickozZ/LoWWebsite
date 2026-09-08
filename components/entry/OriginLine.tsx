'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { capitalise } from '@/lib/words';

export type OriginCaseLite = {
  id: string;
  slug: string;
  name: string;
  /**
   * §49: may this hand take the artikel out of *this* dossier? The dossier's
   * own dials decide (§17), so it is resolved per dossier on the server. The
   * API checks it again; this only decides whether the offer is made.
   */
  canEdit?: boolean;
};

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
 * §49: and whether the lists print it at all is now a tickbox here, because it
 * was never a property of the *soort*. Three controls, in the order the sentence
 * reads: the tickbox ("Dossier voor de naam"), the dossier it points at, and —
 * inside the menu, per dossier — the way out of that dossier altogether.
 *
 * Ticking with nothing chosen picks the dossier the artikel already came from,
 * or the first one it is filed in: a tick that printed nothing would look
 * broken. Unticking changes nothing but the printing — the artikel stays on
 * every shelf it was on, and ticking it again a week later says the same thing.
 * "Uit dit dossier halen" is the opposite of that: it really takes the artikel
 * off that shelf, and the server then works out where it came from instead
 * (`reconcileOrigin`). If that leaves it nowhere, the prefix has nothing to
 * print, which the archive already has a word for — `isAdrift`.
 *
 * §18: reading, this is a line of print — a folder, a name, a link, no controls.
 * The controls only exist on the editing face, and only for somebody the server
 * would let write (`canEdit`); the API checks that again in any case (§10), and
 * a refusal is printed rather than swallowed.
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
  prefix,
  cases,
  canEdit,
  reading,
}: {
  entryId: string;
  /** The dossier it came from, when there is one this viewer may be told about. */
  origin: OriginCaseLite | null;
  /** §24: true when a person chose it, so nothing moves it on its own. */
  pinned: boolean;
  /** §49: does every list print that dossier in front of this artikel's name? */
  prefix: boolean;
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

  async function patch(body: {
    originCaseId?: string | null;
    originPinned?: boolean;
    casePrefix?: boolean;
  }) {
    setBusy(true);
    try {
      const response = await fetch(`/api/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
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

  /*
   * §49: the tickbox. On with no dossier chosen would print nothing, so it
   * carries a choice with it — what it came from, or the oldest shelf it is on.
   * Off is one field and nothing else: the filing is not this control's.
   */
  function togglePrefix(on: boolean) {
    if (!on) return void patch({ casePrefix: false });
    if (origin || !cases.length) return void patch({ casePrefix: true });
    void patch({ casePrefix: true, originCaseId: cases[0].id, originPinned: true });
  }

  /**
   * §49: really out of this dossier — the row goes, not the label. The server
   * reconciles the herkomst afterwards, so an artikel that was printed under
   * the dossier it just left is printed under the next one it is in, or under
   * none at all.
   */
  async function unfile(item: OriginCaseLite) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/cases/${item.id}/entries?entryId=${encodeURIComponent(entryId)}`,
        { method: 'DELETE' },
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        // §10: the API is the rule, not the hidden button — a 403 is a sentence
        // the person reads, not a click that quietly did nothing.
        ui.toast(data.error ?? `Uit dit ${words.case} halen lukte niet.`);
        return;
      }
      ui.toast(`Uit ${item.name} gehaald.`);
      setOpen(false);
      router.refresh();
    } catch {
      ui.toast('Geen verbinding met het archief.');
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
          <>
            {/* §49: the tickbox first — it is the sentence's verb. Its label
                says what it does to the *name*, not to the filing, because the
                two were confused for a whole round. */}
            <label
              className="row"
              style={{ gap: '0.3rem', alignItems: 'center', textTransform: 'none' }}
            >
              <input
                type="checkbox"
                checked={prefix}
                disabled={busy}
                onChange={(event) => togglePrefix(event.target.checked)}
              />
              <span>{`${capitalise(words.case)} voor de naam`}</span>
            </label>
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
          </>
        )}
      </p>

      {mayChoose && open && (
        <ul className="entry-origin-menu" role="menu" aria-label={`${words.fromCase}: kiezen`}>
          {cases.map((item) => (
            <li key={item.id} role="none" style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                type="button"
                role="menuitem"
                className="btn btn-small btn-ghost"
                disabled={busy}
                aria-current={origin?.id === item.id ? 'true' : undefined}
                onClick={() => void patch({ originCaseId: item.id, originPinned: true })}
              >
                <Icon name="folder" size={14} />
                {words.fromCase}: {item.name}
              </button>
              {/* §49: and the way out. Only where this hand may edit *that*
                  dossier (§17) — the API refuses the rest, and an offer nobody
                  may take is worse than no offer. */}
              {item.canEdit && (
                <button
                  type="button"
                  role="menuitem"
                  className="btn btn-small btn-ghost"
                  disabled={busy}
                  style={{ width: 'auto', flex: '0 0 auto' }}
                  title={`Uit ${item.name} halen`}
                  onClick={() => void unfile(item)}
                >
                  <Icon name="close" size={14} />
                  {`Uit dit ${words.case} halen`}
                </button>
              )}
            </li>
          ))}
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="btn btn-small btn-ghost"
              disabled={busy}
              onClick={() => void patch({ originCaseId: null, originPinned: true })}
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
                onClick={() => void patch({ originPinned: false })}
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
