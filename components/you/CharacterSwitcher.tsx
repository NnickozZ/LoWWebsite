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
import { useAuthorOptional } from './AuthorProvider';

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
  /**
   * §44: is this account a Keeper *really* — before "kijk als speler" was taken
   * into account — and is the preview on right now. The only things that may
   * read either are the banner that offers to take the preview off again and
   * the control in the menu that puts it on; everything else in the archive
   * reads `isKeeper`, which is false while the preview is on.
   */
  isRealKeeper?: boolean;
  asPlayer?: boolean;
  /**
   * §46: which side of the archive this browser is standing on. Read by the
   * shell — the toggle in the corner and the stamp under the masthead — and by
   * nothing else: it is a face, never a right.
   */
  side?: 'keeper' | 'player';
};

type State = { characters: CharacterLite[]; activeId: string | null };

function useWardrobe(me: Me) {
  const router = useRouter();
  const ui = useUi();
  const author = useAuthorOptional();
  const followPlay = author?.followPlay;
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
        // §91: één wie-regel — a wissel of *speelt als* takes this window's
        // *schrijft als* along. Only a wissel: tying one on (POST) says who
        // you hold, and the archive answers with who you play either way.
        if (method === 'PATCH' && 'active' in body) followPlay?.(data.activeId);
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
    [router, ui, followPlay],
  );

  return { state, busy, call };
}

function TypeMark({ character }: { character: CharacterLite }) {
  return (
    <Thumb
      assetId={character.coverAssetId}
      crop={character.coverCrop}
      shape="portrait"
      icon={character.typeIcon}
      colour={character.typeColour}
    />
  );
}

/**
 * §91: the list of who you can be, as radios — the sheet in the side menu and
 * the Jij-blad on a phone draw the same one, and both press the same
 * `/api/characters` PATCH through `useWardrobe` (§5: one wissel, one road).
 */
function WhoOptions({
  me,
  state,
  busy,
  call,
  onDone,
}: {
  me: Me;
  state: State;
  busy: boolean;
  call: ReturnType<typeof useWardrobe>['call'];
  onDone: () => void;
}) {
  const words = useUi().words;
  if (state.characters.length === 0) {
    /* §18c: this is the zero-held case — the one case where the road is
       still the player's own. So it still points at it, and names the
       Keeper for everything after. */
    return (
      <p className="small muted" style={{ margin: 0 }}>
        Je hebt nog geen {words.character} gekoppeld. Je eerste maak je zelf: met de knop
        &lsquo;{words.thisIsMyCharacter}&rsquo; op een {words.entry}, of op je eigen pagina.
        Daarna koppelt de {words.keeper} ze aan je account.
      </p>
    );
  }
  return (
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
                onDone();
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
            onDone();
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
  );
}

/**
 * §91: the head of the Jij-blad on a phone — portrait, name, and *Speel als ▾*
 * folding the same list open in place. In place and not as a second sheet:
 * the blad is a sheet already, and a sheet on a sheet is what §18b spent a
 * round getting rid of.
 */
export function JijWho({ me, onPicked }: { me: Me; onPicked?: () => void }) {
  const ui = useUi();
  const words = ui.words;
  const { state, busy, call } = useWardrobe(me);
  const [open, setOpen] = useState(false);
  const active = state.characters.find((c) => c.entryId === state.activeId) ?? null;

  if (me.isKeeper) {
    return (
      <div className="jij-who" title={me.username}>
        <span className="jij-who-name">
          <Icon name="shield" size={18} />
          {words.keeper}
        </span>
      </div>
    );
  }

  return (
    <div className="jij-who">
      <div className="jij-who-row">
        {active ? <TypeMark character={active} /> : <Icon name="you" size={20} />}
        <span className="jij-who-name">{active?.name ?? me.username}</span>
        {state.characters.length > 0 && (
          <button
            type="button"
            className="btn btn-small jij-who-switch"
            aria-expanded={open}
            aria-controls="jij-who-options"
            onClick={() => setOpen((was) => !was)}
            data-testid="jij-switch"
          >
            {words.switchPlay}
            <Icon name="chevron" size={14} style={{ transform: open ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
          </button>
        )}
      </div>
      {open && (
        <div id="jij-who-options" className="jij-who-options">
          <WhoOptions
            me={me}
            state={state}
            busy={busy}
            call={call}
            onDone={() => {
              setOpen(false);
              onPicked?.();
            }}
          />
        </div>
      )}
    </div>
  );
}

/** The line under the masthead, and the sheet it opens. */
export function CharacterSwitcher({ me }: { me: Me }) {
  const ui = useUi();
  const words = ui.words;
  const { state, busy, call } = useWardrobe(me);
  const [open, setOpen] = useState(false);
  const active = state.characters.find((c) => c.entryId === state.activeId) ?? null;

  /*
   * §91: één wie-regel. The eyebrow "Je speelt als" is still there for a
   * screen reader and for the specs that read `.who`, but not on the screen:
   * the portrait and the name *are* the line, and every pixel of the side
   * menu is wanted for the places under it.
   */
  if (me.isKeeper) {
    return (
      <div className="who" title={me.username}>
        <span className="who-eyebrow visually-hidden">{words.playsAs}</span>
        <span className="who-name">
          <Icon name="shield" size={14} />
          {words.keeper}
        </span>
      </div>
    );
  }

  return (
    <div className="who">
      <span className="who-eyebrow visually-hidden">{words.playsAs}</span>
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
          <WhoOptions me={me} state={state} busy={busy} call={call} onDone={() => setOpen(false)} />
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
      {/* §18c: what this page is for, and what it is not. Wearing one of the
          karakters you hold is your own choice; koppelen is the Keeper's. The
          one exception is the first one, and the paragraph says so only while
          it is true — a speler holding nobody. */}
      {state.characters.length === 0 ? (
        /* "artikel" is een het-woord, dus "het" en "dat" — dit stond er twee
           keer fout ("maak de …", "op die …") en het is de eerste alinea die
           een nieuwe speler op de Jij-pagina leest. De rest van het archief
           schrijft het goed ("Het {words.entry} komt in de wiki", "Op dat
           {words.entry} komt dan"), dus dit week als enige af. */
        <p className="small muted" style={{ margin: 0 }}>
          Je hebt nog geen {words.character}. Je eerste koppel je zelf: maak het {words.entry} van je
          onderzoeker en zoek hem hieronder op, of gebruik de knop &lsquo;
          {words.thisIsMyCharacter}&rsquo; op dat {words.entry}. Daarna geeft de {words.keeper} je
          {' '}
          {words.characterPlural} uit.
        </p>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          Hier kies je wie je bent. Alles wat je in het archief doet draagt die naam — ook wat je
          eerder deed. Welke {words.characterPlural} aan je account hangen bepaalt de{' '}
          {words.keeper}; welke daarvan je draagt, bepaal je zelf. Rechten horen bij je account,
          niet bij een {words.character}: wisselen verandert niets aan wat je mag zien.
        </p>
      )}

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
                {/* §18c: no ✕ here. Ontkoppelen is the Keeper's — a player
                    who could untie their last one would be back at "holds
                    nobody", which is the one state that opens the road above,
                    so it would never close. Not being anyone for a while is
                    "Als jezelf", which is right below and stays theirs. */}
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

      {/* §18c: the box is here only while there is nobody on the peg. That
          first one is the speler's own — an onderzoeker *is* an artikel
          somebody tied on, so refusing it too would leave every new arrival
          waiting on the Keeper for their own beginning. With one tied on the
          box goes, and the Keeper hands out the rest from Beheer. */}
      {state.characters.length === 0 && (
        <div>
          <span className="label">
            Je eerste {words.character} koppelen
          </span>
          <EntryPicker
            value={null}
            // §90: "het artikel" — the paragraph above already fixed this once.
            placeholder={`Zoek het ${words.entry} van je ${words.character}…`}
            onPick={(entry) => {
              void call('POST', { entryId: entry.id }).then((next) => {
                if (next) ui.toast(`${entry.name} is nu een van je ${words.characterPlural}.`);
              });
            }}
            onClear={() => undefined}
          />
        </div>
      )}
    </div>
  );
}
