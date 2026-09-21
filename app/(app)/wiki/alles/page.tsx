import { EntryCard } from '@/components/EntryCard';
import { LivePage } from '@/components/live/LivePage';
import { NewOfTypeButton } from '@/components/NewOfTypeButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { TypeTabs } from '@/components/TypeTabs';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import {
  browseEntries,
  countEntriesPerType,
  listEntryTypes,
  listTagsWithCounts,
  nameTheirCases,
} from '@/lib/entries/service';
import { readListFilters, wikiFilterGroups, WIKI_SORTS } from '@/lib/entries/browseFilters';
import type { ListParams } from '@/lib/listParams';

export const dynamic = 'force-dynamic';

/**
 * §75: alles in de wiki — één rij soorten om langs te bladeren, één balk om te
 * sorteren en te filteren, en de kaartjes.
 *
 * Deze pagina stond tot ronde 38 op `/wiki` zelf. Daar staat nu de voordeur
 * (het thuisoverzicht); dit is waar je heen gaat als je wilt *bladeren* in
 * plaats van rondgeleid worden, en het is het tweede tabblad in `TypeTabs`.
 * Alleen het adres is veranderd: de sorteringen, de filters en de kaartjes zijn
 * regel voor regel wat ze waren, en de `?sort=`/`?tag=` die iemand had
 * opgeslagen werken nog precies zo.
 */
export default async function WikiAllesPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await requireViewer();
  const query = await searchParams;
  const words = getWords();

  const types = listEntryTypes();
  const perType = countEntriesPerType(user);
  const tags = listTagsWithCounts(user);
  const filters = readListFilters(query, user);
  // §24: with the dossier each case-bound artikel was made in, for whoever
  // may see that dossier.
  const entries = nameTheirCases(browseEntries(user, { ...filters, limit: 120 }), user);
  const total = [...perType.values()].reduce((n, count) => n + count, 0);

  return (
    <div className="page-wide">
      <LivePage place="page:/wiki/alles" watch={['entries', 'types']} />
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div>
          <p className="eyebrow">Bladeren</p>
          <h1 style={{ margin: 0 }}>Alles in de wiki</h1>
        </div>
        <div className="spacer" />
        <NewOfTypeButton />
      </div>

      <TypeTabs
        types={types.map((type) => ({
          slug: type.slug,
          label: type.label,
          icon: type.icon,
          colour: type.colour,
          count: perType.get(type.id) ?? 0,
        }))}
        active="alles"
        allCount={total}
        query={query}
      />

      <SortFilterBar
        sorts={WIKI_SORTS}
        defaultSort="recent"
        groups={wikiFilterGroups(tags, user, filters.tag)}
        summary={`${entries.length} ${entries.length === 1 ? words.entry : words.entryPlural}`}
      />

      {entries.length ? (
        <div className="card-grid">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <div className="empty">
          {filters.tag || filters.mine || filters.restricted || filters.onMap || filters.visibility
            ? 'Niets voldoet aan deze filters.'
            : 'Daaronder is nog niets opgeborgen.'}
        </div>
      )}
    </div>
  );
}
