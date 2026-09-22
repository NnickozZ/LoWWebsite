import Link from 'next/link';
import { LivePage } from '@/components/live/LivePage';
import { eq } from 'drizzle-orm';
import { Thumb } from '@/components/Cover';
import { EntryCard } from '@/components/EntryCard';
import { Icon } from '@/components/Icon';
import { MentionText } from '@/components/ui/MentionPopover';
import { roomFeedPhrase } from '@/components/kamer/plekWords';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { listBoards } from '@/lib/boards/service';
import { attributed } from '@/lib/characters';
import { relativeTime } from '@/lib/diff';
import { db, schema } from '@/lib/db';
import { countEntriesPerCase, listCases } from '@/lib/cases/service';
import { browseEntries, countEntriesPerType, recentActivity } from '@/lib/entries/service';
import { defaultIntro, introParagraphs } from '@/lib/intro';
import { listFamilyTrees } from '@/lib/families/service';
import { listMaps } from '@/lib/maps/service';
import { purseOf, visibleNamesOf } from '@/lib/kamers/service';
import { activeCharacter } from '@/lib/characters';
import { OWN_WORK_SCAN, ownRecentWork } from '@/lib/home/jij';
import { Beurs } from '@/components/kamer/Beurs';
import { MEANING } from '@/components/kamer/plekWords';
import { capitalise, fill } from '@/lib/words';

export const dynamic = 'force-dynamic';

const VERBS: Record<string, string> = {
  'entry.created': 'begon aan',
  'entry.edited': 'bewerkte',
  'entry.deleted': 'verwijderde',
  'entry.restored': 'herstelde',
  'entry.restored_revision': 'herstelde een eerdere versie van',
  'entry.section_revealed': 'onthulde iets in',
};

/**
 * Start (5 Sep 2026): a welcome in the Keeper's words with the archive's
 * numbers, the open dossiers and the latest artikelen down the middle, and
 * "Sinds je laatste bezoek" beside it — a sidebar on a desktop, the second
 * block on a phone. The welcome is the one thing a newcomer sees first, so it
 * says what this place is and where to begin.
 */
export default async function HomePage() {
  const user = await requireViewer();
  const words = getWords();
  const settings = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).get();

  // §18: every row names the character the person is wearing now.
  const feed = attributed(recentActivity(user, 30));
  // §90 (E21): wiens kamer een `room.*`-regel noemt, zoals deze kijker hem mag zien.
  const roomOwners = visibleNamesOf(
    feed.filter((item) => item.verb.startsWith('room.')).map((item) => item.characterId),
    user,
  );
  const recent = browseEntries(user, { limit: 12, sort: 'recent' });
  const openCases = listCases(user, { status: 'open' }).slice(0, 6);
  const counts = countEntriesPerCase(
    openCases.map((item) => item.id),
    user,
  );

  // The numbers: only what this viewer may see, like every count here.
  const entryCount = [...countEntriesPerType(user).values()].reduce((n, count) => n + count, 0);
  const caseCount = listCases(user).length;
  const boardCount = listBoards(user).length;
  const mapCount = listMaps(user).length;
  // §66: and the stambomen, beside the walls and the landkaarten. On a phone
  // this line is the way in — the tab bar was full at eight.
  const familyTreeCount = listFamilyTrees(user).length;
  // §90: every number is a door to its own list — DECISIONS (round 31) names
  // this line as the phone's way into a stamboom, and until round 51 it was
  // plain text.
  const numbers = [
    [entryCount, words.entry, words.entryPlural, '/wiki/alles'],
    [caseCount, words.case, words.casePlural, '/cases'],
    [boardCount, words.board, words.boardPlural, '/boards'],
    [mapCount, words.map, words.mapPlural, '/maps'],
    [familyTreeCount, words.familyTree, words.familyTreePlural, '/stambomen'],
  ] as const;

  /*
   * §91: de Jij-rij — wie je speelt, je saldo als deur naar de kamer, de
   * winkel, en de laatste drie dingen die jíj schreef. Uit de feed van Start
   * zelf (`ownRecentWork`), dus met de zichtbaarheidsregel van deze kijker en
   * niets dat hij niet mag zien (rule 1). De Keeper draagt niemand (§18): hij
   * krijgt zijn eigen laatste drie en de deuren Beheer en Uitdelen.
   */
  const purse = purseOf(user);
  const worn = user && !user.isKeeper ? activeCharacter(user.id) : null;
  const ownWork = user && (purse || user.isKeeper) ? ownRecentWork(recentActivity(user, OWN_WORK_SCAN), user.id) : [];

  const intro = introParagraphs(settings?.intro?.trim() ? settings.intro : defaultIntro(words));

  const lastSeen = user?.lastSeenAt ?? 0;
  const firstOldIndex = feed.findIndex((item) => item.createdAt <= lastSeen);
  const hasNew = firstOldIndex !== 0 && feed.length > 0 && lastSeen > 0;
  // Eight rows in view; the rest fold away so a phone does not scroll past
  // thirty of them to reach the dossiers.
  const FEED_SHOWN = 8;
  const feedRow = (item: (typeof feed)[number], index: number) => (
    <li key={item.id}>
      {hasNew && index === firstOldIndex && <p className="since-divider">Eerder</p>}
      <Link href={`/e/${item.entry!.slug}`} className="feed-item" style={{ color: 'inherit', textDecoration: 'none' }}>
        <Thumb
          assetId={item.entry!.coverAssetId}
          crop={item.entry!.coverCrop}
          shape="portrait"
          icon={item.entry!.typeIcon}
          colour={item.entry!.typeColour}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="small" style={{ display: 'block' }}>
            <strong title={item.actorAccount ?? undefined}>{item.actorLabel ?? 'Iemand'}</strong>{' '}
            {(() => {
              const room = roomFeedPhrase(
                item.verb,
                item.characterId ? (roomOwners.get(item.characterId) ?? null) : null,
                !item.actorIsKeeper,
                words,
              );
              return room ? (
                <>
                  {room.verb} <strong>{item.entry!.name}</strong> {room.tail}
                </>
              ) : (
                <>
                  {VERBS[item.verb] ?? 'wijzigde'} <strong>{item.entry!.name}</strong>
                </>
              );
            })()}
          </span>
          <span className="tiny muted clamp-2" style={{ display: 'block' }}>
            {/* §48: flat chips — the whole row is a link. */}
            <MentionText text={item.entry!.shortDescription} flat tokens />
          </span>
          <span className="tiny muted" style={{ display: 'block' }}>
            {relativeTime(item.createdAt)}
          </span>
        </span>
      </Link>
    </li>
  );

  return (
    <div className="page-wide home-layout">
      <LivePage place="page:/" watch={['feed', 'entries', 'cases', 'boards', 'maps', 'site', 'words']} />
      {/* §91: boven de welkomsttekst, die blijft staan zoals hij is. */}
      {user && (
        <section className="home-jij" aria-labelledby="home-jij-title" data-testid="home-jij">
          <h2 id="home-jij-title" className="nav-group-head home-jij-head">
            {words.navGroupYours}
          </h2>
          <div className="home-jij-row">
            {worn ? (
              <Link href={`/e/${worn.slug}`} className="home-jij-card" data-testid="home-jij-card">
                <Thumb
                  assetId={worn.coverAssetId}
                  crop={worn.coverCrop}
                  shape="portrait"
                  icon={worn.typeIcon}
                  colour={worn.typeColour}
                />
                <span className="home-jij-who">
                  <strong>{worn.name}</strong>
                  <span className="tiny muted">{words.wearsNow}</span>
                </span>
              </Link>
            ) : user.isKeeper ? (
              <span className="home-jij-card" data-testid="home-jij-card">
                <Icon name="shield" size={20} />
                <span className="home-jij-who">
                  <strong>{user.username}</strong>
                  <span className="tiny muted">{words.keeper}</span>
                </span>
              </span>
            ) : (
              <Link href="/you#karakters" className="btn" data-testid="home-jij-pick">
                <Icon name="mask" size={16} />
                {fill(words.pickCharacter, { karakter: words.character })}
              </Link>
            )}
            {purse && (
              <>
                <Link href={`/kamer/${purse.slug}`} className="btn home-jij-door" data-testid="home-jij-kamer">
                  <Icon name={MEANING.kamer} size={16} />
                  {fill(words.toRoom, { kamer: words.room })}
                  <Beurs balance={purse.balance} words={words} size="small" />
                </Link>
                <Link
                  href={`/winkel?kamer=${encodeURIComponent(purse.roomId)}`}
                  className="btn home-jij-door"
                  data-testid="home-jij-winkel"
                >
                  <Icon name={MEANING.winkel} size={16} />
                  {fill(words.toShop, { winkel: words.shop.toLowerCase() })}
                </Link>
              </>
            )}
            {user.isKeeper && (
              <>
                <Link href="/admin" className="btn home-jij-door" data-testid="home-jij-admin">
                  <Icon name="shield" size={16} />
                  {words.navAdmin}
                </Link>
                <Link href="/uitdelen" className="btn home-jij-door" data-testid="home-jij-uitdelen">
                  <Icon name={MEANING.geven} size={16} />
                  {words.handout}
                </Link>
              </>
            )}
          </div>
          {(purse || user.isKeeper) && (
            <div className="home-jij-recent" data-testid="home-jij-recent">
              <span className="tiny muted">{words.homeJijRecent}</span>
              {ownWork.length ? (
                <ul>
                  {ownWork.map((item) => (
                    <li key={item.id}>
                      <Link href={`/e/${item.entry!.slug}`}>{item.entry!.name}</Link>{' '}
                      <span className="tiny muted">{relativeTime(item.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="tiny muted">{words.homeJijNone}</span>
              )}
            </div>
          )}
        </section>
      )}
      <section className="home-welcome" aria-labelledby="home-title">
        <p className="eyebrow">Het archief</p>
        <h1 id="home-title" style={{ margin: '0 0 0.2rem' }}>
          {settings?.name ?? 'Het archief'}
        </h1>
        {settings?.tagline && <p className="home-tagline">{settings.tagline}</p>}
        <div className="home-intro">
          {intro.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        <p className="home-numbers" aria-label="Wat het archief telt">
          {numbers.map(([count, one, many, href], index) => (
            <span key={href}>
              {index > 0 && <span className="muted"> · </span>}
              <Link href={href}>
                <strong>{count}</strong> {count === 1 ? one : many}
              </Link>
            </span>
          ))}
          {/* §90: and the web, which has no count of its own — it is all of the above. */}
          <span className="muted"> · </span>
          <Link href="/web">{words.navWeb}</Link>
          {user?.isKeeper && (
            <>
              <span className="muted"> · </span>
              <Link href="/admin?tab=site" className="tiny">
                <Icon name="edit" size={12} /> Welkomsttekst aanpassen
              </Link>
            </>
          )}
        </p>
      </section>

      <aside className="home-aside" aria-labelledby="since-title">
        <h2 id="since-title" className="home-aside-title">
          Sinds je laatste bezoek
        </h2>
        {feed.length === 0 ? (
          <div className="empty">
            <p style={{ margin: 0 }}>Nog niets opgeborgen.</p>
            <p className="small" style={{ margin: '0.4rem 0 0' }}>
              Druk op <kbd>n</kbd>, of op de <strong>+</strong>-knop, om aan het eerste {words.entry} te beginnen.
            </p>
          </div>
        ) : (
          <>
            <ul className="home-feed" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {feed.slice(0, FEED_SHOWN).map(feedRow)}
            </ul>
            {feed.length > FEED_SHOWN && (
              <details className="home-feed-more">
                <summary>Nog {feed.length - FEED_SHOWN} eerder</summary>
                <ul className="home-feed" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {feed.slice(FEED_SHOWN).map((item, index) => feedRow(item, index + FEED_SHOWN))}
                </ul>
              </details>
            )}
          </>
        )}
      </aside>

      <div className="home-rest">
        <div className="row" style={{ marginTop: '0.4rem' }}>
          <h2 style={{ margin: 0 }}>Open {words.casePlural}</h2>
          <div className="spacer" />
          <Link className="small" href="/cases">
            Alle {words.casePlural}
          </Link>
        </div>
        {openCases.length ? (
          <ul style={{ listStyle: 'none', margin: '0.4rem 0 0', padding: 0 }}>
            {openCases.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/c/${item.slug}`}
                  className="feed-item"
                  style={{ color: 'inherit', textDecoration: 'none', alignItems: 'center' }}
                >
                  <Thumb assetId={item.coverAssetId} crop={item.coverCrop} shape="portrait" icon="folder" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="small" style={{ display: 'block', fontWeight: 600 }}>
                      {item.name}
                    </span>
                    {item.summary && (
                      <span className="tiny muted clamp-2" style={{ display: 'block' }}>
                        {/* §48: flat chips — the whole row is a link. */}
                        <MentionText text={item.summary} flat tokens />
                      </span>
                    )}
                  </span>
                  <span className="tiny muted" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {counts.get(item.id) ?? 0} {counts.get(item.id) === 1 ? words.entry : words.entryPlural}
                    <br />
                    {relativeTime(item.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty" style={{ marginTop: '0.6rem' }}>
            <p className="small" style={{ margin: 0 }}>
              Er is nog geen {words.case} open. Open er een vanaf de pagina{' '}
              <Link href="/cases">{words.navCases}</Link>.
            </p>
          </div>
        )}

        {recent.length > 0 && (
          <>
            <div className="row" style={{ marginTop: '2rem' }}>
              <h2 style={{ margin: 0 }}>Recente {words.entryPlural}</h2>
              <div className="spacer" />
              {/* §75: “alles” is sinds ronde 38 een adres van zichzelf — de
                  voordeur staat op /wiki en dit knopje bedoelde altijd de lijst. */}
              <Link className="small" href="/wiki/alles">
                Alles bekijken
              </Link>
            </div>
            <div className="card-grid" style={{ marginTop: '0.8rem' }}>
              {recent.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          </>
        )}
        {recent.length === 0 && (
          <p className="small muted" style={{ marginTop: '1.5rem' }}>
            Nog geen {words.entryPlural}. {capitalise(words.newEntry)} staat in het menu.
          </p>
        )}
      </div>
    </div>
  );
}
