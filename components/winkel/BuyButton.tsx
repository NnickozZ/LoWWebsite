'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { kamerPost } from '@/components/kamer/post';
import { useUi } from '@/components/ui/UiProvider';

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
 * `slotId` is `shopFor`'s `landsIn`: the first open, empty plek of the right
 * kind. It is a convenience and never a decision — the route still checks that
 * the plek is open, empty and of the right kind, so a `landsIn` that went out
 * of date between the render and the click comes back as a refusal and not as
 * a thing in the wrong drawer.
 *
 * The refresh is what makes the row say "owned" and the purse at the top drop:
 * the page is server-rendered, and one re-render moves both.
 */
export function BuyButton({
  roomId,
  slotId,
  entryId,
  label,
}: {
  roomId: string;
  /** Where it would land — `shopFor`'s `landsIn`. */
  slotId: string;
  entryId: string;
  label: string;
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
      {label}
    </button>
  );
}
