'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';

export type EntryRef = {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  colour?: string | null;
};

type Suggestion = {
  id: string;
  slug: string;
  name: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
  typeSlug: string;
  shortDescription: string;
};

/**
 * Picks one existing entry, or creates it. Used by `entry_link` fields; the
 * multi-value `entry_links` field stacks these.
 */
export function EntryPicker({
  value,
  ofType,
  placeholder = 'Zoeken…',
  onPick,
  onClear,
}: {
  value: EntryRef | null;
  ofType?: string[];
  placeholder?: string;
  onPick: (entry: EntryRef) => void;
  onClear: () => void;
}) {
  const ui = useUi();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const typed = query.trim();
    if (!open || typed.length < 1) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const types = ofType?.length ? `&types=${ofType.join(',')}` : '';
      try {
        const response = await fetch(
          `/api/suggest?q=${encodeURIComponent(typed)}&limit=6${types}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { entries: Suggestion[] };
        setItems(data.entries ?? []);
      } catch {
        /* ignore */
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, ofType]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  if (value) {
    return (
      <span className="row" style={{ gap: '0.35rem' }}>
        <a className="entry-chip" href={`/e/${value.slug}`} data-entry-id={value.id} style={value.colour ? ({ ['--chip-colour' as string]: value.colour } as React.CSSProperties) : undefined}>
          {value.name}
        </a>
        <button type="button" className="btn btn-ghost btn-small" onClick={onClear} aria-label="Wissen">
          <Icon name="close" size={14} />
        </button>
      </span>
    );
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        className="input"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />
      {open && query.trim() && (
        <ul className="suggest-list" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0 }}>
          {items.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="suggest-item"
                onClick={() => {
                  onPick({
                    id: entry.id,
                    name: entry.name,
                    slug: entry.slug,
                    icon: entry.typeIcon,
                    colour: entry.typeColour,
                  });
                  setQuery('');
                  setOpen(false);
                }}
              >
                <Icon name={entry.typeIcon} size={15} style={{ color: entry.typeColour }} />
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
              onClick={() => {
                const name = query.trim();
                setQuery('');
                setOpen(false);
                ui.openNewEntry({
                  name,
                  typeSlug: ofType?.[0],
                  onCreated: (entry) =>
                    onPick({
                      id: entry.id,
                      name: entry.name,
                      slug: entry.slug,
                      icon: entry.typeIcon,
                      colour: entry.typeColour,
                    }),
                });
              }}
            >
              <Icon name="plus" size={15} style={{ color: 'var(--stamp-red)' }} />
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
