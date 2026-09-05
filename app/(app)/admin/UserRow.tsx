'use client';

import { useEffect, useState } from 'react';
import { useActionState } from 'react';
import { Icon } from '@/components/Icon';
import { relativeTime } from '@/lib/diff';
import { setPasswordAction, toggleDisabledAction, toggleKeeperAction, type AdminState } from './actions';

type UserLite = {
  id: string;
  username: string;
  isKeeper: boolean;
  isDisabled: boolean;
  lastSeenAt: number | null;
  /** §18: the character this account wears right now. */
  character?: string | null;
};

const REVEAL_SECONDS = 30;

export function UserRow({ user, isSelf }: { user: UserLite; isSelf: boolean }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [passwordState, setPassword] = useActionState<AdminState, FormData>(setPasswordAction, {});

  useEffect(() => {
    if (!revealed) return;
    setCountdown(REVEAL_SECONDS);
    const tick = setInterval(() => setCountdown((n) => n - 1), 1000);
    const hide = setTimeout(() => setRevealed(null), REVEAL_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(hide);
    };
  }, [revealed]);

  async function reveal() {
    setRevealError(null);
    const response = await fetch('/api/admin/reveal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    });
    const data = await response.json();
    if (data.password) setRevealed(data.password);
    else setRevealError(data.error ?? 'Dat wachtwoord kon niet worden gelezen.');
  }

  return (
    <li style={{ borderBottom: '1px solid var(--rule)', padding: '0.7rem 0' }}>
      <div className="row-wrap">
        <strong style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem' }}>{user.username}</strong>
        {user.isKeeper && <span className="chip">Keeper</span>}
        {user.character && (
          <span className="chip" title="Speelt nu als">
            <Icon name="mask" size={12} />
            {user.character}
          </span>
        )}
        {user.isDisabled && <span className="chip">Uitgeschakeld</span>}
        <span className="tiny muted">
          {user.lastSeenAt ? `gezien ${relativeTime(user.lastSeenAt)}` : 'nooit ingelogd'}
        </span>
      </div>

      <div className="row-wrap" style={{ marginTop: '0.4rem' }}>
        <button type="button" className="btn btn-small" onClick={reveal}>
          <Icon name="eye" size={14} />
          Wachtwoord tonen
        </button>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={() => setShowSetPassword((v) => !v)}
        >
          Nieuw wachtwoord instellen
        </button>
        <form action={toggleKeeperAction}>
          <input type="hidden" name="userId" value={user.id} />
          <button type="submit" className="btn btn-small btn-ghost">
            {user.isKeeper ? 'Als Keeper afzetten' : 'Tot Keeper maken'}
          </button>
        </form>
        {!isSelf && (
          <form action={toggleDisabledAction}>
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" className="btn btn-small btn-ghost">
              {user.isDisabled ? 'Inschakelen' : 'Uitschakelen'}
            </button>
          </form>
        )}
      </div>

      {revealed && (
        <p
          className="row"
          style={{
            marginTop: '0.5rem',
            background: 'var(--paper-dark)',
            border: '1px solid var(--rule)',
            padding: '0.4rem 0.6rem',
          }}
        >
          <code style={{ fontSize: '1.05rem', flex: 1 }}>{revealed}</code>
          <span className="tiny muted">verdwijnt over {Math.max(0, countdown)}s</span>
        </p>
      )}
      {revealError && <p className="error-note small">{revealError}</p>}

      {showSetPassword && (
        <form action={setPassword} className="row" style={{ marginTop: '0.5rem', maxWidth: 420 }}>
          <input type="hidden" name="userId" value={user.id} />
          <input
            className="input"
            name="password"
            type="text"
            placeholder="Nieuw wachtwoord (minstens 8 tekens)"
            autoComplete="off"
          />
          <button className="btn btn-small" type="submit">
            Instellen
          </button>
        </form>
      )}
      {passwordState.error && <p className="error-note small">{passwordState.error}</p>}
      {passwordState.ok && <p className="small">{passwordState.ok}</p>}
    </li>
  );
}
