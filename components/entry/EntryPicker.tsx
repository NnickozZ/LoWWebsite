'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { entryDisplayName } from '@/lib/entries/caseName';
import { AdriftChip } from '@/components/entry/AdriftChip';
import { preferredCasesParam, usePreferredCases } from './PreferredCases';

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
  /** §24: the dossier a voorwerp or clue was made in, when it was. */
  originCaseName?: string | null;
  /** §31: this one is in the dossier you are writing in. A flag, not a name. */
  inCase?: boolean;
  /** §24: and whether it is in no dossier at all. */
  adrift?: boolean;
};

/**
 * Picks one existing entry, or creates it. Used by `entry_link` fields; the
 * multi-value `entry_links` field stacks these.
 */
export function EntryPicker({
  id,
  value,
  ofType,
  placeholder = 'Zoeken…',
  onPick,
  onClear,
}: {
  /** So a caller's own `<label htmlFor>` actually points at the box. */
  id?: string;
  value: EntryRef | null;
  ofType?: string[];
  placeholder?: string;
  onPick: (entry: EntryRef) => void;
  onClear: () => void;
}) {
  const ui = useUi();
  // §31: the dossiers this box is being used inside, if any. Their contents
  // sort first; everything else is still in the list, underneath.
  const preferCases = usePreferredCases();
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
      const cases = preferredCasesParam(preferCases);
      try {
        const response = await fetch(
          `/api/suggest?q=${encodeURIComponent(typed)}&limit=6${types}${cases}`,
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
  }, [query, open, ofType, preferCases]);

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
        id={id}
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
                  <strong>{entryDisplayName(entry.name, entry.originCaseName)}</strong>
                  {/* §24: a clue in no dossier — the same remark the wiki makes. */}
                  {entry.adrift && <AdriftChip />}
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {entry.typeLabel}
                  </span>
                </span>
                {/* §31: why this row is at the top. A folder and nothing else —
                    naming the dossier would tell a reader an investigation
                    exists, which is not this list's to say. */}
                {entry.inCase && (
                  <span
                    title="Uit dit dossier"
                    style={{ color: 'var(--ink-muted)', flex: '0 0 auto', display: 'inline-flex' }}
                  >
                    <Icon name="folder" size={13} />
                    <span className="visually-hidden">Uit dit dossier</span>
                  </span>
                )}
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
