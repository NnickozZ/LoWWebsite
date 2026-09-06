'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { entryDisplayName } from '@/lib/entries/caseName';
import { AdriftChip } from '@/components/entry/AdriftChip';

type Suggestion = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  typeSlug: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
  originCaseName?: string | null;
  /** §24: and whether it is in no dossier at all. */
  adrift?: boolean;
};

/**
 * §7: the search box at the top of every type tab. Typing filters existing
 * entries; the last result is always "Create '<typed>'", which opens the New
 * entry sheet with the type preselected and files the result in this case.
 *
 * The box searches for something that already exists and attaches it. Making
 * something new is the other road, and it used to be reachable only after
 * typing (the last suggestion). `action` puts a visible control for it beside
 * the box: the field halves, the button sits to its right, and on a narrow
 * screen `.row-wrap` drops the button onto its own line at full width.
 */
export function CaseAddSearch({
  caseId,
  typeSlugs,
  placeholder,
  onAdded,
  action,
}: {
  caseId: string;
  /** Restrict the picker to these types. Empty means every type. */
  typeSlugs?: string[];
  placeholder?: string;
  onAdded: () => void;
  /** Optional control rendered to the right of the field, on the same row. */
  action?: ReactNode;
}) {
  const ui = useUi();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const typed = query.trim();
    if (typed.length < 1) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const types = typeSlugs?.length ? `&types=${typeSlugs.join(',')}` : '';
      try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(typed)}&limit=6${types}`, {
          signal: controller.signal,
        });
        if (response.ok) setItems(((await response.json()).entries ?? []) as Suggestion[]);
      } catch {
        /* aborted */
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, typeSlugs]);

  async function add(entryId: string, name: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/entries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entryId }),
      });
      if (!response.ok) {
        ui.toast('Opslaan is niet gelukt.');
        return;
      }
      setQuery('');
      setItems([]);
      onAdded();
      router.refresh();
      ui.toast(`${name} toegevoegd aan dit dossier.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row-wrap" style={{ marginBottom: '0.9rem' }}>
      {/* `position: relative` stays on the field, never on the row: the
          suggestion list is `left: 0; right: 0`, so it must be measured
          against the halved input and not spill under the button. */}
      <div style={{ position: 'relative', flex: '1 1 20rem', minWidth: 0, margin: 0 }}>
        <input
          ref={inputRef}
          className="input"
          value={query}
          placeholder={placeholder ?? 'Zoek of maak…'}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={placeholder ?? 'Aan dit dossier toevoegen'}
        />

        {query.trim() && (
          <ul className="suggest-list" style={{ position: 'absolute', zIndex: 25, left: 0, right: 0 }}>
            {items.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="suggest-item"
                  disabled={busy}
                  onClick={() => void add(entry.id, entry.name)}
                >
                  <Icon name={entry.typeIcon} size={16} style={{ color: entry.typeColour }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{entryDisplayName(entry.name, entry.originCaseName)}</strong>
                    {/* §24: a clue in no dossier — the same remark the wiki makes. */}
                    {entry.adrift && <AdriftChip />}
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {entry.typeLabel}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="suggest-item"
                disabled={busy}
                onClick={() => {
                  const name = query.trim();
                  setQuery('');
                  setItems([]);
                  ui.openNewEntry({
                    name,
                    typeSlug: typeSlugs?.[0],
                    // §24: made *in* this dossier, which is what lets a voorwerp
                    // or a clue be made at all — and what the wiki puts in front
                    // of its name later.
                    caseId,
                    // Typed into the box, so the answer belongs back on this
                    // page: the new thing is attached and the list redraws.
                    onCreated: (created) => void add(created.id, created.name),
                  });
                }}
              >
                <Icon name="plus" size={16} style={{ color: 'var(--stamp-red)' }} />
                <span>
                  &lsquo;<strong>{query.trim()}</strong>&rsquo; aanmaken
                </span>
              </button>
            </li>
          </ul>
        )}
      </div>

      {action}
    </div>
  );
}
