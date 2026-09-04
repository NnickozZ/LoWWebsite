'use client';

import { useActionState } from 'react';
import { changePasswordAction, type AccountState } from './actions';

export function ChangePasswordForm() {
  const [state, action] = useActionState<AccountState, FormData>(changePasswordAction, {});

  return (
    <form action={action} style={{ maxWidth: 420 }}>
      <div className="field">
        <label className="label" htmlFor="current">
          Huidig wachtwoord
        </label>
        <input
          id="current"
          name="current"
          type="password"
          className="input"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="next">
          Nieuw wachtwoord
        </label>
        <input
          id="next"
          name="next"
          type="password"
          className="input"
          autoComplete="new-password"
          required
        />
      </div>
      {state.error && <p className="error-note">{state.error}</p>}
      {state.ok && <p className="small">{state.ok}</p>}
      <button className="btn" type="submit">
        Wachtwoord wijzigen
      </button>
    </form>
  );
}
