'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';

export function NewBoardButton() {
  const ui = useUi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const response = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Nieuw prikbord' }),
      });
      if (!response.ok) {
        ui.toast('Nieuw prikbord aanmaken is niet gelukt.');
        return;
      }
      const data = await response.json();
      router.push(`/b/${data.board.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-primary btn-small" onClick={create} disabled={busy}>
      <Icon name="plus" size={15} />
      Nieuw prikbord
    </button>
  );
}
