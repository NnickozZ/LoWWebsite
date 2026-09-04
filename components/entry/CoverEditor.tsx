'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { assetUrl } from '@/components/Cover';
import { CropFrame } from '@/components/CropFrame';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { CoverCrop } from '@/lib/db/schema';

/**
 * §6: upload from device or paste from clipboard.
 *
 * The entry itself shows the whole picture at whatever shape it is — a tall
 * portrait, a wide map, a scan of a letter — and never crops it. Lists are a
 * different problem: they need one uniform shape, so the picture gets a small
 * 3:4 crop that they use and this page does not. That crop is only the
 * *default*: a case card and a board card each keep their own. The file on disk
 * is untouched either way; only a focal point and a zoom are stored.
 */
export function CoverEditor({
  assetId,
  crop,
  alt,
  icon,
  colour,
  onChange,
}: {
  assetId: string | null;
  crop: CoverCrop | null;
  alt: string;
  icon: string;
  colour: string;
  onChange: (next: { coverAssetId: string | null; coverCrop: CoverCrop | null }) => void;
}) {
  const ui = useUi();
  const [busy, setBusy] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [local, setLocal] = useState<CoverCrop>(crop ?? { x: 0.5, y: 0.5, zoom: 1 });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocal(crop ?? { x: 0.5, y: 0.5, zoom: 1 });
  }, [crop]);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/assets', { method: 'POST', body: form });
        const data = await response.json();
        if (!response.ok) {
          ui.toast(data.error ?? 'De afbeelding is niet geüpload.');
          return;
        }
        const fresh = { x: 0.5, y: 0.5, zoom: 1 };
        setLocal(fresh);
        setCropping(false);
        onChange({ coverAssetId: data.asset.id, coverCrop: fresh });
      } finally {
        setBusy(false);
      }
    },
    [onChange, ui],
  );

  // Paste an image straight onto the entry page.
  useEffect(() => {
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
  }, [upload]);

  return (
    <div>
      <div className={assetId ? 'entry-cover-whole' : 'entry-cover entry-cover-empty'}>
        {assetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(assetId, 'full')} alt={alt} />
        ) : (
          <Icon name={icon} size={48} style={{ color: colour, opacity: 0.5 }} />
        )}
      </div>

      <div className="row-wrap" style={{ marginTop: '0.5rem' }}>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <Icon name="camera" size={15} />
          {busy ? 'Uploaden…' : assetId ? 'Vervangen' : 'Afbeelding toevoegen'}
        </button>
        {assetId && (
          <>
            <button
              type="button"
              className={`btn btn-small${cropping ? ' btn-primary' : ''}`}
              onClick={() => setCropping((value) => !value)}
            >
              {cropping ? 'Klaar' : 'Bijsnijden voor lijsten'}
            </button>
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => {
                onChange({ coverAssetId: null, coverCrop: null });
                setCropping(false);
              }}
            >
              Verwijderen
            </button>
          </>
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
            Zo wordt de afbeelding in lijsten uitgesneden. Sleep om te verschuiven; scrol om te zoomen.
          </p>
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
    </div>
  );
}
