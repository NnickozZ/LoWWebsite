import '@/app/overzichten.css';
import { redirect } from 'next/navigation';
import { LivePage } from '@/components/live/LivePage';
import { NewOverzichtButton } from '@/components/overzichten/NewOverzichtButton';
import { OverzichtView } from '@/components/overzichten/OverzichtView';
import { TypeTabs } from '@/components/TypeTabs';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { countEntriesPerType, listEntryTypes } from '@/lib/entries/service';
import { defaultIntro } from '@/lib/intro';
import { newOverzichtSide } from '@/lib/overzichten/service';
import type { ListParams } from '@/lib/listParams';
import { loadOverzichtPage } from './overzicht/load';

export const dynamic = 'force-dynamic';

/**
 * §75: de voordeur van de wiki.
 *
 * Nick: *"the first thing that shows should be an intro page that players get
 * to freely fill in."* Dit is die pagina. Wat er tot ronde 38 stond — de
 * gesorteerde lijst van alles — staat nu op `/wiki/alles`, één tab verderop.
 *
 * Twee dingen die makkelijk stil fout gaan en dat hier niet doen:
 *
 *  1. **De tabrij staat er nog steeds**, met dezelfde tellingen als op elke
 *     andere wikipagina. De voordeur is een pagina *in* de wiki, geen eigen
 *     eilandje; wie hier landt en meteen wil bladeren is één klik verder.
 *  2. **Een thuisoverzicht dat van de Keeper is, is voor een speler afwezig**
 *     (`getHomeOverzicht` geeft dan null) — en dan valt deze pagina terug op de
 *     lijst in plaats van 404 te geven, want een wiki zonder voordeur is geen
 *     404 waard. Dat is de enige plek in het archief waar "niet voor jou" iets
 *     anders oplevert dan "niet gevonden", en het mag omdat er niets te
 *     verklappen valt: de lijst is wat er stond voordat deze ronde bestond.
 */
export default async function WikiPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await requireViewer();
  const query = await searchParams;

  /*
   * §90: the voordeur does not filter, the list does. Every tag chip in the
   * archive pointed here with `?tag=` from round 38 until round 51, so links
   * saved or pasted in that time are sent on to the list with everything
   * they carried, instead of landing on the welcome and dropping the tag.
   */
  if (query.tag) {
    const carried = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
        carried.append(key, one);
      }
    }
    // `return`, and on purpose: this page only *sometimes* sends you on, and
    // `live-everywhere.test.ts` reads a bare `redirect(` at the start of a line
    // as "a page that is nothing but a door".
    return redirect(`/wiki/alles?${carried.toString()}`);
  }

  const words = getWords();

  const loaded = await loadOverzichtPage({ home: true }, user);

  const types = listEntryTypes();
  const perType = countEntriesPerType(user);
  const total = [...perType.values()].reduce((n, count) => n + count, 0);

  const tabs = (
    <TypeTabs
      types={types.map((type) => ({
        slug: type.slug,
        label: type.label,
        icon: type.icon,
        colour: type.colour,
        count: perType.get(type.id) ?? 0,
      }))}
      active="start"
      allCount={total}
      query={query}
    />
  );

  // The Keeper's own front door, read by a player: fall back to the list.
  if (!loaded) {
    return (
      <div className="page-wide">
        <LivePage place="page:/wiki" watch={['entries', 'types', 'overzichten']} />
        <div className="row" style={{ marginBottom: '0.3rem' }}>
          <div>
            <p className="eyebrow">Bladeren</p>
            <h1 style={{ margin: 0 }}>De wiki</h1>
          </div>
          <div className="spacer" />
          <NewOverzichtButton keeperSideDefault={newOverzichtSide(user) === 'keeper'} />
        </div>
        {tabs}
        <p className="empty">Er is nog geen voorpagina voor deze kant van het archief.</p>
      </div>
    );
  }

  return (
    <div className="page-wide">
      <LivePage
        place="page:/wiki"
        watch={['entries', 'types', 'overzichten', `overzicht:${loaded.overzicht.id}`]}
      />
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div className="spacer" />
        <NewOverzichtButton keeperSideDefault={newOverzichtSide(user) === 'keeper'} />
      </div>
      {tabs}
      <OverzichtView
        overzicht={loaded.overzicht}
        siblings={loaded.siblings}
        sections={loaded.sections}
        canEdit={loaded.canEdit}
        isKeeper={Boolean(user?.isKeeper)}
        users={loaded.revealUsers}
        cases={loaded.revealCases}
        liveUser={loaded.liveUser}
        // §11: the archive introduces itself in its own words until somebody
        // writes their own — the same text, and the same rule, the start page
        // has used since round 5.
        defaultLead={defaultIntro(words)}
      />
    </div>
  );
}
