import Link from 'next/link';
import { MentionText } from '@/components/ui/MentionPopover';
import { ShortChips } from '@/components/ui/ShortChips';
import { shortChipsFor } from '@/lib/entries/shortRefs';
import { LivePage } from '@/components/live/LivePage';
import { Icon } from '@/components/Icon';
import { NewFamilyTreeButton } from '@/components/families/NewFamilyTreeButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { relativeTime } from '@/lib/diff';
import { listFamilyTrees } from '@/lib/families/service';
import { readMany, readOne, type ListParams } from '@/lib/listParams';
import { capitalise, fill } from '@/lib/words';
import { LegeStaat } from '@/components/ui/LegeStaat';
import { MaakDeur } from '@/components/eerste-keer/Deuren';

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
    <div className="page-wide">
      <LivePage place="page:/stambomen" watch={['family_trees', 'cases']} />
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div>
          <p className="eyebrow">Wie van wie afstamt</p>
          <h1 style={{ margin: 0 }}>{words.navFamilyTrees}</h1>
        </div>
        <div className="spacer" />
        <NewFamilyTreeButton />
      </div>

      {/* §106 (na review 4, M8): geen sorteerbalk boven een lijst zonder één regel. */}
      {(trees.length > 0 || filtering) && (
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
      )}

      {trees.length ? (
        // §98: the omschrijvingen's chips, for this reader, with the page.
        <ShortChips map={shortChipsFor(user, trees.map((item) => item.description))}>
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
                    {tree.description && (
                      <>
                        {' · '}
                        <MentionText text={tree.description} flat tokens />
                      </>
                    )}
                  </span>
                </span>
                <span className="tiny muted">{relativeTime(tree.updatedAt)}</span>
                <Icon name="chevron" size={16} />
              </Link>
            </li>
          ))}
        </ul>
        </ShortChips>
      ) : (
        // §106: één familie van lege staten — status, één regel, één deur.
        filtering ? (
          <LegeStaat icon="filter" zin={words.emptyFilter} soort="filter">
            <Link className="btn btn-small" href="/stambomen">
              {words.emptyFilterClear}
            </Link>
          </LegeStaat>
        ) : (
          <LegeStaat
            icon="tree"
            zin={fill(words.emptyTrees, { stamboom: words.familyTree })}
            uitleg={fill(words.emptyTreesWhy, { artikelen: words.entryPlural, stamboom: words.familyTree })}
            soort="stambomen"
          >
            <MaakDeur icon="tree" label={fill(words.emptyTreesGo, { stamboom: words.familyTree })} />
          </LegeStaat>
        )
      )}
    </div>
  );
}
