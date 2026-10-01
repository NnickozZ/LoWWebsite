import Link from 'next/link';
import { LivePage } from '@/components/live/LivePage';
import { eq } from 'drizzle-orm';
import { Icon } from '@/components/Icon';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { defaultIntro, introParagraphs } from '@/lib/intro';
import { listCharacters } from '@/lib/characters';
import { EersteRoute } from '@/components/eerste-keer/EersteRoute';
import { WieBenJij } from '@/components/eerste-keer/WieBenJij';
import { archiveFirsts } from '@/lib/eerste-keer/tellen';
import { showsRoute } from '@/lib/eerste-keer/stappen';

export const dynamic = 'force-dynamic';

/**
 * Start.
 *
 * Golf O (Nick, 1 oktober: "The home page is too cluttered, the thing in the
 * red is most important"): het welkom in de woorden van de Keeper, en drie
 * deuren. Meer niet. Wat hier tot golf O stond, is weg en heeft elders een
 * plek die er al was:
 *
 *  - de Jij-rij (§91) — *Jouw plek* in de zijbalk en de Jij-tab op een
 *    telefoon zijn dezelfde deuren;
 *  - *Sinds je laatste bezoek* en *Recente artikelen* — *Alles op volgorde* in
 *    de wiki (`/wiki/alles`, gesorteerd op het laatst bijgewerkt);
 *  - *Open dossiers* — `/cases`, de tweede deur hieronder;
 *  - de regel met getallen — elk getal stond al naast zijn eigen tab.
 *
 * De eerste keer blijft wel staan, want die gaat vanzelf weg: *Wie ben jij aan
 * tafel?* voor een nieuwe speler en de route voor een Keeper in een leeg
 * archief (§106). Zolang die route er staat, staan de deuren er niet: de route
 * ís dan de deur.
 */
export default async function HomePage() {
  const user = await requireViewer();
  const words = getWords();
  const settings = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).get();

  /*
   * §106 (golf i2): de eerste keer. Een speler die nog niemand is, krijgt hier
   * één vraag; een Keeper in een archief dat nog niet begonnen is, krijgt drie
   * stappen.
   */
  // A Keeper looking as a player (§44) is not a newcomer: no question for him.
  const needsCharacter = Boolean(user && !user.isKeeper && !user.asPlayer && listCharacters(user.id).length === 0);
  const firsts = user?.isKeeper ? archiveFirsts() : null;
  const route = firsts && showsRoute(firsts) ? firsts : null;

  const intro = introParagraphs(settings?.intro?.trim() ? settings.intro : defaultIntro(words));

  return (
    <div className="page-wide home-layout home-rustig">
      <LivePage place="page:/" watch={['entries', 'cases', 'site', 'words']} />
      {/* §106: rendered for every speler, also once they are somebody — the
          welcome that follows *Dit ben ik* lives in its state and has to
          survive the refresh that brings the kamer. */}
      {user && !user.isKeeper && !user.asPlayer && <WieBenJij needs={needsCharacter} />}
      {route && <EersteRoute firsts={route} words={words} inviteCode={settings?.inviteCode ?? ''} />}
      <section className="home-welcome" aria-labelledby="home-title">
        <p className="eyebrow">Het archief</p>
        <h1 id="home-title" className="home-titel">
          {settings?.name ?? 'Het archief'}
        </h1>
        {settings?.tagline && <p className="home-tagline">{settings.tagline}</p>}
        <div className="home-intro">
          {intro.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        {/* Golf O: drie deuren in plaats van vijf getallen, twee lijsten en een
            feed. §106 (na review 4, M8): niet onder de route, die zegt het al. */}
        {!route && (
          <nav className="home-deuren" aria-label="Waar je begint" data-testid="home-deuren">
            <Link href="/wiki" className="btn btn-primary home-deur">
              <Icon name="book" size={16} />
              {words.navWiki}
            </Link>
            <Link href="/cases" className="btn home-deur">
              <Icon name="folder" size={16} />
              {words.navCases}
            </Link>
            <Link href="/wiki/willekeurig" className="btn home-deur" prefetch={false}>
              <Icon name="dice" size={16} />
              {words.surpriseMe}
            </Link>
          </nav>
        )}
        {user?.isKeeper && (
          <p className="home-keeper-regel">
            <Link href="/admin?tab=site" className="tiny">
              <Icon name="edit" size={12} /> Welkomsttekst aanpassen
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
