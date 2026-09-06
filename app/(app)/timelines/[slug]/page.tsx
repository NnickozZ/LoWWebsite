import Link from 'next/link';
import { notFound } from 'next/navigation';
import { inArray } from 'drizzle-orm';
import { LivePage } from '@/components/live/LivePage';
import { Icon } from '@/components/Icon';
import { TimelineCanvas } from '@/components/timelines/TimelineCanvas';
import { accessSettings, canEdit, canManageAccess, grantFor } from '@/lib/access';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { presenceColour } from '@/lib/boards/live';
import { displayNames, windowPresenceName } from '@/lib/characters';
import { db, schema } from '@/lib/db';
import { timelineKey } from '@/lib/live/keys';
import { getTimelineBySlug, listEvents } from '@/lib/timelines/service';
import { inkForViewer } from '@/lib/ink/merge';
import { getInk } from '@/lib/ink/service';

export const dynamic = 'force-dynamic';

/**
 * §32: one tijdlijn. The gebeurtenissen are read here, behind the tijdlijn's
 * own rule and `visibleEntryCondition`, so an artikel a player may not see is
 * not on their tijdlijn either.
 */
export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const { slug } = await params;
  const query = await searchParams;
  const timeline = getTimelineBySlug(slug, user);
  if (!timeline) notFound();

  const words = getWords();
  const events = listEvents(timeline.id, user);

  // §17: may this viewer touch it, and may they turn its dials.
  const grant = user ? grantFor('timeline', timeline.id, user.id) : null;
  const mayEdit = canEdit(timeline, user, grant);
  const mayManage = canManageAccess(timeline, user);

  // §18: who set each gebeurtenis, by the name they wear.
  const setters = [...new Set([...events.flatMap((e) => (e.createdBy ? [e.createdBy] : [])), ...(user ? [user.id] : [])])];
  const people = setters.length
    ? db
        .select({ id: schema.users.id, username: schema.users.username, isKeeper: schema.users.isKeeper })
        .from(schema.users)
        .where(inArray(schema.users.id, setters))
        .all()
    : [];
  const names = displayNames(people, words.keeper);
  const peopleNames = Object.fromEntries([...names.entries()].map(([id, n]) => [id, n.label]));

  /*
   * §21 vs §11: one list of people, two jobs. `peopleNames` is attribution —
   * who set this gebeurtenis — and stays a feed: a Keeper is the Keeper's
   * word. The live name is presence — who is standing here — where the word is
   * not a name, so a Keeper is their account.
   */
  const liveName = windowPresenceName(user, words.keeper);

  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
  const place = one(query.place);
  const placeName = one(query.name);
  const focus = one(query.event);

  return (
    <div className="page-wide timeline-page">
      {/*
       * §34: the tijdlijn takes the screen, like a landkaart. The heading is
       * one wrapping line and the axis has everything under it. There is no
       * Keeper's block below the fold here: a tijdlijn's own settings, its
       * dials and the tekenlaag's switch are all in the Instellingen sheet.
       */}
      <div className="page-canvas">
        <LivePage place={timelineKey(timeline.id)} watch={['entries']} />
        <header className="canvas-head">
          <p className="eyebrow">
            <Link href="/timelines" style={{ color: 'inherit' }}>
              <Icon name="chevron" size={12} style={{ transform: 'rotate(180deg)' }} /> {words.navTimelines}
            </Link>
            {timeline.caseSlug && timeline.caseName && (
              <>
                {' · '}
                <Link href={`/c/${timeline.caseSlug}`} style={{ color: 'inherit' }}>
                  <Icon name="folder" size={12} /> {timeline.caseName}
                </Link>
              </>
            )}
          </p>
          <h1 data-testid="timeline-title">{timeline.name}</h1>
          {timeline.description && <p className="small muted canvas-head-desc">{timeline.description}</p>}
        </header>

        <TimelineCanvas
          timeline={timeline}
          initialEvents={events}
          canEdit={mayEdit}
          viewerId={user?.id ?? ''}
          isKeeper={Boolean(user?.isKeeper)}
          peopleNames={peopleNames}
          liveUser={{ name: liveName, colour: presenceColour(user?.id ?? '') }}
          access={{
            settings:
              mayManage || timeline.accessLocked
                ? accessSettings(timeline, 'timeline', timeline.id)
                : {
                    ownerId: null,
                    viewMode: timeline.viewMode,
                    editMode: timeline.editMode,
                    locked: timeline.accessLocked,
                    viewers: [],
                    editors: [],
                  },
            canManage: mayManage,
          }}
          placing={place ? { entryId: place, name: placeName } : null}
          focusEventId={focus || null}
          initialInk={inkForViewer(getInk(timeline.id), user?.id ?? null)}
        />
      </div>
    </div>
  );
}
