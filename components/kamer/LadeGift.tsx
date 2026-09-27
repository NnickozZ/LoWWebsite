'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { EntryPicker, type EntryRef } from '@/components/entry/EntryPicker';
import { useUi } from '@/components/ui/UiProvider';
import { fill, type Words } from '@/lib/words';
import { MEANING } from './plekWords';
import { kamerPostFor } from './post';

/**
 * §101: de Keeper legt iets rechtstreeks in de lade van deze kamer.
 *
 * `GrantForm`'s broertje, en met opzet even kaal: een zoekvak voor huisraad
 * (de soorten die alleen de Keeper maakt — `furnishingTypeSlugs`), en een knop.
 * Het zoekvak is `EntryPicker`, dezelfde als in de infobox; wat de server
 * weigert (geen huisraad, een uniek ding dat al van iemand is) komt terug als
 * de zin om te tonen. Getekend voor de Keeper alleen, en `giveToDrawer`
 * vraagt het nóg een keer (§17 regel 4).
 */
export function LadeGift({
  roomId,
  name,
  types,
  words,
}: {
  roomId: string;
  /** De onderzoeker van de kamer, voor de melding. */
  name: string;
  /** De soorten waarvan iets in een lade mag. */
  types: string[];
  words: Words;
}) {
  const ui = useUi();
  const router = useRouter();
  const [picked, setPicked] = useState<EntryRef | null>(null);
  const [busy, setBusy] = useState(false);
  const boxId = useId();

  async function give() {
    if (!picked || busy) return;
    setBusy(true);
    try {
      const { error, data } = await kamerPostFor<{ name: string }>(
        `/api/kamers/${roomId}/lade`,
        { entryId: picked.id },
        words,
      );
      if (error || !data) {
        if (error) ui.toast(error);
        return;
      }
      ui.toast(fill(words.drawerGiveDone, { ding: data.name, naam: name }));
      setPicked(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kamer-lade-gift" data-testid="lade-gift">
      <label className="tiny muted kamer-lade-gift-label" htmlFor={boxId}>
        {words.drawerGiveLabel}
      </label>
      <div className="row-wrap kamer-lade-gift-row">
        <div className="kamer-lade-gift-pick">
          <EntryPicker
            id={boxId}
            value={picked}
            ofType={types}
            placeholder={words.drawerGivePlaceholder}
            onPick={setPicked}
            onClear={() => setPicked(null)}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary btn-small"
          data-testid="lade-gift-geef"
          disabled={!picked || busy}
          onClick={() => void give()}
        >
          <Icon name={MEANING.geven} size={13} />
          {words.drawerGiveButton}
        </button>
      </div>
    </div>
  );
}
