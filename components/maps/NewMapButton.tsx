'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';

/**
 * §19: the Keeper hangs a map. One sheet: a picture and a name, and the map
 * is on the shelf with no pins yet.
 */
export function NewMapButton() {
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  async function submit() {
    if (!file) {
      setError('Kies eerst een afbeelding.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('name', name.trim() || file.name.replace(/\.[a-z0-9]+$/i, ''));
      form.set('description', description);
      const response = await fetch('/api/maps', { method: 'POST', body: form });
      const data = (await response.json()) as { map?: { slug: string }; error?: string };
      if (!response.ok || !data.map) {
        setError(data.error ?? 'Ophangen is niet gelukt.');
        return;
      }
      setOpen(false);
      router.push(`/maps/${data.map.slug}`);
      router.refresh();
    } catch {
      setError('Geen verbinding met het archief.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-primary btn-small" onClick={() => setOpen(true)}>
        <Icon name="upload" size={15} />
        {cap(words.map)} ophangen
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="new-map-title">
          <h2 id="new-map-title" style={{ marginTop: 0 }}>
            {cap(words.map)} ophangen
          </h2>
          <div className="stack">
            <div>
              <label className="label" htmlFor="new-map-file">
                Afbeelding
              </label>
              <input
                id="new-map-file"
                ref={fileRef}
                className="input"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const chosen = event.target.files?.[0] ?? null;
                  setFile(chosen);
                  if (chosen && !name) setName(chosen.name.replace(/\.[a-z0-9]+$/i, ''));
                }}
              />
              <p className="tiny muted" style={{ margin: '0.3rem 0 0' }}>
                Een scan, een tekening, een schermafbeelding — tot 100 MB. Grote kaarten blijven scherp tot 3200 px.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="new-map-name">
                Naam
              </label>
              <input
                id="new-map-name"
                className="input"
                value={name}
                placeholder="Bijv. Het eiland"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-map-description">
                Omschrijving
              </label>
              <textarea
                id="new-map-description"
                className="input"
                rows={2}
                value={description}
                placeholder="Wat staat erop, en uit welk jaar"
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            {error && <p className="error-note">{error}</p>}
            <div className="row-wrap">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
                {busy ? 'Bezig…' : 'Ophangen'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                Annuleren
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
