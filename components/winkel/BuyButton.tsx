'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { MEANING, munt, plekWord, withPrice } from '@/components/kamer/plekWords';
import { kamerPost } from '@/components/kamer/post';
import { useUi } from '@/components/ui/UiProvider';
import type { PlekKind } from '@/lib/kamers/shape';
import { fill, type Words } from '@/lib/words';

/**
 * §82: kopen vanuit de winkel.
 *
 * Deliberately the same three lines as the catalogue tab in
 * `components/kamer/PlaceButton.tsx`: one POST to the plek's own `buy` route,
 * the sentence that comes back shown as it is written, and a
 * `router.refresh()` when it worked. There is no second road to a purchase and
 * this file is not one — `buyFurnishing` asks all five of its questions again
 * however the button was pressed, so a shop that has gone stale (somebody else
 * took the last lantaarn, the munten were spent on another tab) refuses here
 * exactly as it would in the kamer.
 *
 * `slotId` is `shopFor`'s `landsIn` for the kind this row is buying into: the
 * first open, empty plek of that kind. It is a convenience and never a
 * decision — the route still checks that the plek is open, empty and of the
 * right kind, so a `landsIn` that went out of date between the render and the
 * click comes back as a refusal and not as a thing in the wrong drawer.
 *
 * **§84 gave the purchase a voice.** Before it, this was the quietest spend in
 * the archive: one click, two munten gone, and the only sign was a single digit
 * changing in a blokje that looked exactly like a price tag. The doorloop
 * measured 174 ms between click and new balance — the speed was never the
 * problem, the silence was. So the button says what it costs *before*, and a
 * toast says where the thing went *after*, with a door to go and look at it.
 * There is still no confirmation dialog, on purpose: this is something you do
 * twenty times in an evening and a dialog would be friction, not care.
 */
export function BuyButton({
  roomId,
  slotId,
  entryId,
  name,
  kind,
  price,
  roomSlug,
  words,
}: {
  roomId: string;
  /** Where it would land — `shopFor`'s `landsIn` for this row's kind. */
  slotId: string;
  entryId: string;
  /** What it is called, for the sentence afterwards. */
  name: string;
  /** Which kind of plek it lands on, for that same sentence. */
  kind: PlekKind;
  price: number;
  /** The kamer to go and look at it in, or null when this is not a page that knows. */
  roomSlug: string | null;
  words: Words;
}) {
  const ui = useUi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function buy() {
    setBusy(true);
    try {
      const error = await kamerPost(`/api/kamers/${roomId}/plekken/${slotId}/buy`, { entryId });
      if (error) {
        ui.toast(error);
        return;
      }
      /*
       * Wat er gebeurd is, en waar het heen is. De prijs staat erbij omdat het
       * saldo bovenaan met één cijfer verandert en dat te makkelijk te missen
       * is — en het is de prijs die deze knop toch al droeg, geen som: dit
       * scherm rekent nooit een saldo uit (§79 regel 1).
       */
      const where = fill(words.boughtHere, { ding: name, plek: plekWord(kind, words) });
      ui.toast(
        `${where} −${munt(price, words)}`,
        roomSlug ? { label: words.toastShow, onAction: () => router.push(`/kamer/${roomSlug}#plek-${slotId}`) } : undefined,
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-small btn-primary"
      data-testid="winkel-koop"
      data-entry-id={entryId}
      disabled={busy}
      onClick={() => void buy()}
    >
      <Icon name={MEANING.munt} size={13} />
      {withPrice(words.buy, price, words)}
    </button>
  );
}
