'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';

/**
 * The one bar every list page shares: a sort, and as many filter groups as
 * the page has. Everything lives in the URL, so a filtered list can be
 * bookmarked, sent to someone, and survives a reload — and a server page
 * reads the same search params this bar writes, with `lib/listParams.ts`.
 *
 * A group is a row of chips. Single-choice groups behave like a radio you
 * can also switch off; multi-choice groups toggle each chip on its own and
 * join the chosen values with commas (`?status=open,cold`).
 */

export type SortOption = { value: string; label: string };

export type FilterOption = {
  value: string;
  label: string;
  count?: number;
  icon?: string;
  colour?: string;
};

export type FilterGroup = {
  /** The search param. */
  key: string;
  label: string;
  multi?: boolean;
  options: FilterOption[];
};

export function SortFilterBar({
  sorts,
  defaultSort,
  groups,
  compact = false,
}: {
  sorts: SortOption[];
  defaultSort: string;
  groups: FilterGroup[];
  /** One row: the groups run on after the sort instead of stacking. */
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const chosen = (key: string): string[] => (params.get(key) ?? '').split(',').filter(Boolean);
  const sort = params.get('sort') ?? defaultSort;
  const anyFilter = groups.some((group) => chosen(group.key).length > 0);

  const go = (next: URLSearchParams) => {
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setSort = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === defaultSort) next.delete('sort');
    else next.set('sort', value);
    go(next);
  };

  const toggle = (group: FilterGroup, value: string) => {
    const next = new URLSearchParams(params.toString());
    const current = chosen(group.key);
    let values: string[];
    if (group.multi) {
      values = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    } else {
      values = current.includes(value) ? [] : [value];
    }
    if (values.length) next.set(group.key, values.join(','));
    else next.delete(group.key);
    go(next);
  };

  const clear = () => {
    const next = new URLSearchParams(params.toString());
    for (const group of groups) next.delete(group.key);
    go(next);
  };

  const sortControl = (
    <label className="sortbar-sort">
      <Icon name="sort" size={14} />
      <span className="visually-hidden">Sorteren</span>
      <select
        className="select"
        aria-label="Sorteren"
        value={sort}
        onChange={(event) => setSort(event.target.value)}
      >
        {sorts.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const groupRows = groups
    .filter((group) => group.options.length > 0)
    .map((group) => {
      const current = chosen(group.key);
      return (
        <div key={group.key} className="chip-strip sortbar-group" role="group" aria-label={group.label}>
          <span className="sortbar-label">{group.label}</span>
          {group.options.map((option) => {
            const on = current.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={`chip chip-selectable${on ? ' chip-active' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(group, option.value)}
              >
                {option.icon && <Icon name={option.icon} size={13} style={on ? undefined : { color: option.colour }} />}
                {option.label}
                {typeof option.count === 'number' && <span className="muted">{option.count}</span>}
              </button>
            );
          })}
        </div>
      );
    });

  return (
    <div className={`sortbar${compact ? ' sortbar-compact' : ''}`}>
      <div className="chip-strip sortbar-row">
        {sortControl}
        {compact && groupRows}
        {anyFilter && (
          <button type="button" className="chip chip-selectable" onClick={clear}>
            <Icon name="close" size={12} />
            Wis filters
          </button>
        )}
      </div>
      {!compact && groupRows}
    </div>
  );
}
