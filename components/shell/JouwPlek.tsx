'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Icon } from '@/components/Icon';
import { Beurs } from '@/components/kamer/Beurs';
import { MEANING } from '@/components/kamer/plekWords';
import { FLIP_EVENT } from '@/components/keeper/SideToggle';
import { useLiveBaseOptional } from '@/components/live/LiveProvider';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { JijWho, type Me } from '@/components/you/CharacterSwitcher';
import { WritingAsLine } from '@/components/you/AuthorProvider';
import { capitalise, fill, type Words } from '@/lib/words';

/**
 * §91: jouw plek — kamer, winkel, je eigen spelerspagina en de hal.
 *
 * Nick, ronde 52: *"Je moet te veel knopjes klikken. Misschien moet er iets in
 * de sidebar komen?"* De review van die dag vond de oorzaak: niet het aantal
 * knoppen per scherm, maar dat de speler **geen vaste plek** had. Kamer,
 * winkel, spelerspagina en de hal stonden in geen enkel menu; de enige deur
 * was een saldo-pil van 89 × 22 px die op een canvas, de kamer en de winkel
 * verdween.
 *
 * Eén lijst, twee tekeningen, en dat is met opzet (Discord draaide in 2024
 * een indeling terug die per toestel verschilde):
 *
 *   - op een computer een groep in de zijbalk (`YoursGroup`), met het saldo
 *     rechts naast *Kamer*;
 *   - op een telefoon het Jij-blad (`JijSheet`), dat de Jij-tab opent in plaats
 *     van naar `/you` te gaan, met het saldo op de tab zelf (`JijTab`).
 *
 * Het saldo komt van boven (`purseOf` in de layout) en wordt live gehouden
 * door `useShellBeurs` in `AppShell` — één luisteraar voor beide tekeningen
 * (§5: één weg). Hier wordt het alleen getekend.
 *
 * §44: de Keeper-groep wordt voor een speler niet gerenderd — afwezig, niet
 * verborgen. `me.isKeeper` is op de server bepaald en is onwaar zolang een
 * Keeper door de ogen van een speler kijkt.
 */

export type Purse = { roomId: string; balance: number; slug: string; name: string } | null;

type Door = {
  key: string;
  href: string;
  icon: string;
  label: string;
  /** What stands right-aligned after the word: the saldo, or "2 online". */
  tail?: 'saldo' | 'online';
  testId: string;
};

function isHere(pathname: string, href: string) {
  const path = href.split('?')[0];
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * The doors of *jouw plek*, in the order both drawings use. Without a karakter
 * that is only the hal — there is no kamer, no winkel of your own, and the
 * door that matters is the one to *choose* a karakter, which the callers draw
 * separately. A Keeper wears nobody (§18) but does have a spelerspagina (§81).
 */
export function yoursDoors(input: {
  words: Words;
  purse: Purse;
  myPage: string | null;
  isKeeper: boolean;
}): Door[] {
  const { words, purse, myPage, isKeeper } = input;
  const doors: Door[] = [];
  if (purse) {
    doors.push({
      key: 'kamer',
      href: `/kamer/${purse.slug}`,
      icon: MEANING.kamer,
      label: capitalise(words.room),
      tail: 'saldo',
      testId: 'yours-kamer',
    });
    doors.push({
      key: 'winkel',
      // §90 (E2): the winkel of the karakter you play — the same kamer as the beurs.
      href: `/winkel?kamer=${encodeURIComponent(purse.roomId)}`,
      icon: MEANING.winkel,
      label: capitalise(words.shop),
      testId: 'yours-winkel',
    });
  }
  if (myPage && (purse || isKeeper)) {
    doors.push({
      key: 'mine',
      href: myPage,
      icon: 'person',
      label: fill(words.navMyPage, { spelerspagina: words.spelerPage.toLowerCase() }),
      testId: 'yours-mine',
    });
  }
  doors.push({
    key: 'spelers',
    href: '/spelers',
    icon: 'badge',
    label: capitalise(words.playerPlural),
    tail: 'online',
    testId: 'yours-spelers',
  });
  return doors;
}

/** How many other people the roster says are in the archive — the word the hal uses too. */
function useOnline(): number {
  const live = useLiveBaseOptional();
  return live ? live.roster.rows.filter((row) => !row.self).length : 0;
}

function Tail({ door, purse, online, words }: { door: Door; purse: Purse; online: number; words: Words }) {
  if (door.tail === 'saldo' && purse) {
    return (
      <span className="nav-tail" data-testid="yours-saldo" data-balance={purse.balance}>
        <Icon name={MEANING.munt} size={13} />
        {purse.balance}
      </span>
    );
  }
  if (door.tail === 'online' && online > 0) {
    return <span className="nav-tail tiny muted">{fill(words.onlineCount, { n: String(online) })}</span>;
  }
  return null;
}

/** §91: the karakter-less line — the door to choosing one, which already existed on /you. */
function PickCharacter({ words, onClick }: { words: Words; onClick?: () => void }) {
  return (
    <Link href="/you#karakters" className="nav-pick" data-testid="yours-pick" onClick={onClick}>
      <Icon name="mask" size={16} />
      {fill(words.pickCharacter, { karakter: words.character })}
    </Link>
  );
}

/* ------------------------------------------------------------- the desktop */

/** §91: a small-caps group head, the eyebrow "JE SPEELT ALS" used to be. */
function GroupHead({ id, children }: { id: string; children: string }) {
  return (
    <p className="nav-group-head" id={id}>
      {children}
    </p>
  );
}

export function YoursGroup({ me, purse, myPage }: { me: Me; purse: Purse; myPage: string | null }) {
  const pathname = usePathname();
  const words = useUi().words;
  const online = useOnline();
  const doors = yoursDoors({ words, purse, myPage, isKeeper: me.isKeeper });
  return (
    <div className="nav-group" role="group" aria-labelledby="nav-yours" data-testid="nav-yours">
      <GroupHead id="nav-yours">{words.navGroupYours}</GroupHead>
      {doors.map((door) => (
        <Link
          key={door.key}
          href={door.href}
          data-testid={door.testId}
          aria-current={isHere(pathname, door.href) ? 'page' : undefined}
        >
          <Icon name={door.icon} size={18} />
          <span className="nav-word">{door.label}</span>
          <Tail door={door} purse={purse} online={online} words={words} />
        </Link>
      ))}
      {!purse && !me.isKeeper && <PickCharacter words={words} />}
    </div>
  );
}

export function ArchiveHead() {
  const words = useUi().words;
  return <GroupHead id="nav-archive">{words.navGroupArchive}</GroupHead>;
}

/** §91 / §44: Beheer and Uitdelen — rendered for a Keeper, absent for anybody else. */
export function KeeperGroup() {
  const pathname = usePathname();
  const words = useUi().words;
  return (
    <div className="nav-group" role="group" aria-labelledby="nav-keeper" data-testid="nav-keeper">
      <GroupHead id="nav-keeper">{words.keeper}</GroupHead>
      <Link href="/admin" aria-current={isHere(pathname, '/admin') ? 'page' : undefined} data-testid="nav-admin">
        <Icon name="shield" size={18} />
        {words.navAdmin}
      </Link>
      <Link href="/uitdelen" aria-current={isHere(pathname, '/uitdelen') ? 'page' : undefined} data-testid="nav-uitdelen">
        <Icon name={MEANING.geven} size={18} />
        {words.handout}
      </Link>
    </div>
  );
}

/**
 * §91: the search box at the top of the side menu. Typing and Enter is
 * `/search?q=…` — the same address the Zoeken page writes itself, so there is
 * one search road (§5). `/` on a desk focuses this box (`UiProvider`), which is
 * why it carries `data-search-box`.
 */
export function SideSearch() {
  const router = useRouter();
  const words = useUi().words;
  const [query, setQuery] = useState('');
  const hint = useId();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };
  return (
    <form className="nav-search" role="search" onSubmit={submit}>
      <Icon name="search" size={16} />
      <input
        type="search"
        data-search-box
        data-testid="nav-search"
        aria-label={words.searchBox}
        aria-describedby={hint}
        placeholder={words.searchBoxHint}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') (event.target as HTMLInputElement).blur();
        }}
      />
      <kbd id={hint} aria-hidden="true">
        /
      </kbd>
    </form>
  );
}

/** §91: the line under *Nieuw artikel*: the keys, with `k` for the Keeper only. */
export function ShortcutsLine({ keeper }: { keeper: boolean }) {
  const words = useUi().words;
  const line = fill(words.shortcutsLine, { n: 'n', zoek: '/' });
  const extra = keeper ? ` · ${fill(words.shortcutsKeeper, { k: 'k' })}` : '';
  return <p className="nav-shortcuts tiny muted">{line + extra}</p>;
}

/* --------------------------------------------------------------- the phone */

/**
 * §91: the Jij tab. It opens the blad rather than going to /you, and it wears
 * the saldo under the person — "◎ 12" — where it used to wear no word at all.
 * Its accessible *name* stays "Jij" (§64: specs and screen readers find it by
 * that); the saldo is its description.
 */
export function JijTab({
  purse,
  open,
  onOpen,
  tabRef,
}: {
  purse: Purse;
  open: boolean;
  onOpen: () => void;
  tabRef: RefObject<HTMLButtonElement | null>;
}) {
  const words = useUi().words;
  const pathname = usePathname();
  const describe = useId();
  return (
    <button
      type="button"
      ref={tabRef}
      className="tab-jij"
      aria-label={words.navYou}
      aria-describedby={purse ? describe : undefined}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-current={pathname === '/you' ? 'page' : undefined}
      data-testid="tab-jij"
      onClick={onOpen}
    >
      <Icon name="you" size={20} />
      {purse ? (
        <span className="tab-jij-saldo" aria-hidden="true" data-testid="tab-jij-saldo" data-balance={purse.balance}>
          <Icon name={MEANING.munt} size={10} />
          {purse.balance}
        </span>
      ) : (
        <span aria-hidden="true">{words.navYou}</span>
      )}
      {purse && (
        <span id={describe} className="visually-hidden">
          {`${words.purse}: ${purse.balance}`}
        </span>
      )}
    </button>
  );
}

/**
 * §91: the Jij-blad. Top to bottom: who you are (and *Speel als ▾*, without
 * scrolling), the doors of jouw plek as buttons of a finger's height, the
 * settings, and — for a Keeper — Beheer, Uitdelen and the Keeperkant. The
 * existing `Sheet` does the rest: Escape, the backdrop, the pile, and the
 * focus back on the tab that opened it.
 */
export function JijSheet({
  me,
  purse,
  myPage,
  onClose,
}: {
  me: Me;
  purse: Purse;
  myPage: string | null;
  onClose: () => void;
}) {
  const words = useUi().words;
  const online = useOnline();
  const doors = yoursDoors({ words, purse, myPage, isKeeper: me.isKeeper });
  const keeperHere = Boolean(me.isKeeper && me.isRealKeeper && !me.asPlayer);
  const flipWord = me.side === 'keeper' ? words.toPlayerSide : words.toKeeperSide;
  const closing = useRef(false);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    onClose();
  };

  return (
    <Sheet onClose={close} labelledBy="jij-title">
      <div className="jij-sheet" data-testid="jij-sheet">
        <h2 id="jij-title" className="visually-hidden">
          {words.navYou}
        </h2>
        <JijWho me={me} />
        <WritingAsLine words={words} onOpen={close} />
        <div className="jij-doors">
          {doors.map((door) => (
            <Link key={door.key} className="btn jij-door" href={door.href} data-testid={`jij-${door.key}`} onClick={close}>
              <Icon name={door.icon} size={18} />
              <span className="nav-word">
                {door.key === 'kamer' ? fill(words.toRoom, { kamer: words.room }) : door.key === 'winkel' ? fill(words.toShop, { winkel: words.shop.toLowerCase() }) : door.label}
              </span>
              {door.key === 'kamer' && purse ? (
                <Beurs balance={purse.balance} words={words} size="small" />
              ) : (
                <Tail door={door} purse={purse} online={online} words={words} />
              )}
            </Link>
          ))}
          {!purse && !me.isKeeper && (
            <Link className="btn jij-door" href="/you#karakters" data-testid="jij-pick" onClick={close}>
              <Icon name="mask" size={18} />
              <span className="nav-word">{fill(words.pickCharacter, { karakter: words.character })}</span>
            </Link>
          )}
          <Link className="btn jij-door" href="/you" data-testid="jij-settings" onClick={close}>
            <Icon name="gear" size={18} />
            <span className="nav-word">{words.navSettings}</span>
          </Link>
        </div>
        {keeperHere && (
          <div className="jij-keeper" role="group" aria-labelledby="jij-keeper-head" data-testid="jij-keeper">
            <p className="nav-group-head" id="jij-keeper-head">
              {words.keeper}
            </p>
            <div className="jij-doors">
              <Link className="btn jij-door" href="/admin" onClick={close} data-testid="jij-admin">
                <Icon name="shield" size={18} />
                <span className="nav-word">{words.navAdmin}</span>
              </Link>
              <Link className="btn jij-door" href="/uitdelen" onClick={close} data-testid="jij-uitdelen">
                <Icon name={MEANING.geven} size={18} />
                <span className="nav-word">{words.handout}</span>
              </Link>
              {/* §46: the toggle stays in the corner; this is a second hand on
                  the same toggle, not a second road — it rings the event the
                  `k` key rings, and `SideToggle` does the flip. */}
              <button
                type="button"
                className="btn jij-door"
                data-testid="jij-flip"
                onClick={() => {
                  close();
                  window.dispatchEvent(new Event(FLIP_EVENT));
                }}
              >
                <Icon name={me.side === 'keeper' ? 'you' : 'shield'} size={18} />
                <span className="nav-word">{flipWord}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
