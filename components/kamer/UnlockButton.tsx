'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { kamerPost } from './post';

/**
 * §79: the button that opens a plek.
 *
 * It is offered only to a hand that may arrange this kamer, and it is *held*
 * when the balance is under the price — the price is on the tile either way,
 * because a kamer has to show you what you could have or there is nothing to
 * save up for. A held button says why in its title rather than vanishing: a
 * control that disappears when you are two munten short teaches nothing.
 *
 * `unlockSlot` charges inside the UPDATE, so a second click during the round
 * trip cannot buy the plek twice. `busy` is a courtesy on top of that, not the
 * guard.
 */
export function UnlockButton({
  roomId,
  slotId,
  label,
  affordable,
  short,
}: {
  roomId: string;
  slotId: string;
  /** `words.slotOpen`. */
  label: string;
  affordable: boolean;
  /** What to say when it is held — plain Dutch, there is no word for it. */
  short: string;
}) {
  const ui = useUi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function unlock() {
    setBusy(true);
    try {
      const error = await kamerPost(`/api/kamers/${roomId}/plekken/${slotId}/unlock`);
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
      className="btn btn-small plek-action"
      data-testid="plek-unlock"
      disabled={busy || !affordable}
      title={affordable ? undefined : short}
      onClick={() => void unlock()}
    >
      <Icon name="lock" size={13} />
      {label}
    </button>
  );
}
