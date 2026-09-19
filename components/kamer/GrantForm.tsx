'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { kamerPost } from './post';

/**
 * §79: the Keeper writes a line.
 *
 * Two boxes and a button, under the grootboek it adds to, and nothing else —
 * this is the only road in for a positive number and the only road at all for
 * a correction, so it may as well look like what it is: a line being written
 * at the bottom of a ledger.
 *
 * A negative amount is allowed on purpose (a theft at the table, a mistake put
 * right) and is typed as one: `-3`. The floor at zero, "a bedrag is a whole
 * number", and Keeper-only are all `grant`'s, asked on the server, and their
 * refusals come back as the sentence to show.
 *
 * It is an ordinary controlled form rather than `useActionState`: the round's
 * writes are API routes, and §63's warning about a form action resetting the
 * boxes underneath an error does not apply to a form that owns its own state.
 * What was typed survives a refusal, which is the part that matters.
 */
export function GrantForm({
  roomId,
  give,
  why,
}: {
  roomId: string;
  /** `words.ledgerGive`. */
  give: string;
  /** `words.ledgerWhy`. */
  why: string;
}) {
  const ui = useUi();
  const router = useRouter();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const error = await kamerPost(`/api/kamers/${roomId}/grant`, { delta, reason });
      if (error) {
        ui.toast(error);
        return;
      }
      setDelta('');
      setReason('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="kamer-grant" data-testid="grootboek-form" onSubmit={(event) => void submit(event)}>
      <label className="visually-hidden" htmlFor="grootboek-bedrag">
        Hoeveel?
      </label>
      <input
        id="grootboek-bedrag"
        className="input kamer-grant-amount"
        data-testid="grootboek-bedrag"
        value={delta}
        inputMode="numeric"
        placeholder="+3"
        readOnly={busy}
        onChange={(event) => setDelta(event.target.value)}
      />
      <label className="visually-hidden" htmlFor="grootboek-reden">
        {why}
      </label>
      <input
        id="grootboek-reden"
        className="input kamer-grant-reason"
        data-testid="grootboek-reden"
        value={reason}
        placeholder={why}
        readOnly={busy}
        onChange={(event) => setReason(event.target.value)}
      />
      <button type="submit" className="btn btn-primary btn-small" data-testid="grootboek-geef" disabled={busy}>
        <Icon name="plus" size={13} />
        {give}
      </button>
    </form>
  );
}
