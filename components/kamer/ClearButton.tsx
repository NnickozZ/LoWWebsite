'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { fill, type Words } from '@/lib/words';
import { MEANING } from './plekWords';
import { kamerPost } from './post';

/**
 * §79: taking something off the shelf.
 *
 * No confirmation, and that is deliberate: nothing is destroyed and nothing is
 * refunded (`clearSlot`). The voorwerp is an artikel and goes on existing; the
 * only thing that ends is that it lies here, and putting it back is the same
 * two taps.
 */
export function ClearButton({
  roomId,
  slotId,
  label,
  name,
  compact,
  toDrawer = false,
  guestOf = null,
  words,
}: {
  roomId: string;
  slotId: string;
  /** `words.slotClear`. */
  label: string;
  /** §84: wat er weggehaald wordt, voor de melding erna. */
  name: string;
  /**
   * §85: een × rechtsboven in de tegel in plaats van een knop onderaan.
   *
   * Weghalen en Neerzetten stonden tot ronde 46 naast elkaar, even groot, op
   * dezelfde plek in de tegel — en dat zegt dat het twee even waarschijnlijke
   * dingen zijn om te doen. Dat is het niet: je zet tien dingen neer voor je er
   * één weghaalt. De × is klein, staat uit de leesrichting, houdt zijn 44 px
   * raakvlak (§69 6.1) en draagt de naam van wat hij weghaalt in zijn
   * `aria-label`, want een × op zichzelf zegt niet waarvan.
   */
  compact?: boolean;
  /**
   * §93: huisraad gaat de lade in, en de melding zegt dat — "ligt nu in je
   * lade" is een andere belofte dan "is weggehaald".
   */
  toDrawer?: boolean;
  /** §93: de onderzoeker, als dit de kamer van een ander is. */
  guestOf?: string | null;
  words: Words;
}) {
  const ui = useUi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function clear() {
    setBusy(true);
    try {
      const error = await kamerPost(`/api/kamers/${roomId}/plekken/${slotId}/clear`);
      if (error) {
        ui.toast(error);
        return;
      }
      // §84: ook weghalen zegt iets. Het kost niets en geeft niets terug (§79),
      // maar het is wél een verandering aan je kamer, en een verandering zonder
      // woord is een verandering die je een keer per ongeluk doet.
      ui.toast(
        toDrawer
          ? guestOf
            ? fill(words.clearedToDrawerOf, { ding: name, naam: guestOf })
            : fill(words.clearedToDrawer, { ding: name })
          : fill(words.clearedHere, { ding: name }),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        className="btn btn-ghost plek-clear"
        data-testid="plek-clear"
        aria-label={fill(words.slotClearOne, { ding: name })}
        title={fill(words.slotClearOne, { ding: name })}
        disabled={busy}
        onClick={() => void clear()}
      >
        <Icon name={MEANING.weghalen} size={14} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-small plek-action"
      data-testid="plek-clear"
      disabled={busy}
      onClick={() => void clear()}
    >
      <Icon name={MEANING.weghalen} size={13} />
      {label}
    </button>
  );
}
