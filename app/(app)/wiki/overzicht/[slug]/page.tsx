import '@/app/overzichten.css';
import { notFound, redirect } from 'next/navigation';
import { LivePage } from '@/components/live/LivePage';
import { KeeperStamp } from '@/components/keeper/KeeperStamp';
import { NewOverzichtButton } from '@/components/overzichten/NewOverzichtButton';
import { OverzichtView } from '@/components/overzichten/OverzichtView';
import { TypeTabs } from '@/components/TypeTabs';
import { requireViewer } from '@/lib/auth/session';
import { countEntriesPerType, listEntryTypes } from '@/lib/entries/service';
import { sideOf } from '@/lib/keeper/kinds';
import { queryTail, sideDetour } from '@/lib/keeper/side';
import { newOverzichtSide } from '@/lib/overzichten/service';
import { overzichtPagePlace } from '@/lib/live/keys';
import { loadOverzichtPage } from '../load';

export const dynamic = 'force-dynamic';

/**
 * §75: één overzicht, dat niet de voordeur is.
 *
 * Dezelfde pagina als `/wiki`, met drie verschillen die alle drie ergens anders
 * vandaan komen:
 *
 *  - hij wordt opgezocht op slug, en "niet gevonden" is hier gewoon een 404;
 *  - hij doet §50's **omslag**: een Keeper die op de spelerskant staat en een
 *    Keeperoverzicht opent, wordt vóór het renderen door `/api/keeper/flip`
 *    gestuurd, zodat de schil, de kleuren en elke kiezer al bij de kant horen
 *    waar deze pagina op staat. Zonder deze vier regels krijg je precies de
 *    "gekke UI bugs" waar ronde 26 over gaat;
 *  - en hij zet `KeeperStamp`, zodat de pagina zelf zegt op welke kant hij
 *    staat (§46: de kleuren volgen de pagina, niet de browser).
 */
export default async function OverzichtPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireViewer();
  const { slug } = await params;
  const query = await searchParams;

  const loaded = await loadOverzichtPage({ slug }, user);
  if (!loaded) notFound();

  // §50: de omslag, vóór het renderen. `queryTail` draagt mee wat er in het
  // adres stond, zodat de omweg niets kwijtraakt.
  const detour = sideDetour(user, loaded.keeperOnly, `/wiki/overzicht/${slug}${queryTail(query)}`);
  if (detour) redirect(detour);

  const types = listEntryTypes();
  const perType = countEntriesPerType(user);
  const total = [...perType.values()].reduce((n, count) => n + count, 0);

  return (
    <div className="page-wide">
      <KeeperStamp side={sideOf(loaded.keeperOnly)} />
      <LivePage
        place={overzichtPagePlace(loaded.overzicht.slug)}
        watch={['entries', 'types', 'overzichten', `overzicht:${loaded.overzicht.id}`]}
      />
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div className="spacer" />
        <NewOverzichtButton keeperSideDefault={newOverzichtSide(user) === 'keeper'} />
      </div>
      {/* §75: de tabrij blijft staan. Een overzicht is een pagina *in* de wiki,
          en wie hier landt moet even goed kunnen doorbladeren als op elke
          andere wikipagina. Geen enkele tab is de huidige, want dit is geen
          soort en ook niet de voordeur. */}
      <TypeTabs
        types={types.map((type) => ({
          slug: type.slug,
          label: type.label,
          icon: type.icon,
          colour: type.colour,
          count: perType.get(type.id) ?? 0,
        }))}
        active={null}
        allCount={total}
        query={query as Record<string, string>}
      />
      <OverzichtView
        overzicht={loaded.overzicht}
        siblings={loaded.siblings}
        sections={loaded.sections}
        canEdit={loaded.canEdit}
        isKeeper={Boolean(user?.isKeeper)}
        users={loaded.revealUsers}
        cases={loaded.revealCases}
        liveUser={loaded.liveUser}
      />
    </div>
  );
}
