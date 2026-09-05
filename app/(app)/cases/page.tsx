import Link from 'next/link';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { NewCaseButton } from '@/components/cases/NewCaseButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { getSessionUser } from '@/lib/auth/session';
import { countEntriesPerCase, listCases, type CaseStatus } from '@/lib/cases/service';
import { relativeTime } from '@/lib/diff';
import { readMany, readOne, type ListParams } from '@/lib/listParams';

export const dynamic = 'force-dynamic';

const STATUS_LABELS = { open: 'open', cold: 'koud', closed: 'gesloten' } as const;
const STATUSES = ['open', 'cold', 'closed'] as const;
const SORTS = ['status', 'recent', 'name', 'created', 'size'] as const;
const SHOW = ['mine', 'member', 'restricted'] as const;

/** §14: the dossier shelf, sortable and filterable — status above all. */
export default async function CasesPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await getSessionUser();
  const query = await searchParams;

  const sort = readOne(query, 'sort', SORTS, 'status') as (typeof SORTS)[number];
  const statuses = readMany(query, 'status', STATUSES) as CaseStatus[];
  const show = readMany(query, 'show', SHOW);

  const cases = listCases(user, {
    status: statuses,
    sort: sort === 'size' ? 'recent' : sort,
    mine: show.includes('mine') && user ? user.id : undefined,
    memberOf: show.includes('member') && user ? user.id : undefined,
    restricted: show.includes('restricted') || undefined,
  });
  const counts = countEntriesPerCase(
    cases.map((c) => c.id),
    user,
  );
  // "Meeste fiches" counts what this viewer may see, so it is sorted here.
  const sorted =
    sort === 'size'
      ? [...cases].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || b.updatedAt - a.updatedAt)
      : cases;

  return (
    <div className="page-wide">
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div>
          <p className="eyebrow">Archief</p>
          <h1 style={{ margin: 0 }}>Dossiers</h1>
        </div>
        <div className="spacer" />
        <NewCaseButton />
      </div>
      <p className="muted small">
        {cases.length} {cases.length === 1 ? 'dossier' : 'dossiers'}
      </p>

      <SortFilterBar
        sorts={[
          { value: 'status', label: 'Open eerst' },
          { value: 'recent', label: 'Laatst veranderd' },
          { value: 'name', label: 'Op naam' },
          { value: 'created', label: 'Nieuwste eerst' },
          { value: 'size', label: 'Meeste fiches' },
        ]}
        defaultSort="status"
        groups={[
          {
            key: 'status',
            label: 'Status',
            multi: true,
            options: [
              { value: 'open', label: 'Open', icon: 'folder' },
              { value: 'cold', label: 'Koud', icon: 'clock' },
              { value: 'closed', label: 'Gesloten', icon: 'check' },
            ],
          },
          {
            key: 'show',
            label: 'Alleen',
            multi: true,
            options: [
              { value: 'member', label: 'Waar ik bij zit', icon: 'person' },
              { value: 'mine', label: 'Van mij', icon: 'you' },
              { value: 'restricted', label: 'Vertrouwelijk', icon: 'lock' },
            ],
          },
        ]}
      />

      {sorted.length ? (
        <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {sorted.map((item) => (
            <Link key={item.id} className="card" href={`/c/${item.slug}`}>
              <div style={{ position: 'relative' }}>
                <Cover assetId={item.coverAssetId} crop={item.coverCrop} alt="" icon="folder" />
                <span
                  className={`stamp${item.status === 'open' ? '' : ' stamp-muted'}`}
                  style={{ position: 'absolute', top: 8, left: 8, background: 'var(--paper)' }}
                >
                  {STATUS_LABELS[item.status]}
                </span>
                {item.viewMode !== 'all' && (
                  <span
                    className="stamp"
                    style={{ position: 'absolute', bottom: 8, right: 8, background: 'var(--paper)' }}
                  >
                    {item.viewMode === 'private' ? 'Privé' : 'Vertrouwelijk'}
                  </span>
                )}
              </div>
              <div className="card-body">
                <p className="card-name">{item.name}</p>
                {item.summary && (
                  <p className="tiny muted clamp-2" style={{ margin: 0 }}>
                    {item.summary}
                  </p>
                )}
                <p
                  className="tiny muted"
                  style={{ margin: '0.4rem 0 0', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Icon name="file" size={13} />
                  {counts.get(item.id) ?? 0} {(counts.get(item.id) ?? 0) === 1 ? 'fiche' : 'fiches'}
                  <span className="spacer" />
                  {relativeTime(item.updatedAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">
          <p style={{ margin: 0 }}>{statuses.length || show.length ? 'Geen dossier voldoet hieraan.' : 'Nog geen dossiers.'}</p>
          <p className="small" style={{ margin: '0.4rem 0 0' }}>
            {statuses.length || show.length
              ? 'Zet een filter uit om meer te zien.'
              : 'Een dossier hoort bij één onderzoek — een naam en één regel samenvatting zijn genoeg om te beginnen.'}
          </p>
        </div>
      )}
    </div>
  );
}
