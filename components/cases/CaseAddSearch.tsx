'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';

type Suggestion = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  typeSlug: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
};

/**
 * §7: the search box at the top of every type tab. Typing filters existing
 * entries; the last result is always "Create '<typed>'", which opens the New
 * entry sheet with the type preselected and files the result in this case.
 */
export function CaseAddSearch({
  caseId,
  typeSlugs,
  placeholder,
  onAdded,
}: {
  caseId: string;
  /** Restrict the picker to these types. Empty means every type. */
  typeSlugs?: string[];
  placeholder?: string;
  onAdded: () => void;
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
    <div style={{ position: 'relative', marginBottom: '0.9rem' }}>
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
                  <strong>{entry.name}</strong>
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
  );
}
