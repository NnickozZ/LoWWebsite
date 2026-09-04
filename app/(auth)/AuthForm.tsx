'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, signupAction, type AuthState } from './actions';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending} style={{ width: '100%' }}>
      {pending ? 'Een ogenblik…' : label}
    </button>
  );
}

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const action = mode === 'signup' ? signupAction : loginAction;
  const [state, formAction] = useActionState<AuthState, FormData>(action, {});

  return (
    <form action={formAction}>
      {mode === 'signup' && (
        <div className="field">
          <label className="label" htmlFor="code">
            Uitnodigingscode
          </label>
          <input
            id="code"
            name="code"
            className="input"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="username">
          Naam
        </label>
        <input
          id="username"
          name="username"
          className="input"
          autoComplete="username"
          autoFocus={mode === 'login'}
          required
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="password">
          Wachtwoord
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
        />
      </div>

      {mode === 'signup' && (
        <>
          <div className="field">
            <label className="label" htmlFor="password2">
              Wachtwoord nogmaals
            </label>
            <input
              id="password2"
              name="password2"
              type="password"
              className="input"
              autoComplete="new-password"
              required
            />
          </div>
          <p className="small muted" style={{ marginTop: '-0.4rem' }}>
            De Keeper kan je wachtwoord terughalen als je het vergeet. Gebruik geen wachtwoord dat je
            ook ergens anders gebruikt.
          </p>
        </>
      )}

      {state.error && (
        <p className="error-note" role="alert">
          {state.error}
        </p>
      )}

      <Submit label={mode === 'signup' ? 'Account aanmaken' : 'Inloggen'} />
    </form>
  );
}
