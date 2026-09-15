'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { fuzzyScore } from '@/lib/search/fuzzy';
import type { StoredTreeRef } from '@/lib/entries/fieldValues';
import { useDismiss } from '@/components/ui/useDismiss';
import { useSuggestKeys } from '@/components/ui/useSuggestKeys';
import { NewFamilyTreeSheet } from './NewFamilyTreeSheet';

/**
 * §66 (round 32): names *one* stamboom in an infobox field — the editing face
 * of `family_tree_link`, and the exact sibling of `CasePicker`.
 *
 * Two differences from the dossier's picker, both deliberate:
 *
 *  - It stores the name and the slug beside the id (`StoredTreeRef`), because
 *    nothing resolves a stamboom per viewer on the way to the reading face the
 *    way `resolveCaseRefs` resolves a dossier. `GET /api/family-trees` already
 *    lists only what this viewer may open (and, per §50, only the side they
 *    stand on), so what is offered here is what may be named.
 *  - **§69, round 35: it makes one too.** Until then it was the only picker in
 *    the archive without a "'X' aanmaken" row, on the reasoning that a stamboom
 *    is a canvas with a shelf of its own and a tree conjured out of an infobox
 *    would be an empty one nobody opens. Nick reversed that: an empty stamboom
 *    is exactly what you want at the moment you are filling in a Familie, and
 *    the alternative was leaving the artikel half-typed to go and make one. The
 *    sheet is `NewFamilyTreeSheet`, the same one the shelf's button opens, and
 *    it hands the tree *back* rather than navigating to it — the person is in
 *    the middle of a page.
 *
 * The list is fetched once, when the box is first focused, and filtered here by
 * the same fuzzy match the rest of the archive uses — an archive has a handful
 * of stambomen, so a request per keystroke would be for nothing.
 */
type TreeRow = { id: string; name: string; slug: string; caseName?: string | null };

export function FamilyTreePicker({
  id,
  value,
  readOnly = false,
  onChange,
}: {
  /** The label's `htmlFor` target, so the row stays one labelled control. */
  id: string;
  value: StoredTreeRef | null;
  readOnly?: boolean;
  onChange: (next: StoredTreeRef | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<TreeRow[]>([]);
  /** §69: the aanmaak-sheet, with what was typed as its name. */
  const [making, setMaking] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const closeList = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open || all.length) return;
    void fetch('/api/family-trees')
      .then((response) => (response.ok ? response.json() : { trees: [] }))
      .then((data) => setAll(Array.isArray(data.trees) ? data.trees : []))
      .catch(() => undefined);
  }, [open, all.length]);

  /*
   * §69: Escape closes it and a press outside closes it — the box holds the
   * input as well as the list, so the caret never leaves and there is nothing
   * to hand back.
   */
  useDismiss({ open, onDismiss: closeList, ref: boxRef });
  /*
   * §69 (5.2): ↑ ↓ lopen de lijst en Enter kiest de rij — hetzelfde als de
   * `@`-lijst, en om dezelfde reden: de eerste rij is `'X' aanmaken`, dus een
   * haastige hand die niet kan kiezen zonder de muis maakt een tweede artikel.
   */
  const keys = useSuggestKeys({ open: open, ref: boxRef });

  const matches = useMemo(() => {
    const free = all.filter((row) => row.id !== value?.id);
    const typed = query.trim();
    if (!typed) return free.slice(0, 6);
    return free
      .map((row) => ({ row, score: fuzzyScore(row.name, typed) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((hit) => hit.row);
  }, [all, query, value?.id]);

  const take = (row: TreeRow) => {
    onChange({ id: row.id, name: row.name, slug: row.slug });
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="stack" style={{ position: 'relative', gap: '0.4rem' }}>
      {value && (
        <div className="row-wrap">
          <span className="row" style={{ gap: '0.2rem' }}>
            {value.slug ? (
              <a className="entry-chip" href={`/stambomen/${value.slug}`} data-family-tree-id={value.id}>
                <Icon name="tree" size={12} />
                {value.name || 'Stamboom'}
              </a>
            ) : (
              // An id with no name beside it: a value written by hand, or one
              // whose tree was named after it was stored. It is a row that is
              // there, which is all a chip can honestly say.
              <span className="entry-chip" style={{ opacity: 0.6 }}>
                <Icon name="tree" size={12} />
                {value.name || 'Stamboom'}
              </span>
            )}
            {!readOnly && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                aria-label={`${value.name || 'Stamboom'} verwijderen`}
                onClick={() => onChange(null)}
              >
                <Icon name="close" size={13} />
              </button>
            )}
          </span>
        </div>
      )}

      {!readOnly && !value && (
        <>
          <input
            id={id}
            className="input"
            value={query}
            placeholder="Zoek een stamboom…"
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            /* §69 (5.2): de pijltjes en Enter. */
            onKeyDown={keys.onKeyDown}
          />

          {open && (
            <ul
              className="suggest-list"
              style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%' }}
            >
              {matches.map((row) => (
                <li key={row.id}>
                  <button type="button" className="suggest-item" onClick={() => take(row)}>
                    <Icon name="tree" size={15} style={{ color: 'var(--ink-muted)' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{row.name}</strong>
                    </span>
                  </button>
                </li>
              ))}
              {!matches.length && !query.trim() && (
                <li className="tiny muted" style={{ padding: '0.5rem 0.6rem' }}>
                  Er is nog geen stamboom om naar te wijzen.
                </li>
              )}
              {/*
               * §69: the aanmaak-rij, and only once something is typed — it is
               * the *first* `.suggest-item`, so an always-there one is the row
               * a hand lands on before the tree it was looking for arrives, and
               * with nothing typed there is no name to give the new one.
               */}
              {query.trim() && (
                <li>
                  <button
                    type="button"
                    className="suggest-item"
                    onClick={() => {
                      setOpen(false);
                      setMaking(query.trim());
                    }}
                  >
                    <Icon name="plus" size={15} style={{ color: 'var(--stamp-red)' }} />
                    <span>
                      &lsquo;<strong>{query.trim()}</strong>&rsquo; aanmaken
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </>
      )}

      {readOnly && !value && <p className="tiny muted" style={{ margin: 0 }}>—</p>}

      {/*
       * §69: made here, so it lands here. `onCreated` is what keeps the person
       * on the page they were filling in — see `NewFamilyTreeSheet`.
       */}
      {making !== null && (
        <NewFamilyTreeSheet
          initialName={making}
          onClose={() => setMaking(null)}
          onCreated={(tree) => {
            setMaking(null);
            setQuery('');
            onChange({ id: tree.id, name: tree.name, slug: tree.slug });
          }}
        />
      )}
    </div>
  );
}
