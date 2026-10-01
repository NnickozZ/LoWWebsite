'use client';

import { useActionState, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { confirmsBin } from '@/lib/entries/binConfirm';
import { fill } from '@/lib/words';
import type { DeleteEntryState } from '@/app/(app)/e/[slug]/actions';

/**
 * Golf O, vijfde pas: *Naar de prullenbak* opens only once the confirm word
 * (*akkoord*, `deleteConfirmWord`) is typed. Not the artikel's name: that is
 * the guard on *Voorgoed wissen* in Beheer, where nothing comes back; here a
 * Keeper can still fetch it out of the bin, so one ordinary word is enough.
 */
export function DeleteEntryForm({
  entryId,
  action,
}: {
  entryId: string;
  action: (prev: DeleteEntryState, formData: FormData) => Promise<DeleteEntryState>;
}) {
  const { words } = useUi();
  const [typed, setTyped] = useState('');
  const [state, formAction, pending] = useActionState(action, { error: null });
  const word = words.deleteConfirmWord;
  const ready = confirmsBin(typed, word);
  const id = `entry-bin-${entryId}`;

  return (
    <form action={formAction} className="stack entry-bin-form">
      <input type="hidden" name="entryId" value={entryId} />
      <label className="label" htmlFor={id}>
        {fill(words.deleteConfirmLabel, { woord: `“${word}”`, artikel: words.entry })}
      </label>
      <input
        id={id}
        className="input entry-bin-confirm"
        name="confirmWord"
        value={typed}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        data-testid="entry-bin-confirm"
        onChange={(event) => setTyped(event.target.value)}
      />
      {state.error && <p className="error-note">{state.error}</p>}
      <div>
        <button
          className="btn btn-small btn-danger"
          type="submit"
          disabled={pending || !ready}
          data-testid="entry-bin-go"
        >
          <Icon name="trash" size={14} />
          {words.deleteToBin}
        </button>
      </div>
    </form>
  );
}
