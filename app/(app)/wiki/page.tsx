import Link from 'next/link';
import { EntryCard } from '@/components/EntryCard';
import { Icon } from '@/components/Icon';
import { SortFilterBar } from '@/components/SortFilterBar';
import { getSessionUser } from '@/lib/auth/session';
import { browseEntries, listEntryTypes, listTagsWithCounts } from '@/lib/entries/service';
import { readListFilters, wikiFilterGroups, WIKI_SORTS } from '@/lib/entries/browseFilters';
import type { ListParams } from '@/lib/listParams';

export const dynamic = 'force-dynamic';

export default async function WikiPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await getSessionUser();
  const query = await searchParams;

  const types = listEntryTypes();
  const tags = listTagsWithCounts(user);
  const filters = readListFilters(query, user);
  const entries = browseEntries(user, { ...filters, limit: 120 });

  return (
    <div className="page-wide">
      <p className="eyebrow">Bladeren</p>
      <h1>De wiki</h1>

      <div className="chip-strip" style={{ margin: '0.8rem 0 0.4rem' }}>
        {types.map((type) => (
          <Link key={type.slug} className="chip chip-selectable" href={`/wiki/${type.slug}`}>
            <Icon name={type.icon} size={14} style={{ color: type.colour }} />
            {type.label}
          </Link>
        ))}
      </div>

      <SortFilterBar sorts={WIKI_SORTS} defaultSort="recent" groups={wikiFilterGroups(tags, user)} />

      {entries.length ? (
        <div className="card-grid">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <div className="empty">Daaronder is nog niets opgeborgen.</div>
      )}
    </div>
  );
}
