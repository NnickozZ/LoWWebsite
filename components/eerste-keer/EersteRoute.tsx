import { Icon } from '@/components/Icon';
import { routeSteps, type ArchiveFirsts } from '@/lib/eerste-keer/stappen';
import { fill, type Words } from '@/lib/words';
import { ArtikelDeur, DossierDeur } from './Deuren';
import { Uitnodiging } from './Uitnodiging';

/**
 * §106 (golf i2): Start voor een Keeper in een leeg archief.
 *
 * Een verse installatie (`npm run bootstrap`, zonder seed) opende op een welkom
 * met vijf nullen, "Nog niets opgeborgen." met *Druk op n* (ook op een
 * telefoon), en nergens een woord over de uitnodigingscode: die stond in
 * Beheer, onder de gebruikers. Dit is een korte route op de pagina zelf — geen
 * rondleiding die over de pagina hangt — met drie stappen die elk een knop
 * zijn: het eerste artikel, een dossier, en de tafel uitnodigen. Een gedane
 * stap wordt een vinkje en een streep; de route verdwijnt als alle drie
 * gedaan zijn (`showsRoute`), en de Keeper hoeft hem niet weg te klikken.
 *
 * Alleen voor de Keeper: de pagina vraagt `archiveFirsts()` alleen dan, en de
 * code zelf komt van de server en gaat niet naar een speler (§89).
 */
export function EersteRoute({ firsts, words, inviteCode }: { firsts: ArchiveFirsts; words: Words; inviteCode: string }) {
  const steps = routeSteps(firsts);
  const first = steps.findIndex((step) => !step.done);
  return (
    <section className="eerste-route eerste-plek" aria-labelledby="eerste-route-kop" data-testid="eerste-route">
      <div className="eerste-route-kop-rij">
        <h2 id="eerste-route-kop" className="eerste-route-kop">
          {words.routeTitle}
        </h2>
        <span className="eerste-route-tel" aria-hidden="true">
          {steps.filter((step) => step.done).length}/3
        </span>
      </div>
      <p className="eerste-route-lead">{words.routeLead}</p>
      <ol className="eerste-route-stappen">
        {steps.map((step, index) => {
          const title =
            step.key === 'entry'
              ? fill(words.routeEntry, { artikel: words.entry })
              : step.key === 'case'
                ? fill(words.routeCase, { dossier: words.case })
                : fill(words.routeInvite, { spelers: words.playerPlural });
          const why =
            step.key === 'entry' ? fill(words.routeEntryWhy, { artikel: words.entry }) : step.key === 'case' ? words.routeCaseWhy : words.routeInviteWhy;
          return (
            <li
              key={step.key}
              className={`eerste-stap${step.done ? ' is-gedaan' : ''}${index === first ? ' is-nu' : ''}`}
              data-stap={step.key}
              data-gedaan={step.done ? 'ja' : 'nee'}
            >
              <span className="eerste-stap-nummer" aria-hidden="true">
                {step.done ? <Icon name="check" size={16} /> : index + 1}
              </span>
              <div className="eerste-stap-tekst">
                <p className="eerste-stap-titel">
                  <span className="visually-hidden">{fill(words.routeStepOf, { n: String(index + 1) })}: </span>
                  {title}
                  {step.done && <span className="eerste-stap-gedaan"> · {words.routeDone}</span>}
                </p>
                {!step.done && <p className="eerste-stap-why">{why}</p>}
                {!step.done && step.key === 'entry' && (
                  <ArtikelDeur primary={index === first} label={title} testId="route-artikel" />
                )}
                {!step.done && step.key === 'case' && (
                  <DossierDeur primary={index === first} label={title} testId="route-dossier" />
                )}
                {!step.done && step.key === 'invite' && <Uitnodiging code={inviteCode} />}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
