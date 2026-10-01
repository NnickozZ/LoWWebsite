import Link from 'next/link';
import { Icon } from '@/components/Icon';
import type { ListParams } from '@/lib/listParams';
import { getWords } from '@/lib/admin/words';

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
 * Golf N (Nick, 30 september): every soort is a tab, always. Golf H had one
 * row with the biggest soorten and the rest behind *Meer soorten ▾*; Nick:
 * "I dislike very much … either show all of them at the same time or make it
 * scrollable. Not this half solution which is super confusing." He chose all
 * of them: the row wraps onto a second (and third) row when they do not fit,
 * and nothing is hidden anywhere.
 */
/** Query keys that belong to the page they were set on (§104: the list's *Meer*). */
const NOT_CARRIED = new Set(['pagina', 'per']);

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
   * list, `'start'` for the front door, `'geschiedenis'` for what happened
   * (golf O), or null for a page that is in the wiki
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
    // §104 (#14): how far down one list you had read is that list's, not the next tab's.
    if (value && !NOT_CARRIED.has(key)) carried.set(key, value);
  }
  const qs = carried.toString();
  const href = (path: string) => (qs ? `${path}?${qs}` : path);

  return (
    <nav className="type-tabs-rij" aria-label="Soorten">
      <div className="type-tabs type-tabs-alle">
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
        {/* Golf O: wat er in de wiki gebeurde, per dag — *Sinds je laatste
            bezoek* van Start, hier als een pagina van de wiki. Geen telling:
            een geschiedenis telt geen soort. */}
        <Link
          className="type-tab"
          href="/wiki/geschiedenis"
          aria-current={active === 'geschiedenis' ? 'page' : undefined}
          data-testid="tab-geschiedenis"
        >
          <Icon name="clock" size={14} />
          {getWords().wikiHistory}
        </Link>
        {/* Golf K: the voordeur has this same row. Until now it had Start, Alles
            and *De soorten*, a tab that only scrolled to the tiles under it —
            on a computer, where the tiles are already in view, it lit up on
            hover and then did nothing (Nick: "hoverable maar niet
            clickable"). One row, the same on every page of the wiki: every
            tab in it is a page. */}
        {types.map((type) => (
            <Link
              key={type.slug}
              /* §104 (#16): a soort with nothing in it on this side is there, and quiet. */
              className={`type-tab${type.count ? '' : ' is-leeg'}`}
              href={href(`/wiki/${type.slug}`)}
              aria-current={active === type.slug ? 'page' : undefined}
            >
              {/* §104 (#9): the soort's colour, mixed towards the ink (`.soort-inkt`). */}
              <Icon name={type.icon} size={14} className="soort-inkt" style={{ ['--soort' as string]: type.colour }} />
              {type.label}
              <span className="type-tab-count">{type.count}</span>
            </Link>
          ))}
      </div>
    </nav>
  );
}
