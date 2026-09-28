'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Icon } from '@/components/Icon';
import { Beurs } from '@/components/kamer/Beurs';
import { SaldoGetal } from '@/components/kamer/SaldoGetal';
import { NavPending } from '@/components/shell/NavPending';
import { MEANING } from '@/components/kamer/plekWords';
import { flipEventFrom } from '@/components/keeper/SideToggle';
import { useLiveBaseOptional } from '@/components/live/LiveProvider';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { JijWho, type Me } from '@/components/you/CharacterSwitcher';
import { WritingAsLine } from '@/components/you/AuthorProvider';
import { capitalise, fill, type Words } from '@/lib/words';
import { currentDoor, jijIsHere } from '@/components/shell/jouwPlekPad';

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

export type Purse = {
  roomId: string;
  balance: number;
  slug: string;
  name: string;
  /** §103 (K4): de nieuwste gift van de Keeper, voor de melding als hij binnenkomt. */
  lastGrant?: { id: string; delta: number; reason: string } | null;
} | null;

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
      <span className="nav-tail saldo-staart" data-testid="yours-saldo" data-balance={purse.balance}>
        <Icon name={MEANING.munt} size={13} />
        {/* §103 (K3): het getal rolt tussen twee serverwaarden; de chip hangt links ervan. */}
        <SaldoGetal value={purse.balance} side="voor" />
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
  const current = currentDoor(pathname, doors.map((door) => door.href));
  return (
    <div className="nav-group" role="group" aria-labelledby="nav-yours" data-testid="nav-yours">
      <GroupHead id="nav-yours">{words.navGroupYours}</GroupHead>
      {doors.map((door) => (
        <Link
          key={door.key}
          href={door.href}
          data-testid={door.testId}
          aria-current={door.href === current ? 'page' : undefined}
        >
          <Icon name={door.icon} size={18} />
          {/* §102 (ronde 65·b): het vakje antwoordt meteen. */}
          <NavPending />
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
        <NavPending />
      </Link>
      <Link href="/uitdelen" aria-current={isHere(pathname, '/uitdelen') ? 'page' : undefined} data-testid="nav-uitdelen">
        <Icon name={MEANING.geven} size={18} />
        {words.handout}
        <NavPending />
      </Link>
    </div>
  );
}

/**
 * §91 put a search box at the top of the side menu that went to
 * `/search?q=…`. §100 made it the palet's door: a press (or `/`, or Ctrl/⌘K)
 * opens the palet on the page you are on, which searches along the same road
 * and can still end on Zoeken — its last row is *Zoek … in het hele archief*.
 * One gesture instead of a box that searched and a key that did something
 * else on a phone.
 */
export function SideSearch() {
  const ui = useUi();
  const words = ui.words;
  return (
    <button
      type="button"
      className="nav-search"
      data-testid="nav-search"
      aria-haspopup="dialog"
      aria-keyshortcuts="/ Control+K Meta+K"
      onClick={() => ui.openPalette()}
    >
      <Icon name="search" size={16} />
      <span className="nav-search-word">{words.paletteDoor}</span>
      {/* One key in the box, so its word fits; both are in the line under Nieuw artikel. */}
      <kbd aria-hidden="true">/</kbd>
    </button>
  );
}

/**
 * ⌘ on a Mac, Ctrl everywhere else. Read after the first paint: the server
 * does not know the machine, and a guess that differs is a hydration warning.
 */
function useModKey(): string {
  const [mod, setMod] = useState('Ctrl ');
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setMod('⌘');
  }, []);
  return mod;
}

/** §91: the line under *Nieuw artikel*: the keys, with `k` for the Keeper only. */
export function ShortcutsLine({ keeper }: { keeper: boolean }) {
  const words = useUi().words;
  const mod = useModKey();
  // §100: the palet's two keys where §91 had one.
  const line = fill(words.shortcutsLine, {
    n: 'n',
    zoek: fill(words.shortcutsPalette, { slash: '/', mod: `${mod}K` }),
  });
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
      aria-current={jijIsHere(pathname) ? 'page' : undefined}
      data-testid="tab-jij"
      onClick={onOpen}
    >
      {/* §102, golf h1 (T3): het poppetje, en eronder het woord *Jij* — een label,
          net als de zeven tabs ernaast — met het saldo op dezelfde regel. */}
      <Icon name="you" size={20} />
      <span className="tab-jij-label" aria-hidden="true">
        {words.navYou}
        {purse && (
          <span className="tab-jij-saldo" data-testid="tab-jij-saldo" data-balance={purse.balance}>
            <Icon name={MEANING.munt} size={9} />
            {/* §103 (K3): hetzelfde getal, dezelfde rol; de chip staat boven het poppetje. */}
            <SaldoGetal value={purse.balance} side="boven" />
          </span>
        )}
      </span>
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
  const ui = useUi();
  const words = ui.words;
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
        {/* §100: the palet, from the phone — the eight tabs stay eight. Opened
            two frames on, when this blad has handed the focus back to its
            tab, so Escape in the palet lands there too. */}
        <button
          type="button"
          className="btn jij-door jij-palette"
          data-testid="jij-palette"
          aria-haspopup="dialog"
          onClick={() => {
            close();
            requestAnimationFrame(() => requestAnimationFrame(() => ui.openPalette()));
          }}
        >
          <Icon name="search" size={18} />
          <span className="nav-word">{words.paletteDoor}</span>
        </button>
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
                onClick={(event) => {
                  close();
                  // §102: a finger here draws the circle from this button.
                  window.dispatchEvent(flipEventFrom(event));
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
