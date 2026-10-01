import Link from 'next/link';
import { LivePage } from '@/components/live/LivePage';
import { Thumb } from '@/components/Cover';
import { TypeTabs } from '@/components/TypeTabs';
import { MentionText } from '@/components/ui/MentionPopover';
import { LegeStaat } from '@/components/ui/LegeStaat';
import { roomFeedPhrase } from '@/components/kamer/plekWords';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { attributed, type Attributed } from '@/lib/characters';
import { countEntriesPerType, listEntryTypes, recentActivity, type FeedItem } from '@/lib/entries/service';
import { visibleNamesOf } from '@/lib/kamers/service';
import type { ListParams } from '@/lib/listParams';
import { groupByDay, timeOf } from '@/lib/wiki/geschiedenis';
import { moreHref, readPagina } from '@/lib/wiki/pagina';
import type { Words } from '@/lib/words';

export const dynamic = 'force-dynamic';

const VERBS: Record<string, string> = {
  'entry.created': 'begon aan',
  'entry.edited': 'bewerkte',
  'entry.deleted': 'verwijderde',
  'entry.restored': 'herstelde',
  'entry.restored_revision': 'herstelde een eerdere versie van',
  'entry.section_revealed': 'onthulde iets in',
};

/** Hoeveel regels er per stap staan; *Meer* legt de volgende eronder (`lib/wiki/pagina.ts`). */
const PER = 60;

/**
 * Golf O: de geschiedenis van de wiki.
 *
 * *Sinds je laatste bezoek* stond tot golf O naast het welkom op Start. Nick
 * haalde het daar weg (*"'recent' things … are just not it"*) en wilde het
 * terug als een tab van de wiki. Dezelfde lezing (`recentActivity`, achter
 * `visibleEntryCondition`, de kant (§46) en `roomRowCondition` (§101)), dezelfde
 * zinnen (§18b: het karakter, met het account als tip; §90: wiens kamer), maar
 * per dag, met het uur erbij, en wat er na je vorige bezoek gebeurde met een
 * stempeltje *Nieuw*.
 */
export default async function WikiGeschiedenisPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await requireViewer();
  const query = await searchParams;
  const words = getWords();

  const types = listEntryTypes();
  const perType = countEntriesPerType(user);
  const total = [...perType.values()].reduce((n, count) => n + count, 0);

  const pagina = readPagina(query, PER);
  // Eén meer dan er staan, om te weten of *Meer* iets brengt.
  const read = attributed(recentActivity(user, pagina.shown + 1));
  const feed = read.slice(0, pagina.shown);
  const more = read.length > pagina.shown;
  // §90 (E21): wiens kamer een `room.*`-regel noemt, zoals deze kijker hem mag zien.
  const roomOwners = visibleNamesOf(
    feed.filter((item) => item.verb.startsWith('room.')).map((item) => item.characterId),
    user,
  );
  const lastSeen = user?.lastSeenAt ?? 0;
  const days = groupByDay(feed);

  return (
    <div className="page-wide">
      <LivePage place="page:/wiki/geschiedenis" watch={['feed', 'entries', 'types', 'words']} />
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div>
          <p className="eyebrow">De wiki</p>
          <h1 style={{ margin: 0 }}>{words.wikiHistory}</h1>
        </div>
      </div>
      <TypeTabs
        types={types.map((type) => ({
          slug: type.slug,
          label: type.label,
          icon: type.icon,
          colour: type.colour,
          count: perType.get(type.id) ?? 0,
        }))}
        active="geschiedenis"
        allCount={total}
        query={{}}
      />
      <p className="muted geschiedenis-lead">{words.wikiHistoryLead}</p>

      {feed.length === 0 ? (
        <LegeStaat icon="clock" zin={words.emptyFeed} uitleg={words.emptyFeedWhy} soort="geschiedenis" />
      ) : (
        <div className="geschiedenis" data-testid="wiki-geschiedenis">
          {days.map((day) => (
            <section key={day.key} className="geschiedenis-dag" aria-labelledby={`dag-${day.key}`}>
              <h2 id={`dag-${day.key}`} className="geschiedenis-dag-kop">
                <span>{day.label}</span>
              </h2>
              <ul className="geschiedenis-rijen">
                {day.items.map((item) => (
                  <li key={item.id}>
                    <Link href={`/e/${item.entry!.slug}`} className="feed-item geschiedenis-rij" data-entry-id={item.entry!.id}>
                      <Thumb
                        assetId={item.entry!.coverAssetId}
                        crop={item.entry!.coverCrop}
                        shape="portrait"
                        icon={item.entry!.typeIcon}
                        colour={item.entry!.typeColour}
                      />
                      <span className="geschiedenis-tekst">
                        <span className="small geschiedenis-zin">
                          <Zin item={item} words={words} roomOwners={roomOwners} />
                        </span>
                        {item.entry!.shortDescription && (
                          <span className="tiny muted clamp-2 geschiedenis-lead-regel">
                            {/* §48: flat chips — the whole row is a link. */}
                            <MentionText text={item.entry!.shortDescription} flat tokens />
                          </span>
                        )}
                      </span>
                      <span className="geschiedenis-tijd tiny muted">
                        {lastSeen > 0 && item.createdAt > lastSeen && (
                          <span className="geschiedenis-nieuw">{words.wikiHistoryNew}</span>
                        )}
                        <time dateTime={new Date(item.createdAt * 1000).toISOString()}>{timeOf(item.createdAt)}</time>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {more && (
            <p className="geschiedenis-meer">
              <Link className="btn" href={moreHref('/wiki/geschiedenis', query, pagina)}>
                {words.listMore}
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type Item = FeedItem & Attributed;

/** Eén regel: wie, wat, en welk artikel — zoals Start hem tot golf O zei. */
function Zin({ item, words, roomOwners }: { item: Item; words: Words; roomOwners: Map<string, string> }) {
  const who = (
    <strong title={item.actorAccount ?? undefined}>{item.actorLabel ?? 'Iemand'}</strong>
  );
  // §106 (na review 4, M7): een speler die aanschuift, is zelf het onderwerp.
  if (item.verb === 'character.added') {
    return item.actorIsKeeper ? (
      <>
        {who} {words.feedCast} <strong>{item.entry!.name}</strong>
      </>
    ) : (
      <>
        <strong title={item.actorAccount ?? undefined}>{item.entry!.name}</strong> {words.feedSatDown}
      </>
    );
  }
  const room = roomFeedPhrase(
    item.verb,
    item.characterId ? (roomOwners.get(item.characterId) ?? null) : null,
    !item.actorIsKeeper,
    words,
  );
  if (room) {
    return (
      <>
        {who} {room.verb}
        {/* §103 golf H (D26): in de eigen kamer staat de naam er niet nog eens. */}
        {!room.bare && (
          <>
            {' '}
            <strong>{item.entry!.name}</strong>
          </>
        )}{' '}
        {room.tail}
      </>
    );
  }
  return (
    <>
      {who} {VERBS[item.verb] ?? 'wijzigde'} <strong>{item.entry!.name}</strong>
    </>
  );
}
