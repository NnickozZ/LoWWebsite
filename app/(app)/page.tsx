import Link from 'next/link';
import { Thumb } from '@/components/Cover';
import { EntryCard } from '@/components/EntryCard';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { attributed } from '@/lib/characters';
import { relativeTime } from '@/lib/diff';
import { countEntriesPerCase, listCases } from '@/lib/cases/service';
import { browseEntries, recentActivity } from '@/lib/entries/service';

export const dynamic = 'force-dynamic';

const VERBS: Record<string, string> = {
  'entry.created': 'begon aan',
  'entry.edited': 'bewerkte',
  'entry.deleted': 'verwijderde',
  'entry.restored': 'herstelde',
  'entry.restored_revision': 'herstelde een eerdere versie van',
  'entry.section_revealed': 'onthulde iets in',
};

export default async function HomePage() {
  const user = await getSessionUser();
  const words = getWords();
  // §18: every row names the character the person is wearing now.
  const feed = attributed(recentActivity(user, 30), words.keeper);
  const recent = browseEntries(user, { limit: 12, sort: 'recent' });
  const openCases = listCases(user, { status: 'open' }).slice(0, 6);
  const counts = countEntriesPerCase(
    openCases.map((item) => item.id),
    user,
  );

  const lastSeen = user?.lastSeenAt ?? 0;
  const firstOldIndex = feed.findIndex((item) => item.createdAt <= lastSeen);
  const hasNew = firstOldIndex !== 0 && feed.length > 0 && lastSeen > 0;

  return (
    <div className="page">
      <p className="eyebrow">Het archief</p>
      <h1 style={{ marginBottom: '1rem' }}>Sinds je laatste bezoek</h1>

      {feed.length === 0 ? (
        <div className="empty">
          <p style={{ margin: 0 }}>Nog niets opgeborgen.</p>
          <p className="small" style={{ margin: '0.4rem 0 0' }}>
            Druk op <kbd>n</kbd>, of op de <strong>+</strong>-knop, om aan de eerste fiche te beginnen.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {feed.map((item, index) => (
            <li key={item.id}>
              {hasNew && index === firstOldIndex && (
                <p className="since-divider">Eerder</p>
              )}
              <Link
                href={`/e/${item.entry!.slug}`}
                className="feed-item"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                <Thumb
                  assetId={item.entry!.coverAssetId}
                  crop={item.entry!.coverCrop}
                  icon={item.entry!.typeIcon}
                  colour={item.entry!.typeColour}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="small">
                    <strong title={item.actorAccount ?? undefined}>{item.actorLabel ?? 'Iemand'}</strong>{' '}
                    {VERBS[item.verb] ?? 'wijzigde'}{' '}
                    <strong>{item.entry!.name}</strong>
                  </span>
                  <span className="tiny muted clamp-2" style={{ display: 'block' }}>
                    {item.entry!.shortDescription}
                  </span>
                </span>
                <span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>
                  {relativeTime(item.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="row" style={{ marginTop: '2rem' }}>
        <h2 style={{ margin: 0 }}>Open dossiers</h2>
        <div className="spacer" />
        <Link className="small" href="/cases">
          Alle dossiers
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
                  {counts.get(item.id) ?? 0} {counts.get(item.id) === 1 ? 'fiche' : 'fiches'}
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
            Er is nog geen dossier open. Open er een vanaf de pagina{' '}
            <Link href="/cases">Dossiers</Link>.
          </p>
        </div>
      )}

      {recent.length > 0 && (
        <>
          <div className="row" style={{ marginTop: '2rem' }}>
            <h2 style={{ margin: 0 }}>Recente fiches</h2>
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
    </div>
  );
}
