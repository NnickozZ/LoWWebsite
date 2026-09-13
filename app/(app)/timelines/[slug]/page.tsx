import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
/*
 * §62: the tijdlijn's own stylesheet, brought in by the one page that is a
 * tijdlijn rather than pasted into `app/globals.css` — which is where every
 * round collides. Next hoists it into the page's own CSS chunk.
 */
import '@/app/timelines.css';
import { inArray } from 'drizzle-orm';
import { LivePage } from '@/components/live/LivePage';
import { Icon } from '@/components/Icon';
import { ConnectionsLink } from '@/components/web/ConnectionsLink';
import { TimelineCanvas } from '@/components/timelines/TimelineCanvas';
import { KeeperPanelServer } from '@/components/keeper/KeeperPanelServer';
import { KeeperStamp } from '@/components/keeper/KeeperStamp';
import { sideOf } from '@/lib/keeper/kinds';
import { isKeeperSide, keeperRef, queryTail, sideDetour } from '@/lib/keeper/side';
import { twinOf } from '@/lib/keeper/ties';
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

  /*
   * §50: the page decides where you stand. The query rides along — `?place=`
   * is a gebeurtenis waiting to be made, and losing it would drop the thing
   * the person came here to do.
   */
  const detour = sideDetour(user, isKeeperSide('timeline', timeline.id), `/timelines/${timeline.slug}${queryTail(query)}`);
  if (detour) redirect(detour);

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
        {/* §62: the canvas draws its own hands, in the axis's own coordinates
            — a fraction of the main column means nothing to somebody standing
            at another zoom. `watch={['entries']}` stays: §59's hold is what
            makes it harmless, because nothing lands while a hand is on the
            axis. */}
        <LivePage place={timelineKey(timeline.id)} watch={['entries']} pointers={false} />
        <header className="canvas-head">
          {/* §44/§45/§46: which side this tijdlijn is on — the word and the
              colours. §57: and where the toggle goes from here, with the list
              kept apart from the tweeling so a flip that lands on it can say
              why. */}
          <KeeperStamp
            side={sideOf(Boolean(user?.isKeeper && keeperRef('timeline', timeline.id, user)?.keeperOnly))}
            flipTo={twinOf('timeline', timeline.id, user)?.href}
            flipList="/timelines"
          />
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
          {/* §43: the web, with this tijdlijn in the middle. */}
          <ConnectionsLink kind="timeline" id={timeline.id} />
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
      {/*
       * §44: the Keeper's corner. The tijdlijn keeps its own settings in the
       * Instellingen sheet, but this is not a setting of the axis — it is the
       * second face of it, what it is roped to, and the notes the pair share —
       * so it stands below the fold where a landkaart's does, and a player's
       * page is still nothing but the canvas.
       */}
      {user?.isKeeper && (
        <div className="keeper-underfold">
          <KeeperPanelServer kind="timeline" id={timeline.id} user={user} />
        </div>
      )}
    </div>
  );
}
