import { notFound } from 'next/navigation';
import { EntryCard } from '@/components/EntryCard';
import { Icon } from '@/components/Icon';
import { NewOfTypeButton } from '@/components/NewOfTypeButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { getSessionUser } from '@/lib/auth/session';
import { readListFilters, wikiFilterGroups, WIKI_SORTS } from '@/lib/entries/browseFilters';
import { browseEntries, getEntryType, listTagsWithCounts } from '@/lib/entries/service';
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

  const tags = listTagsWithCounts(user, typeSlug);
  const filters = readListFilters(query, user);
  const entries = browseEntries(user, { ...filters, typeSlug, limit: 200 });

  return (
    <div className="page-wide">
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <Icon name={type.icon} size={22} style={{ color: type.colour }} />
        <h1 style={{ margin: 0 }}>{type.label}</h1>
        <div className="spacer" />
        <NewOfTypeButton typeSlug={type.slug} />
      </div>
      <p className="muted small">
        {entries.length} {entries.length === 1 ? 'fiche' : 'fiches'}
      </p>

      <SortFilterBar sorts={WIKI_SORTS} defaultSort="recent" groups={wikiFilterGroups(tags, user)} />

      {entries.length ? (
        <div className="card-grid">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} showType={false} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <p style={{ margin: 0 }}>Nog niets onder {type.label.toLowerCase()}.</p>
        </div>
      )}
    </div>
  );
}
