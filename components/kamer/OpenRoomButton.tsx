'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { fill, type Words } from '@/lib/words';
import { MEANING } from './plekWords';
import { kamerPost } from './post';

/**
 * §86: de Keeper geeft een onderzoeker een kamer.
 *
 * Staat op het artikel zelf, want dat is waar je naar een figuur kijkt en
 * bedenkt dat hij iets hoort te bezitten. Alleen voor de Keeper, en alleen
 * zolang er nog geen kamer is — daarna staat op diezelfde regel de beurs en de
 * deur ernaartoe, en is deze knop weg omdat hij niets meer te doen heeft.
 *
 * Geen bevestiging: een kamer openen neemt niets af en is met één blik terug
 * te draaien (er ligt niets in). Wel een melding, want er verschijnt een deur
 * die er een tel eerder niet was — dat is §84's regel over een verandering
 * zonder woord.
 */
export function OpenRoomButton({ entryId, name, words }: { entryId: string; name: string; words: Words }) {
  const ui = useUi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const error = await kamerPost('/api/kamers/openen', { entryId });
      if (error) {
        ui.toast(error);
        return;
      }
      ui.toast(fill(words.roomOpened, { naam: name }));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-small"
      data-testid="entry-kamer-openen"
      disabled={busy}
      onClick={() => void open()}
    >
      <Icon name={MEANING.kamer} size={13} />
      {words.roomOpen}
    </button>
  );
}
