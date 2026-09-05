'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { PendingEdit } from '@/lib/entries/review';

/**
 * §17: the owner's side of the queue, on their own fiche.
 *
 * Someone who may see this fiche but not change it can still propose a change.
 * The Keeper sees every proposal in Beheer; the owner sees the ones for their
 * own fiche right here, with the same two buttons and the same note back.
 */
export function ProposalsPanel({
  entryId,
  initial,
}: {
  entryId: string;
  initial: PendingEdit[];
}) {
  const ui = useUi();
  const [proposals, setProposals] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function decide(pendingId: string, decision: 'approve' | 'reject') {
    setBusy(pendingId);
    try {
      const response = await fetch(`/api/entries/${entryId}/proposals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pendingId, decision, note: notes[pendingId] ?? '' }),
      });
      const data = await response.json();
      if (!response.ok) {
        ui.toast(data.error ?? 'Het is niet gelukt.');
        return;
      }
      setProposals(data.proposals ?? []);
      ui.toast(decision === 'approve' ? 'Voorstel overgenomen.' : 'Voorstel afgewezen.');
      if (decision === 'approve') window.location.reload();
    } catch {
      ui.toast('Geen verbinding met het archief.');
    } finally {
      setBusy(null);
    }
  }

  if (!proposals.length) return null;

  return (
    <details className="section" open>
      <summary>
        <Icon name="flag" size={14} /> Voorstellen{' '}
        <span className="muted">({proposals.length})</span>
      </summary>
      <div className="stack" style={{ padding: '0.6rem 0 1rem' }}>
        {proposals.map((proposal) => (
          <div
            key={proposal.id}
            style={{
              border: '1px solid var(--rule)',
              background: 'var(--paper-raised)',
              padding: '0.7rem',
            }}
          >
            <p className="small" style={{ margin: '0 0 0.5rem' }}>
              <strong title={proposal.proposedByAccount ?? undefined}>{proposal.proposedByName ?? 'Iemand'}</strong> stelt voor:
            </p>
            {proposal.fields.length === 0 ? (
              <p className="tiny muted" style={{ margin: 0 }}>
                Geen zichtbaar verschil met wat er nu staat.
              </p>
            ) : (
              proposal.fields.map((field) => (
                <div key={field.key} className="small" style={{ marginBottom: '0.5rem' }}>
                  <span className="label">{field.label}</span>
                  <div style={{ color: 'var(--stamp-red)', textDecoration: 'line-through' }}>
                    {field.before || '—'}
                  </div>
                  <div style={{ color: 'var(--link)' }}>{field.after || '—'}</div>
                </div>
              ))
            )}
            <input
              className="input"
              placeholder="Een woord terug (mag leeg)"
              value={notes[proposal.id] ?? ''}
              onChange={(event) => setNotes({ ...notes, [proposal.id]: event.target.value })}
              style={{ margin: '0.4rem 0' }}
            />
            <div className="row-wrap">
              <button
                type="button"
                className="btn btn-small btn-primary"
                disabled={busy === proposal.id}
                onClick={() => void decide(proposal.id, 'approve')}
              >
                <Icon name="check" size={14} /> Overnemen
              </button>
              <button
                type="button"
                className="btn btn-small btn-ghost"
                disabled={busy === proposal.id}
                onClick={() => void decide(proposal.id, 'reject')}
              >
                Afwijzen
              </button>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
