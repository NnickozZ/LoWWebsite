import { listBoards } from '@/lib/boards/service';
import { listCases } from '@/lib/cases/service';
import type { Viewer } from '@/lib/entries/visibility';
import { listFamilyTrees } from '@/lib/families/service';
import { kindHref, type KeeperKind } from '@/lib/keeper/kinds';
import { listMaps } from '@/lib/maps/service';
import { listOverzichten, overzichtHref } from '@/lib/overzichten/service';
import { listSpelers } from '@/lib/spelers/service';
import { listTimelines } from '@/lib/timelines/service';
import { rankBy } from './fuzzy';

/**
 * §96: zoeken vindt meer dan artikelen.
 *
 * Tot ronde 57 was `/search` een wiki-zoeker: een dossier, een landkaart, een
 * tijdlijn, een stamboom, een prikbord, een overzicht of een speler gaf
 * "Niets in het archief komt daarmee overeen" — over dingen die er wél waren.
 * Dit is de tweede helft van het antwoord: alles wat geen artikel is, gezocht
 * op **naam**.
 *
 * Rule 1 is de hele functie, en daarom doet ze zelf niets slims. Elke soort
 * ding wordt gelezen door **zijn eigen `list*`**, zonder `bothSides`, dus met
 * zijn eigen zichtbaarheidsregel (§17/§40, de prullenbak inbegrepen) én de
 * §46-kant: een zoeklijst is een lijst. Wat een lezer niet mag zien, komt hier
 * nooit binnen — niet als naam en niet als telling — want er is geen tweede
 * query die het zou kunnen tellen. De fuzzy-rangschikking is die van de
 * artikelen (`rankBy`), zodat "Walcheren" hier hetzelfde betekent als daar.
 *
 * Spelers komen uit de hal (`listSpelers`, dezelfde lijst als `/spelers`):
 * iedereen met een account mag die al zien, dus er valt niets te verbergen.
 * Ze hebben geen kant.
 */

export type OtherKind = Exclude<KeeperKind, 'entry'> | 'speler';

export type OtherHit = {
  kind: OtherKind;
  id: string;
  name: string;
  href: string;
  /** Het dossier waar een vlak in hangt, als de lezer dat dossier mag zien. */
  caseName?: string | null;
};

/** De volgorde van de groepen op het scherm. */
export const OTHER_KINDS: OtherKind[] = [
  'case',
  'overzicht',
  'map',
  'timeline',
  'family_tree',
  'board',
  'speler',
];

export function searchOthers(viewer: Viewer, query: string, options: { limit?: number } = {}): OtherHit[] {
  const q = query.trim();
  if (!q || !viewer) return [];
  const limit = options.limit ?? 20;

  const candidates: OtherHit[] = [
    // §46: every one of these is a list, so none of them passes `bothSides`.
    ...listCases(viewer).map((row) => ({
      kind: 'case' as const,
      id: row.id,
      name: row.name,
      href: kindHref('case', row),
    })),
    ...listOverzichten(viewer).map((row) => ({
      kind: 'overzicht' as const,
      id: row.id,
      name: row.name,
      href: overzichtHref(row),
    })),
    ...listMaps(viewer).map((row) => ({
      kind: 'map' as const,
      id: row.id,
      name: row.name,
      href: kindHref('map', row),
    })),
    ...listTimelines(viewer).map((row) => ({
      kind: 'timeline' as const,
      id: row.id,
      name: row.name,
      href: kindHref('timeline', row),
      caseName: row.caseName,
    })),
    ...listFamilyTrees(viewer).map((row) => ({
      kind: 'family_tree' as const,
      id: row.id,
      name: row.name,
      href: kindHref('family_tree', row),
      caseName: row.caseName,
    })),
    ...listBoards(viewer).map((row) => ({
      kind: 'board' as const,
      id: row.id,
      name: row.name,
      href: kindHref('board', row),
      caseName: row.caseName,
    })),
    ...listSpelers().map((row) => ({
      kind: 'speler' as const,
      id: row.id,
      name: row.username,
      href: `/spelers/${row.slug}`,
    })),
  ];

  return rankBy(candidates, q, (hit) => [hit.name], limit).map((scored) => scored.item);
}
