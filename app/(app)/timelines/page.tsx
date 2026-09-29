import Link from 'next/link';
import { MentionText } from '@/components/ui/MentionPopover';
import { ShortChips } from '@/components/ui/ShortChips';
import { shortChipsFor } from '@/lib/entries/shortRefs';
import { LivePage } from '@/components/live/LivePage';
import { Icon } from '@/components/Icon';
import { NewTimelineButton } from '@/components/timelines/NewTimelineButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { relativeTime } from '@/lib/diff';
import { readMany, readOne, type ListParams } from '@/lib/listParams';
import { listTimelines } from '@/lib/timelines/service';
import { SCALE_LABELS } from '@/lib/timelines/time';
import { capitalise, fill } from '@/lib/words';
import { LegeStaat } from '@/components/ui/LegeStaat';
import { MaakDeur } from '@/components/eerste-keer/Deuren';

export const dynamic = 'force-dynamic';

const SORTS = ['recent', 'name', 'created', 'size'] as const;
const WHERE = ['loose', 'case'] as const;
const SHOW = ['mine', 'restricted'] as const;

/** §32: the shelf of tijdlijnen. Anyone makes one; the sort-and-filter bar is the prikborden's. */
export default async function TimelinesPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await requireViewer();
  const query = await searchParams;
  const words = getWords();
  const sort = readOne(query, 'sort', SORTS, 'recent') as (typeof SORTS)[number];
  const where = readOne(query, 'where', WHERE, '') as '' | (typeof WHERE)[number];
  const show = readMany(query, 'show', SHOW);
  const filtering = Boolean(where) || show.length > 0;

  const timelines = listTimelines(user, {
    sort,
    where: where || undefined,
    mine: show.includes('mine') && user ? user.id : undefined,
    privateOnly: show.includes('restricted') || undefined,
  });

  // "Zet op een andere tijdlijn…" from an artikel: carry the artikel along to
  // whichever tijdlijn is opened next, which then opens the date form for it.
  const placeRaw = query.place;
  const place = Array.isArray(placeRaw) ? placeRaw[0] : placeRaw;
  const nameRaw = query.name;
  const placeName = Array.isArray(nameRaw) ? nameRaw[0] : nameRaw;
  const href = (slug: string) =>
    place ? `/timelines/${slug}?place=${encodeURIComponent(place)}&name=${encodeURIComponent(placeName ?? '')}` : `/timelines/${slug}`;

  return (
    <div className="page-wide">
      <LivePage place="page:/timelines" watch={['timelines', 'cases']} />
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div>
          <p className="eyebrow">Wanneer wat gebeurde</p>
          <h1 style={{ margin: 0 }}>{words.navTimelines}</h1>
        </div>
        <div className="spacer" />
        <NewTimelineButton />
      </div>
      {place && placeName && (
        <p className="small" style={{ margin: '0 0 0.6rem', padding: '0.5rem 0.7rem', border: '1px solid var(--rule)', background: 'var(--paper-raised)' }}>
          <Icon name="crosshair" size={14} /> Kies de {words.timeline} waar <strong>{placeName}</strong> op moet.
        </p>
      )}

      {/* §106 (na review 4, M8): geen sorteerbalk boven een lijst zonder één regel. */}
      {(timelines.length > 0 || filtering) && (
        <SortFilterBar
          sorts={[
            { value: 'recent', label: 'Laatst veranderd' },
            { value: 'name', label: 'Op naam' },
            { value: 'created', label: 'Nieuwste eerst' },
            { value: 'size', label: `Meeste ${words.eventPlural}` },
          ]}
          defaultSort="recent"
          summary={`${timelines.length} ${timelines.length === 1 ? words.timeline : words.timelinePlural}`}
          groups={[
            {
              key: 'where',
              label: 'Waar',
              options: [
                { value: 'loose', label: 'Los', icon: 'timeline' },
                { value: 'case', label: `Bij een ${words.case}`, icon: 'folder' },
              ],
            },
            {
              key: 'show',
              label: 'Alleen',
              options: [
                { value: 'mine', label: 'Van mij', icon: 'you' },
                { value: 'restricted', label: 'Privé of gekozen personen', icon: 'lock' },
              ],
            },
          ]}
        />
      )}

      {timelines.length ? (
        // §98: the omschrijvingen's chips, for this reader, with the page.
        <ShortChips map={shortChipsFor(user, timelines.map((item) => item.description))}>
        <ul className="timeline-shelf" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {timelines.map((timeline) => (
            <li key={timeline.id} style={{ borderBottom: '1px solid var(--rule)' }}>
              <Link href={href(timeline.slug)} className="row timeline-shelf-row" style={{ color: 'inherit', textDecoration: 'none', padding: '0.7rem 0' }}>
                <Icon name="timeline" size={20} style={{ color: 'var(--ink-muted)', flex: '0 0 auto' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block' }}>
                    {timeline.name}
                    {timeline.viewMode !== 'all' && (
                      <Icon name="lock" size={12} style={{ marginLeft: '0.3rem', color: 'var(--ink-muted)' }} />
                    )}
                  </span>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {SCALE_LABELS[timeline.scale]}
                    {' · '}
                    {timeline.eventCount ?? 0} {(timeline.eventCount ?? 0) === 1 ? words.event : words.eventPlural}
                    {timeline.caseName && <> · {capitalise(words.case)}: {timeline.caseName}</>}
                    {timeline.description && (
                      <>
                        {' · '}
                        <MentionText text={timeline.description} flat tokens />
                      </>
                    )}
                  </span>
                </span>
                <span className="tiny muted">{relativeTime(timeline.updatedAt)}</span>
                <Icon name="chevron" size={16} />
              </Link>
            </li>
          ))}
        </ul>
        </ShortChips>
      ) : (
        // §106: één familie van lege staten — status, één regel, één deur.
        filtering ? (
          <LegeStaat icon="filter" zin={words.emptyFilter} soort="filter">
            <Link className="btn btn-small" href="/timelines">
              {words.emptyFilterClear}
            </Link>
          </LegeStaat>
        ) : (
          <LegeStaat
            icon="timeline"
            zin={fill(words.emptyTimelines, { tijdlijn: words.timeline })}
            uitleg={words.emptyTimelinesWhy}
            soort="tijdlijnen"
          >
            <MaakDeur icon="timeline" label={fill(words.emptyTimelinesGo, { tijdlijn: words.timeline })} />
          </LegeStaat>
        )
      )}
    </div>
  );
}
