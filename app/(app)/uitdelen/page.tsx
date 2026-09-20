import '@/app/kamer.css';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Uitdeler } from '@/components/kamer/Uitdeler';
import { MEANING } from '@/components/kamer/plekWords';
import { LivePage } from '@/components/live/LivePage';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { handOutTargets } from '@/lib/kamers/service';
import { fill } from '@/lib/words';

export const dynamic = 'force-dynamic';

/**
 * §83: munten uitdelen aan de hele tafel tegelijk.
 *
 * Nick, ronde 44: *"Er moet een makkelijke 'mass coin distribution' komen voor
 * keepers. dat ze ergens op een simpele knop kunnen drukken…"* — §79's
 * grootboekformulier is één kamer tegelijk, en een sessie waarin vijf mensen
 * samen iets deden is dan vijf keer hetzelfde typen, met vijf kansen om er één
 * te vergeten.
 *
 * **Keeper-only, op drie plekken** (§80: een slot heeft ook aan de buitenkant
 * van de deur een gleuf nodig): `handOut` weigert iedereen anders, deze pagina
 * is een 404 voor wie geen Keeper is, en `canWatch` geeft de plek `/uitdelen`
 * alleen aan hem — anders leest een speler in het lijstje dat de Keeper staat
 * uit te delen, wat op zichzelf al iets verklapt.
 *
 * Een 404 en geen gesloten deur, om dezelfde reden als bij een kamer die niet
 * van jou is (§40): een pagina die zegt dat hij bestaat maar niet voor jou, is
 * een pagina die iets verteld heeft.
 *
 * Het *lezen* van wie er bestaat is `handOutTargets`, en die legt uit waarom de
 * lijst uit kamers bestaat en niet uit spelers.
 */
export default async function UitdelenPage() {
  const user = await getSessionUser();
  if (!user?.isKeeper) notFound();

  const words = getWords();
  const targets = handOutTargets(user);

  return (
    <div className="page uitdelen-page" data-testid="uitdelen-page">
      {/*
       * §21: `characters` en `users` omdat de lijst zelf uit gedragen
       * onderzoekers bestaat, en `entries` omdat de naam ernaast van een
       * artikel komt dat hernoemd kan worden terwijl dit openstaat.
       */}
      <LivePage place="page:/uitdelen" watch={['users', 'characters', 'entries']} />

      {/*
        §85: de eyebrow zei "Kamer", net als die van de winkel en die van élke
        kamer — en een kruimelpad dat op drie pagina's hetzelfde zegt zegt
        niets (§84 haalde dezelfde fout uit de kamer). Dit is het ene scherm in
        het archief dat alleen van de Keeper is, en dát is waar je bent.
      */}
      <p className="eyebrow">{words.keeper}</p>
      <h1 className="row-wrap uitdelen-title">
        {words.handoutTitle}
        {/* En de deur terug. Uitdelen is iets wat je vanaf de hal begint en
            waar je naar de hal van terugkeert om te zien wat het deed. */}
        <Link className="btn btn-small" href="/spelers" data-testid="uitdelen-terug">
          <Icon name={MEANING.onderzoeker} size={13} />
          {fill(words.toPlayers, { spelers: words.playerPlural })}
        </Link>
      </h1>

      {targets.length === 0 ? (
        <p className="small muted" data-testid="uitdelen-leeg">
          {words.handoutEmpty}
        </p>
      ) : (
        <Uitdeler targets={targets} words={words} />
      )}
    </div>
  );
}
