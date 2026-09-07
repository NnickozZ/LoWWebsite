import Link from 'next/link';
import { mapKey } from '@/lib/live/keys';
import { LivePage } from '@/components/live/LivePage';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ConnectionsLink } from '@/components/web/ConnectionsLink';
import { MapCanvas } from '@/components/maps/MapCanvas';
import { MapKeeperTools } from '@/components/maps/MapKeeperTools';
import { KeeperPanelServer } from '@/components/keeper/KeeperPanelServer';
import { KeeperStamp } from '@/components/keeper/KeeperStamp';
import { sideOf } from '@/lib/keeper/kinds';
import { keeperRef } from '@/lib/keeper/side';
import { twinOf } from '@/lib/keeper/ties';
import { accessSettings, canManageAccess } from '@/lib/access';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { presenceColour } from '@/lib/boards/live';
import { displayNames, windowPresenceName } from '@/lib/characters';
import { db, schema } from '@/lib/db';
import { getMapBySlug, listMaps, listMapsPinningMap, listPins } from '@/lib/maps/service';
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
  // §40: a landkaart this viewer's dial does not allow is a 404, not a locked
  // door — the same answer a private artikel or dossier gives at its own URL.
  const map = getMapBySlug(slug, user);
  if (!map) notFound();

  const words = getWords();
  const pins = listPins(map.id, user);

  /*
   * §39: the landkaarten a speld on this one may point at — every one this
   * viewer may see, minus this one, which a speld may not stand on and open.
   * Handed over whole, the way a prikbord hands `pickableMaps` to its canvas:
   * the list is short, the filtering is a fuzzy match in the sheet, and a
   * second search road would be a second set of rules about who may see what.
   */
  // §46: `bothSides` — a picker on a record's own page, not a list.
  const pickableMaps = listMaps(user, { bothSides: true })
    .filter((other) => other.id !== map.id)
    .map((other) => ({ id: other.id, name: other.name }));

  /*
   * §39: the way back up — the landkaarten carrying a speld that opens this
   * one. Derived on every read, never stored, so it is there the moment
   * somebody pins this plattegrond on the map of the town and gone the moment
   * they pull that speld. Without it a map three levels down is a dead end.
   */
  const pinnedOn = listMapsPinningMap(map.id, user);

  // §17: may this viewer turn the landkaart's dials — the owner (unbolted), or
  // a Keeper. Only a Keeper ever hangs one, so in practice this is the Keepers.
  const mayManage = canManageAccess(map, user);

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
          {/* §44/§45/§46: which side this landkaart is on — the word, the
              colours, and the browser's side, so a link followed across turns
              the site over with you. */}
          <KeeperStamp
            side={sideOf(Boolean(user?.isKeeper && keeperRef('map', map.id, user)?.keeperOnly))}
            browserSide={user?.isKeeper ? user.side : undefined}
            flipTo={twinOf('map', map.id, user)?.href ?? '/maps'}
          />
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
          {/* §39: the chip back up, beside the §23 one. "Op de grotere
              landkaart: Zeeland" — a plattegrond with no way out is a dead
              end, and the browser's Back button is not always on a phone. */}
          {pinnedOn.length > 0 && (
            <p className="small canvas-head-of">
              Op de grotere {words.map}:{' '}
              {pinnedOn.map((parent, index) => (
                <span key={parent.id}>
                  {index > 0 && ', '}
                  <Link href={`/maps/${parent.slug}`}>{parent.name}</Link>
                </span>
              ))}
            </p>
          )}
          {map.description && <p className="small muted canvas-head-desc">{map.description}</p>}
          {/* §43: the web, with this landkaart in the middle. */}
          <ConnectionsLink kind="map" id={map.id} />
        </header>

        <MapCanvas
          liveUser={{ name: liveName, colour: presenceColour(user?.id ?? '') }}
          map={map}
          initialPins={pins}
          pickableMaps={pickableMaps}
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
          /*
           * §17: the landkaart's two dials, handed over the same way a prikbord
           * and a tijdlijn hand theirs over — the full settings for whoever may
           * turn them, and the modes alone for everyone else, so a reader never
           * learns *who* was chosen.
           */
          access={{
            settings:
              mayManage || map.accessLocked
                ? accessSettings(map, 'map', map.id)
                : {
                    ownerId: null,
                    viewMode: map.viewMode,
                    editMode: map.editMode,
                    locked: map.accessLocked,
                    viewers: [],
                    editors: [],
                  },
            canManage: mayManage,
            isKeeper: Boolean(user?.isKeeper),
            viewerId: user?.id ?? '',
          }}
        />
      )}
      {/*
       * §44: the Keeper's corner, under the rest of their tools and below the
       * fold with them — the switch to the other face of this landkaart, the
       * "this map is mine" toggle, its touwtjes and the shared notes. A
       * landkaart never had keeper notes before; it has the same ones as an
       * artikel now, and a twin shares one text with its other face.
       */}
      {user?.isKeeper && (
        <div className="keeper-underfold">
          <KeeperPanelServer kind="map" id={map.id} user={user} />
        </div>
      )}
    </div>
  );
}
