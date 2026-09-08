'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { SideChoice } from '@/components/keeper/SideChoice';
import { MentionPopover, MentionRow } from '@/components/ui/MentionPopover';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { fitUpload } from '@/components/shrinkImage';
import { imageFromClipboard, pasteIsForTyping, uploadForm, uploadLimitLabel, SHRUNK_NOTICE } from '@/lib/upload';

/**
 * §19: the Keeper hangs a map. One sheet: a picture and a name, and the map
 * is on the shelf with no pins yet.
 *
 * §30: the picture may also be pasted. A map is very often a screenshot of
 * something else — and a screenshot is exactly the shape of clipboard that has
 * no file behind it, so `imageFromClipboard` is what reads it. Pasting only
 * *chooses* the picture, as the file dialog does; nothing goes up until
 * Ophangen, which is also where the one size ceiling is (`/api/maps` answers
 * with whoever's ceiling applies and its own wording). The sentence under the
 * field says that number rather than spelling one out, because it is the
 * Keeper's 20 MB for a Keeper and a player's 2 MB for a player, and a picture
 * heavier than it is shrunk to fit on the way out (`fitUpload`).
 */
export function NewMapButton() {
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  /**
   * A pasted File cannot be put into an `<input type=file>` — the browser will
   * not let anything set its value — so the sheet has to say for itself which
   * picture it is holding, or a paste looks like it did nothing.
   */
  const [pasted, setPasted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  // §48: a landkaart hangs in no dossier, so the only question is which side
  // of the archive the Keeper is standing on when they hang it.
  const [keeperSide, setKeeperSide] = useState(ui.side === 'keeper');
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  /**
   * The listener lives only while the sheet is open, so a paste anywhere else
   * on the page is nobody's business but the page's. A paste into the name or
   * the description is text and stays text (`pasteIsForTyping`).
   */
  useEffect(() => {
    if (!open) return;
    const onPaste = (event: ClipboardEvent) => {
      if (pasteIsForTyping(event.target)) return;
      const picture = imageFromClipboard(event);
      if (!picture) return;
      event.preventDefault();
      setFile(picture);
      setPasted(true);
      setError(null);
      if (fileRef.current) fileRef.current.value = '';
      setName((current) => current || picture.name.replace(/\.[a-z0-9]+$/i, ''));
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [open]);

  async function submit() {
    if (!file) {
      setError('Kies eerst een afbeelding.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // A drawing over the ceiling is shrunk to fit before it goes up; only
      // one that cannot be made to fit comes back as an error.
      const fitted = await fitUpload(file, ui.uploadLimit);
      if ('error' in fitted) {
        setError(fitted.error);
        return;
      }
      if (fitted.shrunk) ui.toast(SHRUNK_NOTICE);
      const form = new FormData();
      form.set('file', fitted.file);
      form.set('name', name.trim() || file.name.replace(/\.[a-z0-9]+$/i, ''));
      form.set('description', description);
      // §48: which side it is born on. A form, so it travels as a word.
      if (ui.isKeeper) form.set('keeperOnly', keeperSide ? 'true' : 'false');
      // The answer is read for what it is: the archive's JSON, or the web
      // server's refusal (a 413 for a body over its own ceiling).
      const result = await uploadForm<{ map?: { slug: string } }>('/api/maps', form);
      if (!result.ok || !result.data.map) {
        setError(result.ok ? 'Ophangen is niet gelukt.' : result.error);
        return;
      }
      setOpen(false);
      router.push(`/maps/${result.data.map.slug}`);
      router.refresh();
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
                  setPasted(false);
                  if (chosen && !name) setName(chosen.name.replace(/\.[a-z0-9]+$/i, ''));
                }}
              />
              <p className="tiny muted" style={{ margin: '0.3rem 0 0' }}>
                Een scan, een tekening, een schermafbeelding — tot {uploadLimitLabel(ui.uploadLimit)}. Grote kaarten
                blijven scherp tot 3200 px.
                Of plak er een: Ctrl+V, op een Mac Cmd+V.
              </p>
              {pasted && file && (
                <p className="tiny" style={{ margin: '0.2rem 0 0' }}>
                  Geplakt: {file.name}
                </p>
              )}
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
                ref={descriptionRef}
                className="input"
                rows={2}
                value={description}
                placeholder="Wat staat erop, en uit welk jaar"
                onChange={(event) => setDescription(event.target.value)}
              />
              {/* §48: `@` here as well — an omschrijving is a description like
                  any other, and this one names places for a living. */}
              <MentionPopover forRef={descriptionRef} />
              {/* §54: and the chips under it, clickable while you write. */}
              <MentionRow text={description} />
            </div>
            <SideChoice show={ui.isKeeper} keeper={keeperSide} onChange={setKeeperSide} words={words} />
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
