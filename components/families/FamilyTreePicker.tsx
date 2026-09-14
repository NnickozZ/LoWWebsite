'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { fuzzyScore } from '@/lib/search/fuzzy';
import type { StoredTreeRef } from '@/lib/entries/fieldValues';

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
 *  - It makes nothing. A dossier's picker carries a "'X' aanmaken" row; a
 *    stamboom is a canvas with a shelf of its own, and a tree conjured out of
 *    an infobox would be an empty one nobody ever opens.
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
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || all.length) return;
    void fetch('/api/family-trees')
      .then((response) => (response.ok ? response.json() : { trees: [] }))
      .then((data) => setAll(Array.isArray(data.trees) ? data.trees : []))
      .catch(() => undefined);
  }, [open, all.length]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

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
              {!matches.length && (
                <li className="tiny muted" style={{ padding: '0.5rem 0.6rem' }}>
                  {query.trim()
                    ? 'Geen stamboom met die naam.'
                    : 'Er is nog geen stamboom om naar te wijzen.'}
                </li>
              )}
            </ul>
          )}
        </>
      )}

      {readOnly && !value && <p className="tiny muted" style={{ margin: 0 }}>—</p>}
    </div>
  );
}
