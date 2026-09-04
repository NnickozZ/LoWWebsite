import Link from 'next/link';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { NewCaseButton } from '@/components/cases/NewCaseButton';
import { getSessionUser } from '@/lib/auth/session';
import { countEntriesPerCase, listCases } from '@/lib/cases/service';
import { relativeTime } from '@/lib/diff';

export const dynamic = 'force-dynamic';

const ORDER = { open: 0, cold: 1, closed: 2 } as const;
const STATUS_LABELS = { open: 'open', cold: 'koud', closed: 'gesloten' } as const;

export default async function CasesPage() {
  const user = await getSessionUser();
  const cases = listCases(user);
  const counts = countEntriesPerCase(
    cases.map((c) => c.id),
    user,
  );

  const sorted = [...cases].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || b.updatedAt - a.updatedAt,
  );

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
                {item.visibility === 'assigned' && (
                  <span
                    className="stamp"
                    style={{ position: 'absolute', bottom: 8, right: 8, background: 'var(--paper)' }}
                  >
                    Vertrouwelijk
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
          <p style={{ margin: 0 }}>Nog geen dossiers.</p>
          <p className="small" style={{ margin: '0.4rem 0 0' }}>
            Een dossier hoort bij één onderzoek — een naam en één regel samenvatting zijn genoeg om
            te beginnen.
          </p>
        </div>
      )}
    </div>
  );
}
