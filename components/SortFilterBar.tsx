'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useIsPhone } from '@/components/useIsPhone';

/**
 * The one toolbar every list page shares: what is being shown, a "Filters"
 * button, and a sort. Everything lives in the URL, so a filtered list can be
 * bookmarked, sent to someone, and survives a reload — and a server page
 * reads the same search params this bar writes, with `lib/listParams.ts`.
 *
 * Before 5 Sep 2026 every group was a row of chips on the page, and the wiki
 * had six rows of them between its title and the first card. Now the groups
 * live in a panel behind the button — a popover on a desktop, a sheet on a
 * phone — and only the filters that are *on* are shown on the page, as chips
 * with a ×. That is the shape most list pages on the web have settled on
 * (Shneiderman: overview first, then filter; Nielsen: show status, hide the
 * rarely used), and it is what Nick asked for.
 *
 * A group is a set of options. Single-choice groups behave like a radio you
 * can also switch off; multi-choice groups toggle each option on its own and
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
  summary,
}: {
  sorts: SortOption[];
  defaultSort: string;
  groups: FilterGroup[];
  /** What the list holds — "12 dossiers" — shown at the left of the bar. */
  summary?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isPhone = useIsPhone();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const shownGroups = groups.filter((group) => group.options.length > 0);
  const chosen = (key: string): string[] => (params.get(key) ?? '').split(',').filter(Boolean);
  const sort = params.get('sort') ?? defaultSort;
  const active = shownGroups.flatMap((group) =>
    chosen(group.key).flatMap((value) => {
      const option = group.options.find((item) => item.value === value);
      return option ? [{ group, option }] : [];
    }),
  );
  const activeCount = shownGroups.reduce((n, group) => n + chosen(group.key).length, 0);

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

  // A desktop popover closes on a click outside it, and on Escape.
  useEffect(() => {
    if (!open || isPhone) return;
    const onDown = (event: PointerEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, isPhone]);

  const groupRows = shownGroups.map((group) => {
    const current = chosen(group.key);
    return (
      <div key={group.key} className="sortbar-group" role="group" aria-label={group.label}>
        <span className="sortbar-label">{group.label}</span>
        <div className="row-wrap" style={{ gap: '0.35rem' }}>
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
      </div>
    );
  });

  const panel = (
    <div className="sortbar-panel-body">
      <div className="row" style={{ marginBottom: '0.2rem' }}>
        <strong className="small" id={`${panelId}-title`}>
          Filters
        </strong>
        <div className="spacer" />
        {activeCount > 0 && (
          <button type="button" className="btn btn-ghost btn-small" onClick={clear}>
            Wis alles
          </button>
        )}
        <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>
          Klaar
        </button>
      </div>
      {groupRows}
    </div>
  );

  return (
    <div className="sortbar">
      <div className="sortbar-row">
        {summary !== undefined && <span className="sortbar-summary muted small">{summary}</span>}
        <div className="spacer" />

        {shownGroups.length > 0 && (
          <div className="sortbar-anchor" ref={anchorRef}>
            <button
              type="button"
              className={`btn btn-small sortbar-filters${activeCount ? ' sortbar-filters-on' : ''}`}
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-controls={panelId}
              onClick={() => setOpen((current) => !current)}
            >
              <Icon name="filter" size={14} />
              Filters
              {activeCount > 0 && <span className="sortbar-badge">{activeCount}</span>}
              <Icon name="chevron" size={13} className="sortbar-caret" />
            </button>
            {open &&
              (isPhone ? (
                <Sheet onClose={() => setOpen(false)} labelledBy={`${panelId}-title`}>
                  {panel}
                </Sheet>
              ) : (
                <div className="sortbar-panel" id={panelId} role="dialog" aria-label="Filters">
                  {panel}
                </div>
              ))}
          </div>
        )}

        <label className="sortbar-sort">
          <Icon name="sort" size={14} />
          <span className="visually-hidden">Sorteren</span>
          <select className="select" aria-label="Sorteren" value={sort} onChange={(event) => setSort(event.target.value)}>
            {sorts.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {active.length > 0 && (
        <div className="chip-strip sortbar-active" aria-label="Actieve filters">
          {active.map(({ group, option }) => (
            <button
              key={`${group.key}:${option.value}`}
              type="button"
              className="chip chip-selectable chip-active sortbar-active-chip"
              title={`${group.label}: ${option.label} — klik om weg te halen`}
              onClick={() => toggle(group, option.value)}
            >
              {option.icon && <Icon name={option.icon} size={12} />}
              <span className="sortbar-active-group">{group.label}:</span> {option.label}
              <Icon name="close" size={12} />
            </button>
          ))}
          <button type="button" className="chip chip-selectable" onClick={clear}>
            Wis filters
          </button>
        </div>
      )}
    </div>
  );
}
