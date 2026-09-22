import '@/app/spelers.css';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { MEANING } from '@/components/kamer/plekWords';
import { HalOnline } from '@/components/spelers/HalOnline';
import { LivePage } from '@/components/live/LivePage';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { charactersWorn, listCharacters } from '@/lib/characters';
import { visibleNamesOf } from '@/lib/kamers/service';
import { listSpelers } from '@/lib/spelers/service';
import { capitalise, fill } from '@/lib/words';

export const dynamic = 'force-dynamic';

/**
 * §81: iedereen, op één plek.
 *
 * §77 gave every person a front door and left the hall out: you could only
 * reach somebody's spelerspagina from the roster (so: while they happened to be
 * online) or from your own *Jij*. For a table of five that is one missing page,
 * and it is this one.
 *
 * Deliberately thin. Who somebody *is* lives on their own page, and this is a
 * list of doors — the account name, the onderzoeker they are wearing now, and
 * nothing else. Everything else it could show is already a panel one click
 * away, and §77's rule about panels applies to a list of them just as much: a
 * summary with a door, never a second place to do things.
 *
 * The roster (§76) is the *live* half of the same question and stays what it
 * is: who is here now. This one answers who there is at all, online or not.
 */
export default async function SpelersPage() {
  const user = await requireViewer();
  const words = getWords();
  const spelers = listSpelers();
  const worn = charactersWorn(spelers.map((speler) => speler.id));

  /*
   * §85: **jij staat bovenaan.**
   *
   * De hal stond op accountnaam, alfabetisch, en dat is de goede volgorde voor
   * een lijst waar je iemand in zoekt. Maar de eerste vraag die iemand aan een
   * lijst van zichzelf-en-de-rest stelt is "waar sta ik", en op naam is dat
   * antwoord elke avond ergens anders. Je eigen regel staat nu vooraan en zegt
   * dat hij van jou is; de rest houdt precies de volgorde die hij had. De
   * server beslist dit en niet de browser: de lijst die binnenkomt is dan al
   * goed, in plaats van een tel later te verspringen.
   */
  /*
   * §93 (E22): élk karakter dat iemand draagt, als een kleine deur naar zijn
   * kamer — niet alleen het karakter dat hij nu speelt. Kees' kamer was vanaf
   * hier twee tikken. Alleen wat deze kijker mag zien (§76): een onderzoeker
   * die je niet mag zien, heeft voor jou geen kamer.
   */
  const heldBy = new Map(
    spelers.filter((speler) => !speler.isKeeper).map((speler) => [speler.id, listCharacters(speler.id)]),
  );
  const seen = visibleNamesOf(
    [...heldBy.values()].flat().map((character) => character.entryId),
    user,
  );

  const inHall = [...spelers].sort((a, b) => {
    if (a.id === user?.id) return -1;
    if (b.id === user?.id) return 1;
    return 0;
  });

  return (
    <div className="page spelers-hal" data-testid="spelers-page">
      {/*
       * §21: `users` for who exists at all, `characters` for what they are
       * wearing. Both move rarely and both change this list when they do.
       */}
      <LivePage place="page:/spelers" watch={['users', 'characters']} />

      <p className="eyebrow">{capitalise(words.playerPlural)}</p>
      <h1 className="row-wrap spelers-kop">
        {words.spelerPagePlural}
        {/*
          §83: de tweede deur naar de uitdeler, en de vanzelfsprekende — dit is
          de pagina die "iedereen" heet. Alleen voor de Keeper, en absent in
          plaats van verborgen (§44), want de pagina erachter is ook een 404.
        */}
        {user?.isKeeper && (
          <Link className="btn btn-small" href="/uitdelen" data-testid="spelers-uitdelen">
            <Icon name={MEANING.geven} size={13} />
            {/* §90 (E25): een deur draagt een werkwoord; *Uitdelen* is de knop
                op de pagina erachter. */}
            {words.toHandout}
          </Link>
        )}
      </h1>

      {/*
        §85: kolomkoppen. Twee dingen per regel, waarvan het rechter er per
        regel anders uitziet — een naam, een schuingedrukt *als jezelf*, een
        rode stempel — en niets dat zegt wat die kolom is. Eén regel erboven
        kost niets en beantwoordt dat één keer voor de hele lijst.
      */}
      <p className="tiny muted spelers-koppen" aria-hidden="true">
        <span>{capitalise(words.player)}</span>
        <span>{words.wears}</span>
      </p>

      <ul className="spelers-lijst" data-testid="spelers-lijst">
        {inHall.map((speler) => {
          const karakter = worn.get(speler.id) ?? null;
          const isSelf = speler.id === user?.id;
          return (
            <li key={speler.id}>
              <Link
                href={`/spelers/${speler.slug}`}
                className="spelers-deur"
                data-testid="spelers-deur"
                data-speler={speler.slug}
                data-self={isSelf ? 'ja' : 'nee'}
              >
                <span className="spelers-naam">
                  {speler.username}
                  {isSelf && (
                    <span className="tiny muted spelers-jij" data-testid="spelers-jij">
                      {' '}
                      {words.youMarker}
                    </span>
                  )}
                  <HalOnline href={`/spelers/${speler.slug}`} words={words} />
                </span>
                <span className="tiny muted spelers-onder">
                  {speler.isKeeper ? (
                    /*
                     * §81: de Keeper staat er met zijn eigen naam, net als
                     * iedereen — "Keeper" is hier een rol en geen naam, en dat
                     * is precies het onderscheid dat deze ronde rechtzet.
                     */
                    <span className="stamp">{words.keeper}</span>
                  ) : (
                    karakter ?? <em>{words.asYourself}</em>
                  )}
                </span>
              </Link>
              {(() => {
                const kamers = (heldBy.get(speler.id) ?? []).filter((character) => seen.has(character.entryId));
                if (!kamers.length) return null;
                return (
                  <nav className="tiny spelers-kamers" aria-label={capitalise(words.roomPlural)} data-testid="spelers-kamers">
                    <Icon name={MEANING.kamer} size={12} />
                    {kamers.map((character) => (
                      <Link
                        key={character.entryId}
                        href={`/kamer/${character.slug}`}
                        className="spelers-kamer"
                        data-testid="spelers-kamer"
                        aria-label={fill(words.hallRoomOf, { naam: character.name })}
                      >
                        {character.name}
                      </Link>
                    ))}
                  </nav>
                );
              })()}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
