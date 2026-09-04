'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Thumb } from './Cover';
import { Icon } from './Icon';
import { useUi } from './ui/UiProvider';
import type { EntrySummary } from '@/lib/entries/service';

type Results = { names: EntrySummary[]; bodies: EntrySummary[] };

function ResultRow({ entry }: { entry: EntrySummary }) {
  return (
    <Link
      href={`/e/${entry.slug}`}
      className="feed-item"
      style={{ color: 'inherit', textDecoration: 'none' }}
      data-entry-id={entry.id}
    >
      <Thumb
        assetId={entry.coverAssetId}
        crop={entry.coverCrop}
        icon={entry.typeIcon}
        colour={entry.typeColour}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong>{entry.name}</strong>
        <span className="tiny muted clamp-2" style={{ display: 'block' }}>
          {entry.shortDescription}
        </span>
      </span>
    </Link>
  );
}

export function SearchScreen({ initialQuery = '' }: { initialQuery?: string }) {
  const ui = useUi();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Results>({ names: [], bodies: [] });
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const typed = query.trim();
    if (!typed) {
      setResults({ names: [], bodies: [] });
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(typed)}`, {
          signal: controller.signal,
        });
        if (response.ok) setResults((await response.json()) as Results);
      } catch {
        /* aborted */
      } finally {
        setBusy(false);
      }
    }, 140);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setBusy(false);
    };
  }, [query]);

  /** Names grouped by type, in the order the ranking produced them (§10). */
  const grouped = useMemo(() => {
    const groups = new Map<string, { label: string; icon: string; colour: string; items: EntrySummary[] }>();
    for (const entry of results.names) {
      const group = groups.get(entry.typeSlug) ?? {
        label: entry.typeLabel,
        icon: entry.typeIcon,
        colour: entry.typeColour,
        items: [],
      };
      group.items.push(entry);
      groups.set(entry.typeSlug, group);
    }
    return [...groups.values()];
  }, [results.names]);

  const typed = query.trim();

  return (
    <div className="page">
      <label className="visually-hidden" htmlFor="search-input">
        Zoeken in het archief
      </label>
      <input
        id="search-input"
        ref={inputRef}
        className="input"
        value={query}
        placeholder="Zoek op naam, tag, wat dan ook…"
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
        style={{ fontSize: '1.1rem', marginBottom: '1rem' }}
      />

      {!typed && (
        <p className="muted small">
          Typ om te zoeken. Druk overal op <kbd>/</kbd> om hier te komen.
        </p>
      )}

      {typed && (
        <>
          {grouped.map((group) => (
            <section key={group.label} style={{ marginBottom: '1.2rem' }}>
              <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Icon name={group.icon} size={14} style={{ color: group.colour }} />
                {group.label}
              </p>
              {group.items.map((entry) => (
                <ResultRow key={entry.id} entry={entry} />
              ))}
            </section>
          ))}

          {results.bodies.length > 0 && (
            <section style={{ marginBottom: '1.2rem' }}>
              <p className="eyebrow">Genoemd in de tekst</p>
              {results.bodies.map((entry) => (
                <ResultRow key={entry.id} entry={entry} />
              ))}
            </section>
          )}

          {!busy && !results.names.length && !results.bodies.length && (
            <p className="muted small">Niets in het archief komt daarmee overeen.</p>
          )}

          <button
            type="button"
            className="btn"
            style={{ width: '100%', marginTop: '0.5rem' }}
            onClick={() => ui.openNewEntry({ name: typed })}
          >
            <Icon name="plus" size={16} />
            &lsquo;{typed}&rsquo; aanmaken
          </button>
        </>
      )}
    </div>
  );
}
