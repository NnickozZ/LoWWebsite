'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { borderClass } from '@/components/borders';
import { Cover } from '@/components/Cover';
import { CropFrame } from '@/components/CropFrame';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { CaseEntry } from '@/lib/cases/service';
import type { CoverCrop } from '@/lib/db/schema';

/**
 * §7: uniform 3:4 cover, name, short description clamped to two lines, the case
 * note in italics. The kebab removes it from the case or pins it to a board.
 */
export function CaseEntryCard({
  caseId,
  entry,
  onChanged,
}: {
  caseId: string;
  entry: CaseEntry;
  onChanged: () => void;
}) {
  const ui = useUi();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(entry.caseNote);
  const [cropping, setCropping] = useState(false);
  // This case's own crop of the cover; null means "use the entry's".
  const [crop, setCrop] = useState<CoverCrop | null>(entry.caseCrop);

  async function saveCrop(next: CoverCrop | null) {
    setCrop(next);
    await fetch(`/api/cases/${caseId}/entries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, crop: next, cropOnly: true }),
    });
  }

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
      {cropping && entry.coverAssetId ? (
        <CropFrame
          assetId={entry.coverAssetId}
          crop={crop ?? entry.coverCrop}
          className="card-cover card-cover-cropping"
          onCommit={(next) => void saveCrop(next)}
        />
      ) : (
        <Link href={`/e/${entry.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
          <Cover
            assetId={entry.coverAssetId}
            crop={crop ?? entry.coverCrop}
            alt=""
            icon={entry.typeIcon}
            colour={entry.typeColour}
          />
        </Link>
      )}

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

      {menuOpen && (
        <div
          className="suggest-list"
          style={{ position: 'absolute', top: 38, right: 4, zIndex: 20, width: 190 }}
        >
          <button type="button" className="suggest-item" onClick={() => { setMenuOpen(false); setEditingNote(true); }}>
            <Icon name="file" size={15} />
            {note ? 'Dossiernotitie bewerken' : 'Dossiernotitie toevoegen'}
          </button>
          {entry.coverAssetId && (
            <button
              type="button"
              className="suggest-item"
              onClick={() => {
                setMenuOpen(false);
                setCropping(true);
              }}
            >
              <Icon name="camera" size={15} />
              Bijsnijden voor dit dossier
            </button>
          )}
          {entry.coverAssetId && crop && (
            <button
              type="button"
              className="suggest-item"
              onClick={() => {
                setMenuOpen(false);
                setCropping(false);
                void saveCrop(null);
              }}
            >
              <Icon name="close" size={15} />
              Uitsnede van de fiche gebruiken
            </button>
          )}
          <button type="button" className="suggest-item" onClick={remove}>
            <Icon name="trash" size={15} />
            Uit dossier halen
          </button>
        </div>
      )}

      {cropping && (
        <div className="card-crop-bar">
          <span className="tiny muted">Slepen &middot; scrollen om te zoomen</span>
          <button
            type="button"
            className="btn btn-small btn-primary"
            onClick={() => setCropping(false)}
          >
            Klaar
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
