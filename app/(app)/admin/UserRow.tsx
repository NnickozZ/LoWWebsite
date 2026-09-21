'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useActionState } from 'react';
import { Thumb } from '@/components/Cover';
import { EntryPicker } from '@/components/entry/EntryPicker';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { CharacterLite } from '@/lib/characters';
import { fill } from '@/lib/words';
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
  /**
   * §18c: every karakter tied to this account — the account's wardrobe, as the
   * account itself sees it (`listCharacters`, so a fiche in the prullenbak is
   * not in it). That is deliberately the player's view and not the Keeper's:
   * this list is what the person will find on their own Jij-pagina, and it is
   * the thing the Keeper is administering.
   */
  characters?: CharacterLite[];
};

/**
 * §18c: the Keeper's casting bench, one account at a time.
 *
 * Koppelen has always been able to name somebody else — `whose()` and
 * `addCharacter` both take a `userId` — and until now nothing in the archive
 * ever sent one, so the ability existed and no screen used it. With handing out
 * an onderzoeker made the Keeper's (and only a speler's own *first* one left to
 * them), it needs a place to happen, and this is it: the account list the
 * Keeper already opens to make somebody a Keeper or reset a password.
 *
 * The shapes are the wardrobe's on the Jij-pagina — `who-list`, `who-row`, the
 * same thumbnail — because it is the same thing seen from the other side, and
 * two different-looking lists of one person's onderzoekers would be two things
 * to learn instead of one.
 */
function AssignedCharacters({ user }: { user: UserLite }) {
  const router = useRouter();
  const ui = useUi();
  const words = ui.words;
  const [held, setHeld] = useState<CharacterLite[]>(user.characters ?? []);
  const [busy, setBusy] = useState(false);

  // The server is the truth: an untie here, a first koppeling the player made
  // themselves, a fiche binned — all arrive as new props through `refresh()`.
  const fingerprint = (user.characters ?? []).map((c) => c.entryId).join(',');
  useEffect(() => {
    setHeld(user.characters ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const call = useCallback(
    async (method: 'POST' | 'DELETE', entryId: string) => {
      setBusy(true);
      try {
        const response = await fetch('/api/characters', {
          method,
          headers: { 'content-type': 'application/json' },
          // The `userId` nothing ever sent. A Keeper may name anyone.
          body: JSON.stringify({ entryId, userId: user.id }),
        });
        const data = (await response.json()) as { characters?: CharacterLite[]; error?: string };
        if (!response.ok) {
          ui.toast(data.error ?? 'Dat lukte niet.');
          return false;
        }
        setHeld(data.characters ?? []);
        // Every feed on every page names people from who they are wearing.
        router.refresh();
        return true;
      } catch {
        ui.toast('Geen verbinding.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router, ui, user.id],
  );

  // A Keeper wears nobody, so there is nothing to hand them (`refuseKeeper`).
  if (user.isKeeper) return null;

  return (
    <div className="stack" style={{ gap: '0.4rem', marginTop: '0.6rem' }}>
      <span className="label">
        Toegewezen {words.characterPlural}
        {held.length > 0 && <span className="tiny muted"> — {held.length} toegewezen</span>}
      </span>

      {held.length > 0 && (
        <ul className="who-list" aria-label={`Toegewezen ${words.characterPlural} van ${user.username}`}>
          {held.map((character) => (
            <li key={character.entryId} className="who-row">
              <span className="row" style={{ flex: 1, minWidth: 0 }}>
                <Thumb
                  assetId={character.coverAssetId}
                  crop={character.coverCrop}
                  shape="portrait"
                  icon={character.typeIcon}
                  colour={character.typeColour}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{character.name}</strong>
                  {user.character === character.name && (
                    <span className="tiny muted" style={{ display: 'block' }}>
                      Speelt hier nu als
                    </span>
                  )}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={busy}
                onClick={() => {
                  void call('DELETE', character.entryId).then((ok) => {
                    if (ok) ui.toast(`${character.name} is losgekoppeld van ${user.username}.`);
                  });
                }}
                aria-label={`${character.name} ontkoppelen van ${user.username}`}
                title="Ontkoppelen"
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <EntryPicker
        value={null}
        placeholder={`Zoek de ${words.entry} van een ${words.character}…`}
        onPick={(entry) => {
          void call('POST', entry.id).then((ok) => {
            if (ok) ui.toast(`${entry.name} is toegewezen aan ${user.username}.`);
          });
        }}
        onClear={() => undefined}
      />
    </div>
  );
}

export function UserRow({ user, isSelf }: { user: UserLite; isSelf: boolean }) {
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [passwordState, setPassword] = useActionState<AdminState, FormData>(setPasswordAction, {});
  /*
   * §89: Keepers are equals. Nobody sets another Keeper's password or switches
   * them off — the server refuses it (`admin/actions.ts`), and this only stops
   * offering a button that would be refused. To take over a lost Keeper
   * account, demote it first (an audited act of its own), then reset it.
   *
   * There is no "Wachtwoord tonen" any more: a password is stored only as an
   * argon2id hash and cannot be read by anybody (§89, rule 4).
   */
  const otherKeeper = user.isKeeper && !isSelf;
  /*
   * §90: *Tot Keeper maken* asks first. It is not a removal (§69 lets those go
   * without a question and puts the undo in a toast); it is a secret that
   * leaks with one tap — the Keeperkant, every hidden sectie — and there is no
   * toast that takes back what somebody has already read. The same question
   * the archive asks everywhere else before an act (`ui.confirm`). Taking the
   * role *away* hides things again, so that stays one press.
   */
  const ui = useUi();
  const keeperForm = useRef<HTMLFormElement>(null);
  const keeperConfirmed = useRef(false);
  const onKeeperSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    if (user.isKeeper || keeperConfirmed.current) {
      keeperConfirmed.current = false;
      return;
    }
    event.preventDefault();
    const yes = await ui.confirm({
      title: fill(ui.words.keeperPromoteTitle, { naam: user.username, keeper: ui.words.keeper }),
      message: fill(ui.words.keeperPromoteMessage, {
        naam: user.username,
        keeperkant: ui.words.keeperSide,
      }),
      confirmLabel: fill(ui.words.keeperPromoteYes, { keeper: ui.words.keeper }),
    });
    if (!yes) return;
    keeperConfirmed.current = true;
    keeperForm.current?.requestSubmit();
  };

  return (
    <li
      // So a test — and a Keeper's own eye down a long list — can find one
      // account's row without counting.
      data-username={user.username}
      style={{ borderBottom: '1px solid var(--rule)', padding: '0.7rem 0' }}
    >
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
        {!otherKeeper && (
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => setShowSetPassword((v) => !v)}
          >
            Nieuw wachtwoord instellen
          </button>
        )}
        <form ref={keeperForm} action={toggleKeeperAction} onSubmit={(event) => void onKeeperSubmit(event)}>
          <input type="hidden" name="userId" value={user.id} />
          <button type="submit" className="btn btn-small btn-ghost">
            {user.isKeeper ? 'Als Keeper afzetten' : 'Tot Keeper maken'}
          </button>
        </form>
        {!isSelf && !otherKeeper && (
          <form action={toggleDisabledAction}>
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" className="btn btn-small btn-ghost">
              {user.isDisabled ? 'Inschakelen' : 'Uitschakelen'}
            </button>
          </form>
        )}
      </div>

      {/* §18c: who this account may play. Handing one out is the Keeper's, and
          this is where they do it. */}
      <AssignedCharacters user={user} />

      {showSetPassword && !otherKeeper && (
        <form action={setPassword} className="row-wrap" style={{ marginTop: '0.5rem', maxWidth: 420 }}>
          <input type="hidden" name="userId" value={user.id} />
          {/* §90: a real label, and the caret already in the box — a
              placeholder alone is gone the moment you start typing. */}
          <label className="label" htmlFor={`new-password-${user.id}`} style={{ flexBasis: '100%', margin: 0 }}>
            {fill(ui.words.adminNewPasswordFor, { naam: user.username })}
          </label>
          <input
            id={`new-password-${user.id}`}
            className="input"
            name="password"
            type="text"
            placeholder="Nieuw wachtwoord (minstens 8 tekens)"
            autoComplete="off"
            autoFocus
            style={{ flex: '1 1 12rem', width: 'auto' }}
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
