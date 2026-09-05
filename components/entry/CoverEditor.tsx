'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { assetUrl } from '@/components/Cover';
import { CropFrame } from '@/components/CropFrame';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { CoverCrop } from '@/lib/db/schema';
import { uploadForm } from '@/lib/upload';

/**
 * §6: upload from device or paste from clipboard.
 *
 * The entry itself shows the whole picture at whatever shape it is — a tall
 * portrait, a wide map, a scan of a letter — and never crops it. Lists are a
 * different problem: they need one uniform shape, so the picture gets a small
 * 3:4 crop that they use and this page does not. That crop is only the
 * *default*: a case card and a board card each keep their own. The file on disk
 * is untouched either way; only a focal point and a zoom are stored.
 *
 * §22 (5 Sep 2026). This lives in the artikel's right-hand column now, at the
 * top of the box whose lower half is the infobox — the shape Wikipedia,
 * Fandom and every wiki after them settled on. Two things follow from being in
 * a 320 px column beside the prose rather than across the header:
 *
 *  - Reading, there is no chrome at all. `readOnly` with no picture renders
 *    nothing, so an artikel without one has no empty frame in its margin.
 *  - Editing, the three tools — replace, crop for lists, remove — are behind
 *    one "Afbeelding" button. They were a row of three buttons under the
 *    picture, which in a narrow column wraps to three lines of chrome sitting
 *    above the facts. A menu is one line and the tools are where you would go
 *    looking for them (progressive disclosure; the same popover the Filters
 *    button uses, closing on an outside click and on Escape). With no picture
 *    yet there is only one thing to do, so the button does it rather than
 *    opening a menu of one.
 */
export function CoverEditor({
  assetId,
  crop,
  alt,
  icon,
  colour,
  readOnly = false,
  onChange,
}: {
  assetId: string | null;
  crop: CoverCrop | null;
  alt: string;
  icon: string;
  colour: string;
  /** §22: the reading face — the picture, and not one control. */
  readOnly?: boolean;
  onChange: (next: { coverAssetId: string | null; coverCrop: CoverCrop | null }) => void;
}) {
  const ui = useUi();
  const [busy, setBusy] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [local, setLocal] = useState<CoverCrop>(crop ?? { x: 0.5, y: 0.5, zoom: 1 });
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocal(crop ?? { x: 0.5, y: 0.5, zoom: 1 });
  }, [crop]);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const form = new FormData();
        form.append('file', file);
        const result = await uploadForm<{ asset: { id: string } }>('/api/assets', form);
        if (!result.ok) {
          ui.toast(result.error);
          return;
        }
        const fresh = { x: 0.5, y: 0.5, zoom: 1 };
        setLocal(fresh);
        setCropping(false);
        onChange({ coverAssetId: result.data.asset.id, coverCrop: fresh });
      } finally {
        setBusy(false);
      }
    },
    [onChange, ui],
  );

  // Paste an image straight onto the entry page. Not while reading: a paste on
  // the reading face is someone copying text out, not putting a picture in.
  useEffect(() => {
    if (readOnly) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return; // the body editor handles its own pastes
      const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith('image/'),
      );
      if (!file) return;
      event.preventDefault();
      void upload(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [upload, readOnly]);

  // The menu closes on a click outside it, and on Escape — as the Filters
  // popover does, so both behave the same way under the same fingers.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Reading an artikel that never had a picture: nothing at all, so the
  // sidebar starts at the facts instead of at an empty frame.
  if (readOnly && !assetId) return null;

  const picture = (
    <div className={assetId ? 'entry-cover-whole' : 'entry-cover entry-cover-empty'}>
      {assetId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(assetId, 'full')} alt={alt} />
      ) : (
        <Icon name={icon} size={48} style={{ color: colour, opacity: 0.5 }} />
      )}
    </div>
  );

  if (readOnly) return <figure className="entry-figure">{picture}</figure>;

  return (
    <figure className="entry-figure">
      {picture}

      <div className="entry-figure-tools">
        {assetId ? (
          <div className="cover-menu-anchor" ref={menuRef}>
            <button
              type="button"
              className="btn btn-small cover-menu-button"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              disabled={busy}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name="camera" size={14} />
              {busy ? 'Uploaden…' : 'Afbeelding'}
              <Icon name="chevron" size={12} className="cover-menu-caret" />
            </button>

            {menuOpen && (
              <div className="cover-menu" role="menu" aria-label="Afbeelding">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    fileRef.current?.click();
                  }}
                >
                  <Icon name="upload" size={14} />
                  Vervangen
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setCropping((value) => !value);
                  }}
                >
                  <Icon name="crosshair" size={14} />
                  {cropping ? 'Bijsnijden sluiten' : 'Bijsnijden voor lijsten'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cover-menu-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    setCropping(false);
                    onChange({ coverAssetId: null, coverCrop: null });
                  }}
                >
                  <Icon name="trash" size={14} />
                  Verwijderen
                </button>
              </div>
            )}
          </div>
        ) : (
          // Nothing to choose between yet: the one thing to do is the button.
          <button
            type="button"
            className="btn btn-small"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <Icon name="camera" size={15} />
            {busy ? 'Uploaden…' : 'Afbeelding toevoegen'}
          </button>
        )}
      </div>

      {cropping && assetId && (
        <div className="entry-crop-row">
          <CropFrame
            key={assetId}
            assetId={assetId}
            crop={local}
            className="entry-crop-frame"
            onCommit={(next) => {
              setLocal(next);
              onChange({ coverAssetId: assetId, coverCrop: next });
            }}
          />
          <p className="tiny muted" style={{ margin: 0 }}>
            Zo wordt de afbeelding in lijsten uitgesneden. Sleep om te verschuiven; scrol om te
            zoomen.
          </p>
          <button type="button" className="btn btn-small" onClick={() => setCropping(false)}>
            Klaar
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
    </figure>
  );
}
