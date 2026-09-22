import { notFound } from 'next/navigation';
import { typePagePlace } from '@/lib/live/keys';
import { LivePage } from '@/components/live/LivePage';
import { EntryCard } from '@/components/EntryCard';
import { NewOfTypeButton } from '@/components/NewOfTypeButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { TypeTabs } from '@/components/TypeTabs';
import { WikiViewToggle } from '@/components/WikiViewToggle';
import { tagListHref } from '@/lib/entries/tagHref';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { readListFilters, wikiFilterGroups, WIKI_SORTS } from '@/lib/entries/browseFilters';
import {
  browseEntries,
  countEntriesPerType,
  getEntryType,
  listEntryTypes,
  listTagsWithCounts,
  nameTheirCases,
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
  const user = await requireViewer();
  const { type: typeSlug } = await params;
  const query = await searchParams;

  const type = getEntryType(typeSlug);
  if (!type) notFound();
  const words = getWords();

  const types = listEntryTypes();
  const perType = countEntriesPerType(user);
  const tags = listTagsWithCounts(user, typeSlug);
  const filters = readListFilters(query, user);
  const entries = nameTheirCases(browseEntries(user, { ...filters, typeSlug, limit: 200 }), user);
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
        {/* §49: every soort has its own button again. §24 took this one away
            from a soort that "only exists inside a dossier"; a clue made here
            simply has no dossier in front of its name — and says so, with the
            same grey chip the wiki has always used for a loose end. */}
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

      {/*
        §92 (F31): the tags of this soort as one row that scrolls sideways,
        straight under the tabs — on a phone they were behind "Filters" and a
        "Klaar". The same `?tag=` the filter writes (§12), from `tagListHref`
        (§90), and the chosen one says so. The filter sheet keeps them too.
      */}
      {tags.length > 0 && (
        <nav className="wiki-tag-row" aria-label={words.wikiTagRow}>
          {tags.map((item) => {
            const on = filters.tag === item.tag;
            return (
              <a
                key={item.tag}
                className={`tag${on ? ' tag-active' : ''}`}
                href={on ? `/wiki/${encodeURIComponent(type.slug)}` : tagListHref(item.tag, type.slug)}
                aria-current={on ? 'true' : undefined}
              >
                {item.tag}
              </a>
            );
          })}
        </nav>
      )}

      <SortFilterBar
        sorts={WIKI_SORTS}
        defaultSort="recent"
        groups={wikiFilterGroups(tags, user, filters.tag)}
        summary={`${entries.length} ${entries.length === 1 ? words.entry : words.entryPlural}`}
      />

      {entries.length > 0 && <WikiViewToggle target="wiki-entries" />}

      {entries.length ? (
        /* §92 (F31): one line per artikel on a phone, cards elsewhere — the
           default is the stylesheet's, a choice is `data-view`. */
        <div className="card-grid wiki-entries" id="wiki-entries">
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
