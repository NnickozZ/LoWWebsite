'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { assetUrl } from '@/components/Cover';
import { EntryPreview } from '@/components/EntryPreview';
import { Icon } from '@/components/Icon';
import { UiProvider, useUi, type EntryTypeLite } from '@/components/ui/UiProvider';
import { CharacterSwitcher, type Me } from '@/components/you/CharacterSwitcher';
import type { Words } from '@/lib/words';

/**
 * The seven places in the menu. What each is *called* comes from Beheer →
 * Woorden, so the labels are word keys rather than words; the hrefs and the
 * icons are the app's own and stay put.
 */
const NAV = [
  { href: '/', word: 'navHome', icon: 'home' },
  { href: '/cases', word: 'navCases', icon: 'folder' },
  { href: '/wiki', word: 'navWiki', icon: 'book' },
  { href: '/boards', word: 'navBoards', icon: 'board' },
  { href: '/maps', word: 'navMaps', icon: 'map' },
  // Seven tabs do not fit a phone with a word under each. The two whose icon
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
        </div>
        {/* §18: who you are being — under the masthead, above the places. */}
        <CharacterSwitcher me={me} />
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}>
            <Icon name={item.icon} size={18} />
            {words[item.word]}
          </Link>
        ))}
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '1rem' }}
          onClick={() => ui.openNewEntry()}
        >
          <Icon name="plus" size={18} />
          {words.newEntry}
        </button>
        <p className="tiny muted" style={{ marginTop: '0.6rem', paddingLeft: '0.6rem' }}>
          Druk overal op <kbd>n</kbd>
        </p>
      </nav>

      <nav className="tabs" aria-label="Hoofdmenu">
        {NAV.map((item) => (
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

      <button type="button" className="fab" aria-label={words.newEntry} onClick={() => ui.openNewEntry()}>
        +
      </button>
    </>
  );
}

export function AppShell({
  types,
  words,
  me,
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
  siteName: string;
  tagline: string;
  logoAssetId: string | null;
  children: ReactNode;
}) {
  return (
    <UiProvider types={types} words={words}>
      <div className="shell">
        <Nav siteName={siteName} tagline={tagline} logoAssetId={logoAssetId} me={me} />
        <main className="main">{children}</main>
      </div>
      <EntryPreview />
    </UiProvider>
  );
}
