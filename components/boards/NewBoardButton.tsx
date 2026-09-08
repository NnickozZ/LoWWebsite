'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { SideChoice } from '@/components/keeper/SideChoice';
import { useUi } from '@/components/ui/UiProvider';

/**
 * §17: two buttons rather than one and a setting afterwards. The moment you
 * make a wall is the moment you know whether it is for the camp or for you,
 * and a private wall that spent its first minute public is a leak.
 *
 * "Openbaar" is the archive's default: everyone may look and everyone may pin.
 * "Privé" sets both dials to the owner and the Keepers; they can be opened up
 * later, one dial at a time, from the board's own Rechten sheet.
 */
export function NewBoardButton({ caseId }: { caseId?: string } = {}) {
  const ui = useUi();
  const router = useRouter();
  const [busy, setBusy] = useState<'public' | 'private' | null>(null);
  /*
   * §48: and a third question, for a Keeper: which side of the archive the
   * wall is hung on. It is not the same question as openbaar-of-privé — that
   * one is about which *players* may look, this one about whether the table
   * knows the wall exists at all. Inside a Keeper-only dossier there is no
   * choice: the wall carries the dossier's name into every list that shows it.
   */
  const here = ui.caseHere && ui.caseHere.id === caseId ? ui.caseHere : null;
  const sideLocked = Boolean(here?.keeperOnly);
  const [keeperSide, setKeeperSide] = useState(sideLocked || ui.side === 'keeper');

  async function create(isPrivate: boolean) {
    setBusy(isPrivate ? 'private' : 'public');
    try {
      const response = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: isPrivate ? `Privé ${ui.words.board}` : `Nieuw ${ui.words.board}`,
          caseId,
          isPrivate,
          // §48: ignored for anyone who is not a Keeper.
          keeperOnly: ui.isKeeper ? sideLocked || keeperSide : undefined,
        }),
      });
      if (!response.ok) {
        ui.toast(`Nieuw ${ui.words.board} aanmaken is niet gelukt.`);
        return;
      }
      const data = await response.json();
      router.push(`/b/${data.board.id}`);
    } catch {
      // A `fetch` that rejects rather than answering means the archive did not
      // reply at all — the server is down or the connection dropped. Without
      // this the button simply did nothing, forever, with no explanation, which
      // is the worst way to learn that the server has died.
      ui.toast('Geen verbinding met het archief. Probeer het zo opnieuw.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="row-wrap" style={{ gap: '0.4rem' }}>
      <SideChoice
        show={ui.isKeeper}
        keeper={sideLocked || keeperSide}
        locked={sideLocked}
        lockedWhy={`${here?.name ?? `Dit ${ui.words.case}`} is van de ${ui.words.keeper}.`}
        onChange={setKeeperSide}
        words={ui.words}
      />
      <button
        type="button"
        className="btn btn-primary btn-small"
        onClick={() => void create(false)}
        disabled={busy !== null}
        title="Iedereen mag kijken en prikken"
      >
        <Icon name="plus" size={15} />
        {/* Inside a dossier there is only one wall worth making, and it is
            this dossier's — so the button says what it does rather than what
            its rights are. On the prikborden-pagina, where the choice really is
            openbaar or privé, it keeps the old word. */}
        {caseId ? `Maak nieuw ${ui.words.board} voor dit ${ui.words.case}` : `Openbaar ${ui.words.board}`}
      </button>
      <button
        type="button"
        className="btn btn-small"
        onClick={() => void create(true)}
        disabled={busy !== null}
        title="Alleen jij en de Keepers, tot je het openzet"
      >
        <Icon name="lock" size={14} />
        Privé {ui.words.board}
      </button>
    </span>
  );
}
