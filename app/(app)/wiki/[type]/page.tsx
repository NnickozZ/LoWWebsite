import { notFound } from 'next/navigation';
import { typePagePlace } from '@/lib/live/keys';
import { LivePage } from '@/components/live/LivePage';
import { EntryCard } from '@/components/EntryCard';
import { NewOfTypeButton } from '@/components/NewOfTypeButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { TypeTabs } from '@/components/TypeTabs';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { readListFilters, wikiFilterGroups, WIKI_SORTS } from '@/lib/entries/browseFilters';
import {
  browseEntries,
  countEntriesPerType,
  getEntryType,
  listEntryTypes,
  listTagsWithCounts,
} from '@/lib/entries/service';
import type { ListParams } from '@/lib/listParams';

export const dynamic = 'force-dynamic';

export default async function BrowseTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<ListParams>;
}) {
  const user = await getSessionUser();
  const { type: typeSlug } = await params;
  const query = await searchParams;

  const type = getEntryType(typeSlug);
  if (!type) notFound();
  const words = getWords();

  const types = listEntryTypes();
  const perType = countEntriesPerType(user);
  const tags = listTagsWithCounts(user, typeSlug);
  const filters = readListFilters(query, user);
  const entries = browseEntries(user, { ...filters, typeSlug, limit: 200 });
  const total = [...perType.values()].reduce((n, count) => n + count, 0);

  return (
    <div className="page-wide">
      <LivePage place={typePagePlace(type.slug)} watch={['entries', 'types']} />
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div>
          <p className="eyebrow">De wiki</p>
          <h1 style={{ margin: 0 }}>{type.label}</h1>
        </div>
        <div className="spacer" />
        <NewOfTypeButton typeSlug={type.slug} />
      </div>

      <TypeTabs
        types={types.map((item) => ({
          slug: item.slug,
          label: item.label,
          icon: item.icon,
          colour: item.colour,
          count: perType.get(item.id) ?? 0,
        }))}
        active={type.slug}
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
            <EntryCard key={entry.id} entry={entry} showType={false} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <p style={{ margin: 0 }}>
            {filters.tag || filters.mine || filters.restricted || filters.onMap || filters.visibility
              ? 'Niets voldoet aan deze filters.'
              : `Nog niets onder ${type.label.toLowerCase()}.`}
          </p>
        </div>
      )}
    </div>
  );
}
