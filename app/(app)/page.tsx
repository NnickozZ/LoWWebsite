import Link from 'next/link';
import { LivePage } from '@/components/live/LivePage';
import { eq } from 'drizzle-orm';
import { Thumb } from '@/components/Cover';
import { EntryCard } from '@/components/EntryCard';
import { Icon } from '@/components/Icon';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { listBoards } from '@/lib/boards/service';
import { attributed } from '@/lib/characters';
import { relativeTime } from '@/lib/diff';
import { db, schema } from '@/lib/db';
import { countEntriesPerCase, listCases } from '@/lib/cases/service';
import { browseEntries, countEntriesPerType, recentActivity } from '@/lib/entries/service';
import { defaultIntro, introParagraphs } from '@/lib/intro';
import { listMaps } from '@/lib/maps/service';
import { capitalise } from '@/lib/words';

export const dynamic = 'force-dynamic';

const VERBS: Record<string, string> = {
  'entry.created': 'begon aan',
  'entry.edited': 'bewerkte',
  'entry.deleted': 'verwijderde',
  'entry.restored': 'herstelde',
  'entry.restored_revision': 'herstelde een eerdere versie van',
  'entry.section_revealed': 'onthulde iets in',
};

/**
 * Start (5 Sep 2026): a welcome in the Keeper's words with the archive's
 * numbers, the open dossiers and the latest artikelen down the middle, and
 * "Sinds je laatste bezoek" beside it — a sidebar on a desktop, the second
 * block on a phone. The welcome is the one thing a newcomer sees first, so it
 * says what this place is and where to begin.
 */
export default async function HomePage() {
  const user = await getSessionUser();
  const words = getWords();
  const settings = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).get();

  // §18: every row names the character the person is wearing now.
  const feed = attributed(recentActivity(user, 30), words.keeper);
  const recent = browseEntries(user, { limit: 12, sort: 'recent' });
  const openCases = listCases(user, { status: 'open' }).slice(0, 6);
  const counts = countEntriesPerCase(
    openCases.map((item) => item.id),
    user,
  );

  // The numbers: only what this viewer may see, like every count here.
  const entryCount = [...countEntriesPerType(user).values()].reduce((n, count) => n + count, 0);
  const caseCount = listCases(user).length;
  const boardCount = listBoards(user).length;
  const mapCount = listMaps(user).length;
  const numbers = [
    [entryCount, words.entry, words.entryPlural],
    [caseCount, words.case, words.casePlural],
    [boardCount, words.board, words.boardPlural],
    [mapCount, words.map, words.mapPlural],
  ] as const;

  const intro = introParagraphs(settings?.intro?.trim() ? settings.intro : defaultIntro(words));

  const lastSeen = user?.lastSeenAt ?? 0;
  const firstOldIndex = feed.findIndex((item) => item.createdAt <= lastSeen);
  const hasNew = firstOldIndex !== 0 && feed.length > 0 && lastSeen > 0;
  // Eight rows in view; the rest fold away so a phone does not scroll past
  // thirty of them to reach the dossiers.
  const FEED_SHOWN = 8;
  const feedRow = (item: (typeof feed)[number], index: number) => (
    <li key={item.id}>
      {hasNew && index === firstOldIndex && <p className="since-divider">Eerder</p>}
      <Link href={`/e/${item.entry!.slug}`} className="feed-item" style={{ color: 'inherit', textDecoration: 'none' }}>
        <Thumb
          assetId={item.entry!.coverAssetId}
          crop={item.entry!.coverCrop}
          icon={item.entry!.typeIcon}
          colour={item.entry!.typeColour}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="small" style={{ display: 'block' }}>
            <strong title={item.actorAccount ?? undefined}>{item.actorLabel ?? 'Iemand'}</strong>{' '}
            {VERBS[item.verb] ?? 'wijzigde'} <strong>{item.entry!.name}</strong>
          </span>
          <span className="tiny muted clamp-2" style={{ display: 'block' }}>
            {item.entry!.shortDescription}
          </span>
          <span className="tiny muted" style={{ display: 'block' }}>
            {relativeTime(item.createdAt)}
          </span>
        </span>
      </Link>
    </li>
  );

  return (
    <div className="page-wide home-layout">
      <LivePage place="page:/" watch={['feed', 'entries', 'cases', 'boards', 'maps', 'site', 'words']} />
      <section className="home-welcome" aria-labelledby="home-title">
        <p className="eyebrow">Het archief</p>
        <h1 id="home-title" style={{ margin: '0 0 0.2rem' }}>
          {settings?.name ?? 'Het archief'}
        </h1>
        {settings?.tagline && <p className="home-tagline">{settings.tagline}</p>}
        <div className="home-intro">
          {intro.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        <p className="home-numbers" aria-label="Wat het archief telt">
          {numbers.map(([count, one, many], index) => (
            <span key={one}>
              {index > 0 && <span className="muted"> · </span>}
              <strong>{count}</strong> {count === 1 ? one : many}
            </span>
          ))}
          {user?.isKeeper && (
            <>
              <span className="muted"> · </span>
              <Link href="/admin?tab=site" className="tiny">
                <Icon name="edit" size={12} /> Welkomsttekst aanpassen
              </Link>
            </>
          )}
        </p>
      </section>

      <aside className="home-aside" aria-labelledby="since-title">
        <h2 id="since-title" className="home-aside-title">
          Sinds je laatste bezoek
        </h2>
        {feed.length === 0 ? (
          <div className="empty">
            <p style={{ margin: 0 }}>Nog niets opgeborgen.</p>
            <p className="small" style={{ margin: '0.4rem 0 0' }}>
              Druk op <kbd>n</kbd>, of op de <strong>+</strong>-knop, om aan het eerste {words.entry} te beginnen.
            </p>
          </div>
        ) : (
          <>
            <ul className="home-feed" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {feed.slice(0, FEED_SHOWN).map(feedRow)}
            </ul>
            {feed.length > FEED_SHOWN && (
              <details className="home-feed-more">
                <summary>Nog {feed.length - FEED_SHOWN} eerder</summary>
                <ul className="home-feed" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {feed.slice(FEED_SHOWN).map((item, index) => feedRow(item, index + FEED_SHOWN))}
                </ul>
              </details>
            )}
          </>
        )}
      </aside>

      <div className="home-rest">
        <div className="row" style={{ marginTop: '0.4rem' }}>
          <h2 style={{ margin: 0 }}>Open {words.casePlural}</h2>
          <div className="spacer" />
          <Link className="small" href="/cases">
            Alle {words.casePlural}
          </Link>
        </div>
        {openCases.length ? (
          <ul style={{ listStyle: 'none', margin: '0.4rem 0 0', padding: 0 }}>
            {openCases.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/c/${item.slug}`}
                  className="feed-item"
                  style={{ color: 'inherit', textDecoration: 'none', alignItems: 'center' }}
                >
                  <Thumb assetId={item.coverAssetId} crop={item.coverCrop} icon="folder" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="small" style={{ display: 'block', fontWeight: 600 }}>
                      {item.name}
                    </span>
                    {item.summary && (
                      <span className="tiny muted clamp-2" style={{ display: 'block' }}>
                        {item.summary}
                      </span>
                    )}
                  </span>
                  <span className="tiny muted" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {counts.get(item.id) ?? 0} {counts.get(item.id) === 1 ? words.entry : words.entryPlural}
                    <br />
                    {relativeTime(item.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty" style={{ marginTop: '0.6rem' }}>
            <p className="small" style={{ margin: 0 }}>
              Er is nog geen {words.case} open. Open er een vanaf de pagina{' '}
              <Link href="/cases">{words.navCases}</Link>.
            </p>
          </div>
        )}

        {recent.length > 0 && (
          <>
            <div className="row" style={{ marginTop: '2rem' }}>
              <h2 style={{ margin: 0 }}>Recente {words.entryPlural}</h2>
              <div className="spacer" />
              <Link className="small" href="/wiki">
                Alles bekijken
              </Link>
            </div>
            <div className="card-grid" style={{ marginTop: '0.8rem' }}>
              {recent.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          </>
        )}
        {recent.length === 0 && (
          <p className="small muted" style={{ marginTop: '1.5rem' }}>
            Nog geen {words.entryPlural}. {capitalise(words.newEntry)} staat in het menu.
          </p>
        )}
      </div>
    </div>
  );
}
