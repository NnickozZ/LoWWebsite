'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/auth/rules.mjs';
import { usernameProblem } from '@/lib/auth/username.mjs';
import { loginAction, signupAction, type AuthField, type AuthState } from './actions';

/**
 * §63: the front door keeps what you typed.
 *
 * Two things were wrong here, and they were the same thing twice.
 *
 * **The form emptied itself.** `<form action={…}>` with `useActionState` is a
 * React form action, and React calls `requestFormReset()` on it once the action
 * settles — by design, because the ordinary case is a form that succeeded. So a
 * password one character too short came back from the server with its sentence
 * *and* a blank invitation code and a blank name, and the person started over
 * for a reason that had nothing to do with either box. Three answers, stacked
 * deliberately:
 *
 *   1. The rules are asked **in the browser first**. `run()` below is a client
 *      function handed to `useActionState`, so "too short" and "those two are
 *      not the same" are answered without the server being asked at all. That
 *      is also the only reason the boxes can keep a password: the echo never
 *      leaves this machine, because `run` still has the `FormData` in hand
 *      after awaiting the server and fills `values` from it here.
 *   2. Every box reads `defaultValue` out of that echo. React resets a form to
 *      its inputs' *attributes*, and `defaultValue` is that attribute, so the
 *      reset puts the typed text back instead of wiping it.
 *   3. And because (2) depends on React resetting inside the same commit as the
 *      state update, `useEffect` below writes the values back imperatively as
 *      well. An effect runs after the commit, so it is the last word whatever
 *      the reset did. Belt and braces on purpose: this is the first screen of
 *      the archive and it is not allowed to be clever.
 *
 * **And it did not say which box.** One red line under the whole form meant
 * reading four boxes to find out which one the sentence was about. The action
 * now names the box (`field`), the sentence stands under *that* box, and the
 * box is focused when the answer arrives.
 *
 * Two deliberate costs, written down so the next round does not "fix" them:
 *
 * `noValidate` turns the browser's own bubbles off. `required` stays on the
 * boxes — it is what a screen reader reads and what an autofill respects — but
 * an empty box gets the same Dutch sentence in the same place as a short one,
 * instead of a bubble in whatever language the browser happens to be in.
 *
 * And handing `useActionState` a *client* function means the form no longer has
 * a server action as its `action` attribute, so it no longer submits with
 * JavaScript off. That was never a supported way to use this archive — the wiki,
 * the prikbord, the tijdlijn and the web are all canvases and editors — and it
 * is the price of answering "too short" without asking the server. Worth naming
 * because it was true by accident before, and is false on purpose now.
 */

const FIELD_ORDER = ['code', 'username', 'password', 'password2'] as const;
type FieldName = (typeof FIELD_ORDER)[number];

type Typed = Record<FieldName, string>;

const EMPTY: Typed = { code: '', username: '', password: '', password2: '' };

function readTyped(formData: FormData): Typed {
  const read = (name: FieldName) => String(formData.get(name) ?? '');
  return { code: read('code'), username: read('username'), password: read('password'), password2: read('password2') };
}

/**
 * The answers this machine can give on its own. Deliberately the same rules, in
 * the same order, as `signupAction` — `lib/auth/rules.mjs` and
 * `lib/auth/username.mjs` import nothing, so there is one definition of each
 * and the browser and the server cannot drift apart about it.
 *
 * The invitation code is *not* checked here: only the archive knows it, and a
 * wrong one has to be a round trip.
 */
function localProblem(typed: Typed, mode: 'login' | 'signup'): { error: string; field: AuthField } | null {
  if (mode === 'login') {
    if (!typed.username.trim()) return { error: 'Vul je naam in.', field: 'username' };
    if (!typed.password) return { error: 'Vul je wachtwoord in.', field: 'password' };
    return null;
  }
  if (!typed.code.trim()) return { error: 'Vul de uitnodigingscode van je Keeper in.', field: 'code' };
  const name = usernameProblem(typed.username);
  if (name) return { error: name, field: 'username' };
  const password = passwordProblem(typed.password);
  if (password) return { error: password, field: 'password' };
  if (typed.password !== typed.password2) {
    return { error: 'De twee wachtwoorden zijn niet hetzelfde.', field: 'password2' };
  }
  return null;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending} style={{ width: '100%' }}>
      {pending ? 'Een ogenblik…' : label}
    </button>
  );
}

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const serverAction = mode === 'signup' ? signupAction : loginAction;
  const helpId = useId();

  const run = async (prev: AuthState, formData: FormData): Promise<AuthState> => {
    const typed = readTyped(formData);
    const seq = (prev.seq ?? 0) + 1;

    const local = localProblem(typed, mode);
    if (local) return { ...local, values: typed, seq };

    /*
     * `{}` and not `prev`, and this matters. A server action's arguments are
     * serialised into the request, so handing it the previous state would post
     * the echo back up — the rejected password and the invitation code, a second
     * time, into anything on the way that logs a body. The actions ignore their
     * first argument anyway; the echo exists for the boxes in this browser.
     *
     * A `redirect()` from the action is resolved by Next's router rather than
     * thrown here, and resolves this promise with `undefined` — which `?? {}`
     * absorbs. Anything that *is* thrown is the network, below.
     */
    let result: AuthState;
    try {
      result = (await serverAction({}, formData)) ?? {};
    } catch (error) {
      // Next's own control flow (a redirect, a `notFound`) rides on a thrown
      // error with a `digest`. Swallowing one of those would strand the person
      // on a form that had just succeeded.
      const digest = (error as { digest?: unknown } | null)?.digest;
      if (typeof digest === 'string' && digest.startsWith('NEXT_')) throw error;
      return { error: 'Geen verbinding met het archief. Probeer het opnieuw.', values: typed, seq };
    }

    /*
     * Logging in wrong is different from signing up wrong: the password is the
     * thing that was wrong, and keeping it would invite the same click again.
     * The name stays, because retyping that is pure tax.
     */
    const echo = mode === 'login' ? { ...typed, password: '', password2: '' } : typed;
    return { ...result, values: echo, seq };
  };

  const [state, formAction, pending] = useActionState<AuthState, FormData>(run, {});

  const boxes = useRef<Partial<Record<FieldName, HTMLInputElement | null>>>({});
  useEffect(() => {
    if (!state.seq) return;
    const values = state.values ?? EMPTY;
    for (const name of FIELD_ORDER) {
      const box = boxes.current[name];
      if (box && box.value !== values[name]) box.value = values[name];
    }
    /*
     * The box the sentence is about, so the caret is already where the repair has
     * to happen — and *only* then. A rate limit and "het archief is nog niet
     * ingericht" are nobody's box: their sentence stands under the button, and
     * throwing the caret into the name box would point at the wrong thing.
     */
    if (state.error && state.field) boxes.current[state.field]?.focus();
  }, [state.seq, state.error, state.field, state.values]);

  const values = state.values ?? EMPTY;
  /** The sentence under one box — and `null` for the ones it is not about. */
  const noteFor = (name: FieldName) =>
    state.error && state.field === name ? (
      <p className="error-note small" role="alert" style={{ marginBottom: 0 }}>
        {state.error}
      </p>
    ) : null;
  const wrong = (name: FieldName) => (state.error && state.field === name ? true : undefined);

  /*
   * The boxes are read-only while the archive is being asked, and that is not
   * decoration. The echo is the `FormData` as it was at submit, so a letter typed
   * *during* the round trip would be thrown away by the restore below — silently,
   * which is the worst way for a login form to lose a character. `readOnly`
   * rather than `disabled`: a disabled box loses the focus it has, and the person
   * is most likely still standing in one.
   */
  return (
    <form action={formAction} noValidate aria-busy={pending || undefined}>
      {mode === 'signup' && (
        <div className="field">
          <label className="label" htmlFor="code">
            Uitnodigingscode
          </label>
          <input
            id="code"
            name="code"
            className="input"
            ref={(el) => {
              boxes.current.code = el;
            }}
            defaultValue={values.code}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={wrong('code')}
            readOnly={pending}
            required
          />
          {noteFor('code')}
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
          ref={(el) => {
            boxes.current.username = el;
          }}
          defaultValue={values.username}
          autoComplete="username"
          autoFocus={mode === 'login'}
          aria-invalid={wrong('username')}
          readOnly={pending}
          required
        />
        {noteFor('username')}
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
          ref={(el) => {
            boxes.current.password = el;
          }}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          aria-invalid={wrong('password')}
          aria-describedby={mode === 'signup' ? helpId : undefined}
          readOnly={pending}
          required
        />
        {/* The rule said out loud, before it can be broken. It used to be
            findable only by breaking it — and breaking it emptied the page. */}
        {mode === 'signup' && (
          <p className="tiny muted" id={helpId} style={{ margin: '0.3rem 0 0' }}>
            Minstens {MIN_PASSWORD_LENGTH} tekens.
          </p>
        )}
        {noteFor('password')}
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
              ref={(el) => {
                boxes.current.password2 = el;
              }}
              autoComplete="new-password"
              aria-invalid={wrong('password2')}
              readOnly={pending}
              required
            />
            {noteFor('password2')}
          </div>
          <p className="small muted" style={{ marginTop: '-0.4rem' }}>
            De Keeper kan je wachtwoord terughalen als je het vergeet. Gebruik geen wachtwoord dat je
            ook ergens anders gebruikt.
          </p>
        </>
      )}

      {/* Whatever is nobody's box in particular: a rate limit, an archive that
          has not been set up, a name already taken by somebody else. */}
      {state.error && !state.field && (
        <p className="error-note" role="alert">
          {state.error}
        </p>
      )}

      <Submit label={mode === 'signup' ? 'Account aanmaken' : 'Inloggen'} />
    </form>
  );
}
