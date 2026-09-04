'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { fuzzyScore } from '@/lib/search/fuzzy';

type CaseLite = { id: string; slug: string; name: string; summary: string; status: string };

const STATUS_LABELS: Record<string, string> = { open: 'open', cold: 'koud', closed: 'gesloten' };

/** §6/§7: "Add to case" → a searchable list of cases the user can see, one tap. */
export function AddToCaseButton({
  entryId,
  entryName,
  inCaseIds,
}: {
  entryId: string;
  entryName: string;
  inCaseIds: string[];
}) {
  const ui = useUi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState<CaseLite[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const already = useMemo(() => new Set(inCaseIds), [inCaseIds]);

  useEffect(() => {
    if (!open) return;
    void fetch('/api/cases')
      .then((r) => (r.ok ? r.json() : { cases: [] }))
      .then((data) => setCases(data.cases ?? []))
      .catch(() => undefined);
    setTimeout(() => searchRef.current?.focus(), 60);
  }, [open]);

  const matches = useMemo(() => {
    const typed = query.trim();
    const available = cases.filter((c) => !already.has(c.id));
    if (!typed) return available.slice(0, 8);
    return available
      .map((c) => ({ c, score: Math.max(fuzzyScore(c.name, typed), fuzzyScore(c.summary, typed)) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.c);
  }, [cases, query, already]);

  async function add(caseId: string, caseName: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/entries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entryId }),
      });
      if (!response.ok) {
        const data = await response.json();
        ui.toast(data.error ?? 'Opslaan is niet gelukt.');
        return;
      }
      setOpen(false);
      ui.toast(`Toegevoegd aan ${caseName}.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-small" onClick={() => setOpen(true)}>
        <Icon name="folder" size={15} />
        {ui.words.addToCase}
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="add-to-case-title">
          <div className="row" style={{ marginBottom: '0.7rem' }}>
            <h2 id="add-to-case-title" style={{ margin: 0, fontSize: '1.2rem' }}>
              {ui.words.addToCase}
            </h2>
            <div className="spacer" />
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Sluiten"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          <label className="visually-hidden" htmlFor="case-search">
            Dossiers zoeken
          </label>
          <input
            id="case-search"
            ref={searchRef}
            className="input"
            value={query}
            placeholder="Zoek een dossier…"
            onChange={(event) => setQuery(event.target.value)}
          />

          <ul className="suggest-list" style={{ marginTop: '0.6rem' }}>
            {matches.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="suggest-item"
                  disabled={busy}
                  onClick={() => void add(item.id, item.name)}
                >
                  <Icon name="folder" size={16} style={{ color: 'var(--ink-muted)' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{item.name}</strong>
                    <span className="tiny muted clamp-2" style={{ display: 'block' }}>
                      {item.summary}
                    </span>
                  </span>
                  <span className="stamp stamp-muted" style={{ fontSize: '0.6rem' }}>
                    {STATUS_LABELS[item.status] ?? item.status}
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
                  setOpen(false);
                  ui.openNewCase({
                    name,
                    onCreated: (created) => void add(created.id, created.name),
                  });
                }}
              >
                <Icon name="plus" size={16} style={{ color: 'var(--stamp-red)' }} />
                <span>
                  {query.trim() ? (
                    <>
                      Dossier &lsquo;<strong>{query.trim()}</strong>&rsquo; openen
                    </>
                  ) : (
                    <>Nieuw dossier openen voor {entryName}</>
                  )}
                </span>
              </button>
            </li>
          </ul>
        </Sheet>
      )}
    </>
  );
}
