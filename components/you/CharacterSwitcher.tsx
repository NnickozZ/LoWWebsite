'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Thumb } from '@/components/Cover';
import { EntryPicker } from '@/components/entry/EntryPicker';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import type { CharacterLite } from '@/lib/characters';

/**
 * §18: who you are being.
 *
 * The same knot in two places. In the side menu it is a small line under the
 * masthead — "Je speelt als … ▾" — that opens a sheet to swap. On the Jij page
 * it is the whole wardrobe: tie a fiche on, take one off, pick which to wear.
 * On a phone the menu has no room for it, so the Jij tab is where it lives.
 *
 * A Keeper gets a stamp and no switch: they are always the Keeper.
 */

export type Me = {
  id: string;
  username: string;
  isKeeper: boolean;
  characters: CharacterLite[];
  activeId: string | null;
};

type State = { characters: CharacterLite[]; activeId: string | null };

function useWardrobe(me: Me) {
  const router = useRouter();
  const ui = useUi();
  const [state, setState] = useState<State>({ characters: me.characters, activeId: me.activeId });
  const [busy, setBusy] = useState(false);

  // The server is the truth: a change made elsewhere (the fiche's own button,
  // another tab, a Keeper) arrives here through `router.refresh()` as new props.
  const fingerprint = `${me.activeId ?? ''}|${me.characters.map((c) => c.entryId).join(',')}`;
  useEffect(() => {
    setState({ characters: me.characters, activeId: me.activeId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const call = useCallback(
    async (method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) => {
      setBusy(true);
      try {
        const response = await fetch('/api/characters', {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as State & { error?: string };
        if (!response.ok) {
          ui.toast(data.error ?? 'Dat lukte niet.');
          return null;
        }
        setState({ characters: data.characters, activeId: data.activeId });
        // Every name in every feed is resolved on the server from who is
        // active now, so the whole page re-reads.
        router.refresh();
        return data;
      } catch {
        ui.toast('Geen verbinding.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [router, ui],
  );

  return { state, busy, call };
}

function TypeMark({ character }: { character: CharacterLite }) {
  return (
    <Thumb
      assetId={character.coverAssetId}
      icon={character.typeIcon}
      colour={character.typeColour}
    />
  );
}

/** The line under the masthead, and the sheet it opens. */
export function CharacterSwitcher({ me }: { me: Me }) {
  const ui = useUi();
  const words = ui.words;
  const { state, busy, call } = useWardrobe(me);
  const [open, setOpen] = useState(false);
  const active = state.characters.find((c) => c.entryId === state.activeId) ?? null;

  if (me.isKeeper) {
    return (
      <div className="who" title={me.username}>
        <span className="who-eyebrow">{words.playsAs}</span>
        <span className="who-name">
          <Icon name="shield" size={14} />
          {words.keeper}
        </span>
      </div>
    );
  }

  return (
    <div className="who">
      <span className="who-eyebrow">{words.playsAs}</span>
      <button
        type="button"
        className="who-button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={`Account: ${me.username}`}
      >
        {active ? <TypeMark character={active} /> : <Icon name="you" size={18} />}
        <span className="who-name">{active?.name ?? me.username}</span>
        <Icon name="chevron" size={14} style={{ transform: 'rotate(90deg)', flex: '0 0 auto' }} />
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="who-title">
          <h2 id="who-title" style={{ marginTop: 0 }}>
            {words.playsAs}
          </h2>
          {state.characters.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>
              Je hebt nog geen {words.character} gekoppeld. Dat doe je op je eigen pagina, of met de
              knop &lsquo;{words.thisIsMyCharacter}&rsquo; op een {words.entry}.
            </p>
          ) : (
            <ul className="who-list" role="radiogroup" aria-label={words.playsAs}>
              {state.characters.map((character) => {
                const isActive = character.entryId === state.activeId;
                return (
                  <li key={character.entryId}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      className={`who-option${isActive ? ' who-option-active' : ''}`}
                      disabled={busy}
                      onClick={() => {
                        if (!isActive) void call('PATCH', { active: character.entryId });
                        setOpen(false);
                      }}
                    >
                      <TypeMark character={character} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong>{character.name}</strong>
                      </span>
                      {isActive && <Icon name="check" size={16} />}
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  role="radio"
                  aria-checked={state.activeId === null}
                  className={`who-option${state.activeId === null ? ' who-option-active' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    if (state.activeId !== null) void call('PATCH', { active: null });
                    setOpen(false);
                  }}
                >
                  <span className="feed-thumb" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="you" size={18} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{words.asYourself}</strong>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {me.username}
                    </span>
                  </span>
                  {state.activeId === null && <Icon name="check" size={16} />}
                </button>
              </li>
            </ul>
          )}
          <p style={{ margin: '0.9rem 0 0' }}>
            <Link className="btn btn-small" href="/you#karakters" onClick={() => setOpen(false)}>
              <Icon name="mask" size={15} />
              {words.characterPlural.charAt(0).toUpperCase() + words.characterPlural.slice(1)} beheren
            </Link>
          </p>
        </Sheet>
      )}
    </div>
  );
}

/** The wardrobe on the Jij page. */
export function CharacterWardrobe({ me }: { me: Me }) {
  const ui = useUi();
  const words = ui.words;
  const { state, busy, call } = useWardrobe(me);

  if (me.isKeeper) {
    return (
      <p className="small muted" style={{ margin: 0 }}>
        Als {words.keeper} ben je overal de {words.keeper}: er valt geen {words.character} te kiezen.
      </p>
    );
  }

  return (
    <div className="stack" style={{ gap: '0.7rem' }}>
      <p className="small muted" style={{ margin: 0 }}>
        Koppel de {words.entry} van je onderzoeker aan je account. Alles wat je in het archief doet
        draagt dan die naam — ook wat je eerder deed. Rechten horen bij je account, niet bij een{' '}
        {words.character}: wisselen verandert niets aan wat je mag zien.
      </p>

      {state.characters.length > 0 && (
        <ul className="who-list" aria-label={words.yourCharacters}>
          {state.characters.map((character) => {
            const isActive = character.entryId === state.activeId;
            return (
              <li key={character.entryId} className="who-row">
                <Link href={`/e/${character.slug}`} className="row" style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
                  <TypeMark character={character} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{character.name}</strong>
                    {isActive && (
                      <span className="tiny muted" style={{ display: 'block' }}>
                        Dit ben je nu
                      </span>
                    )}
                  </span>
                </Link>
                <button
                  type="button"
                  className={`chip chip-selectable${isActive ? ' chip-active' : ''}`}
                  aria-pressed={isActive}
                  disabled={busy || isActive}
                  onClick={() => void call('PATCH', { active: character.entryId })}
                >
                  {isActive && <Icon name="check" size={12} />}
                  {isActive ? 'Actief' : 'Speel als'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={busy}
                  onClick={() => void call('DELETE', { entryId: character.entryId })}
                  aria-label={`${character.name} ontkoppelen`}
                  title="Ontkoppelen"
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {state.characters.length > 0 && (
        <div className="row-wrap">
          <button
            type="button"
            className={`chip chip-selectable${state.activeId === null ? ' chip-active' : ''}`}
            aria-pressed={state.activeId === null}
            disabled={busy || state.activeId === null}
            onClick={() => void call('PATCH', { active: null })}
          >
            {state.activeId === null && <Icon name="check" size={12} />}
            {words.asYourself} ({me.username})
          </button>
        </div>
      )}

      <div>
        <span className="label">
          {words.character.charAt(0).toUpperCase() + words.character.slice(1)} koppelen
        </span>
        <EntryPicker
          value={null}
          placeholder={`Zoek de ${words.entry} van je ${words.character}…`}
          onPick={(entry) => {
            void call('POST', { entryId: entry.id }).then((next) => {
              if (next) ui.toast(`${entry.name} is nu een van je ${words.characterPlural}.`);
            });
          }}
          onClear={() => undefined}
        />
      </div>
    </div>
  );
}
