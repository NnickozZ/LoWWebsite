import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { MapCanvas } from '@/components/maps/MapCanvas';
import { MapKeeperTools } from '@/components/maps/MapKeeperTools';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { displayNames } from '@/lib/characters';
import { db, schema } from '@/lib/db';
import { getMapBySlug, listPins } from '@/lib/maps/service';
import { inArray } from 'drizzle-orm';

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

  return (
    <div className="page-wide">
      <div className="row" style={{ marginBottom: '0.4rem', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            <Link href="/maps" style={{ color: 'inherit' }}>
              <Icon name="chevron" size={12} style={{ transform: 'rotate(180deg)' }} /> {words.navMaps}
            </Link>
          </p>
          <h1 style={{ margin: 0 }}>{map.name}</h1>
          {map.description && (
            <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
              {map.description}
            </p>
          )}
        </div>
      </div>

      <MapCanvas
        map={map}
        initialPins={pins}
        viewerId={user?.id ?? ''}
        isKeeper={Boolean(user?.isKeeper)}
        peopleNames={peopleNames}
      />

      {user?.isKeeper && <MapKeeperTools map={map} />}
    </div>
  );
}
