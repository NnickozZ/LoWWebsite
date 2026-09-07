'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { borderClass } from '@/components/borders';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { CaseEntry } from '@/lib/cases/service';

/**
 * §7: uniform 3:4 cover, name, short description clamped to two lines, the case
 * note in italics. The kebab edits the note or removes it from the case.
 *
 * Round 19: the cover is drawn with the artikel's own staand crop — the one
 * every list uses. A dossier no longer keeps a crop of its own, so there is
 * no crop mode here; "Bijsnijden" lives on the artikel.
 */
export function CaseEntryCard({
  caseId,
  entry,
  onChanged,
  readOnly = false,
}: {
  caseId: string;
  entry: CaseEntry;
  onChanged: () => void;
  /** §17: no note or remove for someone who may only look. */
  readOnly?: boolean;
}) {
  const ui = useUi();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(entry.caseNote);

  async function saveNote(next: string) {
    setNote(next);
    setEditingNote(false);
    await fetch(`/api/cases/${caseId}/entries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, note: next, noteOnly: true }),
    });
    onChanged();
  }

  async function remove() {
    setMenuOpen(false);
    const previousNote = note;
    await fetch(`/api/cases/${caseId}/entries?entryId=${encodeURIComponent(entry.id)}`, {
      method: 'DELETE',
    });
    onChanged();
    router.refresh();
    ui.toast(`${entry.name} uit dit dossier gehaald.`, {
      label: 'Ongedaan maken',
      onAction: async () => {
        await fetch(`/api/cases/${caseId}/entries`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entryId: entry.id, note: previousNote }),
        });
        onChanged();
        router.refresh();
      },
    });
  }

  return (
    <div className={`card ${borderClass(entry.typeBorder)}`}>
      <Link href={`/e/${entry.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
        <Cover
          assetId={entry.coverAssetId}
          crop={entry.coverCrop}
          shape="portrait"
          alt=""
          icon={entry.typeIcon}
          colour={entry.typeColour}
        />
      </Link>

      {!readOnly && (
      <button
        type="button"
        aria-label={`Opties voor ${entry.name}`}
        onClick={() => setMenuOpen((open) => !open)}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 32,
          height: 32,
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
          borderRadius: 2,
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        ⋯
      </button>
      )}

      {menuOpen && !readOnly && (
        <div
          className="suggest-list"
          style={{ position: 'absolute', top: 38, right: 4, zIndex: 20, width: 190 }}
        >
          <button type="button" className="suggest-item" onClick={() => { setMenuOpen(false); setEditingNote(true); }}>
            <Icon name="file" size={15} />
            {note ? 'Dossiernotitie bewerken' : 'Dossiernotitie toevoegen'}
          </button>
          <button type="button" className="suggest-item" onClick={remove}>
            <Icon name="trash" size={15} />
            Uit dossier halen
          </button>
        </div>
      )}

      <div className="card-body">
        <Link href={`/e/${entry.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
          <p className="card-name">{entry.name}</p>
          {entry.shortDescription && (
            <p className="tiny muted clamp-2" style={{ margin: 0 }}>
              {entry.shortDescription}
            </p>
          )}
        </Link>

        {editingNote ? (
          <textarea
            className="textarea"
            autoFocus
            defaultValue={note}
            rows={2}
            placeholder="Waarom dit hier van belang is"
            style={{ marginTop: '0.4rem', minHeight: 56, fontSize: '0.85rem' }}
            onBlur={(event) => void saveNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditingNote(false);
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                void saveNote((event.target as HTMLTextAreaElement).value);
              }
            }}
          />
        ) : (
          note && (
            <p
              className="tiny clamp-2"
              style={{ margin: '0.35rem 0 0', fontStyle: 'italic', cursor: 'text' }}
              onClick={() => setEditingNote(true)}
            >
              {note}
            </p>
          )
        )}
      </div>
    </div>
  );
}
