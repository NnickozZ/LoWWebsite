'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Sheet } from './Sheet';

export type CreatedCase = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  status: 'open' | 'cold' | 'closed';
};

export type NewCasePrefill = {
  name?: string;
  summary?: string;
  /** When set, the sheet hands the case back instead of navigating to it. */
  onCreated?: (created: CreatedCase) => void;
};

/** §7: same two-field pattern as an entry — name and a one-line summary. */
export function NewCaseSheet({
  prefill,
  onClose,
  onCreated,
}: {
  prefill: NewCasePrefill;
  onClose: () => void;
  onCreated: (created: CreatedCase) => void;
}) {
  const [name, setName] = useState(prefill.name ?? '');
  const [summary, setSummary] = useState(prefill.summary ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), summary }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Opslaan is niet gelukt.');
        setBusy(false);
        return;
      }
      onCreated(data.case as CreatedCase);
    } catch {
      setError('Geen verbinding met het archief.');
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} labelledBy="new-case-title">
      <div className="row" style={{ marginBottom: '0.8rem' }}>
        <h2 id="new-case-title" style={{ margin: 0, fontSize: '1.3rem' }}>
          Dossier openen
        </h2>
        <div className="spacer" />
        <button className="btn btn-ghost btn-small" type="button" onClick={onClose} aria-label="Sluiten">
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="field">
        <label className="label" htmlFor="new-case-name">
          Naam
        </label>
        <input
          id="new-case-name"
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
      </div>

      <div className="field">
        <label className="label" htmlFor="new-case-summary">
          Samenvatting
        </label>
        <input
          id="new-case-summary"
          className="input"
          value={summary}
          placeholder="Eén regel: wat wordt er onderzocht?"
          onChange={(event) => setSummary(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void create();
            }
          }}
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
        {busy ? 'Openen…' : 'Openen'}
      </button>
    </Sheet>
  );
}
