import '@/app/spelers.css';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Thumb } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { Beurs } from '@/components/kamer/Beurs';
import { MEANING } from '@/components/kamer/plekWords';
import { HalOnline } from '@/components/spelers/HalOnline';
import { activeCharacter } from '@/lib/characters';
import { visibleNamesOf, purseOf } from '@/lib/kamers/service';
import { LivePage } from '@/components/live/LivePage';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import type { Viewer } from '@/lib/entries/visibility';
import { spelerPagePlace } from '@/lib/live/keys';
import { panelsFor } from '@/lib/spelers/panels';
import { spelerBySlug } from '@/lib/spelers/service';
import { capitalise, fill } from '@/lib/words';

export const dynamic = 'force-dynamic';

/**
 * §77: one person's front door.
 *
 * The address is `/spelers/<slug>`, and the slug is `lib/spelers/service.ts`'s
 * — computed from the account name in one pass, so there is exactly one answer
 * to "who is `jan-piet`". A slug nobody answers to is a 404 and not an empty
 * page: this page is about a person, and there is no such person.
 *
 * What it holds is the panel registry (`lib/spelers/panels.tsx`), not a layout
 * of its own. The page decides the frame — the heading, the `data-testid`, the
 * order — and each panel decides its body. That split is the round's point:
 * the sixth panel is one object in an array and no change here.
 *
 * `<LivePage>` stands at this page's place (§21, §60). It does *not* read the
 * hub: the live half of "Nu bezig" is wired separately, and a server render
 * that went and asked would be a second, staler answer to the same question.
 */
export default async function SpelerPage({ params }: { params: Promise<{ naam: string }> }) {
  const user = await requireViewer();
  const { naam } = await params;

  const speler = spelerBySlug(naam);
  if (!speler) notFound();

  const words = getWords();
  // The layout redirects everybody who is not signed in, so there is a viewer.
  const viewer: Viewer = user ? { id: user.id, isKeeper: user.isKeeper, side: user.side } : null;
  const isSelf = Boolean(user && user.id === speler.id);

  /*
   * §93: de eerste rij is anders op je eigen pagina dan op die van een ander,
   * want je komt er met een andere vraag (review onderzoek §5). Op je eigen:
   * wie je speelt, je saldo, en de twee deuren die je hier het vaakst neemt.
   * Bij een ander: of hij er is, en wie hij nu speelt — de naam alleen als
   * jij dat artikel mag zien (§76: een naam die je niet mag zien, staat ook
   * niet in een zin over iets anders).
   */
  const purse = isSelf && !speler.isKeeper ? purseOf(viewer) : null;
  const playing = speler.isKeeper ? null : activeCharacter(speler.id);
  const playingSeen =
    playing && visibleNamesOf([playing.entryId], viewer).has(playing.entryId) ? playing : null;

  return (
    <div className="page speler-page" data-testid="speler-page">
      {/*
       * §21: the keys this page is made of. `users` for the name and the
       * roster, `characters` and `entries` for the portraits, `cases` for the
       * shelves and `feed` for the lines — one watch per panel that reads
       * anything, and none for the two that read nothing.
       */}
      <LivePage
        place={spelerPagePlace(speler.slug)}
        watch={['users', 'characters', 'entries', 'cases', 'feed']}
      />

      <p className="eyebrow">{words.spelerPage}</p>
      <h1 style={{ marginBottom: '0.2rem' }}>{speler.username}</h1>
      <p className="row-wrap" style={{ marginTop: 0 }}>
        {speler.isKeeper ? (
          <span className="stamp">{words.keeper}</span>
        ) : (
          <span className="small muted">{capitalise(words.player)}</span>
        )}
      </p>

      {isSelf && purse && playingSeen && (
        <div className="speler-eerste row-wrap" data-testid="speler-eerste" data-self="ja">
          <Link href={`/e/${playingSeen.slug}`} className="speler-eerste-wie" data-testid="speler-eerste-wie">
            <Thumb
              assetId={playingSeen.coverAssetId}
              crop={playingSeen.coverCrop}
              shape="portrait"
              icon={playingSeen.typeIcon}
              colour={playingSeen.typeColour}
            />
            <span className="speler-eerste-naam">{playingSeen.name}</span>
          </Link>
          <Beurs balance={purse.balance} words={words} />
          <Link className="btn" href={`/kamer/${purse.slug}`} data-testid="speler-eerste-kamer">
            <Icon name={MEANING.kamer} size={15} />
            {fill(words.toRoom, { kamer: words.room })}
          </Link>
          <Link
            className="btn"
            href={`/winkel?kamer=${encodeURIComponent(purse.roomId)}`}
            data-testid="speler-eerste-winkel"
          >
            <Icon name={MEANING.winkel} size={15} />
            {fill(words.toShop, { winkel: words.shop.toLowerCase() })}
          </Link>
        </div>
      )}
      {!isSelf && (
        <div className="speler-eerste row-wrap" data-testid="speler-eerste" data-self="nee">
          <HalOnline href={`/spelers/${speler.slug}`} words={words} />
          {playingSeen && (
            <span className="small speler-eerste-speelt" data-testid="speler-eerste-speelt">
              <span className="muted">{words.wearsNow}: </span>
              <Link href={`/e/${playingSeen.slug}`}>{playingSeen.name}</Link>
            </span>
          )}
        </div>
      )}

      <div className="speler-panels">
        {panelsFor(isSelf).map((panel) => (
          <section
            key={panel.id}
            className="speler-panel"
            data-testid={`panel-${panel.id}`}
            aria-labelledby={`panel-${panel.id}-title`}
          >
            <h2 className="speler-panel-title" id={`panel-${panel.id}-title`}>
              {panel.title(words)}
            </h2>
            {panel.render({ viewer, speler, words, isSelf })}
          </section>
        ))}
      </div>
    </div>
  );
}
