import Link from 'next/link';
import { Icon } from '@/components/Icon';
import type { ListParams } from '@/lib/listParams';
import { MeerSoorten } from './MeerSoorten';
import { Schuifrij } from './Schuifrij';
import { MENU_RANG, rangSoorten } from '@/lib/wiki/tabrij';

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
 * One row at every width (§104, golf H): the soorten that do not fit are in
 * *Meer soorten*, and the row scrolls under the thumb if a long name still
 * does not fit.
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
  moreLabel = 'Meer soorten',
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
  /** §104 (golf H, D6): the menu at the end of the row, with the soorten that are not in it. */
  moreLabel?: string;
}) {
  const carried = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    // §104 (#14): how far down one list you had read is that list's, not the next tab's.
    if (value && !NOT_CARRIED.has(key)) carried.set(key, value);
  }
  const qs = carried.toString();
  const href = (path: string) => (qs ? `${path}?${qs}` : path);

  /*
   * §104 (golf H, D6): één rij. Tot hier stonden alle soorten als tabs op drie
   * rijen (21 tabs, 130 px, met een onderlijn die per rij afbrak). Nu: Start,
   * Alles, de soorten met de meeste artikelen, en *Meer soorten ▾* met de rest
   * en hun tellingen. Welke soorten in de rij staan, is een rang (`rangSoorten`);
   * hoeveel er passen, zegt de stylesheet per breedte (`data-rang`,
   * app/leeskamer.css), zodat de server de goede rij rendert en er niets
   * verspringt. De soort waar je op staat heeft rang 0 en staat er altijd. Past
   * de rij toch niet (een lange naam), dan scrolt hij, met een zachte rand.
   */
  const { rang, nodigTot } = rangSoorten(types, active);
  // The menu holds every soort but the one you are on; those that the row
  // shows at this width are hidden in it by the same `data-rang`.
  const inMenu = types.filter((type) => rang.get(type.slug) !== 0);
  const zichtbaar = (type: TypeTab) => rang.has(type.slug);

  return (
    <nav className="type-tabs-rij" aria-label="Soorten">
      <Schuifrij className="type-tabs">
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
        {/* Golf K: the voordeur has this same row. Until now it had Start, Alles
            and *De soorten*, a tab that only scrolled to the tiles under it —
            on a computer, where the tiles are already in view, it lit up on
            hover and then did nothing (Nick: "hoverable maar niet
            clickable"). One row, the same on every page of the wiki: every
            tab in it is a page. */}
        {types.filter(zichtbaar).map((type) => (
            <Link
              key={type.slug}
              /* §104 (#16): a soort with nothing in it on this side is there, and quiet. */
              className={`type-tab${type.count ? '' : ' is-leeg'}`}
              href={href(`/wiki/${type.slug}`)}
              aria-current={active === type.slug ? 'page' : undefined}
              data-rang={rang.get(type.slug)}
            >
              {/* §104 (#9): the soort's colour, mixed towards the ink (`.soort-inkt`). */}
              <Icon name={type.icon} size={14} className="soort-inkt" style={{ ['--soort' as string]: type.colour }} />
              {type.label}
              <span className="type-tab-count">{type.count}</span>
            </Link>
          ))}
      </Schuifrij>
      {inMenu.length > 0 && (
        <MeerSoorten
          label={moreLabel}
          nodigTot={nodigTot}
          items={inMenu.map((type) => ({
            slug: type.slug,
            label: type.label,
            icon: type.icon,
            colour: type.colour,
            count: type.count,
            href: href(`/wiki/${type.slug}`),
            rang: rang.get(type.slug) ?? MENU_RANG,
          }))}
        />
      )}
    </nav>
  );
}
