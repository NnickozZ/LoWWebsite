import Link from 'next/link';
import { LivePage } from '@/components/live/LivePage';
import { Icon } from '@/components/Icon';
import { NewTimelineButton } from '@/components/timelines/NewTimelineButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { relativeTime } from '@/lib/diff';
import { readMany, readOne, type ListParams } from '@/lib/listParams';
import { listTimelines } from '@/lib/timelines/service';
import { SCALE_LABELS } from '@/lib/timelines/time';
import { capitalise } from '@/lib/words';

export const dynamic = 'force-dynamic';

const SORTS = ['recent', 'name', 'created', 'size'] as const;
const WHERE = ['loose', 'case'] as const;
const SHOW = ['mine', 'restricted'] as const;

/** §32: the shelf of tijdlijnen. Anyone makes one; the sort-and-filter bar is the prikborden's. */
export default async function TimelinesPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await getSessionUser();
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
    <div className="page">
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

      {timelines.length ? (
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
                    {timeline.description && <> · {timeline.description}</>}
                  </span>
                </span>
                <span className="tiny muted">{relativeTime(timeline.updatedAt)}</span>
                <Icon name="chevron" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p style={{ margin: 0 }}>
            {filtering ? `Geen ${words.timeline} die hieraan voldoet.` : `Er is nog geen ${words.timeline}.`}
          </p>
          <p className="small" style={{ margin: '0.4rem 0 0' }}>
            Een {words.timeline} is een as in jaren, dagen of minuten, met {words.eventPlural} erop: {words.entryPlural} uit het
            archief, of losse aantekeningen die alleen daar bestaan.
          </p>
        </div>
      )}
    </div>
  );
}
