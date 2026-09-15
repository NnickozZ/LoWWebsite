'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';

/**
 * §11/§69 — de prullenbak-lade, voor elk tekenvlak dezelfde.
 *
 * A dossier has had one of these since round 6: a folded `<details>` at the
 * bottom of the page saying "Dossier verwijderen", one muted sentence that
 * nothing is really erased, and a red button into the bin.
 *
 * "Je kunt geen stambomen verwijderen" was the report, and it was exact: of the
 * four tekenvlakken the **stamboom alone** had the whole road and no door. The
 * other three each have a door of their own already — `removeBoard` in
 * `BoardCanvas`, `deleteTimeline` behind the tijdlijn's Instellingen, and
 * `takeDown` in the landkaart's Keeper-blok — so this component is deliberately
 * used on the stamboom **only**. A second door into the same prullenbak on a
 * page that already has one is worse than the gap it would close; putting all
 * four on this one component means taking their own buttons away, which is a
 * round and not a repair (DECISIONS, ronde 36).
 *
 * So this is the dossier's bin with the noun taken out of it, and the same
 * three promises:
 *
 *  - **Folded.** Weggooien is niets waar je per ongeluk op drukt.
 *  - **Nothing is really erased.** A soft delete; a Keeper digs it up again in
 *    Beheer → Prullenbak.
 *  - **The archive's own word.** The noun comes in as a prop (the page already
 *    has `getWords()`), and the Keeper's title is read from `useUi().words` —
 *    never hard-coded (§5).
 *
 * It takes no height from a full-screen canvas: every caller puts it *below*
 * the `.page-canvas` column, where `#tree-underfold` / `#map-underfold` put the
 * tekenlaag switch, for the same reason (§34: the stage gets the screen).
 *
 * Everyone else is told by §21: the soft delete is an UPDATE through the ORM,
 * so `changeLogger` puts `family_tree:{id}` and `family_trees` (and the same
 * pair for the other three) on the wire by itself. The two kinds that also have
 * a hub sentence of their own — the prikbord and the stamboom, whose canvases
 * pull on it — say it in the route as well, so a hand that is drawing hears it
 * without waiting for a list page to notice.
 */
export function BinSlot({
  endpoint,
  noun,
  redirectTo,
  summary,
  note,
  testId = 'bin-slot',
}: {
  /** Where the `DELETE` goes: `/api/family-trees/{id}`, `/api/maps/{id}`, … */
  endpoint: string;
  /** The archive's own word for this thing, lower case: `words.familyTree`. */
  noun: string;
  /** The list page to land on once it is in the bin. */
  redirectTo: string;
  /** The summary line. Defaults to "<Noun> verwijderen". */
  summary?: string;
  /** An extra sentence about what stays behind, where there is one. */
  note?: string;
  testId?: string;
}) {
  const ui = useUi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const title = summary ?? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} verwijderen`;

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        ui.toast(data?.error ?? `Deze ${noun} is niet verwijderd.`);
        setBusy(false);
        return;
      }
      // The list page is server-rendered, so it has to be asked again — and the
      // Back button must not land on the payload from before the removal.
      router.push(redirectTo);
      router.refresh();
    } catch {
      ui.toast('Geen verbinding.');
      setBusy(false);
    }
  };

  return (
    <details className="section" data-testid={testId} style={{ marginTop: '1.5rem' }}>
      <summary>{title}</summary>
      <div style={{ padding: '0.6rem 0 1.5rem' }}>
        <p className="small muted">
          Niets wordt echt gewist — een {ui.words.keeper} kan dit terughalen uit de prullenbak.
          {note ? ` ${note}` : ''}
        </p>
        <button
          className="btn btn-small btn-danger"
          type="button"
          disabled={busy}
          data-testid={`${testId}-button`}
          onClick={() => void remove()}
        >
          <Icon name="trash" size={14} />
          Naar de prullenbak
        </button>
      </div>
    </details>
  );
}
