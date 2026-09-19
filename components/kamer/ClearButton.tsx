'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
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
}: {
  roomId: string;
  slotId: string;
  /** `words.slotClear`. */
  label: string;
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
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-small plek-action"
      data-testid="plek-clear"
      disabled={busy}
      onClick={() => void clear()}
    >
      <Icon name="close" size={13} />
      {label}
    </button>
  );
}
