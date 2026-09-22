'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMayType } from '@/components/you/AuthorProvider';
import { ShortField } from '@/components/live/LiveFields';
import { SideChoice } from '@/components/keeper/SideChoice';
import { useUi } from './UiProvider';
import { Sheet } from './Sheet';
import { clearDraft, readDraft, writeDraft, DRAFT_CASE } from '@/lib/sheetDraft';
import { fill } from '@/lib/words';

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
  /* §69 (4.5): as in `NewEntrySheet` — a prefill wins over a draft and clears it. */
  const seeded = Boolean(prefill.name || prefill.summary);
  const draft = useMemo(() => {
    if (seeded) {
      clearDraft(DRAFT_CASE);
      return {};
    }
    return readDraft(DRAFT_CASE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [name, setName] = useState(prefill.name ?? draft.name ?? '');
  const [summary, setSummary] = useState(prefill.summary ?? draft.summary ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  // §48: a dossier hangs in nothing, so its side is simply the side the hand
  // is standing on — and a Keeper may say otherwise before it is opened.
  const ui = useUi();
  const [keeperSide, setKeeperSide] = useState(ui.side === 'keeper');

  /*
   * §18b: opening this sheet is an act of writing, so the question comes
   * *before* it — `ensureAuthor` inside `useUi().openNewCase`, the only door
   * in. Asking from here put a sheet on top of a sheet.
   */
  const mayType = useMayType();

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  /* §69 (4.5): every keystroke into the page-lived draft. */
  useEffect(() => {
    writeDraft(DRAFT_CASE, { name, summary });
  }, [name, summary]);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          summary,
          // §48: ignored by the server for anyone who is not a Keeper.
          keeperOnly: ui.isKeeper ? keeperSide : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Opslaan is niet gelukt.');
        setBusy(false);
        return;
      }
      // §69 (4.5): it exists now, so the draft of it is done.
      clearDraft(DRAFT_CASE);
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
        <label className="label" id="new-case-summary-label" htmlFor="new-case-summary">
          Samenvatting
        </label>
        {/* §95: the dossier page's own box — a picked name is a chip with its
            artikel in it. Enter opens the dossier, as it always did here. */}
        <ShortField
          noRoom
          ungated
          field="summary"
          id="new-case-summary"
          className="input"
          ariaLabelledBy="new-case-summary-label"
          value={summary}
          placeholder={`Eén regel: wat wordt er onderzocht? ${fill(ui.words.mentionHint, { artikel: ui.words.entry })}`}
          onValue={(next) => setSummary(next)}
          onEnter={() => void create()}
        />
      </div>

      <SideChoice show={ui.isKeeper} keeper={keeperSide} onChange={setKeeperSide} words={ui.words} />

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
        disabled={!mayType || !name.trim() || busy}
      >
        {busy ? 'Openen…' : 'Openen'}
      </button>
    </Sheet>
  );
}
