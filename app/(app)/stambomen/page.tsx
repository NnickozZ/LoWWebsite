import Link from 'next/link';
import { LivePage } from '@/components/live/LivePage';
import { Icon } from '@/components/Icon';
import { NewFamilyTreeButton } from '@/components/families/NewFamilyTreeButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { relativeTime } from '@/lib/diff';
import { listFamilyTrees } from '@/lib/families/service';
import { readMany, readOne, type ListParams } from '@/lib/listParams';
import { capitalise } from '@/lib/words';

export const dynamic = 'force-dynamic';

const SORTS = ['recent', 'name', 'created'] as const;
const WHERE = ['loose', 'case'] as const;
const SHOW = ['mine', 'restricted'] as const;

/**
 * §66: de plank met stambomen. Anyone makes one; the sort-and-filter bar is the
 * tijdlijnen's, minus "size" — a stamboom's size is a per-viewer count and
 * sorting a shelf by a number that differs per reader reads as a bug.
 */
export default async function FamilyTreesPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await requireViewer();
  const query = await searchParams;
  const words = getWords();
  const sort = readOne(query, 'sort', SORTS, 'recent') as (typeof SORTS)[number];
  const where = readOne(query, 'where', WHERE, '') as '' | (typeof WHERE)[number];
  const show = readMany(query, 'show', SHOW);
  const filtering = Boolean(where) || show.length > 0;

  const trees = listFamilyTrees(user, {
    sort,
    where: where || undefined,
    mine: show.includes('mine') && user ? user.id : undefined,
    privateOnly: show.includes('restricted') || undefined,
  });

  return (
    <div className="page">
      <LivePage place="page:/stambomen" watch={['family_trees', 'cases']} />
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div>
          <p className="eyebrow">Wie van wie afstamt</p>
          <h1 style={{ margin: 0 }}>{words.navFamilyTrees}</h1>
        </div>
        <div className="spacer" />
        <NewFamilyTreeButton />
      </div>

      <SortFilterBar
        sorts={[
          { value: 'recent', label: 'Laatst veranderd' },
          { value: 'name', label: 'Op naam' },
          { value: 'created', label: 'Nieuwste eerst' },
        ]}
        defaultSort="recent"
        summary={`${trees.length} ${trees.length === 1 ? words.familyTree : words.familyTreePlural}`}
        groups={[
          {
            key: 'where',
            label: 'Waar',
            options: [
              { value: 'loose', label: 'Los', icon: 'tree' },
              { value: 'case', label: `Bij een ${words.case}`, icon: 'folder' },
            ],
          },
          {
            key: 'show',
            label: 'Alleen',
            options: [
              { value: 'mine', label: 'Van mij', icon: 'you' },
              { value: 'restricted', label: 'Privé of gekozen personen', icon: 'lock' },
            ],
          },
        ]}
      />

      {trees.length ? (
        <ul className="tree-shelf" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {trees.map((tree) => (
            <li key={tree.id} style={{ borderBottom: '1px solid var(--rule)' }}>
              <Link
                href={`/stambomen/${tree.slug}`}
                className="row tree-shelf-row"
                style={{ color: 'inherit', textDecoration: 'none', padding: '0.7rem 0' }}
              >
                <Icon name="tree" size={20} style={{ color: 'var(--ink-muted)', flex: '0 0 auto' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block' }}>
                    {tree.name}
                    {/* §17: the stamp every shelf wears when a thing is not for everybody. */}
                    {tree.viewMode !== 'all' && (
                      <Icon name="lock" size={12} style={{ marginLeft: '0.3rem', color: 'var(--ink-muted)' }} />
                    )}
                  </span>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {tree.memberCount ?? 0} {(tree.memberCount ?? 0) === 1 ? 'persoon' : 'personen'}
                    {tree.caseName && (
                      <>
                        {' · '}
                        {capitalise(words.case)}: {tree.caseName}
                      </>
                    )}
                    {tree.description && <> · {tree.description}</>}
                  </span>
                </span>
                <span className="tiny muted">{relativeTime(tree.updatedAt)}</span>
                <Icon name="chevron" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p style={{ margin: 0 }}>
            {filtering
              ? `Geen ${words.familyTree} die hieraan voldoet.`
              : `Nog geen ${words.familyTreePlural}. Maak er een, of open een ${words.case} en begin daar.`}
          </p>
          <p className="small" style={{ margin: '0.4rem 0 0' }}>
            Wie familie van wie is staat op de {words.entryPlural} zelf, in velden als Ouders, Kinderen en Partner. Een{' '}
            {words.familyTree} tekent wat daar staat — en houdt losse kaartjes bij voor wie nog geen {words.entry} heeft.
          </p>
        </div>
      )}
    </div>
  );
}
