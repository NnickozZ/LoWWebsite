import { EntryCard } from '@/components/EntryCard';
import { NewOfTypeButton } from '@/components/NewOfTypeButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { TypeTabs } from '@/components/TypeTabs';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { browseEntries, countEntriesPerType, listEntryTypes, listTagsWithCounts } from '@/lib/entries/service';
import { readListFilters, wikiFilterGroups, WIKI_SORTS } from '@/lib/entries/browseFilters';
import type { ListParams } from '@/lib/listParams';

export const dynamic = 'force-dynamic';

/**
 * The wiki: one row of soorten to browse by, one toolbar to sort and filter
 * with, and the cards. Two rows between the title and the first card, where
 * there were six (5 Sep 2026).
 */
export default async function WikiPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await getSessionUser();
  const query = await searchParams;
  const words = getWords();

  const types = listEntryTypes();
  const perType = countEntriesPerType(user);
  const tags = listTagsWithCounts(user);
  const filters = readListFilters(query, user);
  const entries = browseEntries(user, { ...filters, limit: 120 });
  const total = [...perType.values()].reduce((n, count) => n + count, 0);

  return (
    <div className="page-wide">
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div>
          <p className="eyebrow">Bladeren</p>
          <h1 style={{ margin: 0 }}>De wiki</h1>
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
        active={null}
        allCount={total}
        query={query}
      />

      <SortFilterBar
        sorts={WIKI_SORTS}
        defaultSort="recent"
        groups={wikiFilterGroups(tags, user)}
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
