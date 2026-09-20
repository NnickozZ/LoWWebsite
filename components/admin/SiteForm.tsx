'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { assetUrl } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { fitUpload } from '@/components/shrinkImage';
import { imageFromClipboard, pasteIsForTyping, uploadForm, SHRUNK_NOTICE } from '@/lib/upload';
import {
  saveSiteAction,
  setFaviconAction,
  setLogoAction,
  type AdminState,
} from '@/app/(app)/admin/actions';
import { defaultIntro } from '@/lib/intro';
import { UploadProbe } from './UploadProbe';

/** Which of the two pictures on this pane an upload is for. */
type Picture = 'logo' | 'favicon';

/**
 * §11's Site pane: name, tagline, the welcome on the start page, logo, favicon,
 * accent colour.
 *
 * §30: the logo can be pasted as well as picked — a logo is almost always
 * something copied out of another page or cropped in a paint program, which is
 * the clipboard shape that has no file behind it. Every text field on this pane
 * is guarded by `pasteIsForTyping`, so pasting a tagline is still pasting a
 * tagline; only a picture is caught, and it goes up the same road as the file
 * dialog, with the same ceiling and the same refusal.
 *
 * §88: het icoontje in de tab staat hier, naast het logo, en niet in een eigen
 * paneel — het is hetzelfde gebaar met hetzelfde plaatje, en de enige vraag die
 * een Keeper erover heeft ("waar zet ik dat ding?") wordt beantwoord door het
 * naast het logo te zetten. **Plakken blijft van het logo**: één toetsaanslag
 * kan maar één ding betekenen, en een plakbare favicon zou van Ctrl+V een
 * raadsel maken. De favicon wordt gekozen met de knop.
 */
export function SiteForm({
  name,
  tagline,
  accent,
  logoAssetId,
  faviconAssetId,
  intro,
}: {
  name: string;
  tagline: string;
  accent: string;
  logoAssetId: string | null;
  /** §88: het icoontje in de browsertab. Leeg betekent "val terug op het logo". */
  faviconAssetId: string | null;
  /** The start page's welcome text; empty means the archive's own default. */
  intro: string;
}) {
  const ui = useUi();
  const [state, action, busy] = useActionState<AdminState, FormData>(saveSiteAction, {});
  const [logo, setLogo] = useState(logoAssetId);
  const [favicon, setFavicon] = useState(faviconAssetId);
  const [uploading, setUploading] = useState<Picture | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  async function upload(file: File, what: Picture) {
    setUploading(what);
    try {
      // §30: a logo that is too heavy is shrunk to fit rather than refused.
      const fitted = await fitUpload(file, ui.uploadLimit);
      if ('error' in fitted) {
        ui.toast(fitted.error);
        return;
      }
      if (fitted.shrunk) ui.toast(SHRUNK_NOTICE);
      const form = new FormData();
      form.append('file', fitted.file);
      const result = await uploadForm<{ asset: { id: string } }>('/api/assets', form);
      if (!result.ok) {
        ui.toast(result.error);
        return;
      }
      const body = new FormData();
      body.append('assetId', result.data.asset.id);
      if (what === 'favicon') {
        setFavicon(result.data.asset.id);
        await setFaviconAction(body);
      } else {
        setLogo(result.data.asset.id);
        await setLogoAction(body);
      }
    } finally {
      setUploading(null);
    }
  }

  // The listener is bound once and reads the freshest `upload` through a ref:
  // `upload` is redeclared on every render, and re-binding a document listener
  // on each keystroke in this form is the mistake README rule 14 is about.
  const uploadRef = useRef<(file: File) => void>(() => {});
  uploadRef.current = (file: File) => void upload(file, 'logo');

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (pasteIsForTyping(event.target)) return;
      const picture = imageFromClipboard(event);
      if (!picture) return;
      event.preventDefault();
      uploadRef.current(picture);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  return (
    <form action={action} className="stack" style={{ maxWidth: 520 }}>
      <div>
        <label className="label" htmlFor="site-name">
          Naam van het archief
        </label>
        <input id="site-name" className="input" name="name" defaultValue={name} />
        <p className="tiny muted" style={{ margin: '0.25rem 0 0' }}>
          Staat in het menu én in de titel van de browsertab.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="site-tagline">
          Ondertitel
        </label>
        <input id="site-tagline" className="input" name="tagline" defaultValue={tagline} />
        <p className="tiny muted" style={{ margin: '0.25rem 0 0' }}>
          Staat onder de naam in het menu.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="site-intro">
          Welkomsttekst op de startpagina
        </label>
        <textarea
          id="site-intro"
          className="input textarea"
          name="intro"
          defaultValue={intro}
          rows={5}
          placeholder={defaultIntro(ui.words)}
        />
        <p className="tiny muted" style={{ margin: '0.25rem 0 0' }}>
          Staat bovenaan Start, boven de dossiers. Een lege regel begint een nieuwe alinea. Laat leeg voor
          de standaardtekst hierboven.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="site-accent">
          Accentkleur
        </label>
        <div className="row-wrap">
          <input
            id="site-accent"
            className="input"
            name="accent"
            type="color"
            defaultValue={accent || '#A8321E'}
            style={{ width: 72, padding: '0.2rem' }}
          />
          <span className="tiny muted">
            De stempelrode kleur van knoppen en stempels. Standaard #A8321E. Dit is de oude, enige
            kleur: zodra je onder <em>Kleuren</em> een palet opslaat, staat de stempel daar — per
            palet — en telt dit vakje niet meer mee.
          </span>
        </div>
      </div>

      <div>
        <span className="label">Logo</span>
        <div className="row-wrap">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl(logo, 'thumb')}
              alt=""
              style={{ width: 56, height: 56, objectFit: 'contain', border: '1px solid var(--rule)' }}
            />
          ) : (
            <span className="tiny muted">Nog geen logo.</span>
          )}
          <button
            type="button"
            className="btn btn-small"
            onClick={() => fileRef.current?.click()}
            disabled={uploading !== null}
            data-testid="site-logo-kies"
          >
            <Icon name="camera" size={15} />
            {uploading === 'logo' ? 'Uploaden…' : logo ? 'Vervangen' : 'Logo toevoegen'}
          </button>
          {logo && (
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => {
                setLogo(null);
                void setLogoAction(new FormData());
              }}
            >
              Verwijderen
            </button>
          )}
        </div>
        <p className="tiny muted" style={{ margin: '0.25rem 0 0' }}>
          Of plak een afbeelding — Ctrl+V, op een Mac Cmd+V.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void upload(file, 'logo');
          }}
        />
      </div>

      {/*
        §88: het icoontje in de browsertab. Eén plaatje, twee vragen die een
        Keeper zich stelt — "hoe heet dit archief in mijn tabbladen" staat
        hierboven bij de naam, "welk plaatje staat ervoor" staat hier.
      */}
      <div data-testid="site-favicon">
        <span className="label">Icoontje in de browsertab</span>
        <div className="row-wrap">
          {favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl(favicon, 'thumb')}
              alt=""
              data-testid="site-favicon-beeld"
              style={{ width: 32, height: 32, objectFit: 'contain', border: '1px solid var(--rule)' }}
            />
          ) : (
            <span className="tiny muted">
              {logo ? 'Nog geen eigen icoontje — de tab draagt je logo.' : 'Nog geen icoontje.'}
            </span>
          )}
          <button
            type="button"
            className="btn btn-small"
            onClick={() => faviconRef.current?.click()}
            disabled={uploading !== null}
            data-testid="site-favicon-kies"
          >
            <Icon name="camera" size={15} />
            {uploading === 'favicon' ? 'Uploaden…' : favicon ? 'Vervangen' : 'Icoontje toevoegen'}
          </button>
          {favicon && (
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => {
                setFavicon(null);
                void setFaviconAction(new FormData());
              }}
            >
              Verwijderen
            </button>
          )}
        </div>
        <p className="tiny muted" style={{ margin: '0.25rem 0 0' }}>
          Een vierkant plaatje werkt het best; een browser toont het op zestien pixels. Laat dit leeg
          en de tab draagt je logo. Browsers houden een icoontje lang vast — zie je het oude nog, ververs
          de pagina dan met Ctrl+F5.
        </p>
        <input
          ref={faviconRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void upload(file, 'favicon');
          }}
        />
      </div>

      <UploadProbe />

      {state.error && <p className="error-note">{state.error}</p>}
      {state.ok && <p className="small muted">{state.ok}</p>}

      <div>
        <button className="btn btn-primary btn-small" type="submit" disabled={busy}>
          {busy ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>
    </form>
  );
}
