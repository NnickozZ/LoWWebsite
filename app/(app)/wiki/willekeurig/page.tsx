import { redirect } from 'next/navigation';
import { requireViewer } from '@/lib/auth/session';
import { randomEntry } from '@/lib/wiki/leeskamer';

export const dynamic = 'force-dynamic';

/**
 * §104, ronde 67 (L2): `/wiki/willekeurig` — een willekeurig artikel.
 *
 * Een deur, geen pagina. De server kiest (`randomEntry`): uit wat deze lezer
 * mag zien (rule 1) en van de kant waar hij staat (§46), dus een speler komt
 * nooit op iets van de Keeper uit en een Keeper op zijn eigen kant nooit op iets
 * van de spelers. Wie niets te kiezen heeft, belandt op de lijst.
 *
 * `willekeurig` staat daarom in `RESERVED_WIKI_SLUGS`: een soort mag dit adres
 * niet pakken, anders zou `/wiki/[type]` het nooit meer zien.
 */
export default async function WikiWillekeurigPage() {
  const user = await requireViewer();
  const pick = randomEntry(user);
  if (!pick) redirect('/wiki/alles');
  redirect(`/e/${pick.slug}`);
}
