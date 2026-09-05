'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { capitalise } from '@/lib/words';
import { fuzzyScore } from '@/lib/search/fuzzy';
import type { CaseRef } from '@/lib/cases/service';

/**
 * §21: names one or more dossiers in an infobox field — the working half of
 * what used to say "verschijnt zodra de dossiers er zijn (fase 2)".
 *
 * Two things it does *not* do, both on purpose:
 *
 *  - It never stores a dossier's name, only its id. A name copied into an
 *    artikel's fields would still be there after the dossier was renamed, and
 *    would be printed to readers who may not open it. The names come back from
 *    the server per viewer (`resolveCaseRefs`), which is also why an id that
 *    resolves to nothing is quietly left out instead of drawn as a blank chip.
 *  - It does not offer every dossier in a dropdown. `/api/cases` already lists
 *    only what this viewer may see, and the list is filtered here by the same
 *    fuzzy match the rest of the archive uses.
 */
export function CasePicker({
  id,
  ids,
  cases,
  multiple,
  readOnly = false,
  onChange,
  onPicked,
}: {
  /** The label's `htmlFor` target, so the row stays one labelled control. */
  id: string;
  /** What is stored: dossier ids, in the order they were added. */
  ids: string[];
  /** Ids resolved to names, for this viewer. Ids missing from it stay unnamed. */
  cases: Record<string, CaseRef>;
  /** `case_links` takes several; `case_link` takes one and closes the box. */
  multiple: boolean;
  readOnly?: boolean;
  onChange: (ids: string[]) => void;
  /** A dossier picked here is not in `cases` yet; the page folds it in. */
  onPicked?: (item: CaseRef) => void;
}) {
  const ui = useUi();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<CaseRef[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || all.length) return;
    void fetch('/api/cases')
      .then((response) => (response.ok ? response.json() : { cases: [] }))
      .then((data) => setAll(data.cases ?? []))
      .catch(() => undefined);
  }, [open, all.length]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const chosen = useMemo(() => new Set(ids), [ids]);

  const matches = useMemo(() => {
    const free = all.filter((item) => !chosen.has(item.id));
    const typed = query.trim();
    if (!typed) return free.slice(0, 6);
    return free
      .map((item) => ({ item, score: fuzzyScore(item.name, typed) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((row) => row.item);
  }, [all, chosen, query]);

  const take = (item: CaseRef) => {
    onPicked?.(item);
    setAll((current) => (current.some((row) => row.id === item.id) ? current : [item, ...current]));
    onChange(multiple ? [...ids, item.id] : [item.id]);
    setQuery('');
    setOpen(false);
  };

  const named = ids.map((caseId) => ({ id: caseId, item: cases[caseId] }));
  const full = !multiple && ids.length > 0;

  return (
    <div ref={boxRef} className="stack" style={{ position: 'relative', gap: '0.4rem' }}>
      {named.length > 0 && (
        <div className="row-wrap">
          {named.map(({ id: caseId, item }) => (
            <span key={caseId} className="row" style={{ gap: '0.2rem' }}>
              {item ? (
                <a className="entry-chip" href={`/c/${item.slug}`} data-case-id={item.id}>
                  <Icon name="folder" size={12} />
                  {item.name}
                </a>
              ) : (
                // The id points at a dossier this viewer may not open. Naming it
                // is the leak; saying a row is there is not.
                <span className="entry-chip" style={{ opacity: 0.6 }} title="Je mag dit dossier niet inzien">
                  <Icon name="lock" size={12} />
                  Niet zichtbaar
                </span>
              )}
              {!readOnly && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  aria-label={`${item?.name ?? 'Dossier'} verwijderen`}
                  onClick={() => onChange(ids.filter((other) => other !== caseId))}
                >
                  <Icon name="close" size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!readOnly && !full && (
        <>
          <input
            id={id}
            className="input"
            value={query}
            placeholder={named.length ? 'Nog een dossier…' : `Zoek een ${ui.words.case}…`}
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
              {matches.map((item) => (
                <li key={item.id}>
                  <button type="button" className="suggest-item" onClick={() => take(item)}>
                    <Icon name="folder" size={15} style={{ color: 'var(--ink-muted)' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{item.name}</strong>
                    </span>
                  </button>
                </li>
              ))}
              {!matches.length && !query.trim() && (
                <li className="tiny muted" style={{ padding: '0.5rem 0.6rem' }}>
                  Er is nog geen {ui.words.case} om naar te wijzen.
                </li>
              )}
              <li>
                <button
                  type="button"
                  className="suggest-item"
                  onClick={() => {
                    const name = query.trim();
                    setQuery('');
                    setOpen(false);
                    ui.openNewCase({
                      name,
                      onCreated: (created) =>
                        take({
                          id: created.id,
                          name: created.name,
                          slug: created.slug,
                          status: 'open',
                        }),
                    });
                  }}
                >
                  <Icon name="plus" size={15} style={{ color: 'var(--stamp-red)' }} />
                  <span>
                    {query.trim() ? (
                      <>
                        &lsquo;<strong>{query.trim()}</strong>&rsquo; aanmaken
                      </>
                    ) : (
                      <>{capitalise(ui.words.case)} aanmaken</>
                    )}
                  </span>
                </button>
              </li>
            </ul>
          )}
        </>
      )}

      {readOnly && !named.length && <p className="tiny muted" style={{ margin: 0 }}>—</p>}
    </div>
  );
}
