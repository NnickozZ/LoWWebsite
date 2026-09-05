import Link from 'next/link';
import { LivePage } from '@/components/live/LivePage';
import { assetUrl } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { NewMapButton } from '@/components/maps/NewMapButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { relativeTime } from '@/lib/diff';
import { readMany, readOne, type ListParams } from '@/lib/listParams';
import { listMaps } from '@/lib/maps/service';
import { capitalise } from '@/lib/words';

export const dynamic = 'force-dynamic';

const SORTS = ['order', 'name', 'recent', 'created'] as const;

/** §19: the shelf of maps. The Keeper hangs them; everyone opens them. */
export default async function MapsPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await getSessionUser();
  const query = await searchParams;
  const words = getWords();
  const sort = readOne(query, 'sort', SORTS, 'order') as (typeof SORTS)[number];
  const mine = readMany(query, 'show', ['mine']).includes('mine');

  const maps = listMaps(user, { sort, mine: mine && user ? user.id : undefined });

  // "Zet op een andere landkaart…" from a fiche: carry the fiche along to
  // whichever map is opened next, which then starts in placing mode.
  const placeRaw = query.place;
  const place = Array.isArray(placeRaw) ? placeRaw[0] : placeRaw;
  const nameRaw = query.name;
  const placeName = Array.isArray(nameRaw) ? nameRaw[0] : nameRaw;
  const mapHref = (slug: string) =>
    place ? `/maps/${slug}?place=${encodeURIComponent(place)}&name=${encodeURIComponent(placeName ?? '')}` : `/maps/${slug}`;

  return (
    <div className="page-wide">
      <LivePage place="page:/maps" watch={['maps']} />
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div>
          <p className="eyebrow">Het eiland</p>
          <h1 style={{ margin: 0 }}>{words.navMaps}</h1>
        </div>
        <div className="spacer" />
        {user?.isKeeper && <NewMapButton />}
      </div>
      {place && placeName && (
        <p className="small" style={{ margin: '0 0 0.6rem', padding: '0.5rem 0.7rem', border: '1px solid var(--rule)', background: 'var(--paper-raised)' }}>
          <Icon name="crosshair" size={14} /> Kies de {words.map} waar <strong>{placeName}</strong> op moet.
        </p>
      )}

      <SortFilterBar
        sorts={[
          { value: 'order', label: 'Volgorde van de Keeper' },
          { value: 'name', label: 'Op naam' },
          { value: 'recent', label: 'Laatst veranderd' },
          { value: 'created', label: 'Nieuwste eerst' },
        ]}
        defaultSort="order"
        summary={`${maps.length} ${maps.length === 1 ? words.map : words.mapPlural}`}
        groups={[
          {
            key: 'show',
            label: 'Alleen',
            options: [{ value: 'mine', label: `Met mijn ${words.mapPinPlural}`, icon: 'mapPin' }],
          },
        ]}
      />

      {maps.length ? (
        <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {maps.map((map) => (
            <Link key={map.id} className="card" href={mapHref(map.slug)}>
              <div className="map-card-picture">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(map.assetId, 'card')} alt="" loading="lazy" />
              </div>
              <div className="card-body">
                <p className="card-name">{map.name}</p>
                {map.description && (
                  <p className="tiny muted clamp-2" style={{ margin: 0 }}>
                    {map.description}
                  </p>
                )}
                <p className="tiny muted" style={{ margin: '0.4rem 0 0', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Icon name="mapPin" size={13} />
                  {map.pinCount ?? 0} {(map.pinCount ?? 0) === 1 ? words.mapPin : words.mapPinPlural}
                  <span className="spacer" />
                  {relativeTime(map.updatedAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">
          <p style={{ margin: 0 }}>
            {mine ? `Je hebt nog nergens een ${words.mapPin} gezet.` : `Er hangt nog geen ${words.map}.`}
          </p>
          <p className="small" style={{ margin: '0.4rem 0 0' }}>
            {user?.isKeeper
              ? `Hang er een op met '${capitalise(words.map)} ophangen': een scan of tekening is genoeg. Daarna kan iedereen er ${words.entryPlural} en ${words.note}s op prikken.`
              : `De ${words.keeper} hangt de ${words.mapPlural} op. Zodra er een hangt, kun je er ${words.entryPlural} en ${words.note}s op prikken.`}
          </p>
        </div>
      )}
    </div>
  );
}
