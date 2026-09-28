import Link from 'next/link';
import { EntryCard } from '@/components/EntryCard';
import { LivePage } from '@/components/live/LivePage';
import { NewOfTypeButton } from '@/components/NewOfTypeButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { TypeTabs } from '@/components/TypeTabs';
import { WikiViewToggle } from '@/components/WikiViewToggle';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import {
  browseEntries,
  countEntriesPerType,
  listEntryTypes,
  listTagsWithCounts,
  nameTheirCases,
} from '@/lib/entries/service';
import { readListFilters, wikiFilterGroups, WIKI_SORTS } from '@/lib/entries/browseFilters';
import type { ListParams } from '@/lib/listParams';
import { fill } from '@/lib/words';
import { moreHref, readPagina, remaining } from '@/lib/wiki/pagina';

export const dynamic = 'force-dynamic';

/**
 * §75: alles in de wiki — één rij soorten om langs te bladeren, één balk om te
 * sorteren en te filteren, en de kaartjes.
 *
 * Deze pagina stond tot ronde 38 op `/wiki` zelf. Daar staat nu de voordeur
 * (het thuisoverzicht); dit is waar je heen gaat als je wilt *bladeren* in
 * plaats van rondgeleid worden, en het is het tweede tabblad in `TypeTabs`.
 * Alleen het adres is veranderd: de sorteringen, de filters en de kaartjes zijn
 * regel voor regel wat ze waren, en de `?sort=`/`?tag=` die iemand had
 * opgeslagen werken nog precies zo.
 */
export default async function WikiAllesPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await requireViewer();
  const query = await searchParams;
  const words = getWords();

  const types = listEntryTypes();
  const perType = countEntriesPerType(user);
  const tags = listTagsWithCounts(user);
  const filters = readListFilters(query, user);
  // §24: with the dossier each case-bound artikel was made in, for whoever
  // may see that dossier.
  /*
   * §104 (ronde 67·herstel, #14): every match is counted, and as many as the
   * address asks for are drawn — "120 van 209", with *Meer* under the cards.
   * The rows are the list's summary columns; the dossier names are looked up
   * only for what is drawn.
   */
  const pagina = readPagina(query);
  const matches = browseEntries(user, { ...filters, limit: 100_000 });
  const entries = nameTheirCases(matches.slice(0, pagina.shown), user);
  const left = remaining(matches.length, pagina);
  const total = [...perType.values()].reduce((n, count) => n + count, 0);

  return (
    <div className="page-wide">
      <LivePage place="page:/wiki/alles" watch={['entries', 'types']} />
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div>
          <p className="eyebrow">Bladeren</p>
          <h1 style={{ margin: 0 }}>Alles in de wiki</h1>
        </div>
        <div className="spacer" />
        <NewOfTypeButton />
      </div>

      <TypeTabs
        types={types.map((type) => ({
          slug: type.slug,
          label: type.label,
          icon: type.icon,
          colour: type.colour,
          count: perType.get(type.id) ?? 0,
        }))}
        active="alles"
        allCount={total}
        query={query}
        moreLabel={words.wikiMoreKinds}
      />

      <SortFilterBar
        sorts={WIKI_SORTS}
        defaultSort="recent"
        groups={wikiFilterGroups(tags, user, filters.tag)}
        summary={
          left
            ? fill(words.listShownOf, { n: String(entries.length), totaal: String(matches.length), artikelen: words.entryPlural })
            : `${entries.length} ${entries.length === 1 ? words.entry : words.entryPlural}`
        }
      />

      {/* §104 (golf H, T1): the same Lijst/Kaarten as a soort's list — one line
          per artikel on a phone, and the reader's choice remembered for both. */}
      {entries.length > 0 && <WikiViewToggle target="wiki-entries" />}

      {entries.length ? (
        <>
          <div className="card-grid wiki-entries" id="wiki-entries">
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </div>
          {left > 0 && (
            <p className="lijst-meer">
              <Link className="btn" href={moreHref('/wiki/alles', query, pagina)} scroll={false} data-testid="lijst-meer">
                {words.listMore}
              </Link>
              <span className="lijst-meer-rest">{fill(words.listMoreLeft, { n: String(left) })}</span>
            </p>
          )}
        </>
      ) : (
        <div className="empty">
          {filters.tag || filters.mine || filters.restricted || filters.onMap || filters.visibility
            ? 'Niets voldoet aan deze filters.'
            : 'Daaronder is nog niets opgeborgen.'}
        </div>
      )}
    </div>
  );
}
