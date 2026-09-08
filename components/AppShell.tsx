'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { assetUrl } from '@/components/Cover';
import { EntryPreview } from '@/components/EntryPreview';
import { Icon } from '@/components/Icon';
import { LiveProvider } from '@/components/live/LiveProvider';
import { LiveStrip } from '@/components/live/LiveStrip';
import { UiProvider, useUi, type EntryTypeLite } from '@/components/ui/UiProvider';
import { CharacterSwitcher, type Me } from '@/components/you/CharacterSwitcher';
import { ReadOnlyBanner, WritingAsLine } from '@/components/you/AuthorProvider';
import { AsPlayerBanner, AsPlayerLink } from '@/components/keeper/AsPlayer';
import { SideToggle } from '@/components/keeper/SideToggle';
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
  /** §44: not rendered at all for anyone but a Keeper — never hidden with CSS. */
  keeperOnly?: boolean;
}[] = [
  { href: '/', word: 'navHome', icon: 'home' },
  { href: '/cases', word: 'navCases', icon: 'folder' },
  { href: '/wiki', word: 'navWiki', icon: 'book' },
  { href: '/boards', word: 'navBoards', icon: 'board' },
  { href: '/maps', word: 'navMaps', icon: 'map' },
  { href: '/timelines', word: 'navTimelines', icon: 'timeline' },
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
  { href: '/search', word: 'navSearch', icon: 'search', compact: true },
  { href: '/you', word: 'navYou', icon: 'you', compact: true },
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
}: {
  siteName: string;
  tagline: string;
  logoAssetId: string | null;
  me: Me;
}) {
  const pathname = usePathname();
  const ui = useUi();
  const words = ui.words;
  // §48: the dossier this screen is, when it is one.
  const here = ui.caseHere;

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
          <WritingAsLine />
          {/* §44: the way into "kijk als speler", beside who you are being —
              the other question about whose eyes you are reading with. */}
          <AsPlayerLink show={Boolean(me.isRealKeeper && !me.asPlayer)} words={words} />
        </div>
        {NAV.filter((item) => !item.keeperOnly || me.isKeeper).map((item) => (
          <Link key={item.href} href={item.href} aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}>
            <Icon name={item.icon} size={18} />
            {words[item.word]}
          </Link>
        ))}
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '1rem' }}
          onClick={() => ui.openNewEntry(here ? { caseId: here.id } : undefined)}
        >
          <Icon name="plus" size={18} />
          {here ? `${words.newEntry} in dit ${words.case}` : words.newEntry}
        </button>
        <p className="tiny muted" style={{ marginTop: '0.6rem', paddingLeft: '0.6rem' }}>
          Druk overal op <kbd>n</kbd>
        </p>
      </nav>

      <nav className="tabs" aria-label="Hoofdmenu">
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
      </nav>

      {/* §48: inside a dossier the `+` makes something *in* it — which is the
          only way a voorwerp or an aanwijzing can be made at all (§24). */}
      <button
        type="button"
        className="fab"
        aria-label={here ? `${words.newEntry} in dit ${words.case}` : words.newEntry}
        onClick={() => ui.openNewEntry(here ? { caseId: here.id } : undefined)}
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
      {/* §21: one live line per tab, for every page inside the shell. */}
      <LiveProvider>
        <div className="shell">
          <Nav siteName={siteName} tagline={tagline} logoAssetId={logoAssetId} me={me} />
          {/*
           * §46: de spiegel. Outside the menu, in the corner of the viewport,
           * the same spot on a desk and on a phone — and rendered only for a
           * Keeper who is not looking as a player, so nobody else's HTML
           * carries the button or the address behind it.
           */}
          {me.isRealKeeper && !me.asPlayer && (
            <SideToggle side={me.side === 'keeper' ? 'keeper' : 'player'} words={words} />
          )}
          <main className="main">
            <LiveStrip />
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
