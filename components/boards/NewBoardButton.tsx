'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
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
      <button
        type="button"
        className="btn btn-primary btn-small"
        onClick={() => void create(false)}
        disabled={busy !== null}
        title="Iedereen mag kijken en prikken"
      >
        <Icon name="plus" size={15} />
        Openbaar {ui.words.board}
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
