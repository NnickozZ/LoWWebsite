'use client';

import { useActionState } from 'react';
import { Icon } from '@/components/Icon';
import { createTypeAction, type AdminState } from '@/app/(app)/admin/actions';

/** §2.2's two-field pattern, once more: a new type needs only a name. */
export function NewTypeForm() {
  const [state, action, busy] = useActionState<AdminState, FormData>(createTypeAction, {});

  return (
    <form action={action} className="row-wrap" style={{ marginTop: '0.8rem' }}>
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
