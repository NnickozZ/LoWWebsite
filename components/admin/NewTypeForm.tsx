'use client';

import { useActionState, useEffect } from 'react';
import { Icon } from '@/components/Icon';
import { createTypeAction, type AdminState } from '@/app/(app)/admin/actions';
import { announceNewType } from './newType';

/**
 * §2.2's two-field pattern, once more: a new type needs only a name.
 *
 * §96: and then the soort you just named opens, comes into view and waits for
 * its first field — it used to land shut at the bottom of the list, 1.370 px
 * down. This form stands at the top of the list since the same round.
 */
export function NewTypeForm() {
  const [state, action, busy] = useActionState<AdminState, FormData>(createTypeAction, {});

  useEffect(() => {
    if (state.created) announceNewType(state.created);
  }, [state]);

  return (
    <form action={action} className="row-wrap" style={{ margin: '0.8rem 0' }}>
      <label className="visually-hidden" htmlFor="new-type">
        Naam van de nieuwe soort
      </label>
      <input
        id="new-type"
        className="input"
        name="label"
        placeholder="Nieuwe soort, bijvoorbeeld Schepen"
        style={{ flex: '1 1 14rem' }}
      />
      <button className="btn btn-small" type="submit" disabled={busy}>
        <Icon name="plus" size={15} />
        {busy ? 'Aanmaken…' : 'Soort aanmaken'}
      </button>
      {state.error && <p className="error-note" style={{ width: '100%' }}>{state.error}</p>}
    </form>
  );
}
