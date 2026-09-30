'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { assetUrl } from '@/components/Cover';
import { EntryPreview } from '@/components/EntryPreview';
import { Icon } from '@/components/Icon';
import { LiveProvider } from '@/components/live/LiveProvider';
import { LiveStrip } from '@/components/live/LiveStrip';
import { LiveSpot } from '@/components/live/LiveSpot';
import { useShellBeurs } from '@/components/kamer/ShellBeurs';
import { CommandPalette, useRememberRecent } from '@/components/palette/CommandPalette';
// §102 (ronde 65·b): het vakje dat meteen antwoordt, en de streep na 150 ms.
import { NavPending } from '@/components/shell/NavPending';
import { NavProgress } from '@/components/shell/NavProgress';
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
import { useIsPhone } from '@/components/useIsPhone';
import { fabTypeFor } from '@/lib/newEntryType';
import { fill, type Words } from '@/lib/words';

/**
 * The eight places in the menu. What each is *called* comes from Beheer →
 * Woorden, so the labels are word keys rather than words; the hrefs and the
 * icons are the app's own and stay put.
 */
const NAV: {
  href: string;
  word: string;
  icon: string;
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
  // §102, golf h1 (T3): eight tabs, and since this wave a word under each — Zoeken
  // and Jij included. `compact` is gone: the magnifier went without a word
  // because the labels were capitals at 8,6 px; in ordinary spelling at 10,5
  // px all eight fit at 360 px (see `.tabs a` in `app/globals.css`).
  { href: '/search', word: 'navSearch', icon: 'search', phoneOnly: true },
  // §91: *Jij* is not a place in this list any more. On a desk it is the last
  // line of the side menu (`/you`, the settings); on a phone it is the eighth
  // tab, and that tab opens the Jij-blad instead of going anywhere (§32: still
  // eight tabs). Both are drawn below, beside the list rather than in it.
];

function isCurrent(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** How far the page must travel in one direction before the `+` answers it. */
const FAB_SCROLL_SLOP = 8;

/**
 * Review #10: the `+` steps aside while you scroll *down*, and is back the
 * moment you scroll up (or reach the top). One rAF per frame at most, passive,
 * and only on a phone — the `+` is not drawn on a desk.
 *
 * §102, golf h1 (T4): on *every* page with a `+`, not only a reading one. Herstel
 * #10 asked `readingPage()` first, and on Start, /spelers, Beheer and the rest
 * the `+` stayed on top of a name or a button while the thumb went past it.
 * The gesture is the same everywhere, so is the answer.
 */
/** Golf H: how long after a touch, wheel or key a scroll still counts as the hand's. */
const FAB_HAND_MS = 700;

function useFabAway(pathname: string): boolean {
  const [away, setAway] = useState(false);
  useEffect(() => {
    setAway(false);
    const narrow = window.matchMedia('(max-width: 767px)');
    let last = window.scrollY;
    let frame = 0;
    /*
     * Golf H: only a scroll the hand made sends the + away. A scroll the page
     * makes itself — the caret put into a new artikel, a tile scrolled into
     * view after *Bekijk*, `scrollIntoView` of a tab — is not somebody reading
     * on, and hiding the + there took it away exactly when it was wanted next.
     */
    let handAt = -Infinity;
    const hand = () => {
      handAt = performance.now();
    };
    const settle = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - last;
      if (performance.now() - handAt > FAB_HAND_MS) {
        last = y;
        return;
      }
      if (!narrow.matches || y <= 0) {
        last = y;
        setAway(false);
        return;
      }
      if (Math.abs(delta) < FAB_SCROLL_SLOP) return;
      last = y;
      setAway(delta > 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(settle);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    for (const type of ['touchmove', 'wheel', 'keydown'] as const) window.addEventListener(type, hand, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      for (const type of ['touchmove', 'wheel', 'keydown'] as const) window.removeEventListener(type, hand);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);
  return away;
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
  useShellBeurs(purse);
  // §100: *Onlangs* — the addresses of the things you open, in this browser.
  useRememberRecent(me.id);
  // §91: the Jij-blad, and the tab it hands the focus back to.
  const [jijOpen, setJijOpen] = useState(false);
  const jijTab = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setJijOpen(false);
  }, [pathname]);
  const fabAway = useFabAway(pathname);
  // §102, golf h1 (D4): one toggle, drawn where this width wants it.
  const isPhone = useIsPhone();
  const keeperHand = Boolean(me.isRealKeeper && !me.asPlayer);

  return (
    <>
      <nav className="sidenav" aria-label="Hoofdmenu">
        <div className="masthead">
          {logoAssetId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="masthead-logo" src={assetUrl(logoAssetId, 'thumb')} alt="" />
          ) : (
            // Golf L: zonder eigen logo het merk van het archief, als watermerk
            // achter de naam — het neemt geen plaats in (ronde 52 meet de zijbalk).
            <span className="masthead-merk" aria-hidden="true">
              <Icon name="merk" size={58} />
            </span>
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
          {/*
           * §102, golf h1 (D4): on a desk the stamp became the switch itself — the
           * Keeper half carries the shield and `masthead-side` when it is the
           * side you stand on. The phone has no side menu to show (it keeps
           * §46's button in the corner), so there the stamp stays in the
           * hidden masthead for what reads it.
           */}
          {keeperHand && !isPhone ? (
            <SideToggle side={me.side === 'keeper' ? 'keeper' : 'player'} words={words} variant="mast" />
          ) : (
            me.side === 'keeper' && (
              <span className="masthead-side" data-testid="masthead-side">
                <Icon name="shield" size={12} />
                {words.keeperSide}
              </span>
            )
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
              <NavPending />
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
          // §104 (golf H, D23): the long sentence stays the button's name; what it shows fits on one line.
          aria-label={here ? fill(words.navNewInCaseLabel, { nieuw: words.newEntry, dossier: words.case }) : undefined}
        >
          <Icon name="plus" size={18} />
          {here ? fill(words.navNewInCase, { dossier: words.case }) : words.newEntry}
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
          <NavPending />
        </Link>
      </nav>

      {/* §90: two landmarks both called "Hoofdmenu" were one name for two places. */}
      <nav className="tabs" aria-label={words.tabBar}>
        {NAV.filter((item) => !item.desktopOnly && (!item.keeperOnly || me.isKeeper)).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
          >
            <Icon name={item.icon} size={20} />
            {/* §102, golf h1 (T3): Zoeken draagt zijn woord ook. */}
            <span>{words[item.word]}</span>
            <NavPending />
          </Link>
        ))}
        {/* §91: the eighth tab opens the Jij-blad, and wears the saldo. */}
        <JijTab purse={purse} open={jijOpen} onOpen={() => setJijOpen(true)} tabRef={jijTab} />
      </nav>
      {/* §100: the palet — `/`, Ctrl/⌘K, the box in the side menu, the Jij-blad. */}
      {ui.palette && (
        <CommandPalette
          me={me}
          purse={purse}
          myPage={myPage}
          initialQuery={ui.palette.query}
          onClose={ui.closePalette}
        />
      )}
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
        // Review #10: stepped aside on a reading page while scrolling down —
        // and then not a stop for the keyboard or a screen reader either.
        data-away={fabAway ? '1' : undefined}
        tabIndex={fabAway ? -1 : undefined}
        aria-hidden={fabAway || undefined}
        aria-label={here ? fill(words.navNewInCaseLabel, { nieuw: words.newEntry, dossier: words.case }) : words.newEntry}
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
  // §102, golf h1 (D4): the corner button is the phone's only.
  const isPhone = useIsPhone();
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
        {/* §102, golf h1 (D4): `data-keeper-hand` says, from the server's first HTML,
            that a Keeper's toggle belongs on this screen — so the phone's band
            for the corner button is there before the button hydrates in. */}
        <div className="shell" data-keeper-hand={me.isRealKeeper && !me.asPlayer ? '' : undefined}>
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
              {/* §102, golf h1 (D4): the corner is the phone's; a desk has the switch
                  in the masthead (`Nav`). One of the two, never both. */}
              {isPhone && <SideToggle side={me.side === 'keeper' ? 'keeper' : 'player'} words={words} />}
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
            {/* §102 (ronde 65·b): één streep, vast bovenaan deze kolom. */}
            <NavProgress label={words.navLoading} />
            <LiveStrip words={words} />
            {/* Golf M (A3): waar op de pagina je staat, en aankomen waar een ander stond. */}
            <LiveSpot />
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
