import Link from 'next/link';
import { Icon } from '@/components/Icon';
import type { ListParams } from '@/lib/listParams';

/**
 * The wiki's soorten as one row of tabs. Navigation, not a filter — each tab is
 * its own page — but the sort and the filters that are on travel along in the
 * query string, so switching soort keeps them.
 *
 * §75 put one tab in front of the rest: **Start**, the wiki's front door
 * (`/wiki`), with "Alles" — the browse list this row has always led with —
 * moving one place along to `/wiki/alles`. That order is the whole navigation
 * idea of round 38 in one line: you land on something written by a person, and
 * the sorted list of everything is one click away rather than the first thing
 * you meet. Start carries no count, on purpose: an overzicht counts nothing,
 * and a number beside it would invite the reader to read it as a soort.
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
  startLabel = 'Start',
}: {
  types: TypeTab[];
  /**
   * Which tab is the page you are on: a soort's slug, `'alles'` for the browse
   * list, `'start'` for the front door, or null for a page that is in the wiki
   * but is none of those (an overzicht that is not home).
   */
  active: string | null;
  allCount: number;
  /** The current search params, carried along to every tab. */
  query: ListParams;
  allLabel?: string;
  startLabel?: string;
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
      {/* §75: de voordeur. Geen telling — een overzicht telt niets. */}
      <Link
        className="type-tab"
        href={href('/wiki')}
        aria-current={active === 'start' ? 'page' : undefined}
      >
        <Icon name="home" size={14} />
        {startLabel}
      </Link>
      <Link
        className="type-tab"
        href={href('/wiki/alles')}
        aria-current={active === 'alles' ? 'page' : undefined}
      >
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
