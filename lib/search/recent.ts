import type { Viewer } from '@/lib/entries/visibility';
import { KIND_ICON } from '@/lib/keeper/kinds';
import { recentPath, RECENT_MAX } from '@/lib/palette/recent';
import { otherCandidates, type OtherKind } from './others';
import { visibleEntriesBySlug } from './service';

/**
 * §100: *Onlangs* in het palet — wat deze browser onthield (alleen adressen,
 * in `localStorage`), opnieuw gelezen met de ogen van wie nu kijkt.
 *
 * Regel 1 is ook hier de hele functie: een adres uit de browser is een
 * vraag, geen feit. Een artikel komt terug via `visibleEntriesBySlug`, al het
 * andere via `otherCandidates` — precies de lijsten waar Zoeken uit kiest,
 * met hun zichtbaarheid en hun kant (§46). Wat je niet meer mag zien (privé
 * gezet, naar de Keeperkant, in de prullenbak) komt niet terug, en het
 * antwoord verraadt niet dat erom gevraagd is.
 */

export type RecentHit = {
  kind: 'entry' | OtherKind;
  href: string;
  name: string;
  icon: string;
  /** De soort van een artikel, of het dossier waar een vlak in hangt. */
  hint?: string | null;
};

export function resolveRecent(viewer: Viewer, asked: readonly string[]): RecentHit[] {
  if (!viewer) return [];
  const paths = [...new Set(asked.map((raw) => recentPath(raw)).filter((p): p is string => Boolean(p)))].slice(
    0,
    RECENT_MAX,
  );
  if (!paths.length) return [];

  const found = new Map<string, RecentHit>();
  const slugs = paths.filter((p) => p.startsWith('/e/')).map((p) => p.slice(3));
  for (const entry of visibleEntriesBySlug(viewer, slugs)) {
    found.set(`/e/${entry.slug}`, {
      kind: 'entry',
      href: `/e/${entry.slug}`,
      name: entry.name,
      icon: entry.typeIcon || KIND_ICON.entry,
      hint: entry.typeLabel,
    });
  }
  if (paths.some((p) => !p.startsWith('/e/'))) {
    const wanted = new Set(paths);
    for (const hit of otherCandidates(viewer)) {
      if (!wanted.has(hit.href) || found.has(hit.href)) continue;
      found.set(hit.href, {
        kind: hit.kind,
        href: hit.href,
        name: hit.name,
        icon: hit.kind === 'speler' ? 'badge' : KIND_ICON[hit.kind],
        hint: hit.caseName ?? null,
      });
    }
  }
  return paths.map((p) => found.get(p)).filter((hit): hit is RecentHit => Boolean(hit));
}
