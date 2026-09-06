import Link from 'next/link';
import { mapKey } from '@/lib/live/keys';
import { LivePage } from '@/components/live/LivePage';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { MapCanvas } from '@/components/maps/MapCanvas';
import { MapKeeperTools } from '@/components/maps/MapKeeperTools';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { presenceColour } from '@/lib/boards/live';
import { displayNames, windowPresenceName } from '@/lib/characters';
import { db, schema } from '@/lib/db';
import { getMapBySlug, listPins } from '@/lib/maps/service';
import { visibleEntryCondition } from '@/lib/entries/visibility';
import { and, eq, inArray } from 'drizzle-orm';
import { inkForViewer } from '@/lib/ink/merge';
import { getInk } from '@/lib/ink/service';

export const dynamic = 'force-dynamic';

/**
 * §19: one map. The pins are read here, behind `visibleEntryCondition`, so a
 * fiche a player may not see is not on their map either.
 */
export default async function MapPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser();
  const { slug } = await params;
  const map = getMapBySlug(slug);
  if (!map) notFound();

  const words = getWords();
  const pins = listPins(map.id, user);

  // §23: the artikel this map is a map *of*, if it is of one — read behind the
  // ordinary entry visibility rule, so a map of a Keeper-only place does not
  // name it to a player who happens to be looking at the drawing.
  const ofEntry = map.entryId
    ? (db
        .select({ id: schema.entries.id, name: schema.entries.name, slug: schema.entries.slug })
        .from(schema.entries)
        .where(and(eq(schema.entries.id, map.entryId), visibleEntryCondition(user)))
        .get() ?? null)
    : null;

  // §18: who set each pin, by the name they wear.
  // The viewer is in the list too, so a pin they set just now has a name at once.
  const setters = [...new Set([...pins.flatMap((p) => (p.createdBy ? [p.createdBy] : [])), ...(user ? [user.id] : [])])];
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
   * who set this speld — and stays a feed: a Keeper is the Keeper's word. The
   * live name is presence — who is standing here — where the word is not a
   * name, so a Keeper is their account.
   */
  const liveName = windowPresenceName(user, words.keeper);

  return (
    <div className="page-wide">
      {/*
       * §34: the map takes the screen. Everything that used to stand above it
       * — the eyebrow, the name, what it is a map of, the description — is one
       * wrapping line now (`.canvas-head`), and the canvas has the rest.
       */}
      <div className="page-canvas">
        <LivePage place={mapKey(map.id)} watch={['entries']} pointers={false} />
        <header className="canvas-head">
          <p className="eyebrow">
            <Link href="/maps" style={{ color: 'inherit' }}>
              <Icon name="chevron" size={12} style={{ transform: 'rotate(180deg)' }} /> {words.navMaps}
            </Link>
          </p>
          <h1>{map.name}</h1>
          {ofEntry && (
            <p className="small canvas-head-of">
              De {words.map} van <Link href={`/e/${ofEntry.slug}`}>{ofEntry.name}</Link>
            </p>
          )}
          {map.description && <p className="small muted canvas-head-desc">{map.description}</p>}
        </header>

        <MapCanvas
          liveUser={{ name: liveName, colour: presenceColour(user?.id ?? '') }}
          map={map}
          initialPins={pins}
          initialInk={inkForViewer(getInk(map.id), user?.id ?? null)}
          viewerId={user?.id ?? ''}
          isKeeper={Boolean(user?.isKeeper)}
          peopleNames={peopleNames}
        />
      </div>

      {/* The Keeper's tools are below the fold: a landkaart is looked at far
          more often than it is re-hung. The empty div is where `MapCanvas`
          puts the tekenlaag switch — it is a tool like the rest of them, and
          inside the canvas column it was 132 px off the map on a telephone.
          Both are Keeper-only, so a player's page is still nothing but the
          canvas and does not scroll (`.page-canvas:last-child`). */}
      {user?.isKeeper && <div id="map-underfold" />}
      {user?.isKeeper && (
        <MapKeeperTools
          map={map}
          ofEntry={
            ofEntry
              ? { id: ofEntry.id, name: ofEntry.name, slug: ofEntry.slug }
              : null
          }
        />
      )}
    </div>
  );
}
