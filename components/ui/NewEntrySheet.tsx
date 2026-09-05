'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Sheet } from './Sheet';
import { useUi } from './UiProvider';
import { capitalise } from '@/lib/words';
import type { EntryTypeLite } from './UiProvider';

export type CreatedEntry = {
  id: string;
  slug: string;
  name: string;
  typeSlug: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
  shortDescription: string;
};

export type NewEntryPrefill = {
  name?: string;
  shortDescription?: string;
  typeSlug?: string;
  /** When set, the sheet hands the entry back instead of navigating to it. */
  onCreated?: (entry: CreatedEntry) => void;
};

/** §6, verbatim. */
const DESCRIPTION_PLACEHOLDER =
  'Waar kwam je ze tegen, wat was de sfeer, wat was de context van de eerste ontmoeting, en hoe zagen ze eruit?';

const LAST_TYPE_KEY = 'zcf:last-type';

type Suggestion = {
  id: string;
  slug: string;
  name: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
  shortDescription: string;
};

export function NewEntrySheet({
  types,
  prefill,
  onClose,
  onCreated,
}: {
  types: EntryTypeLite[];
  prefill: NewEntryPrefill;
  onClose: () => void;
  onCreated: (entry: CreatedEntry) => void;
}) {
  const initialType = useMemo(() => {
    if (prefill.typeSlug && types.some((t) => t.slug === prefill.typeSlug)) return prefill.typeSlug;
    if (typeof window !== 'undefined') {
      const remembered = window.localStorage.getItem(LAST_TYPE_KEY);
      if (remembered && types.some((t) => t.slug === remembered)) return remembered;
    }
    return types[0]?.slug ?? 'character';
  }, [prefill.typeSlug, types]);

  const words = useUi().words;
  const [typeSlug, setTypeSlug] = useState(initialType);
  const [name, setName] = useState(prefill.name ?? '');
  const [description, setDescription] = useState(prefill.shortDescription ?? '');
  const [similar, setSimilar] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  // "Did you mean…" — up to 5 existing entries with similar names.
  useEffect(() => {
    const query = name.trim();
    if (query.length < 2) {
      setSimilar([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(query)}&limit=5`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { entries: Suggestion[] };
        setSimilar(data.entries ?? []);
      } catch {
        /* aborted or offline — the sheet still works */
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name]);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ typeSlug, name: name.trim(), shortDescription: description }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Opslaan is niet gelukt.');
        setBusy(false);
        return;
      }
      window.localStorage.setItem(LAST_TYPE_KEY, typeSlug);
      onCreated(data.entry as CreatedEntry);
    } catch {
      setError('Geen verbinding met het archief.');
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} labelledBy="new-entry-title">
      <div className="row" style={{ marginBottom: '0.8rem' }}>
        <h2 id="new-entry-title" style={{ margin: 0, fontSize: '1.3rem' }}>
          {words.newEntry}
        </h2>
        <div className="spacer" />
        <button className="btn btn-ghost btn-small" type="button" onClick={onClose} aria-label="Sluiten">
          <Icon name="close" size={18} />
        </button>
      </div>

      <div
        className="row-wrap"
        role="radiogroup"
        aria-label={capitalise(words.entryType)}
        style={{ marginBottom: '0.9rem' }}
      >
        {types.map((type) => (
          <button
            key={type.slug}
            type="button"
            role="radio"
            aria-checked={type.slug === typeSlug}
            className={`chip chip-selectable${type.slug === typeSlug ? ' chip-active' : ''}`}
            onClick={() => setTypeSlug(type.slug)}
          >
            <Icon name={type.icon} size={15} />
            {type.label}
          </button>
        ))}
      </div>

      <div className="field">
        <label className="label" htmlFor="new-entry-name">
          Naam
        </label>
        <input
          id="new-entry-name"
          ref={nameRef}
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void create();
            }
          }}
          autoComplete="off"
          enterKeyHint="done"
        />

        {similar.length > 0 && (
          <>
            <p className="tiny muted" style={{ margin: '0.5rem 0 0' }}>
              Bedoel je…
            </p>
            <ul className="suggest-list">
              {similar.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/e/${entry.slug}`}
                    className="suggest-item"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                    onClick={onClose}
                  >
                    <Icon name={entry.typeIcon} size={16} style={{ color: entry.typeColour }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{entry.name}</strong>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {entry.typeLabel}
                      </span>
                    </span>
                    <Icon name="chevron" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="field">
        <label className="label" htmlFor="new-entry-description">
          Korte beschrijving
        </label>
        <textarea
          id="new-entry-description"
          className="textarea"
          value={description}
          placeholder={DESCRIPTION_PLACEHOLDER}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
        />
      </div>

      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%' }}
        onClick={create}
        disabled={!name.trim() || busy}
      >
        {busy ? 'Opbergen…' : 'Aanmaken'}
      </button>
    </Sheet>
  );
}
