import '@/app/spelers.css';
import Link from 'next/link';
import { LivePage } from '@/components/live/LivePage';
import { getWords } from '@/lib/admin/words';
import { charactersWorn } from '@/lib/characters';
import { listSpelers } from '@/lib/spelers/service';
import { capitalise } from '@/lib/words';

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
  const words = getWords();
  const spelers = listSpelers();
  const worn = charactersWorn(spelers.map((speler) => speler.id));

  return (
    <div className="page spelers-index" data-testid="spelers-page">
      {/*
       * §21: `users` for who exists at all, `characters` for what they are
       * wearing. Both move rarely and both change this list when they do.
       */}
      <LivePage place="page:/spelers" watch={['users', 'characters']} />

      <p className="eyebrow">{capitalise(words.playerPlural)}</p>
      <h1>{words.spelerPagePlural}</h1>

      <ul className="spelers-lijst" data-testid="spelers-lijst">
        {spelers.map((speler) => {
          const karakter = worn.get(speler.id) ?? null;
          return (
            <li key={speler.id} className="spelers-rij">
              <Link
                href={`/spelers/${speler.slug}`}
                className="spelers-deur"
                data-testid="spelers-deur"
                data-speler={speler.slug}
              >
                <span className="spelers-naam">{speler.username}</span>
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
