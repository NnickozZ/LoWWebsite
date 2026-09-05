import type { FilterGroup, SortOption } from '@/components/SortFilterBar';
import type { Visibility } from '@/lib/db/schema';
import type { BrowseOptions } from '@/lib/entries/service';
import { readMany, readOne, type ListParams } from '@/lib/listParams';

/**
 * §14: the wiki's sort and filter vocabulary — shared by `/wiki` and
 * `/wiki/[type]`, which show the same bar over a different set of fiches.
 * Pure: reads search params, builds `BrowseOptions` and the bar's groups.
 */

export const WIKI_SORTS: SortOption[] = [
  { value: 'recent', label: 'Laatst bewerkt' },
  { value: 'name', label: 'Op naam' },
  { value: 'created', label: 'Nieuwste eerst' },
];

const SORT_VALUES = ['recent', 'name', 'created'] as const;
const VISIBILITIES = ['all', 'keeper', 'players'] as const;
const SHOW = ['mine', 'restricted', 'onmap'] as const;

export function readListFilters(
  params: ListParams,
  viewer: { id: string; isKeeper: boolean } | null | undefined,
): Pick<BrowseOptions, 'sort' | 'tag' | 'mine' | 'visibility' | 'restricted' | 'onMap'> {
  const tagRaw = params.tag;
  const tag = (Array.isArray(tagRaw) ? tagRaw[0] : tagRaw) || undefined;
  const visibility = viewer?.isKeeper ? readOne(params, 'visibility', VISIBILITIES, '') : '';
  const show = readMany(params, 'show', SHOW);
  return {
    sort: readOne(params, 'sort', SORT_VALUES, 'recent') as (typeof SORT_VALUES)[number],
    tag,
    mine: show.includes('mine') && viewer ? viewer.id : undefined,
    visibility: (visibility || undefined) as Visibility | undefined,
    restricted: show.includes('restricted') || undefined,
    onMap: show.includes('onmap') || undefined,
  };
}

export function wikiFilterGroups(
  tags: { tag: string; count: number }[],
  viewer: { id: string; isKeeper: boolean } | null | undefined,
): FilterGroup[] {
  const groups: FilterGroup[] = [
    {
      key: 'tag',
      label: 'Tag',
      options: tags.slice(0, 14).map((t) => ({ value: t.tag, label: t.tag, count: t.count })),
    },
    {
      key: 'show',
      label: 'Alleen',
      multi: true,
      options: [
        { value: 'mine', label: 'Van mij', icon: 'you' },
        { value: 'restricted', label: 'Niet voor iedereen', icon: 'lock' },
        { value: 'onmap', label: 'Op een landkaart', icon: 'mapPin' },
      ],
    },
  ];
  if (viewer?.isKeeper) {
    groups.push({
      key: 'visibility',
      label: 'Geheimhouding',
      options: [
        { value: 'all', label: 'Voor iedereen', icon: 'eye' },
        { value: 'players', label: 'Onthuld aan gekozen', icon: 'flag' },
        { value: 'keeper', label: 'Alleen de Keeper', icon: 'shield' },
      ],
    });
  }
  return groups;
}
