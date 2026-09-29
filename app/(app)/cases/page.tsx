import Link from 'next/link';
import { LivePage } from '@/components/live/LivePage';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { MentionText } from '@/components/ui/MentionPopover';
import { NewCaseButton } from '@/components/cases/NewCaseButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { countEntriesPerCase, listCases, type CaseStatus } from '@/lib/cases/service';
import { relativeTime } from '@/lib/diff';
import { readMany, readOne, type ListParams } from '@/lib/listParams';
import { fill } from '@/lib/words';
import { LegeStaat } from '@/components/ui/LegeStaat';
import { DossierDeur } from '@/components/eerste-keer/Deuren';

export const dynamic = 'force-dynamic';

const STATUS_LABELS = { open: 'open', cold: 'koud', closed: 'gesloten' } as const;
const STATUSES = ['open', 'cold', 'closed'] as const;
const SORTS = ['status', 'recent', 'name', 'created', 'size'] as const;
const SHOW = ['mine', 'member', 'restricted'] as const;

/** §14: the dossier shelf, sortable and filterable — status above all. */
export default async function CasesPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await requireViewer();
  const query = await searchParams;
  const words = getWords();

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
  // "Meeste artikelen" counts what this viewer may see, so it is sorted here.
  const sorted =
    sort === 'size'
      ? [...cases].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || b.updatedAt - a.updatedAt)
      : cases;

  return (
    <div className="page-wide">
      <LivePage place="page:/cases" watch={['cases']} />
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div>
          <p className="eyebrow">Archief</p>
          <h1 style={{ margin: 0 }}>Dossiers</h1>
        </div>
        <div className="spacer" />
        <NewCaseButton />
      </div>
      {/* §106 (na review 4, M8): geen sorteerbalk boven een lijst zonder één regel. */}
      {(sorted.length > 0 || statuses.length > 0 || show.length > 0) && (
        <SortFilterBar
          sorts={[
            { value: 'status', label: 'Open eerst' },
            { value: 'recent', label: 'Laatst veranderd' },
            { value: 'name', label: 'Op naam' },
            { value: 'created', label: 'Nieuwste eerst' },
            { value: 'size', label: `Meeste ${words.entryPlural}` },
          ]}
          defaultSort="status"
          summary={`${cases.length} ${cases.length === 1 ? words.case : words.casePlural}`}
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
      )}

      {sorted.length ? (
        // §104 (golf H, T1): on a phone one line per dossier (`.rijen`) — five
        // dossiers were five screens of empty folders. The width of a card on a
        // desk is a class now, so the phone's one column can win over it.
        <div className="card-grid card-grid-breed rijen">
          {sorted.map((item) => (
            <Link key={item.id} className="card" href={`/c/${item.slug}`}>
              <div className="card-cover-wrap">
                <Cover assetId={item.coverAssetId} crop={item.coverCrop} shape="portrait" alt="" icon="folder" />
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
                    {/* §48: flat chips — the card is a link. */}
                    <MentionText text={item.summary} flat tokens />
                  </p>
                )}
                <p className="tiny muted card-meta">
                  {/* In a row the stamp on the cover is gone; the status is here instead. */}
                  <span className="card-meta-status alleen-rij">{STATUS_LABELS[item.status]}</span>
                  <Icon name="file" size={13} />
                  {counts.get(item.id) ?? 0} {(counts.get(item.id) ?? 0) === 1 ? words.entry : words.entryPlural}
                  <span className="spacer" />
                  {relativeTime(item.updatedAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        // §106: één familie van lege staten — status, één regel, één deur.
        statuses.length || show.length ? (
          <LegeStaat icon="filter" zin={words.emptyFilter} soort="filter">
            <Link className="btn btn-small" href="/cases">
              {words.emptyFilterClear}
            </Link>
          </LegeStaat>
        ) : (
          <LegeStaat
            icon="folder"
            zin={words.emptyCases}
            uitleg={fill(words.emptyCasesWhy, { dossier: words.case })}
            soort="dossiers"
          >
            <DossierDeur label={fill(words.emptyCasesGo, { dossier: words.case })} />
          </LegeStaat>
        )
      )}
    </div>
  );
}
