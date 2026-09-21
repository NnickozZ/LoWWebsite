import Link from 'next/link';
import { Thumb } from '@/components/Cover';
import { roomFeedPhrase } from '@/components/kamer/plekWords';
import { MentionText } from '@/components/ui/MentionPopover';
import { attributed } from '@/lib/characters';
import { relativeTime } from '@/lib/diff';
import type { FeedItem } from '@/lib/entries/service';
import type { Viewer } from '@/lib/entries/visibility';
import { visibleNamesOf } from '@/lib/kamers/service';
import type { Words } from '@/lib/words';

/**
 * The same verbs the Start reads them with. A copy on purpose: the map is one
 * page's prose about its own rows, not a service, and the two pages are free
 * to say it differently. If a third page ever needs it, that is the moment it
 * becomes a module, not before.
 */
const VERBS: Record<string, string> = {
  'entry.created': 'begon aan',
  'entry.edited': 'bewerkte',
  'entry.deleted': 'verwijderde',
  'entry.restored': 'herstelde',
  'entry.restored_revision': 'herstelde een eerdere versie van',
  'entry.section_revealed': 'onthulde iets in',
};

/**
 * §77, panel 4: the last handful of lines this account wrote.
 *
 * The rows come from `recentActivity`, the Start's own feed, so every §9/§17
 * rule and §46's side already applies — this panel narrows that list to one
 * actor and never asks the database a question of its own. §18b: the headline
 * is `attributed()`'s label, the karakter the row was written as, and the
 * account name is the tooltip. A speler is not their username.
 */
export function BijdragenPanel({ rows, viewer, words }: { rows: FeedItem[]; viewer: Viewer; words: Words }) {
  if (rows.length === 0) {
    return (
      <p className="small muted" style={{ margin: 0 }}>
        Nog niets opgeborgen.
      </p>
    );
  }

  // §18: every row names the karakter it was written as, exactly as the Start
  // does. The account name stays one tooltip away.
  const named = attributed(rows);
  // §90 (E21): de kamerhandelingen lezen als wat ze zijn, met de naam van de
  // kamer zoals deze kijker hem mag zien.
  const owners = visibleNamesOf(
    rows.filter((row) => row.verb.startsWith('room.')).map((row) => row.characterId),
    viewer,
  );

  return (
    <>
      <ul className="speler-feed">
        {named.map((row) => (
          <li key={row.id}>
            <Link href={`/e/${row.entry!.slug}`} className="feed-item speler-feed-row">
              <Thumb
                assetId={row.entry!.coverAssetId}
                crop={row.entry!.coverCrop}
                shape="portrait"
                icon={row.entry!.typeIcon}
                colour={row.entry!.typeColour}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="small" style={{ display: 'block' }}>
                  <strong title={row.actorAccount ?? undefined}>{row.actorLabel ?? 'Iemand'}</strong>{' '}
                  {(() => {
                    const room = roomFeedPhrase(
                      row.verb,
                      row.characterId ? (owners.get(row.characterId) ?? null) : null,
                      !row.actorIsKeeper,
                      words,
                    );
                    return room ? (
                      <>
                        {room.verb} <strong>{row.entry!.name}</strong> {room.tail}
                      </>
                    ) : (
                      <>
                        {VERBS[row.verb] ?? 'wijzigde'} <strong>{row.entry!.name}</strong>
                      </>
                    );
                  })()}
                </span>
                <span className="tiny muted clamp-2" style={{ display: 'block' }}>
                  {/* §48: flat chips — the whole row is a link. */}
                  <MentionText text={row.entry!.shortDescription} flat />
                </span>
                <span className="tiny muted" style={{ display: 'block' }}>
                  {relativeTime(row.createdAt)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {/*
        §85: hier stond een deur naar `/`.
        
        §77's regel is dat een paneel een samenvatting met een deur is — en de
        tweede helft daarvan is dat er niets in een paneel staat dat geen eigen
        pagina heeft. De bijdragen van één persoon hebben die niet: de Start is
        de feed van *iedereen*, dus die deur beloofde "meer hiervan" en gaf je
        iets anders. Een deur naar een plek die niet van het onderwerp is, is
        erger dan geen deur, dus er staat er nu geen — tot er een pagina is die
        wél alleen deze persoon laat zien.
      */}
    </>
  );
}
