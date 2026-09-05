import Link from 'next/link';
import { Icon } from '@/components/Icon';
import type { ListParams } from '@/lib/listParams';

/**
 * The wiki's soorten as one row of tabs: "Alles", then every soort with how
 * many of it this viewer may see. Navigation, not a filter — each tab is its
 * own page (`/wiki`, `/wiki/[type]`) — but the sort and the filters that are
 * on travel along in the query string, so switching soort keeps them.
 *
 * On a desktop the row wraps; on a phone it scrolls sideways under the thumb.
 */
export type TypeTab = {
  slug: string;
  label: string;
  icon: string;
  colour: string;
  count: number;
};

export function TypeTabs({
  types,
  active,
  allCount,
  query,
  allLabel = 'Alles',
}: {
  types: TypeTab[];
  /** The slug of the current page, or null on the all-soorten page. */
  active: string | null;
  allCount: number;
  /** The current search params, carried along to every tab. */
  query: ListParams;
  allLabel?: string;
}) {
  const carried = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) carried.set(key, value);
  }
  const qs = carried.toString();
  const href = (path: string) => (qs ? `${path}?${qs}` : path);

  return (
    <nav className="type-tabs" aria-label="Soorten">
      <Link className="type-tab" href={href('/wiki')} aria-current={active === null ? 'page' : undefined}>
        <Icon name="book" size={14} />
        {allLabel}
        <span className="type-tab-count">{allCount}</span>
      </Link>
      {types.map((type) => (
        <Link
          key={type.slug}
          className="type-tab"
          href={href(`/wiki/${type.slug}`)}
          aria-current={active === type.slug ? 'page' : undefined}
        >
          <Icon name={type.icon} size={14} style={{ color: type.colour }} />
          {type.label}
          <span className="type-tab-count">{type.count}</span>
        </Link>
      ))}
    </nav>
  );
}
