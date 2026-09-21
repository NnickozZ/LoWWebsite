'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { assetUrl } from '@/components/Cover';
import { EntryPreview } from '@/components/EntryPreview';
import { Icon } from '@/components/Icon';
import { LiveProvider } from '@/components/live/LiveProvider';
import { LiveStrip } from '@/components/live/LiveStrip';
import { useShellBeurs } from '@/components/kamer/ShellBeurs';
import {
  ArchiveHead,
  JijSheet,
  JijTab,
  KeeperGroup,
  ShortcutsLine,
  SideSearch,
  YoursGroup,
  type Purse,
} from '@/components/shell/JouwPlek';
// §76: the roster's own stylesheet, beside the strip that opens it. `globals.css`
// is the busiest file in the repo (§75 made `overzichten.css` for the same
// reason); a feature with a panel, a row and a banner belongs in its own.
import '@/app/aanwezig.css';
import { UiProvider, useUi, type EntryTypeLite } from '@/components/ui/UiProvider';
import { CharacterSwitcher, type Me } from '@/components/you/CharacterSwitcher';
import { ReadOnlyBanner, WritingAsLine } from '@/components/you/AuthorProvider';
import { AsPlayerBanner, AsPlayerLink } from '@/components/keeper/AsPlayer';
import { SideSwitched } from '@/components/keeper/SideSwitched';
import { SideToggle } from '@/components/keeper/SideToggle';
import { fabTypeFor } from '@/lib/newEntryType';
import type { Words } from '@/lib/words';

/**
 * The eight places in the menu. What each is *called* comes from Beheer →
 * Woorden, so the labels are word keys rather than words; the hrefs and the
 * icons are the app's own and stay put.
 */
const NAV: {
  href: string;
  word: string;
  icon: string;
  compact?: boolean;
  desktopOnly?: boolean;
  /**
   * §91: in the tab bar and not in the side menu. Zoeken is a box at the top of
   * the side menu now; on a phone it stays the tab it was.
   */
  phoneOnly?: boolean;
  /** §44: not rendered at all for anyone but a Keeper — never hidden with CSS. */
  keeperOnly?: boolean;
}[] = [
  { href: '/', word: 'navHome', icon: 'home' },
  { href: '/cases', word: 'navCases', icon: 'folder' },
  { href: '/wiki', word: 'navWiki', icon: 'book' },
  { href: '/boards', word: 'navBoards', icon: 'board' },
  { href: '/maps', word: 'navMaps', icon: 'map' },
  { href: '/timelines', word: 'navTimelines', icon: 'timeline' },
  // §66: de stambomen. Desktop only, for the arithmetic below: the phone's tab
  // bar is full at eight and this would be the tenth thing wanting a place.
  // On a phone the way into a stamboom is a dossier, an artikel's "Genoemd in",
  // or the count on the home page.
  { href: '/stambomen', word: 'navFamilyTrees', icon: 'tree', desktopOnly: true },
  // §43: the web. Not in the phone's tab bar at all: nine tabs do not fit
  // (§32's arithmetic below leaves LANDKAARTEN exactly enough at eight), and
  // on a phone the whole web is a search box anyway — the way in there is the
  // Verbindingen button on the thing you are looking at.
  { href: '/web', word: 'navWeb', icon: 'web', desktopOnly: true },
  // §46: de Keeperkant is *niet* meer een plek in de zijbalk. Round 22 put it
  // here as a ninth menu item; the mirror replaced it with a toggle in the
  // corner of the screen (`SideToggle`), because the Keeper's side is not a
  // place you visit — it is the face the whole archive wears. `keeperOnly`
  // stays on the type above: the next Keeper-only place should still be able
  // to say so, and be absent rather than hidden.
  // Eight tabs do not fit a phone with a word under each. The two whose icon
  // everybody knows — a magnifier, a person — go without one there.
  { href: '/search', word: 'navSearch', icon: 'search', compact: true, phoneOnly: true },
  // §91: *Jij* is not a place in this list any more. On a desk it is the last
  // line of the side menu (`/you`, the settings); on a phone it is the eighth
  // tab, and that tab opens the Jij-blad instead of going anywhere (§32: still
  // eight tabs). Both are drawn below, beside the list rather than in it.
];

function isCurrent(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Nav({
  siteName,
  tagline,
  logoAssetId,
  me,
  purse,
  myPage,
}: {
  siteName: string;
  tagline: string;
  logoAssetId: string | null;
  me: Me;
  purse: Purse;
  myPage: string | null;
}) {
  const pathname = usePathname();
  const ui = useUi();
  const words = ui.words;
  // §48: the dossier this screen is, when it is one.
  const here = ui.caseHere;
  /*
   * §84/§91: the saldo stays live — one listener on your own `room:{id}`, for
   * both of its drawings (the side menu and the Jij tab). The pill in the
   * corner that used to carry it is gone on both sizes.
   */
  useShellBeurs(purse?.roomId ?? null);
  // §91: the Jij-blad, and the tab it hands the focus back to.
  const [jijOpen, setJijOpen] = useState(false);
  const jijTab = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setJijOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="sidenav" aria-label="Hoofdmenu">
        <div className="masthead">
          {logoAssetId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="masthead-logo" src={assetUrl(logoAssetId, 'thumb')} alt="" />
          )}
          <span className="masthead-name">{siteName}</span>
          {tagline && <span className="masthead-tagline">{tagline}</span>}
          {/*
           * §46: the archive's own name block says which side it is being read
           * from, before any record's stamp does and before the colours have
           * been learnt. Only when the browser stands on the Keeper's side —
           * the players' side is the archive as everybody knows it and needs no
           * word for itself.
           */}
          {me.side === 'keeper' && (
            <span className="masthead-side" data-testid="masthead-side">
              <Icon name="shield" size={12} />
              {words.keeperSide}
            </span>
          )}
        </div>
        {/*
         * §18: who you are being — under the masthead, above the places.
         * §18b: and, right under it, who this *window* is writing as. The two
         * belong together: the first is the account's karakter, the second is
         * this window's, and seeing them one above the other is the whole
         * explanation of why they can differ.
         */}
        <div className="who-block">
          <CharacterSwitcher me={me} />
          {/* §91: only when this window writes as somebody else — see `showsWritingLine`. */}
          <WritingAsLine words={words} />
          {/* §44: the way into "kijk als speler", beside who you are being —
              the other question about whose eyes you are reading with. */}
          <AsPlayerLink show={Boolean(me.isRealKeeper && !me.asPlayer)} words={words} />
        </div>
        {/* §91: zoeken is a box now, straight under who you are. */}
        <SideSearch />
        {/* §91: jouw plek — persoonlijk vóór gedeeld. */}
        <YoursGroup me={me} purse={purse} myPage={myPage} />
        <div className="nav-group" role="group" aria-labelledby="nav-archive">
          <ArchiveHead />
          {NAV.filter((item) => !item.phoneOnly && (!item.keeperOnly || me.isKeeper)).map((item) => (
            <Link key={item.href} href={item.href} aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}>
              <Icon name={item.icon} size={18} />
              {words[item.word]}
            </Link>
          ))}
        </div>
        {/* §44/§91: absent for anybody but a Keeper — not hidden. */}
        {me.isKeeper && <KeeperGroup />}
        <button
          type="button"
          className="btn btn-primary nav-new"
          data-testid="nav-new"
          onClick={() => ui.openNewEntry(here ? { caseId: here.id } : undefined)}
        >
          <Icon name="plus" size={18} />
          {here ? `${words.newEntry} in dit ${words.case}` : words.newEntry}
        </button>
        <ShortcutsLine keeper={Boolean(me.isRealKeeper && !me.asPlayer)} />
        <Link
          href="/you"
          className="nav-you"
          data-testid="nav-you"
          aria-current={isCurrent(pathname, '/you') ? 'page' : undefined}
        >
          <Icon name="gear" size={18} />
          {words.navYou}
          <span className="tiny muted">{words.navSettings}</span>
        </Link>
      </nav>

      {/* §90: two landmarks both called "Hoofdmenu" were one name for two places. */}
      <nav className="tabs" aria-label={words.tabBar}>
        {NAV.filter((item) => !item.desktopOnly && (!item.keeperOnly || me.isKeeper)).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={item.compact ? 'tab-compact' : undefined}
            aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
          >
            <Icon name={item.icon} size={20} />
            <span className={item.compact ? 'visually-hidden' : undefined}>{words[item.word]}</span>
          </Link>
        ))}
        {/* §91: the eighth tab opens the Jij-blad, and wears the saldo. */}
        <JijTab purse={purse} open={jijOpen} onOpen={() => setJijOpen(true)} tabRef={jijTab} />
      </nav>
      {jijOpen && (
        <JijSheet
          me={me}
          purse={purse}
          myPage={myPage}
          onClose={() => {
            setJijOpen(false);
            // Back to the tab — unless a door in the blad already took the
            // reader somewhere and the focus with it.
            requestAnimationFrame(() => {
              const active = document.activeElement;
              if (!active || active === document.body) jijTab.current?.focus({ preventScroll: true });
            });
          }}
        />
      )}

      {/* §48: inside a dossier the `+` makes something *in* it — which is the
          only way a voorwerp or an aanwijzing can be made at all (§24). */}
      <button
        type="button"
        className="fab"
        aria-label={here ? `${words.newEntry} in dit ${words.case}` : words.newEntry}
        onClick={() => {
          /*
           * §90: the soort of the list you are standing on, as the *Nieuw* in
           * that list's head already does — and for a speler with no karakter
           * yet, the karakter-soort, because that artikel is the one thing
           * they can make. A soort the sheet will not offer them is dropped
           * there, so this only ever suggests.
           */
          const typeSlug = fabTypeFor({
            pathname,
            typeSlugs: ui.types.filter((type) => ui.isKeeper || !type.keeperMade).map((type) => type.slug),
            needsCharacter: !me.isKeeper && me.characters.length === 0,
          });
          if (!here && !typeSlug) ui.openNewEntry(undefined);
          else ui.openNewEntry({ ...(here ? { caseId: here.id } : {}), ...(typeSlug ? { typeSlug } : {}) });
        }}
      >
        +
      </button>
    </>
  );
}

export function AppShell({
  types,
  words,
  me,
  purse,
  myPage,
  uploadLimit,
  siteName,
  tagline,
  logoAssetId,
  children,
}: {
  types: EntryTypeLite[];
  /** §11: the Keeper's words, resolved on the server in the layout. */
  words: Words;
  /** §18: this account, and the characters it may wear. */
  me: Me;
  /**
   * §84: de beurs van de onderzoeker die deze persoon nú draagt, of null.
   *
   * Op de server gelezen (`purseOf` in de layout) omdat de schil een
   * client-component is en dit een vraag aan de database is. Null voor de
   * Keeper (draagt niemand, §18) en voor wie nog geen onderzoeker draagt — en
   * dan staat er niets, geen nul.
   */
  purse: Purse;
  /** §91: the address of this account's own spelerspagina (§77), for jouw plek. */
  myPage: string | null;
  /**
   * How heavy a picture this person may send up — a player's 2 MB or the
   * Keeper's 20 MB, decided on the server (`uploadLimitFor`) because the role
   * is the server's to know. Every upload reads it from `useUi()`.
   */
  uploadLimit: number;
  siteName: string;
  tagline: string;
  logoAssetId: string | null;
  children: ReactNode;
}) {
  return (
    <UiProvider
      types={types}
      words={words}
      uploadLimit={uploadLimit}
      /* §48: what is made here is born on the side this browser stands on, and
         the sheets have to be able to say so. A Keeper looking through a
         player's eyes is a player here as everywhere else. */
      isKeeper={Boolean(me.isRealKeeper && !me.asPlayer)}
      side={me.side === 'keeper' ? 'keeper' : 'player'}
    >
      {/* §21: one live line per tab, for every page inside the shell.
          §60: with the account it belongs to. The tabs of one browser share a
          leader, and a leader whose account has changed under it (a logout and
          a login in one profile) must be recognisable as somebody else's — the
          follower compares this with the id on the `line` it is offered. It is
          this window's own user id and no secret to it. */}
      <LiveProvider userId={me.id}>
        <div className="shell">
          {/* §90: the first stop for a keyboard, and invisible until it is one —
              otherwise fourteen menu stops stand between Tab and the page. */}
          <a className="skip-link" href="#main">
            {words.skipToContent}
          </a>
          <Nav siteName={siteName} tagline={tagline} logoAssetId={logoAssetId} me={me} purse={purse} myPage={myPage} />
          {/*
           * §46: de spiegel. Outside the menu, in the corner of the viewport,
           * the same spot on a desk and on a phone — and rendered only for a
           * Keeper who is not looking as a player, so nobody else's HTML
           * carries the button or the address behind it.
           */}
          {me.isRealKeeper && !me.asPlayer && (
            <>
              <SideToggle side={me.side === 'keeper' ? 'keeper' : 'player'} words={words} />
              {/*
               * §50/§57: and the word for a wissel that has just happened. It
               * stands here, in the shell, rather than in `KeeperStamp`: a flip
               * from something with no tweeling lands on a **list**, no list
               * renders a stamp, and so the one landing that most needs saying
               * out loud was the one that never said anything. One mount, under
               * every page, reading the side off the shell that has just been
               * rendered on it.
               */}
            </>
          )}
          {/* Outside the Keeper's own block on purpose: taking the flags off
              the address is not a Keeper's privilege, and hanging it inside
              made the cleaning depend on who was looking. */}
          <SideSwitched side={me.side === 'keeper' ? 'keeper' : 'player'} />
          {/* §90: no `tabIndex` — the skip link moves the browser's own
              starting point for Tab, and a focusable `<main>` would take the
              focus on every click on bare page, which half the app reads as
              "nobody is typing" when it sees `<body>`. */}
          <main className="main" id="main">
            <LiveStrip words={words} />
            {/*
             * §84 zette hier de beurs, als pil in de hoek van elke pagina: de
             * voordeur van de meta-progressie. §91 haalde hem weg — op een
             * computer staat het saldo naast *Kamer* in de zijbalk, die er ook
             * op een canvas is, en op een telefoon onder het poppetje van de
             * Jij-tab. De deur is gebleven, de pil niet.
             */}
            {/*
             * §18b: a speler with no onderzoeker may read the whole archive
             * and write none of it. The notice stands at the top of every page
             * inside the shell rather than beside each input, because there is
             * no page where they *can* write and no toast that survives long
             * enough to be read.
             */}
            {/*
             * §44: and, above that, the one banner a Keeper looking through a
             * player's eyes must always be able to reach. It stands here, in
             * the shell, because Beheer and the Keeperkant refuse to render
             * while the preview is on and the shell survives a page that
             * throws — so the way back is never on the page that is missing.
             */}
            <AsPlayerBanner on={Boolean(me.asPlayer)} words={words} />
            <ReadOnlyBanner words={words} />
            {children}
          </main>
        </div>
        <EntryPreview />
      </LiveProvider>
    </UiProvider>
  );
}
