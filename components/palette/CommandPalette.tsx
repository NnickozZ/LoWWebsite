'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Icon } from '@/components/Icon';
import { FLIP_EVENT } from '@/components/keeper/SideToggle';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { useAuthorOptional } from '@/components/you/AuthorProvider';
import { usePlayAs, type Me } from '@/components/you/CharacterSwitcher';
import type { Purse } from '@/components/shell/JouwPlek';
import { KIND_ICON, KIND_WORD } from '@/lib/keeper/kinds';
import { filterActions, paletteActions, paletteMode, type PaletteAction } from '@/lib/palette/actions';
import { readRecent, rememberRecent, recentPath } from '@/lib/palette/recent';
import { capitalise, fill } from '@/lib/words';
import { MAKE_EVENT } from './useMakeOnArrival';

/**
 * §100: het palet — zoeken, onlangs en handelingen, zonder de pagina te
 * verlaten.
 *
 * Nick, ronde 52: *"je moet te veel knopjes klikken."* De review (S3, en het
 * zijbalkvoorstel "later: een echt palet") zag waarom zoeken er één van was:
 * het vak in de zijbalk ging naar `/search`, dus wie op een canvas iets wilde
 * opzoeken, stond daarna op een andere pagina — en op een telefoon was er geen
 * vak. Dit is het antwoord van Notion, Linear en GitHub: één venster, op elke
 * pagina, met `/` en Ctrl/⌘K.
 *
 * - **Typen** zoekt wat Zoeken zoekt, langs dezelfde weg: `/api/search`, dus
 *   `searchEntries` en `searchOthers` met hun zichtbaarheid en kant (§5, §46).
 * - **Leeg** staat er *Onlangs* (adressen uit deze browser, namen van de
 *   server, `resolveRecent`) en *Handelingen*.
 * - **`>`** laat alleen de handelingen zien (`paletteActions`).
 *
 * Het is een `Sheet`, dus Escape, de achtergrond, de stapel en de focus terug
 * naar waar je was komen van daar. Het vak is een ARIA-combobox met een
 * listbox; de pijltjes lopen door de opties, Enter kiest.
 */

type EntryHit = { id: string; slug: string; name: string; typeIcon: string; typeLabel: string; caseName?: string | null };
type OtherHit = { kind: string; id: string; name: string; href: string; caseName?: string | null };
type RecentHit = { kind: string; href: string; name: string; icon: string; hint?: string | null };

type Option = {
  id: string;
  label: string;
  hint?: string | null;
  icon: string;
  choose: () => void;
};
type Group = { key: string; label: string; options: Option[]; empty?: string };

const DEBOUNCE_MS = 160;

export function CommandPalette({
  me,
  purse,
  myPage,
  initialQuery,
  onClose,
}: {
  me: Me;
  purse: Purse;
  myPage: string | null;
  initialQuery: string;
  onClose: () => void;
}) {
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  const pathname = usePathname();
  const author = useAuthorOptional();
  const wardrobe = usePlayAs(me);
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const [answer, setAnswer] = useState<{ q: string; entries: EntryHit[]; others: OtherHit[] } | null>(null);
  const [recent, setRecent] = useState<RecentHit[] | null>(null);
  const listId = useId();
  const inputId = useId();

  const mode = paletteMode(query);
  const text = mode.text;

  /* ----------------------------------------------------------- Onlangs */
  useEffect(() => {
    const paths = readRecent(me.id).filter((path) => path !== recentPath(pathname));
    if (!paths.length) {
      setRecent([]);
      return;
    }
    let live = true;
    const params = new URLSearchParams();
    for (const path of paths) params.append('r', path);
    fetch(`/api/search?${params.toString()}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { recent: [] }))
      .then((data: { recent?: RecentHit[] }) => {
        if (live) setRecent(data.recent ?? []);
      })
      .catch(() => {
        if (live) setRecent([]);
      });
    return () => {
      live = false;
    };
    // Once, when the palet opens: what you opened since is not on this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ zoeken */
  useEffect(() => {
    if (mode.actionsOnly || !text) return;
    let live = true;
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(text)}`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : { names: [], bodies: [], others: [] }))
        .then((data: { names?: EntryHit[]; bodies?: EntryHit[]; others?: OtherHit[] }) => {
          if (!live) return;
          const seen = new Set<string>();
          const entries = [...(data.names ?? []), ...(data.bodies ?? [])].filter((hit) => {
            if (seen.has(hit.id)) return false;
            seen.add(hit.id);
            return true;
          });
          setAnswer({ q: text, entries, others: data.others ?? [] });
        })
        .catch(() => {
          if (live) setAnswer({ q: text, entries: [], others: [] });
        });
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, mode.actionsOnly]);

  /* ------------------------------------------------------ handelingen */
  const actions = useMemo(
    () =>
      paletteActions({
        words,
        keeperHere: ui.isKeeper,
        mayType: author ? author.mayType : true,
        purse: purse ? { slug: purse.slug, roomId: purse.roomId } : null,
        myPage,
        characters: me.isKeeper ? [] : wardrobe.characters,
        activeId: wardrobe.activeId,
        side: ui.side,
        caseHereName: ui.caseHere?.name ?? null,
      }),
    [words, ui.isKeeper, ui.side, ui.caseHere, author, purse, myPage, me.isKeeper, wardrobe.characters, wardrobe.activeId],
  );

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const run = (action: PaletteAction) => {
    onClose();
    const how = action.run;
    switch (how.kind) {
      case 'href':
        router.push(how.href);
        return;
      case 'new-entry':
        // §48: in a dossier, *in* it — as the `+` and `n` do.
        ui.openNewEntry(ui.caseHere ? { caseId: ui.caseHere.id } : undefined);
        return;
      case 'new-case':
        ui.openNewCase();
        return;
      case 'make': {
        // The list's own button opens its own sheet (`useMakeOnArrival`).
        const path = how.href.split('?')[0];
        if (pathname === path) window.dispatchEvent(new Event(MAKE_EVENT));
        else router.push(how.href);
        return;
      }
      case 'flip':
        // §46/§57: the toggle in the corner flips, through `/api/keeper/flip`.
        window.dispatchEvent(new Event(FLIP_EVENT));
        return;
      case 'play':
        wardrobe.playAs(how.characterId);
        return;
    }
  };

  const actionOption = (action: PaletteAction): Option => ({
    id: `act-${action.key}`,
    label: action.label,
    icon: action.icon,
    choose: () => run(action),
  });

  /* ----------------------------------------------------------- groepen */
  const groups: Group[] = [];
  if (mode.actionsOnly) {
    // §102, golf h1 (D25): `>zzqx` drew the head *Handelingen* over nothing. With
    // no handeling that fits, the group loses its head and says so instead.
    const fitting = filterActions(actions, text);
    groups.push({
      key: 'actions',
      label: fitting.length ? words.paletteActions : '',
      options: fitting.map(actionOption),
      empty: fill(words.paletteNoActionFor, { zoek: text }),
    });
  } else if (!text) {
    groups.push({
      key: 'recent',
      label: words.paletteRecent,
      options: (recent ?? []).map((hit) => ({
        id: `recent-${hit.href}`,
        label: hit.name,
        hint: hit.hint ?? (hit.kind in KIND_WORD ? capitalise(words[KIND_WORD[hit.kind as keyof typeof KIND_WORD]]) : null),
        icon: hit.icon,
        choose: () => go(hit.href),
      })),
      empty: recent === null ? words.paletteSearching : words.paletteRecentNone,
    });
    groups.push({ key: 'actions', label: words.paletteActions, options: actions.map(actionOption) });
  } else {
    const fresh = answer && answer.q === text ? answer : null;
    const entries = (fresh?.entries ?? []).slice(0, 8);
    const others = (fresh?.others ?? []).slice(0, 6);
    const fitting = filterActions(actions, text).slice(0, 4);
    /*
     * Ronde 65·herstel (review #27): a group with nothing in it is not drawn.
     * *Artikelen — Niets in het archief heet zo* stood above a handeling that
     * did fit, and read as if the palet had found nothing. The artikelen stay
     * while the answer is on its way (*Zoeken…*); once it is here they show
     * only with hits — and "niets" is said once, when every group is empty,
     * without a heading over it.
     */
    const nothing = Boolean(fresh) && !entries.length && !others.length && !fitting.length;
    if (!fresh || entries.length || nothing) {
      groups.push({
        key: 'entries',
        label: nothing ? '' : capitalise(words.entryPlural),
        options: entries.map((hit) => ({
          id: `entry-${hit.id}`,
          label: hit.name,
          hint: hit.caseName ? `${hit.typeLabel} · ${hit.caseName}` : hit.typeLabel,
          icon: hit.typeIcon || KIND_ICON.entry,
          choose: () => go(`/e/${hit.slug}`),
        })),
        // §102, golf h1 (D25): the sentence names what was typed and what Enter does
        // now — the one option left is *Zoek … in het hele archief*.
        empty: fresh ? fill(words.paletteNothingFor, { zoek: text }) : words.paletteSearching,
      });
    }
    if (others.length) {
      groups.push({
        key: 'others',
        label: words.searchOthers,
        options: others.map((hit) => ({
          id: `other-${hit.kind}-${hit.id}`,
          label: hit.name,
          hint:
            hit.kind === 'speler'
              ? capitalise(words.player)
              : [capitalise(words[KIND_WORD[hit.kind as keyof typeof KIND_WORD]]), hit.caseName].filter(Boolean).join(' · '),
          icon: hit.kind === 'speler' ? 'badge' : KIND_ICON[hit.kind as keyof typeof KIND_ICON] ?? 'file',
          choose: () => go(hit.href),
        })),
      });
    }
    if (fitting.length) groups.push({ key: 'actions', label: words.paletteActions, options: fitting.map(actionOption) });
    groups.push({
      key: 'all',
      label: '',
      options: [
        {
          id: 'search-all',
          label: fill(words.paletteSearchAll, { q: text }),
          icon: 'search',
          choose: () => go(`/search?q=${encodeURIComponent(text)}`),
        },
      ],
    });
  }

  const flat = groups.flatMap((group) => group.options);
  const current = flat.length ? Math.min(active, flat.length - 1) : -1;
  const currentId = current >= 0 ? optionDomId(listId, flat[current].id) : undefined;

  // A new query starts at the top again.
  useEffect(() => setActive(0), [query]);

  // The chosen option stays in sight while the arrows walk.
  useEffect(() => {
    if (!currentId) return;
    const node = document.getElementById(currentId);
    node?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);

  /* ------------------------------------------ boven het toetsenbord */
  useEffect(() => {
    const view = window.visualViewport;
    const root = document.documentElement;
    if (!view) return;
    const fit = () => {
      root.style.setProperty('--palette-vh', `${Math.round(view.height)}px`);
      root.style.setProperty('--palette-top', `${Math.round(view.offsetTop)}px`);
    };
    fit();
    view.addEventListener('resize', fit);
    view.addEventListener('scroll', fit);
    return () => {
      view.removeEventListener('resize', fit);
      view.removeEventListener('scroll', fit);
      root.style.removeProperty('--palette-vh');
      root.style.removeProperty('--palette-top');
    };
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (flat.length) setActive((current < 0 ? -1 : current) + 1 >= flat.length ? 0 : current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (flat.length) setActive(current <= 0 ? flat.length - 1 : current - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (current >= 0) flat[current].choose();
    }
  };

  let index = -1;
  return (
    // §102: het palet is een toetsenbordding — het opent zonder beweging en sluit ook zo.
    <Sheet onClose={onClose} labelledBy={`${inputId}-title`} className="palette-backdrop" exit={false}>
      <div className="palette" data-testid="palette">
        <h2 id={`${inputId}-title`} className="visually-hidden">
          {words.paletteTitle}
        </h2>
        <div className="palette-field">
          <Icon name="search" size={18} />
          <input
            id={inputId}
            className="palette-input"
            data-testid="palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={currentId}
            aria-label={words.searchBox}
            placeholder={words.searchBoxHint}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="palette-list" id={listId} role="listbox" aria-label={words.paletteTitle}>
          {groups.map((group) => {
            const headId = `${listId}-${group.key}`;
            return (
              <div
                key={group.key}
                role="group"
                aria-labelledby={group.label ? headId : undefined}
                className="palette-group"
                data-group={group.key}
              >
                {group.label && (
                  <div id={headId} className="palette-head" role="presentation">
                    {group.label}
                  </div>
                )}
                {group.options.map((option) => {
                  index += 1;
                  const mine = index;
                  const selected = mine === current;
                  return (
                    <div
                      key={option.id}
                      id={optionDomId(listId, option.id)}
                      role="option"
                      aria-selected={selected}
                      className={`palette-option${selected ? ' palette-option-active' : ''}`}
                      data-testid="palette-option"
                      data-option={option.id}
                      // Keep the caret in the box: a press on an option chooses, it does not focus.
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => {
                        if (!selected) setActive(mine);
                      }}
                      onClick={() => option.choose()}
                    >
                      <Icon name={option.icon} size={16} />
                      <span className="palette-label">{option.label}</span>
                      {option.hint && <span className="palette-hint tiny muted">{option.hint}</span>}
                    </div>
                  );
                })}
                {!group.options.length && group.empty && (
                  <p className="palette-empty tiny muted" role="presentation">
                    {group.empty}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="palette-keys tiny muted" aria-hidden="true">
          {words.paletteKeys}
        </p>
      </div>
    </Sheet>
  );
}

function optionDomId(listId: string, optionId: string) {
  return `${listId}-o-${optionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/**
 * §100: *Onlangs* onthouden — elk ding dat je opent, op het adres waar het
 * staat. Eén keer gemount in de schil; alleen adressen, per account.
 */
export function useRememberRecent(userId: string) {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname && recentPath(pathname)) rememberRecent(userId, pathname);
  }, [pathname, userId]);
}
