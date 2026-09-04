import Link from 'next/link';
import { EntryCard } from '@/components/EntryCard';
import { Icon } from '@/components/Icon';
import { TagBar } from '@/components/TagBar';
import { getSessionUser } from '@/lib/auth/session';
import { browseEntries, listEntryTypes, listTagsWithCounts } from '@/lib/entries/service';

export const dynamic = 'force-dynamic';

export default async function WikiPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; sort?: string }>;
}) {
  const user = await getSessionUser();
  const query = await searchParams;
  const sort = query.sort === 'name' ? 'name' : 'recent';

  const types = listEntryTypes();
  const tags = listTagsWithCounts(user);
  const entries = browseEntries(user, { tag: query.tag, sort, limit: 120 });

  return (
    <div className="page-wide">
      <p className="eyebrow">Bladeren</p>
      <h1>De wiki</h1>

      <div className="chip-strip" style={{ margin: '0.8rem 0 1rem' }}>
        {types.map((type) => (
          <Link key={type.slug} className="chip chip-selectable" href={`/wiki/${type.slug}`}>
            <Icon name={type.icon} size={14} style={{ color: type.colour }} />
            {type.label}
          </Link>
        ))}
      </div>

      <TagBar tags={tags} activeTag={query.tag} sort={sort} basePath="/wiki" />

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
