'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { AccessMode, AccessTargetType } from '@/lib/db/schema';

/**
 * §17: the owner's two dials, drawn the same way on a fiche, a dossier and a
 * prikbord so that once you have set one you have set them all.
 *
 *   Kijken     Iedereen · Gekozen personen · Privé
 *   Bewerken   Iedereen · Gekozen personen · Privé
 *
 * "Gekozen personen" opens a row of tickable names — accounts, never
 * characters, because rights are per account. Keepers are shown but greyed:
 * they see and edit everything, and a tick that changes nothing is a lie. The
 * owner is not in the list at all; the owner always may.
 *
 * A Keeper gets one more thing: the bolt. With it set, the owner sees the dials
 * but cannot turn them, and is told why in one line.
 */

export type AccessSettings = {
  ownerId: string | null;
  viewMode: AccessMode;
  editMode: AccessMode;
  locked: boolean;
  viewers: string[];
  editors: string[];
};

export type GrantableUser = {
  id: string;
  username: string;
  isKeeper: boolean;
  /** The character they are wearing, for recognising "who is Bram again". */
  character: string | null;
};

const MODE_LABELS: Record<AccessMode, string> = {
  all: 'Iedereen',
  some: 'Gekozen personen',
  private: 'Privé',
};

export function accessLabel(mode: AccessMode, count = 0): string {
  if (mode === 'some') return count === 1 ? '1 persoon' : `${count} personen`;
  return MODE_LABELS[mode];
}

export function AccessEditor({
  target,
  id,
  initial,
  canManage,
  isKeeper,
  viewerId,
  onChange,
  nouns,
}: {
  target: AccessTargetType;
  id: string;
  initial: AccessSettings;
  /** Owner (unbolted) or Keeper. Everyone else sees nothing but the summary. */
  canManage: boolean;
  isKeeper: boolean;
  viewerId: string;
  onChange?: (settings: AccessSettings) => void;
  /** "deze fiche" / "dit dossier" / "dit prikbord" — for the sentences. */
  nouns: { this: string };
}) {
  const ui = useUi();
  const [settings, setSettings] = useState<AccessSettings>(initial);
  const [users, setUsers] = useState<GrantableUser[] | null>(null);
  const [busy, setBusy] = useState(false);

  const needsPeople = settings.viewMode === 'some' || settings.editMode === 'some';

  useEffect(() => {
    if (!needsPeople || users || !canManage) return;
    let cancelled = false;
    void fetch(`/api/access?target=${target}&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.users) setUsers(data.users as GrantableUser[]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [needsPeople, users, canManage, target, id]);

  async function patch(next: Partial<AccessSettings>) {
    if (!canManage) return;
    const optimistic = { ...settings, ...next };
    setSettings(optimistic);
    onChange?.(optimistic);
    setBusy(true);
    try {
      const response = await fetch(`/api/access?target=${target}&id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await response.json();
      if (!response.ok) {
        ui.toast(data.error ?? 'De rechten zijn niet opgeslagen.');
        setSettings(settings);
        onChange?.(settings);
        return;
      }
      setSettings(data.settings);
      onChange?.(data.settings);
    } catch {
      ui.toast('Geen verbinding met het archief.');
      setSettings(settings);
      onChange?.(settings);
    } finally {
      setBusy(false);
    }
  }

  const lockedForMe = settings.locked && !isKeeper;
  const readOnly = !canManage || lockedForMe;

  function dial({
    label,
    value,
    listKey,
    hint,
  }: {
    label: string;
    value: AccessMode;
    listKey: 'viewers' | 'editors';
    hint: string;
  }) {
    const chosen = new Set(settings[listKey]);
    const modeKey = listKey === 'viewers' ? 'viewMode' : 'editMode';
    return (
      <div>
        <span className="label">{label}</span>
        <div className="row-wrap" role="radiogroup" aria-label={label}>
          {(['all', 'some', 'private'] as AccessMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={value === mode}
              disabled={readOnly || busy}
              className={`chip chip-selectable${value === mode ? ' chip-active' : ''}`}
              onClick={() => value !== mode && void patch({ [modeKey]: mode })}
            >
              {mode === 'private' && <Icon name="lock" size={12} />}
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
        <p className="tiny muted" style={{ margin: '0.25rem 0 0' }}>
          {hint}
        </p>

        {value === 'some' && (
          <div className="access-people">
            {!users ? (
              <p className="tiny muted" style={{ margin: 0 }}>
                {canManage ? 'Namen laden…' : `${chosen.size} gekozen`}
              </p>
            ) : (
              <div className="row-wrap">
                {users
                  .filter((user) => user.id !== settings.ownerId)
                  .map((user) => {
                    const on = chosen.has(user.id) || user.isKeeper;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={readOnly || busy || user.isKeeper}
                        title={
                          user.isKeeper
                            ? 'Keepers zien en bewerken altijd alles.'
                            : user.character
                              ? `${user.username} speelt ${user.character}`
                              : user.username
                        }
                        className={`chip chip-selectable${on ? ' chip-active' : ''}${
                          user.isKeeper ? ' chip-muted' : ''
                        }`}
                        onClick={() => {
                          const next = new Set(chosen);
                          if (next.has(user.id)) next.delete(user.id);
                          else next.add(user.id);
                          void patch({ [listKey]: [...next] });
                        }}
                      >
                        {on && !user.isKeeper && <Icon name="check" size={12} />}
                        {user.username}
                        {user.character && <span className="muted">{user.character}</span>}
                      </button>
                    );
                  })}
                {users.filter((u) => u.id !== settings.ownerId && !u.isKeeper).length === 0 && (
                  <p className="tiny muted" style={{ margin: 0 }}>
                    Er is nog niemand anders om te kiezen.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack access-editor">
      {lockedForMe && (
        <p className="small" style={{ margin: 0 }}>
          <Icon name="shield" size={13} /> De Keeper heeft de rechten van {nouns.this} vastgezet.
          Je kunt ze zien, niet veranderen.
        </p>
      )}
      {!canManage && !lockedForMe && (
        <p className="tiny muted" style={{ margin: 0 }}>
          Alleen de eigenaar van {nouns.this} of een Keeper kan dit aanpassen.
        </p>
      )}

      {dial({
        label: 'Wie mag kijken',
        value: settings.viewMode,
        listKey: 'viewers',
        hint:
          settings.viewMode === 'private'
            ? `Alleen jij en de Keepers zien ${nouns.this}.`
            : settings.viewMode === 'some'
              ? `Alleen de gekozen personen, jij en de Keepers zien ${nouns.this}.`
              : `Iedereen die ingelogd is kan ${nouns.this} zien — mits de Keeper het niet verborgen houdt.`,
      })}
      {dial({
        label: 'Wie mag bewerken',
        value: settings.editMode,
        listKey: 'editors',
        hint:
          settings.editMode === 'private'
            ? 'Alleen jij en de Keepers. Anderen kunnen een wijziging voorstellen.'
            : settings.editMode === 'some'
              ? 'De gekozen personen, jij en de Keepers. Anderen kunnen een wijziging voorstellen.'
              : 'Iedereen die het mag zien, mag het ook veranderen.',
      })}

      {isKeeper && (
        <div>
          <span className="label">Keeper</span>
          <button
            type="button"
            className={`chip chip-selectable${settings.locked ? ' chip-active' : ''}`}
            aria-pressed={settings.locked}
            disabled={busy}
            onClick={() => void patch({ locked: !settings.locked })}
          >
            <Icon name="shield" size={12} />
            {settings.locked ? 'Vastgezet — de eigenaar kan dit niet meer veranderen' : 'Rechten vastzetten'}
          </button>
          <p className="tiny muted" style={{ margin: '0.25rem 0 0' }}>
            Voor iets dat altijd het hele kamp moet dienen: de eigenaar houdt {nouns.this}, maar de
            rechten zijn van jou.
          </p>
        </div>
      )}
      {viewerId === settings.ownerId && !isKeeper && (
        <p className="tiny muted" style={{ margin: 0 }}>
          Jij bent de eigenaar. Rechten gelden per account, niet per karakter.
        </p>
      )}
    </div>
  );
}
